-- =====================================================================
-- E-MAIL DO PCP por unidade -- pro relatorio de saidas do Controle EXP
-- Acessorios (o Robson confere com o PCP se o que carregou foi faturado).
--
-- Mesmo padrao de emails_alm (fase6-requisicao-alm.sql): fica em
-- config_unidade, editavel na aba Configuracoes -- NAO fixo no codigo,
-- porque cada unidade tem seu proprio PCP (confirmado: a unidade 106 usa
-- "Mail PCP - 106" <pcparaquari@kingspanisoeste.com.br>, outra unidade
-- teria outro endereco).
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- =====================================================================

alter table config_unidade add column if not exists email_pcp text;

-- Verificacao
select column_name, data_type from information_schema.columns
 where table_name = 'config_unidade' order by ordinal_position;
