-- =====================================================================
-- ESTOQUE MINIMO por item -- pra avisar quando o saldo ficou baixo.
--
-- O Robson pediu uma telinha (visivel só pra ele) que mostra quantos itens
-- estao com saldo abaixo do minimo cadastrado. Fica junto do item na
-- Consulta de Itens (aba ALM) -- por linha (item+localizacao), nao por
-- codigo agregando todas as localizacoes.
--
-- Nao precisa de politica de RLS nova: a tabela `estoque` ja tem
-- "Escrita admin ou gerente da unidade" (sql/fase1c-rls.sql), que cobre
-- update tambem (for all), nao so insert/delete em massa.
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- =====================================================================

alter table estoque add column if not exists estoque_minimo numeric;

-- Verificacao
select column_name, data_type from information_schema.columns
 where table_name = 'estoque' order by ordinal_position;
