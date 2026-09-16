-- Fase 57 -- Sequência da Separação: ordem da planilha de Carregamento colada
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende da Fase 1 do portal e de programacao-01-tabelas-e-rls.sql.
--
-- O Robson, vendo a coluna Embarque nova mostrar "16/09 —" (data sim, hora
-- não) na maioria dos pedidos: "faça a sequencia de pedido conforme
-- horario de agendamento dos caminhões". Corrigido comparando por DATA
-- primeiro (fase anterior, sem SQL) -- mas pedidos do MESMO dia, ambos SEM
-- hora (o caso mais comum), ainda empatavam entre si sem nenhum critério.
--
-- Perguntado o que decide a ordem nesse empate: "a ordem que aparece na
-- planilha colada" -- o PCP já digita a planilha de Carregamento numa
-- sequência que reflete a intenção de carregamento, mesmo quando ainda não
-- tem hora exata pra cada pedido.
--
-- `ordem_carregamento` guarda a posição em que o pedido apareceu na ÚLTIMA
-- planilha de Carregamento colada (1ª ocorrência, se o pedido repetir em
-- várias linhas) -- ver `importarPlanilhaB()` em js/programacao.js.
alter table pedidos add column if not exists ordem_carregamento integer;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'pedidos' and column_name = 'ordem_carregamento';
