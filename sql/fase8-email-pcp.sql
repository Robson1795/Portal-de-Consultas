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

-- Mesmo padrao de emails_alm_da_unidade() (fase7-senhas-na-aba-admin.sql):
-- desde a fase7, config_unidade só é lida direto por admin ("Admin le
-- config"). Quem NÃO é admin (estoque_alm, que também acessa o Controle
-- EXP Acessórios) precisa de uma função própria pra ler só o e-mail do
-- PCP, sem abrir a tabela inteira nem as senhas.
create or replace function public.email_pcp_da_unidade(uni text)
returns text language sql stable security definer set search_path = public as $$
  select case when public.esta_aprovado()
    then (select c.email_pcp from public.config_unidade c where c.unidade = uni)
    else null end;
$$;

grant execute on function public.email_pcp_da_unidade(text) to authenticated;

-- Verificacao
select column_name, data_type from information_schema.columns
 where table_name = 'config_unidade' order by ordinal_position;
