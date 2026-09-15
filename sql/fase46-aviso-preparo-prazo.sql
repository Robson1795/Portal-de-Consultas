-- Fase 46 -- Prazo do aviso de preparo (imediata ou horário estimado)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase45-aviso-preparo-pedido.sql.
--
-- O Robson, com a aba "Preparar" já em uso: "quero um botao de retornar
-- caso nao precise mais separar e tambem uma area aonde o encarregado
-- coloque se a separaçao é imediata, ou ele colloca o tempo estimado que
-- tem que deixar pronto".
--
-- `prazo_em` NULO = imediata (o padrão -- é pra agora, sem horário
-- marcado). Preenchido = "precisa estar pronto até este horário". Uma
-- coluna só, não um texto "imediata"/"prazo" à parte: nulo já responde
-- sozinho "tem prazo marcado ou não", e ordenar/comparar data é o que a
-- tela precisa fazer (quem está mais perto de vencer sobe pro topo).
alter table exp_pedido_aviso_preparo add column if not exists prazo_em timestamptz;

-- "Botao de retornar caso nao precise mais separar" não precisa de coluna
-- nova nenhuma -- é a MESMA linha sendo apagada (delete), porque o pedido
-- nunca chegou a ser preparado: diferente de marcar "preparado" (que é
-- fato, fica no histórico), cancelar é "isso não devia estar na lista",
-- e apagar é justamente pra não sobrar rastro de uma preparação que não
-- aconteceu.

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_pedido_aviso_preparo' and column_name = 'prazo_em';
