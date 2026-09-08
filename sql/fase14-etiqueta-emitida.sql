-- =====================================================================
-- ETIQUETA EMITIDA — indicador no Controle EXP Acessórios, aba Entrada
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Depende de sql/programacao-03-controle-exp.sql (exp_controle_itens).
-- =====================================================================
--
-- O QUE É
--
-- Na lista do Controle EXP, uma coluna "Etiqueta" com ✓ para o item cuja
-- etiqueta já foi emitida. Sem isso, quem chega no meio do turno não tem
-- como saber o que já foi etiquetado e o que não -- e etiqueta de novo, ou
-- deixa passar.
--
-- Quem marca é o próprio Imprimir do Controle EXP: imprimir a lista É o ato
-- de emitir as etiquetas, então a marcação sai junto. Marcar num segundo
-- clique seria mais um passo para esquecer, e a lista passaria a mentir.
--
-- POR QUE timestamptz E NÃO boolean
--
-- Um `boolean etiqueta_emitida` responde "está etiquetado?". A data responde
-- também "desde quando?" e "quem emitiu?" -- que é o que se pergunta quando
-- há divergência no inventário. Custa o mesmo e diz mais.
--
-- Reimprimir NÃO reescreve a data: o portal só marca as linhas que ainda não
-- tinham etiqueta, então a primeira emissão fica preservada.
-- =====================================================================

alter table exp_controle_itens
  add column if not exists etiqueta_emitida_em timestamptz;

alter table exp_controle_itens
  add column if not exists etiqueta_emitida_por text;

-- A pergunta frequente é "o que ainda não foi etiquetado nesta unidade?".
-- O índice parcial cobre exatamente ela, e fica pequeno porque só indexa as
-- linhas pendentes -- que são as que diminuem conforme o turno avança.
create index if not exists idx_exp_controle_sem_etiqueta
  on exp_controle_itens (unidade, localizacao)
  where etiqueta_emitida_em is null;


-- ---------------------------------------------------------------------
-- Conferência
--
-- Deve listar as duas colunas novas. E o segundo select mostra, por
-- unidade, quantas linhas já têm etiqueta e quantas faltam.
-- ---------------------------------------------------------------------

select column_name, data_type
  from information_schema.columns
 where table_name = 'exp_controle_itens'
   and column_name in ('etiqueta_emitida_em', 'etiqueta_emitida_por')
 order by column_name;

select unidade,
       count(*)                                            as itens,
       count(etiqueta_emitida_em)                          as com_etiqueta,
       count(*) - count(etiqueta_emitida_em)               as sem_etiqueta
  from exp_controle_itens
 group by unidade
 order by unidade;
