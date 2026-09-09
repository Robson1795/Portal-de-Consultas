-- =====================================================================
-- REQUISIÇÃO ALM: MARCAR COMO CONCLUÍDA
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Rode DEPOIS do sql/fase6-requisicao-alm.sql.
-- =====================================================================
--
-- POR QUE
--
-- `requisicoes_alm.status` só tinha 'rascunho' e 'enviada'. Requisição
-- atendida ficava "enviada" para sempre: a lista só crescia, e quem abrisse a
-- tela não distinguia o que ainda falta chegar do que já foi entregue meses
-- atrás. Pedido do Victor em 09/09/2026.
--
-- 'concluida' é um terceiro estado, e não uma coluna booleana à parte, porque
-- os três são mutuamente exclusivos: uma requisição está em UM desses lugares,
-- e um booleano ao lado do status abriria a porta para "rascunho e concluída
-- ao mesmo tempo" -- estado que não existe no mundo real e que a tela teria de
-- decidir como desenhar.
--
-- `concluido_em` é `timestamptz` e não boolean pelo mesmo motivo do
-- `etiqueta_emitida_em` do Controle EXP: a data também responde "quando" e
-- "quem", que é o que se pergunta quando alguém diz que não recebeu. Custa o
-- mesmo e diz mais.
-- =====================================================================

alter table requisicoes_alm add column if not exists concluido_em  timestamptz;
alter table requisicoes_alm add column if not exists concluido_por text;

-- Índice parcial: a pergunta frequente é "o que ainda não foi atendido", então
-- ele fica pequeno -- só as requisições em aberto entram.
create index if not exists idx_requisicoes_alm_em_aberto
  on requisicoes_alm (unidade, criado_em desc)
  where concluido_em is null;

-- O RLS de `requisicoes_alm` (fase6) já cobre estas colunas: política é da
-- tabela, não da coluna. NÃO recrie as políticas aqui -- era assim que o
-- sql/bobinas-aco.sql reabria a escrita que a Fase 1 havia fechado.
--
-- Consequência de propósito: quem já podia editar a requisição (o autor, o
-- estoque_alm da unidade e o admin) pode concluí-la. Inclusive o autor, e isso
-- é útil: "recebi o material" é informação dele. Quem concluiu fica gravado em
-- `concluido_por`, então a informação não se perde.


-- ---------------------------------------------------------------------
-- Conferência
--
-- 1ª: as duas colunas novas.
-- 2ª: quantas requisições há por unidade e status. Esperado logo depois de
--     rodar: nenhuma 'concluida' (ninguém concluiu nada ainda).
-- ---------------------------------------------------------------------

select column_name, data_type
  from information_schema.columns
 where table_name = 'requisicoes_alm'
   and column_name in ('status', 'concluido_em', 'concluido_por')
 order by column_name;

select unidade, status,
       count(*)                                as requisicoes,
       count(*) filter (where concluido_em is not null) as concluidas
  from requisicoes_alm
 group by unidade, status
 order by unidade, status;
