-- =====================================================================
-- DEPÓSITO BENCHMARK -- mesma estrutura do Controle EXP Acessórios,
-- separando o que está fisicamente no Benchmark do que está no EXP
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende de sql/programacao-03-controle-exp.sql já ter rodado.
--
-- ⚠️ Se der "deadlock detected", feche as abas do portal e rode de novo.
--
-- POR QUE ISSO EXISTE
--
-- O Robson: itens da expedição às vezes ficam guardados fisicamente no
-- espaço do Benchmark, não no setor de acessórios (EXP). Contar tudo numa
-- lista só confundia o inventário -- não dava pra saber onde o item estava
-- de verdade sem ir olhar fisicamente nos dois lugares.
--
-- POR QUE UMA COLUNA NOVA NA MESMA TABELA, E NÃO UMA TABELA PRÓPRIA
--
-- "Depósito Benchmark" é o MESMO modelo do Controle EXP Acessórios --
-- mesmas colunas, mesmo fluxo de Entrada/Saída-Conferência, mesmo Catálogo
-- EXP como referência pra descrição/UM. Duplicar a tabela duplicaria toda a
-- lógica de js/programacao.js (gravação, edição por célula, etiqueta,
-- exportar, imprimir, relatório pro PCP) -- e cedo ou tarde uma correção
-- seria feita num lugar só e esquecida no outro (é o item A1 da
-- AUDITORIA.md, já citado várias vezes neste projeto). Uma coluna `setor`
-- na mesma tabela deixa TODA a lógica compartilhada; só o que é listado em
-- cada tela muda, filtrado no cliente por `setor` (mesmo princípio já usado
-- pra unidade: nunca confiar só no filtro do servidor).
--
-- O Catálogo EXP (`catalogo_exp_itens`) continua único e compartilhado --
-- não ganha coluna de setor nenhuma, porque o Robson pediu explicitamente
-- pra usar o MESMO catálogo como referência nos dois setores.
-- =====================================================================

alter table exp_controle_itens
  add column if not exists setor text not null default 'exp';

do $$
begin
  alter table exp_controle_itens
    add constraint exp_controle_itens_setor_valido
    check (setor in ('exp', 'benchmark'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_exp_controle_setor on exp_controle_itens (unidade, setor);

-- Verificação
select column_name, data_type, column_default
  from information_schema.columns
 where table_name = 'exp_controle_itens' and column_name = 'setor';
