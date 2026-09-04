-- =====================================================================
-- FASE 1 — MODELO DE PERFIS E PERMISSÕES  (fase1b-travas.sql)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NÃO cole este arquivo no GitHub (ver sql/README.md).
--
-- Este script SUBSTITUI o sql/corrige-permissoes.sql: ele já inclui a
-- correção da escrita aberta no `estoque`. Rode só este.
--
-- Passo B — definir_acesso() e as travas contra escalonamento.
-- So funcoes e gatilhos.
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


