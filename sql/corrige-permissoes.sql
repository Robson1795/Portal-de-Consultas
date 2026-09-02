-- =====================================================================
-- CORREÇÃO DE PERMISSÕES (RLS) — exigir conta aprovada
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NÃO cole este arquivo no GitHub (ver sql/README.md).
--
-- PROBLEMA QUE ESTE SCRIPT RESOLVE
--
-- Hoje as políticas liberam acesso para "authenticated" com using (true),
-- ou seja: qualquer conta logada, INCLUSIVE UMA AINDA NÃO APROVADA.
-- A checagem de aprovação do Portal é feita em JavaScript, no navegador
-- (função verificarAprovacao / mostrarTelaCorreta): ela decide qual TELA
-- mostrar, mas não protege o banco. Quem chamar a API do Supabase direto,
-- com a chave anon que está no código-fonte, não passa por essa tela.
--
-- Consequências atuais:
--   1. Conta não aprovada consegue LER o estoque das três unidades.
--   2. Em contagem_bobinas a escrita está liberada para qualquer logado
--      (using (true) with check (true)) — dá para alterar ou apagar a
--      contagem física alheia.
--
-- O QUE ESTE SCRIPT FAZ
--   - Cria a função esta_aprovado(), fonte única da regra de acesso.
--   - Substitui as políticas permissivas por políticas que exigem
--     conta aprovada (o admin geral passa sempre).
--   - Mantém o comportamento do Portal: quem conta no chão de fábrica
--     continua podendo lançar contagem, desde que a conta seja aprovada.
--
-- É seguro rodar de novo (usa "if not exists" / "if exists").
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 0 — DIAGNÓSTICO. Rode SÓ esta parte primeiro e envie o resultado.
--
-- Importante: no Postgres, várias políticas de leitura na mesma tabela se
-- SOMAM (basta uma liberar). Se alguma política permissiva tiver nome
-- diferente dos que este script remove, ela continua valendo e a correção
-- não surte efeito. Por isso vale conferir os nomes antes.
-- ---------------------------------------------------------------------

select tablename, policyname, cmd, roles::text, qual as condicao_using
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Confira também quem está aprovado hoje (para ninguém perder acesso):
select email, nome, aprovado from usuarios_permitidos order by aprovado desc, email;
select email from editores_bobinas order by email;


-- ---------------------------------------------------------------------
-- PARTE 1 — A função de regra única
--
-- security definer: a função lê usuarios_permitidos ignorando o RLS
-- daquela tabela, o que evita recursão (política que consulta a tabela
-- que tem política).
-- ---------------------------------------------------------------------

create or replace function public.esta_aprovado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'email', '') = 'robson_alves1995@live.com'
    or exists (
      select 1
      from public.usuarios_permitidos u
      where u.user_id = auth.uid()
        and u.aprovado = true
    );
$$;

grant execute on function public.esta_aprovado() to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 2 — Leitura: só conta aprovada
-- ---------------------------------------------------------------------

drop policy if exists "Leitura para logados" on estoque;
drop policy if exists "Leitura para aprovados" on estoque;
create policy "Leitura para aprovados"
  on estoque for select
  to authenticated
  using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on fichas_tecnicas;
drop policy if exists "Leitura para aprovados" on fichas_tecnicas;
create policy "Leitura para aprovados"
  on fichas_tecnicas for select
  to authenticated
  using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on bobinas_aco;
drop policy if exists "Leitura para aprovados" on bobinas_aco;
create policy "Leitura para aprovados"
  on bobinas_aco for select
  to authenticated
  using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on editores_bobinas;
drop policy if exists "Leitura para aprovados" on editores_bobinas;
create policy "Leitura para aprovados"
  on editores_bobinas for select
  to authenticated
  using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on gerentes_unidade;
drop policy if exists "Leitura para aprovados" on gerentes_unidade;
create policy "Leitura para aprovados"
  on gerentes_unidade for select
  to authenticated
  using (public.esta_aprovado());


-- ---------------------------------------------------------------------
-- PARTE 3 — Contagem física: escrita só para conta aprovada
--
-- Aqui NÃO restringimos a "editores_bobinas": quem conta no chão de
-- fábrica não é editor. A regra correta é "conta aprovada", que fecha o
-- buraco sem quebrar o trabalho de contagem.
-- ---------------------------------------------------------------------

drop policy if exists "Escrita para logados" on contagem_bobinas;
drop policy if exists "Leitura para logados" on contagem_bobinas;
drop policy if exists "Contagem para aprovados" on contagem_bobinas;
create policy "Contagem para aprovados"
  on contagem_bobinas for all
  to authenticated
  using (public.esta_aprovado())
  with check (public.esta_aprovado());

drop policy if exists "Escrita para logados" on contagem_fisica;
drop policy if exists "Leitura para logados" on contagem_fisica;
drop policy if exists "Contagem para aprovados" on contagem_fisica;
create policy "Contagem para aprovados"
  on contagem_fisica for all
  to authenticated
  using (public.esta_aprovado())
  with check (public.esta_aprovado());

drop policy if exists "Escrita para logados" on atribuicoes_corredor;
drop policy if exists "Leitura para logados" on atribuicoes_corredor;
drop policy if exists "Corredor para aprovados" on atribuicoes_corredor;
create policy "Corredor para aprovados"
  on atribuicoes_corredor for all
  to authenticated
  using (public.esta_aprovado())
  with check (public.esta_aprovado());


-- ---------------------------------------------------------------------
-- PARTE 4 — VERIFICAÇÃO. Rode depois e confira o resultado.
--
-- Não deve sobrar nenhuma linha com condicao_using = 'true' nas tabelas
-- de dados. Se sobrar, é uma política permissiva com outro nome, e ela
-- anula a correção — mande o resultado que a gente ajusta.
-- ---------------------------------------------------------------------

select tablename, policyname, cmd, qual as condicao_using
from pg_policies
where schemaname = 'public'
  and tablename in (
    'estoque','fichas_tecnicas','bobinas_aco','editores_bobinas',
    'gerentes_unidade','contagem_bobinas','contagem_fisica',
    'atribuicoes_corredor'
  )
order by tablename, policyname;
