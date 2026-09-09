-- =====================================================================
-- REQUISIÇÃO ALM: A TRAVA DE `status` PASSA A ACEITAR 'concluida'
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Rode DEPOIS do sql/fase24-requisicao-concluida.sql.
-- =====================================================================
--
-- O QUE ACONTECEU
--
-- O fase24 acrescentou `concluido_em` e `concluido_por` e a tela passou a
-- gravar `status = 'concluida'`. Só que desde o fase6 existe uma trava:
--
--     alter table requisicoes_alm
--       add constraint requisicoes_alm_status_valido
--       check (status in ('rascunho', 'enviada'));
--
-- Então clicar em "Concluir" devolvia:
--
--     new row for relation "requisicoes_alm" violates check constraint
--     "requisicoes_alm_status_valido"
--
-- Eu escrevi o fase24 olhando as colunas e esqueci de procurar a trava do
-- próprio campo que a tela ia escrever. A lição, para a próxima vez que um
-- status ganhar um valor novo neste projeto: **procure o `check` antes**. Há
-- outros quatro, em `pedidos`, `pedido_itens`, `exp_acessorios` e
-- `exp_controle_itens` -- todos com o mesmo padrão de nome
-- (`<tabela>_status_valido`).
--
-- A trava é boa e fica: é ela que impede um status escrito errado ("Concluida",
-- "concluído", "CONCLUIDA") de entrar no banco e virar quatro estados onde
-- deveria haver um. O que estava errado era a lista, não a existência dela.
-- =====================================================================

-- `drop` + `add` porque `check` não se altera no lugar. Fica dentro de um
-- bloco para o script poder ser rodado de novo sem erro.
do $$
begin
  alter table requisicoes_alm drop constraint if exists requisicoes_alm_status_valido;

  alter table requisicoes_alm
    add constraint requisicoes_alm_status_valido
    check (status in ('rascunho', 'enviada', 'concluida'));

  raise notice 'requisicoes_alm.status agora aceita rascunho, enviada e concluida';
end $$;


-- ---------------------------------------------------------------------
-- Conferência
--
-- 1ª: a definição da trava, que tem de listar os três valores.
-- 2ª: quantas requisições há por status. Nenhuma 'concluida' ainda é o
--     esperado -- a que você tentou concluir foi recusada pela trava, então
--     continua como 'enviada'. Clique em Concluir de novo depois de rodar
--     isto: nada se perdeu.
-- ---------------------------------------------------------------------

select c.conname                   as restricao,
       pg_get_constraintdef(c.oid) as definicao
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
 where t.relname = 'requisicoes_alm'
   and c.conname = 'requisicoes_alm_status_valido';

select coalesce(status, '(nulo)') as status,
       count(*)                   as requisicoes,
       count(*) filter (where concluido_em is not null) as com_data_de_conclusao
  from requisicoes_alm
 group by status
 order by status;
