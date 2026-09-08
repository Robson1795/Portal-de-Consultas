-- =====================================================================
-- PREENCHE ESTOQUE SEGURO EM 25% DA QUANTIDADE ATUAL, TODOS OS ITENS
--
-- O Robson pediu pra preencher o estoque_minimo ("Estoque Seguro" na
-- tela) de todo item com 25% do saldo atual dele. Roda em TODAS as
-- unidades e SOBRESCREVE qualquer valor já cadastrado manualmente
-- (confirmado -- ex.: um item que já estava em 15000 vira 25% da
-- quantidade dele também).
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--
-- POR QUE O CASE NA CONVERSÃO
--
-- `quantidade` pode estar guardada como texto no formato brasileiro
-- (ex.: "1.234,56", ponto de milhar e vírgula decimal -- é assim que
-- js/estoque.js trata em parseQtd()) ou já como numérico puro. Aplicar a
-- mesma limpeza (tirar ponto, trocar vírgula por ponto) num numérico já
-- correto destruiria a casa decimal dele (5.5 viraria 55). Por isso: só
-- limpa formato brasileiro quando tem vírgula na representação; sem
-- vírgula, converte direto.
--
-- Se algum valor de quantidade não for conversível de jeito nenhum, o
-- UPDATE inteiro falha (Postgres desfaz tudo) -- ninguém fica com estoque
-- seguro pela metade.
-- =====================================================================

update estoque
   set estoque_minimo = round(
     (case
        when quantidade::text ~ ','
          then replace(replace(quantidade::text, '.', ''), ',', '.')::numeric
        else quantidade::text::numeric
      end) * 0.25
   , 2);

-- Verificacao: amostra de 15 itens com o antes/depois do calculo
select unidade, item, quantidade, estoque_minimo
  from estoque
 order by unidade, item
 limit 15;
