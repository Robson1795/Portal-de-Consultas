-- Fase 58 -- Pendências: item que não tem em estoque sai da lista de separação
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de programacao-01-tabelas-e-rls.sql.
--
-- O Robson, apontando itens com "SEM SALDO PEDIDO 313.412" na observação:
-- "esses itens nao tenho em estoque dai quero que crie uma nova aba de
-- pendencias e jogue esses itens la, dai pode limpar ele da aba separação".
--
-- Por que uma COLUNA nova e não um status novo em `status_separacao`:
-- pendência não é etapa da separação, é o motivo de ela não poder acontecer.
-- O item continua `aguardando` -- porque continua devendo -- e o gatilho
-- `recalcular_status_pedido()` segue contando ele como pendente, que é a
-- verdade: o pedido não está completo. Enfiar um valor novo no status
-- mudaria o sentido de tudo que já lê essa coluna (a aba EXP, o painel de
-- docas, o status consolidado do pedido).
alter table pedido_itens add column if not exists em_pendencia    boolean not null default false;
alter table pedido_itens add column if not exists pendencia_motivo text;
alter table pedido_itens add column if not exists pendencia_em     timestamptz;
alter table pedido_itens add column if not exists pendencia_por    uuid references auth.users(id);

-- A aba lista só os itens em pendência da unidade; sem isto seria varredura
-- na tabela inteira toda vez que alguem abre a aba.
create index if not exists idx_pedido_itens_pendencia
  on pedido_itens (em_pendencia)
  where em_pendencia;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type
  from information_schema.columns
 where table_name = 'pedido_itens'
   and column_name in ('em_pendencia', 'pendencia_motivo', 'pendencia_em', 'pendencia_por')
 order by column_name;
