-- =====================================================================
-- SAIDA DO CONTROLE EXP -- o item sai da localizacao pro carregamento
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende de sql/programacao-03-controle-exp.sql (a tabela exp_controle_itens).
--
-- O Controle EXP (migration 03) e a ENTRADA: onde o item foi guardado na
-- expedicao. Isto aqui e a SAIDA: quando o conferente vem, confere e retira
-- o item daquela localizacao pra entregar ao carregamento. E o mesmo
-- registro, so muda de status -- nao apaga (fica o historico de quem
-- retirou e quando).
-- =====================================================================

alter table exp_controle_itens add column if not exists status text not null default 'na_expedicao';
alter table exp_controle_itens add column if not exists retirado_por text;
alter table exp_controle_itens add column if not exists retirado_em timestamptz;

do $$
begin
  alter table exp_controle_itens
    add constraint exp_controle_itens_status_valido
    check (status in ('na_expedicao', 'retirado'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_exp_controle_status on exp_controle_itens (unidade, status, localizacao);

-- Verificacao
select column_name, data_type, column_default from information_schema.columns
 where table_name = 'exp_controle_itens' order by ordinal_position;
