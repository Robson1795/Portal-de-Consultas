-- =====================================================================
-- A4 DA AUDITORIA — apagar a contagem da unidade passa a ser de admin
--                   ou do gerente daquela unidade
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- ⚠️ Se der "deadlock detected", feche as abas do portal (as suas e as do
--    Robson) e rode de novo: `contagem_fisica` tem tempo real, e uma aba
--    aberta segura a tranca. Já aconteceu duas vezes neste projeto.
-- =====================================================================
--
-- O PROBLEMA
--
-- O botão "Limpar tudo" apaga a contagem física inteira de uma unidade,
-- para todos, no meio de um inventário — e não dá para desfazer. A única
-- proteção era o confirm() do navegador.
--
-- Depois da Fase 1, a política de escrita em `contagem_fisica` ficou assim:
--
--     create policy "Contagem ALM" on contagem_fisica
--       for all to authenticated
--       using (eh_admin() or (meu_perfil() = 'estoque_alm' and ...))
--
-- `for all` inclui DELETE. Ou seja: qualquer conta aprovada com perfil
-- `estoque_alm` da unidade podia zerar a contagem da unidade. Amplo demais
-- para uma ação irreversível — contar é uma coisa, apagar a contagem de
-- todos é outra.
--
-- POR QUE NÃO BASTA ACRESCENTAR UMA POLÍTICA
--
-- No Postgres as políticas permissivas se SOMAM (OU, não E). Criar uma
-- política restritiva de DELETE ao lado da "Contagem ALM" não tiraria nada:
-- a permissiva continuaria valendo e o DELETE seguiria liberado. Foi
-- exatamente esse o furo do diagnóstico de 02/09 na tabela `estoque`, onde
-- uma política aberta anulava a restrita.
--
-- Então a "Contagem ALM" é REMOVIDA e reconstruída em três: insert, update
-- e delete separados. Só o delete muda de dono.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — Reconstrói a escrita de `contagem_fisica`
-- ---------------------------------------------------------------------

-- A política que cobria tudo, inclusive o DELETE.
drop policy if exists "Contagem ALM" on contagem_fisica;

-- Idempotência: se este script já rodou, apaga o que ele mesmo criou.
drop policy if exists "Contagem ALM insere"  on contagem_fisica;
drop policy if exists "Contagem ALM altera"  on contagem_fisica;
drop policy if exists "Apagar contagem e do admin ou gerente" on contagem_fisica;

-- Contar (inserir e alterar): segue como antes, do estoque_alm da própria
-- unidade. `minha_unidade() is null` continua aceito para não travar quem
-- ainda não tem unidade definida no cadastro.
create policy "Contagem ALM insere" on contagem_fisica
  for insert to authenticated
  with check (
    public.eh_admin()
    or (public.meu_perfil() = 'estoque_alm'
        and (public.minha_unidade() is null or public.minha_unidade() = unidade))
  );

create policy "Contagem ALM altera" on contagem_fisica
  for update to authenticated
  using (
    public.eh_admin()
    or (public.meu_perfil() = 'estoque_alm'
        and (public.minha_unidade() is null or public.minha_unidade() = unidade))
  )
  with check (
    public.eh_admin()
    or (public.meu_perfil() = 'estoque_alm'
        and (public.minha_unidade() is null or public.minha_unidade() = unidade))
  );

-- Apagar: admin, ou quem está em `gerentes_unidade` daquela unidade.
-- `pode_atualizar_estoque()` já é exatamente essa pergunta, e é a mesma
-- função que autoriza substituir a planilha de estoque da unidade — quem
-- carrega a planilha é quem pode zerar a contagem.
create policy "Apagar contagem e do admin ou gerente" on contagem_fisica
  for delete to authenticated
  using (public.pode_atualizar_estoque(unidade));


-- ---------------------------------------------------------------------
-- PARTE 2 — Conferência
--
-- Esperado: quatro linhas para `contagem_fisica` —
--   Leitura para aprovados                 SELECT
--   Contagem ALM insere                    INSERT
--   Contagem ALM altera                    UPDATE
--   Apagar contagem e do admin ou gerente  DELETE
--
-- Se ainda aparecer alguma política com comando `ALL`, ela engloba o DELETE
-- e anula a restrição: apague-a antes de considerar o item resolvido.
-- ---------------------------------------------------------------------

select policyname as politica,
       cmd        as comando,
       permissive
  from pg_policies
 where schemaname = 'public'
   and tablename = 'contagem_fisica'
 order by cmd, policyname;
