-- Fase 42 -- Tipo de frete (CIF/FOB) no Painel de Docas
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase39-painel-docas.sql.
--
-- O Robson, olhando o painel já em uso: "coloque tambem cif ou fob".
--
-- CIF (frete por conta da Kingspan) x FOB (frete por conta do cliente/
-- transportadora dele) muda quem decide prioridade e quem cobra atraso --
-- é dado de operação, não observação solta, por isso vira coluna própria
-- (mesmo raciocínio de `destino`/`telefone_motorista`, fase40) e não mais
-- um texto dentro de `observacao`.
--
-- Só duas opções, por isso `check` em vez de tabela de cadastro (como
-- seriam os motivos de atraso da fase 2): é sigla do comércio exterior/
-- logística, não um vocabulário que a operação vá querer editar.
alter table doca_carregamentos add column if not exists frete text;

alter table doca_carregamentos drop constraint if exists doca_carregamentos_frete_valido;
alter table doca_carregamentos
  add constraint doca_carregamentos_frete_valido
  check (frete is null or frete in ('CIF', 'FOB'));

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'doca_carregamentos' and column_name = 'frete';

select conname as restricao, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'doca_carregamentos'::regclass
   and conname = 'doca_carregamentos_frete_valido';
