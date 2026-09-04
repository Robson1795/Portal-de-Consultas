-- =====================================================================
-- CADASTRO COM UNIDADE E CARGO · REMOÇÃO DA LOCALIZAÇÃO DO USUÁRIO
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             Rode DEPOIS do fase1-perfis-e-permissoes.sql.
--
-- Cole tudo de uma vez; a última consulta confere o resultado.
-- =====================================================================
--
-- POR QUE
--
-- 1. `usuarios_permitidos.localizacao` era redundante: para o usuário,
--    localização é a mesma coisa que unidade. Duas colunas para o mesmo
--    fato viram duas verdades, e uma delas fica errada. A coluna sai.
--
--    Atenção: `estoque.localizacao` e `bobinas_aco.localizacao` são outra
--    coisa e NÃO são tocadas -- ali localização é o endereço físico no
--    almoxarifado (rua, prateleira, corredor).
--
-- 2. O cadastro passa a pedir unidade e cargo. O cargo escolhido é um
--    PEDIDO, não uma concessão: a conta continua nascendo NÃO APROVADA, e
--    o administrador confere o cargo pedido antes de liberar. `admin`
--    nunca é aceito no cadastro -- cai para consultor.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — O cadastro aceita cargo, menos admin, e nunca se auto-aprova
--
-- Antes, o gatilho forçava perfil = 'consultor' sempre, o que apagava a
-- escolha feita no cadastro. Agora aceita os três cargos de operação e
-- rebaixa qualquer outro. `aprovado` continua sempre falso: quem libera
-- é o administrador, na aba Configurações.
-- ---------------------------------------------------------------------

create or replace function public.forca_cadastro_neutro()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.perfil is null
     or new.perfil not in ('consultor', 'estoque_alm', 'estoque_aco') then
    new.perfil := 'consultor';
  end if;

  new.aprovado := false;
  return new;
end $$;

-- O gatilho já existe desde a Fase 1; recriado aqui por garantia.
drop trigger if exists trg_forca_cadastro_neutro on usuarios_permitidos;
create trigger trg_forca_cadastro_neutro
  before insert on usuarios_permitidos
  for each row execute function public.forca_cadastro_neutro();


-- ---------------------------------------------------------------------
-- PARTE 2 — definir_acesso() sem o parâmetro de localização
--
-- `create or replace` não muda a lista de parâmetros: criaria uma segunda
-- versão sobrecarregada, e a chamada do portal ficaria ambígua. Por isso a
-- antiga é removida antes.
-- ---------------------------------------------------------------------

drop function if exists public.definir_acesso(uuid, text, text, text, boolean);

create or replace function public.definir_acesso(
  alvo          uuid,
  novo_perfil   text,
  nova_unidade  text default null,
  novo_aprovado boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  alterou       integer;
  perfil_antigo text;
begin
  if not public.eh_admin() then
    raise exception 'Somente administradores alteram acesso.';
  end if;

  if novo_perfil not in ('consultor', 'estoque_alm', 'estoque_aco', 'admin') then
    raise exception 'Perfil invalido: %', novo_perfil;
  end if;

  -- Ninguém altera o próprio acesso, nem a raiz de confiança.
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
     set perfil   = novo_perfil,
         unidade  = coalesce(nova_unidade, unidade),
         aprovado = coalesce(novo_aprovado, aprovado)
   where user_id = alvo;

  -- Conferido aqui, logo depois do UPDATE: qualquer comando no meio
  -- redefiniria FOUND (PERFORM inclusive).
  get diagnostics alterou = row_count;

  perform set_config('app.definir_acesso', 'nao', true);

  if alterou = 0 then
    raise exception 'Nenhuma linha alterada para o usuario informado.';
  end if;
end $$;

grant execute on function public.definir_acesso(uuid, text, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 3 — A coluna redundante sai
--
-- Feito depois da PARTE 2 de propósito: enquanto a função antiga existir,
-- ela referencia a coluna.
-- ---------------------------------------------------------------------

alter table usuarios_permitidos drop column if exists localizacao;


-- ---------------------------------------------------------------------
-- VERIFICAÇÃO
--
-- Esperado:
--   secao 'coluna'  -> NÃO deve aparecer 'localizacao'
--   secao 'funcao'  -> definir_acesso com 4 argumentos, uma única vez
--   secao 'usuario' -> os cadastros atuais, com unidade
-- ---------------------------------------------------------------------

select 'coluna'::text as secao, column_name::text as item, data_type::text as detalhe
  from information_schema.columns
 where table_name = 'usuarios_permitidos' and table_schema = 'public'

union all

select 'funcao'::text, p.proname::text,
       pg_get_function_arguments(p.oid)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('definir_acesso', 'forca_cadastro_neutro')

union all

select 'usuario'::text, coalesce(u.nome, u.email)::text,
       (u.perfil || ' · unidade ' || coalesce(u.unidade, '(nenhuma)') ||
        ' · ' || case when u.aprovado then 'aprovado' else 'PENDENTE' end)::text
  from usuarios_permitidos u

order by 1, 2;
