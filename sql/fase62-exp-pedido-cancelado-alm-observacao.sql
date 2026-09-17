-- Fase 62 -- Devolução ao almoxarifado: leva junto a observação escrita em Parados
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase61-exp-pedido-cancelado-alm.sql.
--
-- O Robson escreveu na observação do pedido, na própria aba Parados:
-- "PEDIDO CANCELADO, VOLTAR PARA O ALMOXARIFADO JA ESTORNADO LOCALIZAÇAO ALM
-- B-01-02" -- e pediu um botão pra mandar isso direto, sem precisar do 🗑
-- (que exclui o pedido de Parados; a notificação sozinha não deveria exigir
-- excluir nada). Confirmado: "deixe liberado para ir o que eu escrever na
-- observação" -- o texto vai inteiro, sem filtro nem validação de formato.
--
-- Campo separado de `itens_resumo` (fase61) porque a observação é do PEDIDO
-- (paradosObsMap, uma por pedido), não do item.
alter table exp_pedido_cancelado_alm add column if not exists observacao text;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_pedido_cancelado_alm' and column_name = 'observacao';
