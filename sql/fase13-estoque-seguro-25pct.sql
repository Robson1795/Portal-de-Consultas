-- =====================================================================
-- PREENCHE ESTOQUE SEGURO EM 25% DA QUANTIDADE, ARREDONDADO PRA CIMA
-- PRO MÚLTIPLO DE 500 -- SÓ UNIDADE 106
--
-- O Robson pediu pra preencher o estoque_minimo ("Estoque Seguro" na
-- tela) de todo item com 25% do saldo atual dele, mas arredondado pra um
-- número redondo: 9931,25 -> 10000; 3439,25 -> 3500. Ou seja, arredonda
-- pra CIMA pro múltiplo de 500 mais próximo (ceil(x/500)*500) -- faz
-- sentido pra um número de segurança: melhor sobrar um pouco de margem
-- do que arredondar pra baixo.
--
-- Por enquanto, SÓ na unidade 106 (as outras ficam de fora por agora;
-- isso já exclui o SESMT também, que usa o código de unidade 'SESMT').
-- SOBRESCREVE qualquer valor já cadastrado manualmente (confirmado).
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
   set estoque_minimo = ceil(
     (case
        when quantidade::text ~ ','
          then replace(replace(quantidade::text, '.', ''), ',', '.')::numeric
        else quantidade::text::numeric
      end) * 0.25 / 500
   ) * 500
 where unidade = '106';

-- Verificacao: amostra de 15 itens da 106 com o resultado
select unidade, item, quantidade, estoque_minimo
  from estoque
 where unidade = '106'
 order by item
 limit 15;
