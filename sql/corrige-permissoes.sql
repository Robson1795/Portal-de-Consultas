-- =====================================================================
-- CORREÇÃO DE PERMISSÕES (RLS)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NÃO cole este arquivo no GitHub (ver sql/README.md).
--
-- Escrito a partir do diagnóstico real do banco em 02/09/2026
-- (pg_policies), não de suposição.
-- =====================================================================
--
-- O QUE O DIAGNÓSTICO MOSTROU
--
-- 1. GRAVE — a tabela `estoque` tem DUAS políticas de escrita:
--
--      "Escrita admin ou gerente da unidade"  ALL  (restrita, correta)
--      "Escrita para logados"                 ALL  using (true)   <== aberta
--
--    No Postgres as políticas se SOMAM (é OU, não E). Basta uma liberar.
--    Ou seja: a restrição por gerente de unidade NÃO está valendo.
--    Hoje qualquer conta autenticada pode ALTERAR e APAGAR o estoque das
--    três unidades. A regra "gerente edita só a própria unidade", que está
--    documentada e é o comportamento esperado, não existe na prática.
--
-- 2. Dez tabelas com leitura `using (true)`: qualquer conta autenticada
--    lê tudo, inclusive conta ainda NÃO APROVADA — a checagem de aprovação
--    é feita em JavaScript, no navegador, e só troca a tela.
--
-- 3. Escrita aberta também em `contagem_fisica`, `contagem_bobinas` e
--    `atribuicoes_corredor` (ALL, using (true)).
--
-- 4. `acessos` tem leitura aberta: qualquer conta lê o log de login de
--    todo mundo.
--
-- 5. Existe uma tabela `contagem_bobinas_ocr` que não estava documentada
--    em lugar nenhum. Também com leitura aberta.
--
-- O QUE FICOU CERTO E ESTE SCRIPT NÃO TOCA
--
--    bobinas_aco     "Escrita admin ou editor"            (restrita)
--    fichas_tecnicas "Escrita admin ou joel"              (restrita)
--    gerentes_unidade / editores_bobinas "Admin gerencia" (restrita)
--    usuarios_permitidos — as quatro políticas estão bem desenhadas
--    acessos "Inserir proprio acesso"
--
-- PENDÊNCIA DESTE SCRIPT
--
--    O diagnóstico trouxe só a cláusula USING. Falta ver o WITH CHECK,
--    que é o que vale para INSERT. Rodar a consulta da PARTE 5 e revisar.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — A regra única de acesso
--
-- security definer: lê usuarios_permitidos ignorando o RLS daquela
-- tabela, o que evita recursão (política consultando tabela com política).
-- O admin geral passa sempre, mesmo sem linha em usuarios_permitidos.
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
-- PARTE 2 — O FURO PRINCIPAL: remover a escrita aberta em `estoque`
--
-- Só remove a política aberta. A política correta
-- ("Escrita admin ou gerente da unidade") já existe e passa a valer de
-- verdade a partir daqui — inclusive a regra de gerente por unidade.
-- ---------------------------------------------------------------------

drop policy if exists "Escrita para logados" on estoque;


-- ---------------------------------------------------------------------
-- PARTE 3 — Leitura: exigir conta aprovada
--
-- Os nomes abaixo vieram do diagnóstico; todas se chamam
-- "Leitura para logados".
-- ---------------------------------------------------------------------

drop policy if exists "Leitura para logados" on estoque;
create policy "Leitura para aprovados"
  on estoque for select to authenticated
  using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on fichas_tecnicas;
create policy "Leitura para aprovados"
  on fichas_tecnicas for select to authenticated
  using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on bobinas_aco;
create policy "Leitura para aprovados"
  on bobinas_aco for select to authenticated
  using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on gerentes_unidade;
create policy "Leitura para aprovados"
  on gerentes_unidade for select to authenticated
  using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on editores_bobinas;
create policy "Leitura para aprovados"
  on editores_bobinas for select to authenticated
  using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on contagem_fisica;
drop policy if exists "Leitura para logados" on contagem_bobinas;
drop policy if exists "Leitura para logados" on atribuicoes_corredor;
drop policy if exists "Leitura para logados" on contagem_bobinas_ocr;

-- `acessos` é log de login. Não há motivo para todos verem o de todos.
drop policy if exists "Ver acessos" on acessos;
create policy "Ver acessos - admin"
  on acessos for select to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'robson_alves1995@live.com');


-- ---------------------------------------------------------------------
-- PARTE 4 — Contagem: escrita só para conta aprovada
--
-- Aqui NÃO se restringe a "editores": quem conta no chão de fábrica não
-- é editor. A regra certa é "conta aprovada" — fecha o furo sem quebrar
-- o trabalho de contagem.
-- ---------------------------------------------------------------------

drop policy if exists "Escrita para logados" on contagem_fisica;
create policy "Contagem para aprovados"
  on contagem_fisica for all to authenticated
  using (public.esta_aprovado())
  with check (public.esta_aprovado());

drop policy if exists "Escrita para logados" on contagem_bobinas;
create policy "Contagem para aprovados"
  on contagem_bobinas for all to authenticated
  using (public.esta_aprovado())
  with check (public.esta_aprovado());

drop policy if exists "Escrita para logados" on atribuicoes_corredor;
create policy "Corredor para aprovados"
  on atribuicoes_corredor for all to authenticated
  using (public.esta_aprovado())
  with check (public.esta_aprovado());

drop policy if exists "Escrita para logados" on contagem_bobinas_ocr;
create policy "OCR para aprovados"
  on contagem_bobinas_ocr for all to authenticated
  using (public.esta_aprovado())
  with check (public.esta_aprovado());


-- ---------------------------------------------------------------------
-- PARTE 5 — VERIFICAÇÃO. Rodar depois e conferir.
--
-- Esta consulta traz USING e WITH CHECK. Não deve sobrar nenhuma linha
-- com `true` nas colunas de condição, exceto onde for intencional.
-- Se sobrar, é política permissiva que anula a correção — manda o
-- resultado.
-- ---------------------------------------------------------------------

select
  tablename,
  policyname,
  cmd,
  qual        as usando,
  with_check  as verificando
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
