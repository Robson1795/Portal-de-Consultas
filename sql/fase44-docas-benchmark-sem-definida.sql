-- Fase 44 -- Duas docas a mais: "Benchmark" e "Sem doca definida"
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase39-painel-docas.sql (tabela `docas`).
--
-- O Robson: "coloque aqui tambem, SEM DOCA DEFINIDA, BENCHMARK... o
-- BENCHMARK é la em cima em outro galpao, sem doca definida é que as
-- vezes nao sabem em qual vao carregar ainda". Perguntado se as duas
-- deveriam funcionar como as 3 docas de verdade (cronômetro, progresso,
-- coluna no quadro) ou só uma marcação sem acompanhamento, confirmou
-- que sim, iguais às três.
--
-- Só um INSERT -- nenhuma tabela nem coluna nova. `docas` já é a fonte
-- única de tudo isso (quadro principal, "Em qual doca encostou?", o
-- seletor por pedido na aba DOCA do Controle EXP); as duas entram na
-- mesma lista e o resto do sistema já sabe lidar com mais de 3 (o
-- quadro usa grid `auto-fit`, cresce sozinho).
--
-- "Benchmark" fica por último na ordem: é outro galpão, fisicamente longe
-- das 3 docas de verdade -- não faz sentido aparecer misturada entre
-- elas no quadro. "Sem doca definida" fica ANTES dela (mas depois das
-- três numeradas): é usada com mais frequência que o Benchmark (qualquer
-- caminhão sem doca decidida ainda passa por ela), então mais perto do
-- começo da fileira ajuda a achar rápido.
insert into docas (unidade, nome, ordem) values
  ('106', 'Sem doca definida', 4),
  ('106', 'Benchmark', 5)
on conflict (unidade, nome) do nothing;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select unidade, nome, ordem, ativa from docas where unidade = '106' order by ordem;
