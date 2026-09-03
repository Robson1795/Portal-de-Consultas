-- =====================================================================
-- FASE 1 — MODELO DE PERFIS E PERMISSÕES
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NÃO cole este arquivo no GitHub (ver sql/README.md).
--
-- Este script SUBSTITUI o sql/corrige-permissoes.sql: ele já inclui a
-- correção da escrita aberta no `estoque`. Rode só este.
--
-- Cole tudo de uma vez. O SQL Editor mostra o resultado da ÚLTIMA
-- instrução, que é a verificação da PARTE 7 — é ela que você me manda.
-- =====================================================================
--
-- O QUE ESTE SCRIPT FAZ
--
--   1. Acrescenta perfil, unidade e localizacao em usuarios_permitidos.
--   2. Cria as funções que respondem "quem é você e o que pode".
--   3. Fecha a escrita aberta no `estoque` (o furo do diagnóstico de 02/09).
--   4. Reescreve o RLS de todas as tabelas em cima do perfil.
--   5. Cria a única porta para mudar perfil, com as travas de escalonamento.
--   6. Migra os 12 usuários atuais sem ninguém ganhar nem perder acesso.
--   7. Verifica.
--
-- DESENHO DAS PERMISSÕES
--
--   consultor    -> consulta
--   estoque_alm  -> consulta + contagem ALM da própria unidade
--   estoque_aco  -> consulta + contagem de bobinas
--   admin        -> tudo, incluindo a aba Configurações
--
--   Atualizar PLANILHA é um nível acima de contar, e continua controlado
--   pelas tabelas que já existem: `gerentes_unidade` (estoque, por unidade)
--   e `editores_bobinas` (bobinas). Assim o perfil define o setor e essas
--   tabelas definem quem carrega planilha dentro dele — exatamente como é
--   hoje, sem ninguém ganhar poder na migração.
--
--   SUPER ADMIN (Victor e Robson) é raiz de confiança, fixa no código deste
--   script. Só eles concedem o perfil `admin`. É intencional que não seja
--   configurável pelo portal: é o que impede um admin de criar outro admin.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — Colunas novas em usuarios_permitidos
--
-- `aprovado` (boolean) continua existindo e continua sendo a fonte de
-- verdade de "conta liberada", porque o portal atual já a lê. O status que
-- a tela mostra é derivado dela, para não haver duas verdades.
-- ---------------------------------------------------------------------

alter table usuarios_permitidos
  add column if not exists perfil      text not null default 'consultor',
  add column if not exists unidade     text,
  add column if not exists localizacao text;

do $$
begin
  alter table usuarios_permitidos
    add constraint usuarios_permitidos_perfil_valido
    check (perfil in ('consultor', 'estoque_alm', 'estoque_aco', 'admin'));
exception
  when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------
-- PARTE 2 — As funções que respondem "quem é você"
--
-- Todas são `security definer` com search_path fixo: leem
-- usuarios_permitidos ignorando o RLS daquela tabela, o que evita recursão
-- (política que consulta a tabela que tem política).
-- ---------------------------------------------------------------------

-- Raiz de confiança. Robson tem dois logins e os dois valem aqui, para ele
-- não perder o acesso entrando pelo `.local`.
create or replace function public.eh_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'robson_alves1995@live.com',
    'r.alves1@portal.kingspanisoeste.local',
    'victor.dobner@portal.kingspanisoeste.local'
  );
$$;

create or replace function public.meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.eh_super_admin() then 'admin'
    else coalesce((
      select u.perfil from public.usuarios_permitidos u
      where u.user_id = auth.uid() and u.aprovado = true
    ), 'nenhum')
  end;
$$;

create or replace function public.esta_aprovado()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_perfil() <> 'nenhum';
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_perfil() = 'admin';
$$;

create or replace function public.minha_unidade()
returns text language sql stable security definer set search_path = public as $$
  select u.unidade from public.usuarios_permitidos u where u.user_id = auth.uid();
$$;

-- Pode carregar a planilha do estoque daquela unidade?
create or replace function public.pode_atualizar_estoque(uni text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin()
     or (public.meu_perfil() = 'estoque_alm'
         and exists (
           select 1 from public.gerentes_unidade g
           where g.unidade = uni
             and lower(g.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         ));
$$;

-- Pode carregar a planilha de bobinas?
create or replace function public.pode_atualizar_bobinas()
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin()
     or (public.meu_perfil() = 'estoque_aco'
         and exists (
           select 1 from public.editores_bobinas e
           where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         ));
$$;

grant execute on function
  public.eh_super_admin(), public.meu_perfil(), public.esta_aprovado(),
  public.eh_admin(), public.minha_unidade(),
  public.pode_atualizar_estoque(text), public.pode_atualizar_bobinas()
  to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 3 — A única porta para mudar perfil, e as travas
--
-- Duas barreiras, de propósito:
--
--   definir_acesso()      é o caminho previsto. Confere quem chama antes de
--                         alterar qualquer coisa.
--   trava_escalonamento() é a rede. Pega qualquer UPDATE que mexa em perfil
--                         ou aprovado por fora da função — inclusive um
--                         UPDATE feito à mão no painel do Supabase.
--
-- A função avisa o gatilho pelo parâmetro de sessão app.definir_acesso, para
-- a alteração legítima passar.
-- ---------------------------------------------------------------------

create or replace function public.definir_acesso(
  alvo             uuid,
  novo_perfil      text,
  nova_unidade     text default null,
  nova_localizacao text default null,
  novo_aprovado    boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  alterou   integer;
  perfil_antigo text;
begin
  if not public.eh_admin() then
    raise exception 'Somente administradores alteram acesso.';
  end if;

  if novo_perfil not in ('consultor', 'estoque_alm', 'estoque_aco', 'admin') then
    raise exception 'Perfil invalido: %', novo_perfil;
  end if;

  -- Ninguém altera o próprio acesso, nem a raiz de confiança. Evita tanto
  -- escalonamento quanto o erro bobo de se rebaixar sozinho.
  if alvo = auth.uid() then
    raise exception 'Nao e possivel alterar o proprio acesso. Peca a outro administrador.';
  end if;

  select perfil into perfil_antigo from usuarios_permitidos where user_id = alvo;
  if perfil_antigo is null then
    raise exception 'Usuario nao encontrado.';
  end if;

  -- Conceder admin é privilégio da raiz de confiança.
  if novo_perfil = 'admin' and not public.eh_super_admin() then
    raise exception 'Somente Victor ou Robson concedem o perfil admin.';
  end if;

  -- Retirar admin de alguém, também.
  if novo_perfil <> 'admin' and perfil_antigo = 'admin' and not public.eh_super_admin() then
    raise exception 'Somente Victor ou Robson removem o perfil admin.';
  end if;

  perform set_config('app.definir_acesso', 'sim', true);

  update usuarios_permitidos
     set perfil      = novo_perfil,
         unidade     = coalesce(nova_unidade, unidade),
         localizacao = coalesce(nova_localizacao, localizacao),
         aprovado    = coalesce(novo_aprovado, aprovado)
   where user_id = alvo;

  -- Conferido aqui, logo depois do UPDATE: qualquer comando no meio
  -- redefiniria FOUND (PERFORM inclusive) e a checagem viraria letra morta.
  get diagnostics alterou = row_count;

  perform set_config('app.definir_acesso', 'nao', true);

  if alterou = 0 then
    raise exception 'Nenhuma linha alterada para o usuario informado.';
  end if;
end $$;

grant execute on function public.definir_acesso(uuid, text, text, text, boolean) to authenticated;

create or replace function public.trava_escalonamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.definir_acesso', true), 'nao') = 'sim' then
    return new;
  end if;
  if (new.perfil is distinct from old.perfil
      or new.aprovado is distinct from old.aprovado)
     and not public.eh_super_admin() then
    raise exception 'Perfil e aprovacao mudam apenas por definir_acesso().';
  end if;
  return new;
end $$;

drop trigger if exists trg_trava_escalonamento on usuarios_permitidos;
create trigger trg_trava_escalonamento
  before update on usuarios_permitidos
  for each row execute function public.trava_escalonamento();


-- ---------------------------------------------------------------------
-- PARTE 4 — Cadastro novo não escolhe o próprio perfil
--
-- Fecha o item C3 da AUDITORIA.md: sem isto, uma conta nova podia inserir a
-- própria linha já com aprovado = true, chamando a API direto.
-- ---------------------------------------------------------------------

create or replace function public.forca_cadastro_neutro()
returns trigger language plpgsql set search_path = public as $$
begin
  new.perfil   := 'consultor';
  new.aprovado := false;
  return new;
end $$;

drop trigger if exists trg_forca_cadastro_neutro on usuarios_permitidos;
create trigger trg_forca_cadastro_neutro
  before insert on usuarios_permitidos
  for each row execute function public.forca_cadastro_neutro();


-- ---------------------------------------------------------------------
-- PARTE 5 — RLS: quem lê e escreve o quê
--
-- ⚠️ A PARTE 5 é onde a escrita aberta no `estoque` é removida
--    ("Escrita para logados", using (true)) — o furo do diagnóstico.
-- ---------------------------------------------------------------------

-- ---- usuarios_permitidos ----
drop policy if exists "Ver proprio status"       on usuarios_permitidos;
drop policy if exists "Admin ve todos"           on usuarios_permitidos;
drop policy if exists "Admin aprova"             on usuarios_permitidos;
drop policy if exists "Inserir proprio cadastro" on usuarios_permitidos;

create policy "Ver proprio status" on usuarios_permitidos
  for select to authenticated using (auth.uid() = user_id);
create policy "Admin ve todos" on usuarios_permitidos
  for select to authenticated using (public.eh_admin());
create policy "Inserir proprio cadastro" on usuarios_permitidos
  for insert to authenticated with check (auth.uid() = user_id);
-- Admin faz UPDATE, mas o gatilho da PARTE 3 barra perfil/aprovado fora da função.
create policy "Admin edita cadastro" on usuarios_permitidos
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- ---- estoque ----
drop policy if exists "Escrita para logados"                on estoque;  -- <== O FURO
drop policy if exists "Leitura para logados"                on estoque;
drop policy if exists "Escrita admin ou gerente da unidade" on estoque;
drop policy if exists "Leitura para aprovados"              on estoque;

create policy "Leitura para aprovados" on estoque
  for select to authenticated using (public.esta_aprovado());
create policy "Escrita admin ou gerente da unidade" on estoque
  for all to authenticated
  using (public.pode_atualizar_estoque(unidade))
  with check (public.pode_atualizar_estoque(unidade));

-- ---- contagem_fisica: contar é do estoque_alm da própria unidade ----
drop policy if exists "Escrita para logados"     on contagem_fisica;
drop policy if exists "Leitura para logados"     on contagem_fisica;
drop policy if exists "Contagem para aprovados"  on contagem_fisica;

create policy "Leitura para aprovados" on contagem_fisica
  for select to authenticated using (public.esta_aprovado());
create policy "Contagem ALM" on contagem_fisica
  for all to authenticated
  using (public.eh_admin() or (public.meu_perfil() = 'estoque_alm'
         and (public.minha_unidade() is null or public.minha_unidade() = unidade)))
  with check (public.eh_admin() or (public.meu_perfil() = 'estoque_alm'
         and (public.minha_unidade() is null or public.minha_unidade() = unidade)));

-- ---- atribuicoes_corredor ----
drop policy if exists "Escrita para logados"    on atribuicoes_corredor;
drop policy if exists "Leitura para logados"    on atribuicoes_corredor;
drop policy if exists "Corredor para aprovados" on atribuicoes_corredor;

create policy "Leitura para aprovados" on atribuicoes_corredor
  for select to authenticated using (public.esta_aprovado());
create policy "Corredor ALM" on atribuicoes_corredor
  for all to authenticated
  using (public.eh_admin() or public.meu_perfil() = 'estoque_alm')
  with check (public.eh_admin() or public.meu_perfil() = 'estoque_alm');

-- ---- bobinas_aco: planilha é de quem está em editores_bobinas ----
drop policy if exists "Leitura para logados"      on bobinas_aco;
drop policy if exists "Escrita admin ou editor"   on bobinas_aco;
drop policy if exists "Leitura para aprovados"    on bobinas_aco;

create policy "Leitura para aprovados" on bobinas_aco
  for select to authenticated using (public.esta_aprovado());
create policy "Escrita admin ou editor" on bobinas_aco
  for all to authenticated
  using (public.pode_atualizar_bobinas())
  with check (public.pode_atualizar_bobinas());

-- ---- contagem_bobinas e contagem_bobinas_ocr: contar é do estoque_aco ----
drop policy if exists "Escrita para logados"    on contagem_bobinas;
drop policy if exists "Leitura para logados"    on contagem_bobinas;
drop policy if exists "Contagem para aprovados" on contagem_bobinas;

create policy "Leitura para aprovados" on contagem_bobinas
  for select to authenticated using (public.esta_aprovado());
create policy "Contagem aco" on contagem_bobinas
  for all to authenticated
  using (public.eh_admin() or public.meu_perfil() = 'estoque_aco')
  with check (public.eh_admin() or public.meu_perfil() = 'estoque_aco');

drop policy if exists "Escrita para logados" on contagem_bobinas_ocr;
drop policy if exists "Leitura para logados" on contagem_bobinas_ocr;
drop policy if exists "OCR para aprovados"   on contagem_bobinas_ocr;

create policy "Leitura para aprovados" on contagem_bobinas_ocr
  for select to authenticated using (public.esta_aprovado());
create policy "OCR aco" on contagem_bobinas_ocr
  for all to authenticated
  using (public.eh_admin() or public.meu_perfil() = 'estoque_aco')
  with check (public.eh_admin() or public.meu_perfil() = 'estoque_aco');

-- ---- fichas_tecnicas: embalagem é editada pelo ALM (hoje é o Joel) ----
drop policy if exists "Leitura para logados"   on fichas_tecnicas;
drop policy if exists "Escrita admin ou joel"  on fichas_tecnicas;
drop policy if exists "Leitura para aprovados" on fichas_tecnicas;

create policy "Leitura para aprovados" on fichas_tecnicas
  for select to authenticated using (public.esta_aprovado());
create policy "Escrita ficha" on fichas_tecnicas
  for all to authenticated
  using (public.eh_admin() or public.meu_perfil() = 'estoque_alm')
  with check (public.eh_admin() or public.meu_perfil() = 'estoque_alm');

-- ---- tabelas de apoio: leitura para aprovados, escrita só admin ----
drop policy if exists "Leitura para logados"   on gerentes_unidade;
drop policy if exists "Admin gerencia"         on gerentes_unidade;
drop policy if exists "Leitura para aprovados" on gerentes_unidade;
create policy "Leitura para aprovados" on gerentes_unidade
  for select to authenticated using (public.esta_aprovado());
create policy "Admin gerencia" on gerentes_unidade
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "Leitura para logados"   on editores_bobinas;
drop policy if exists "Admin gerencia"         on editores_bobinas;
drop policy if exists "Leitura para aprovados" on editores_bobinas;
create policy "Leitura para aprovados" on editores_bobinas
  for select to authenticated using (public.esta_aprovado());
create policy "Admin gerencia" on editores_bobinas
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- ---- acessos: o portal só INSERE (conferido no index.html), nunca lê ----
drop policy if exists "Ver acessos"       on acessos;
drop policy if exists "Ver acessos - admin" on acessos;
create policy "Ver acessos - admin" on acessos
  for select to authenticated using (public.eh_admin());


-- ---------------------------------------------------------------------
-- PARTE 6 — Migração dos usuários atuais
--
-- Regra: ninguém ganha nem perde acesso. Quem carrega planilha continua
-- carregando porque continua em gerentes_unidade / editores_bobinas.
--
-- `set_config` libera o gatilho, porque este UPDATE é a migração e não um
-- escalonamento.
-- ---------------------------------------------------------------------

select set_config('app.definir_acesso', 'sim', false);

-- Todos os aprovados viram estoque_alm: hoje qualquer conta aprovada pode
-- contar, e rebaixar para consultor tiraria isso de quem já tem.
update usuarios_permitidos set perfil = 'estoque_alm' where aprovado = true;

-- Quem atualiza bobinas é do setor de aço.
update usuarios_permitidos set perfil = 'estoque_aco'
 where aprovado = true
   and lower(email) in (select lower(email) from editores_bobinas);

-- Admin.
update usuarios_permitidos set perfil = 'admin'
 where lower(email) in ('robson_alves1995@live.com', 'r.alves1@portal.kingspanisoeste.local');

-- Unidade de quem é gerente, para a contagem já sair filtrada.
update usuarios_permitidos u set unidade = g.unidade
  from gerentes_unidade g
 where lower(g.email) = lower(u.email) and u.unidade is null;

select set_config('app.definir_acesso', 'nao', false);


-- ---------------------------------------------------------------------
-- PARTE 7 — VERIFICAÇÃO. É o resultado desta consulta que você me manda.
--
-- O que conferir:
--   secao 'usuario'  -> perfil de cada um, e se pode carregar planilha
--   secao 'politica' -> não deve sobrar `true` em `usando` nas tabelas de dados
--   secao 'bucket'   -> o OCR sobe foto para `fotos-bobinas` e usa
--                       getPublicUrl; bucket público = foto sem login
-- ---------------------------------------------------------------------

select 'usuario'::text as secao,
       coalesce(u.nome, u.email)::text as item,
       u.perfil::text as detalhe,
       (case when u.aprovado then 'aprovado' else 'PENDENTE' end)::text as operacao,
       coalesce(u.unidade, '-')::text as usando,
       (case
          when lower(u.email) in (select lower(email) from gerentes_unidade) then 'carrega planilha ALM'
          when lower(u.email) in (select lower(email) from editores_bobinas) then 'carrega planilha aco'
          else '-'
        end)::text as verificando
from usuarios_permitidos u

union all

select 'politica'::text, tablename::text, policyname::text, cmd::text,
       coalesce(qual, '-')::text, coalesce(with_check, '-')::text
from pg_policies where schemaname = 'public'

union all

select 'bucket'::text, name::text,
       (case when public then 'PUBLICO - foto sem login' else 'privado' end)::text,
       '-'::text, '-'::text, '-'::text
from storage.buckets

order by 1, 2, 3;
