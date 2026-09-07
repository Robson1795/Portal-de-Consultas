-- =====================================================================
-- Nº DA OP no Controle EXP -- nem todo item tem (só os de produção, que
-- vêm com OP/lote da fábrica; item de estoque comum não tem OP nenhuma).
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende de sql/programacao-03-controle-exp.sql (a tabela exp_controle_itens).
-- =====================================================================

alter table exp_controle_itens add column if not exists numero_os_op text;

-- Verificacao
select column_name, data_type from information_schema.columns
 where table_name = 'exp_controle_itens' order by ordinal_position;
