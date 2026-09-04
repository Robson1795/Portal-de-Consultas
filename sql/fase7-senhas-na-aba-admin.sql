-- =====================================================================
-- SENHAS E E-MAILS NA ABA ADMIN — e a senha deixa de ser pública
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             Rode DEPOIS do fase6-requisicao-alm.sql.
--
-- ⚠️ Se der "deadlock detected", feche as abas do portal e rode de novo.
-- =====================================================================
--
-- O QUE MUDA, E POR QUE IMPORTA
--
-- Hoje as senhas estão em `js/config.js`, um arquivo que qualquer pessoa
-- baixa com Ctrl+U. A comparação acontece no navegador:
--
--     if (valor === PINS_CONTAGEM[unidade])     <-- senha no navegador
--
-- Mover a senha para uma tabela e continuar comparando no navegador não
-- resolveria nada: ela seria baixada do mesmo jeito. Então a comparação
-- passa para DENTRO do banco, por função:
--
--     select senha_contagem_confere('106', 'tentativa')  -->  true | false
--
-- A tabela fica legível só para admin, e o navegador nunca recebe a senha.
-- De trava contra clique acidental, ela vira proteção de verdade.
--
-- Os e-mails do ALM continuam legíveis para conta aprovada -- quem faz a
-- requisição precisa saber para quem ela vai --, mas por função própria,
-- para a mesma consulta não trazer as senhas de carona.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — Colunas novas, e as senhas de hoje preservadas
--
-- Os valores abaixo são os que já estão em js/config.js. Ficam iguais para
-- ninguém perder acesso na virada; troque pela aba admin depois.
-- ---------------------------------------------------------------------

alter table config_unidade
  add column if not exists senha_contagem text,
  add column if not exists pin_edicao     text;

update config_unidade set senha_contagem = 'INV' || unidade
 where senha_contagem is null;

update config_unidade set pin_edicao = '2026'
 where pin_edicao is null;


-- ---------------------------------------------------------------------
-- PARTE 2 — A tabela deixa de ser legível para quem não é admin
--
-- Só o admin lê a linha inteira. Todos os outros passam pelas funções da
-- PARTE 3, que devolvem apenas o que precisam.
-- ---------------------------------------------------------------------

drop policy if exists "Leitura para aprovados" on config_unidade;
drop policy if exists "Admin le config" on config_unidade;
create policy "Admin le config" on config_unidade
  for select to authenticated using (public.eh_admin());

-- A de escrita já existia e continua valendo: "Admin gerencia".


-- ---------------------------------------------------------------------
-- PARTE 3 — As funções
--
-- `security definer` para lerem a tabela ignorando o RLS dela. Devolvem
-- sim/não, ou só o e-mail -- nunca a senha.
-- ---------------------------------------------------------------------

create or replace function public.senha_contagem_confere(uni text, tentativa text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.esta_aprovado() and exists (
    select 1 from public.config_unidade c
     where c.unidade = uni
       and c.senha_contagem is not null
       and c.senha_contagem = tentativa
  );
$$;

create or replace function public.pin_edicao_confere(uni text, tentativa text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.esta_aprovado() and exists (
    select 1 from public.config_unidade c
     where c.unidade = uni
       and c.pin_edicao is not null
       and c.pin_edicao = tentativa
  );
$$;

create or replace function public.emails_alm_da_unidade(uni text)
returns text language sql stable security definer set search_path = public as $$
  select case when public.esta_aprovado()
    then (select c.emails_alm from public.config_unidade c where c.unidade = uni)
    else null end;
$$;

grant execute on function
  public.senha_contagem_confere(text, text),
  public.pin_edicao_confere(text, text),
  public.emails_alm_da_unidade(text)
  to authenticated;


-- ---------------------------------------------------------------------
-- VERIFICAÇÃO — é este resultado que deve ser enviado de volta.
--
-- Na seção 'unidade', a coluna `detalhe` diz apenas SE há senha, nunca
-- qual é: nem na verificação a senha aparece.
-- ---------------------------------------------------------------------

select 'unidade'::text as secao, unidade::text as item,
       ('senha: ' || case when senha_contagem is null then 'FALTA' else 'ok' end ||
        ' · pin: '  || case when pin_edicao     is null then 'FALTA' else 'ok' end ||
        ' · e-mail: ' || coalesce(emails_alm, 'FALTA CADASTRAR'))::text as detalhe
  from config_unidade

union all

select 'funcao'::text, p.proname::text, pg_get_function_arguments(p.oid)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('senha_contagem_confere', 'pin_edicao_confere', 'emails_alm_da_unidade')

union all

select 'politica'::text, policyname::text, cmd::text
  from pg_policies where schemaname = 'public' and tablename = 'config_unidade'

order by 1, 2;
