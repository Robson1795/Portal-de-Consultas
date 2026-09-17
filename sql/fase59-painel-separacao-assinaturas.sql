-- Fase 59 -- Painel de Separação: quem separou e quem conferiu, por item
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de programacao-01-tabelas-e-rls.sql.
--
-- O Robson trouxe um protótipo de "Tela de Monitoramento e Separação" feita
-- pro auxiliar operar de pé, em monitor grande/tablet, e pediu: "minha ideia
-- é fazer a programação desse modelo". Decidido (17/09/2026) que ela entra
-- como TELA NOVA, ao lado da aba Separação que já existe -- são usos e
-- pessoas diferentes: a aba atual é a visão do líder (filtros, busca,
-- Pendências, marcar pedido inteiro), esta é a do auxiliar separando.
--
-- O que o banco ainda não guardava: QUEM fez, pelo nome.
-- `separado_por` já existe, mas é o uuid de quem estava logado no portal --
-- e no almoxarifado o tablet fica numa bancada, com uma conta só, enquanto
-- JOEL, NILSON, ANGEL, ANGELO e MAIKO se revezam separando itens do mesmo
-- pedido. Quem clica não é necessariamente quem separou.
--
-- Por que DOIS nomes por item, e não um: os itens com OP são produzidos no
-- CDB (corte e dobra), por equipe própria, que já separa E confere cada peça
-- na hora. Os itens sem OP (parafuso, massa, fita) são conferidos só no fim
-- do pedido, na bancada -- por isso esses gravam só quem separou, e a
-- conferência deles é a assinatura do pedido inteiro, abaixo.
alter table pedido_itens add column if not exists separado_por_nome  text;
alter table pedido_itens add column if not exists conferido_por_nome text;

-- SEPARADO e OP REPORTADA são duas confirmações INDEPENDENTES no protótipo:
-- o almoxarifado embala a peça, e separadamente confere no Datasul que a
-- produção lançou o apontamento da OP. O Robson relatou item já embalado com
-- a OP esquecida sem reporte, virando problema de estoque/fiscal.
--
-- `status_separacao` já cobre a ordem normal disso ('falta_reporte' = separado
-- com reporte pendente, 'reportado' = os dois feitos) e continua sendo a
-- fonte de verdade pra todo o resto do portal -- aba Separação, EXP, painel
-- de docas e o gatilho `recalcular_status_pedido()` leem essa coluna, e mudar
-- o sentido dela quebraria os quatro de uma vez.
--
-- Esta coluna existe só pro caso que o enum não representa: a OP ser
-- reportada ANTES de a peça ser separada. Quem lê deve considerar reportada
-- quando `op_reportada` é true OU `status_separacao` = 'reportado'.
alter table pedido_itens add column if not exists op_reportada boolean not null default false;

-- Assinatura do pedido inteiro, escolhida no pop-up de "Concluir Pedido".
-- Mantida de propósito mesmo com a assinatura item a item acima: cobre o
-- responsável geral pelo pedido e é, na prática, o registro da conferência
-- final de bancada/pallet dos itens sem OP, que nunca são conferidos um a um.
alter table pedidos add column if not exists separador_nome  text;
alter table pedidos add column if not exists conferente_nome text;
alter table pedidos add column if not exists concluido_em    timestamptz;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select table_name, column_name, data_type
  from information_schema.columns
 where (table_name = 'pedido_itens' and column_name in ('separado_por_nome', 'conferido_por_nome', 'op_reportada'))
    or (table_name = 'pedidos' and column_name in ('separador_nome', 'conferente_nome', 'concluido_em'))
 order by table_name, column_name;
