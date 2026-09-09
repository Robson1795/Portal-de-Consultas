-- =====================================================================
-- ESTOQUE SEGURO: alinhar por ITEM, não por localização
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
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
-- todas as localizações da unidade antes de comparar com o mínimo, e
-- (2) gravar o mesmo valor nas localizações do item sempre que alguém
-- edita o campo em qualquer uma delas, dali em diante.
--
-- Este script só arruma o que JÁ ESTÁ no banco de antes desse ajuste:
-- itens que hoje têm valores DIFERENTES (ou só alguns preenchidos e
-- outros em branco) de estoque_minimo entre suas localizações. Usa o
-- MAIOR valor já cadastrado entre as localizações do item -- não
-- inventa número novo, só copia o que já existia pras linhas que
-- ficaram pra trás.
-- =====================================================================

-- Conferência ANTES: quais itens (por unidade) têm mais de um valor de
-- estoque_minimo cadastrado entre suas localizações (inclui o caso de
-- uma localização com valor e outra em branco).
select unidade, item,
       count(*) filter (where estoque_minimo is not null) as localizacoes_com_valor,
       count(*) as localizacoes_do_item,
       array_agg(distinct estoque_minimo order by estoque_minimo) as valores
  from estoque
 group by unidade, item
having count(distinct estoque_minimo) > 1
 order by unidade, item;

-- Unifica: cada linha passa a ter o MAIOR estoque_minimo já cadastrado
-- entre as localizações do mesmo item, na mesma unidade (inclusive
-- preenchendo as localizações que estavam em branco).
update estoque e
   set estoque_minimo = maior.valor
  from (
    select unidade, item, max(estoque_minimo) as valor
      from estoque
     where estoque_minimo is not null
     group by unidade, item
  ) as maior
 where e.unidade = maior.unidade
   and e.item = maior.item
   and (e.estoque_minimo is null or e.estoque_minimo <> maior.valor);

-- Conferência DEPOIS: não deve sobrar nenhuma linha aqui.
select unidade, item, array_agg(distinct estoque_minimo order by estoque_minimo) as valores
  from estoque
 group by unidade, item
having count(distinct estoque_minimo) > 1;
