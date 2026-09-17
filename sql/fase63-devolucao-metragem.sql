-- Fase 63 -- Devolução: metragem (m²) calculada em cada item
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase52-devolucao.sql.
--
-- O Robson: "essa contagem metragem joga dentro da aba devolução, dai ja
-- sai todos os dados junto" (17/09/2026) -- sobre a Contagem por Metragem
-- (calculadora avulsa, m² = qtd peças x metragem x fator conforme a
-- descrição: FRIGO/EVO-FACHADA/TELHA). Perguntado se era calculadora à
-- parte dentro da tela ou o m² calculado no próprio item da devolução,
-- confirmado o segundo: "Calculada em cada item" -- pra sair junto com
-- NF/código/localização na mesma linha, tabela e etiqueta, sem abrir outra
-- tela pra cruzar o número.
--
-- Dois campos novos, não um "m2" gravado: o resultado (qtd_pecas x
-- metragem_peca x fator-da-descrição) é recalculado na hora de mostrar,
-- mesmo princípio do resto do portal ("não grava o que dá pra calcular na
-- hora") -- ver calcularLinhaMetragem() em js/metragem.js, reaproveitada
-- por js/devolucao.js.
--
-- Nem todo item de devolução é painel/telha (parafuso, massa, gaxeta não
-- têm "metragem por peça" nem cabem nas 3 categorias) -- por isso os dois
-- campos são OPCIONAIS: item sem os dois simplesmente não calcula m² nenhum,
-- nem na tela nem na etiqueta.
alter table devolucao_itens add column if not exists qtd_pecas     numeric;
alter table devolucao_itens add column if not exists metragem_peca numeric;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'devolucao_itens' and column_name in ('qtd_pecas', 'metragem_peca')
 order by column_name;
