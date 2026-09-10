-- =====================================================================
-- DEPÓSITO BENCHMARK vira saldo simples, igual ao Almoxarifado/SESMT
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Depende de sql/fase23-sesmt-deposito.sql já ter rodado (é ele que cria a
-- coluna `deposito` em `estoque`, `contagem_fisica` e `atribuicoes_corredor`,
-- e a restrição que hoje só aceita 'alm' ou 'sesmt').
-- =====================================================================
--
-- O QUE MUDOU E POR QUÊ
--
-- Até aqui, "Depósito Benchmark" era o MESMO modelo do Controle EXP
-- Acessórios: mesma tabela (exp_controle_itens), mesmo fluxo de
-- Entrada/Saída-Conferência, filtrado pela coluna `setor` (ver
-- sql/fase18-deposito-benchmark.sql). Fazia sentido pra rastrear pedido,
-- etiqueta e status de item de expedição guardado ali.
--
-- O Robson (10/09/2026), vendo a tela de Atualizar estoques em lote (que já
-- tem Almoxarifado, SESMT, Catálogo EXP e Aço) e uma planilha de saldo do
-- Benchmark pronta pra colar: *"deposito benchmark quero usar por aqui,
-- quero que mude a estrutura igual como é do almoxarifado"*. Ou seja: não é
-- mais controle por pedido -- é saldo por item e localização, substituído
-- inteiro ao colar uma planilha nova, exatamente como o Almoxarifado e o
-- SESMT.
--
-- A aba antiga de Entrada/Saída/Conferência do Benchmark (Programação de
-- Separação) foi retirada do menu -- confirmado com o Robson que pode sair,
-- já que não tinha nenhum pedido registrado nela. O código que a mantinha
-- (setorExpAtual = 'benchmark') fica no histórico em js/programacao.js, sem
-- nada mais chamando -- mesmo princípio do fase26 (sql/fase26-exp-em-
-- lote.sql) já registrado neste projeto: função/caminho que sobra é pior
-- que código morto só se alguém ainda o chamar sem querer.
--
-- Este script só troca a restrição de `deposito` pra aceitar 'benchmark'
-- também -- a coluna, o índice e a chave primária já existem desde o
-- fase23, prontos pra qualquer valor de depósito.
-- =====================================================================

-- Conferência ANTES: precisa estar zerado (ou quase) pra essa migração ser
-- indolor. Se aparecer alguma linha aqui, ela fica ONDE ESTÁ (o Controle EXP
-- Acessórios continua enxergando o setor 'benchmark' normalmente -- nada foi
-- apagado) -- só não é mais alcançável pelo menu.
select unidade, setor, status, count(*) as registros
  from exp_controle_itens
 where setor = 'benchmark'
 group by unidade, setor, status
 order by unidade, status;

do $$
declare t text;
begin
  foreach t in array array['estoque', 'contagem_fisica', 'atribuicoes_corredor'] loop
    execute format('alter table %I drop constraint if exists %I', t, t || '_deposito_valido');
    execute format('alter table %I add constraint %I check (deposito in (''alm'', ''sesmt'', ''benchmark''))',
                   t, t || '_deposito_valido');
  end loop;
end $$;

-- Conferência DEPOIS: as três restrições, já com 'benchmark' na lista.
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conname in ('estoque_deposito_valido', 'contagem_fisica_deposito_valido',
                    'atribuicoes_corredor_deposito_valido')
 order by tabela;
