-- =====================================================================
-- ESTOQUE SEGURO: alinhar por ITEM (dentro do mesmo depósito), não por
-- localização
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Rode DEPOIS do sql/fase23-sesmt-deposito.sql (a coluna `deposito`
-- precisa já existir em `estoque`).
--
-- Renumerado pra fase25 em 09/09/2026: o Victor já tinha usado fase23
-- (sql/fase23-sesmt-deposito.sql) e fase24 (sql/fase24-requisicao-
-- concluida.sql) no mesmo dia.
--
-- POR QUÊ
--
-- O fase12 guardava o Estoque Seguro por linha (item+localização --
-- comentário original de lá: "por linha (item+localizacao), nao por
-- codigo agregando todas as localizacoes"). O Robson percebeu (09/09/2026,
-- print do item 144268 em 3 endereços diferentes) que isso "embaralha"
-- quando o item tem mais de um endereço: cada prateleira podia acabar
-- com um número de Estoque Seguro diferente (o fase13, por exemplo,
-- preenchia 25% da quantidade de CADA linha, não do item todo), e o
-- aviso de estoque baixo comparava a quantidade de UMA prateleira com
-- esse número -- dando alarme (ou omitindo alarme) errado numa
-- prateleira mesmo com o item saudável (ou não) no total.
--
-- js/estoque.js já foi ajustado para: (1) somar a quantidade do item em
-- todas as localizações da unidade E DEPÓSITO antes de comparar com o
-- mínimo, e (2) gravar o mesmo valor nas localizações do item (mesma
-- unidade e depósito) sempre que alguém edita o campo em qualquer uma
-- delas, dali em diante.
--
-- POR QUE AGRUPA POR DEPÓSITO TAMBÉM
--
-- O fase23-sesmt-deposito.sql (Victor, mesmo dia) separou o estoque em
-- dois depósitos por unidade (`alm` e `sesmt`) na MESMA tabela `estoque`.
-- O mesmo código de item pode existir nos dois depósitos da mesma
-- unidade sem relação nenhuma entre si (uma peça do almoxarifado e um
-- EPI que por acaso tenha o mesmo código) -- agrupar só por
-- unidade+item juntaria os dois sem querer. Por isso todo agrupamento
-- aqui é por unidade+item+depósito.
--
-- Este script só arruma o que JÁ ESTÁ no banco de antes desse ajuste:
-- itens que hoje têm valores DIFERENTES (ou só alguns preenchidos e
-- outros em branco) de estoque_minimo entre suas localizações, dentro do
-- mesmo depósito. Usa o MAIOR valor já cadastrado entre as localizações
-- do item -- não inventa número novo, só copia o que já existia pras
-- linhas que ficaram pra trás.
-- =====================================================================

-- Conferência ANTES: quais itens (por unidade e depósito) têm mais de um
-- valor de estoque_minimo cadastrado entre suas localizações (inclui o
-- caso de uma localização com valor e outra em branco).
select unidade, deposito, item,
       count(*) filter (where estoque_minimo is not null) as localizacoes_com_valor,
       count(*) as localizacoes_do_item,
       array_agg(distinct estoque_minimo order by estoque_minimo) as valores
  from estoque
 group by unidade, deposito, item
having count(distinct estoque_minimo) > 1
 order by unidade, deposito, item;

-- Unifica: cada linha passa a ter o MAIOR estoque_minimo já cadastrado
-- entre as localizações do mesmo item, na mesma unidade e depósito
-- (inclusive preenchendo as localizações que estavam em branco).
update estoque e
   set estoque_minimo = maior.valor
  from (
    select unidade, deposito, item, max(estoque_minimo) as valor
      from estoque
     where estoque_minimo is not null
     group by unidade, deposito, item
  ) as maior
 where e.unidade = maior.unidade
   and e.deposito = maior.deposito
   and e.item = maior.item
   and (e.estoque_minimo is null or e.estoque_minimo <> maior.valor);

-- Conferência DEPOIS: não deve sobrar nenhuma linha aqui.
select unidade, deposito, item, array_agg(distinct estoque_minimo order by estoque_minimo) as valores
  from estoque
 group by unidade, deposito, item
having count(distinct estoque_minimo) > 1;
