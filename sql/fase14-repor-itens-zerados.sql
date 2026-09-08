-- =====================================================================
-- MARCA 2 ITENS COMO "PRECISA REPOR" NA UNIDADE 106
--
-- O Robson conferiu no TOTVS (consulta de saldos) que o almoxarifado da
-- 106 nao tem mais estoque de:
--   - 141599  REBITE POP ALUMINIO BRANCO 3,2X10MM  -> Estoque Seguro 50 Ct
--   - 712229  FITA CREPE 50MM X 50M                -> Estoque Seguro 100 Pc
--
-- Ele quer que esses dois apareçam na lista de "estoque baixo" da tela
-- Consulta de Itens, pra lembrar de repor.
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--
-- POR QUE O "DO $$ ... $$" EM VEZ DE UM UPDATE SIMPLES
--
-- Não sei se esses dois itens já existem como linha na tabela `estoque`
-- pra unidade 106 (pode ser que a última planilha importada não tivesse
-- eles, já que o saldo era zero). Por isso cada bloco abaixo tenta um
-- UPDATE primeiro; se nenhuma linha for encontrada (ROW_COUNT = 0), ele
-- cria a linha do zero com quantidade 0 e o Estoque Seguro já preenchido.
-- Assim o script funciona nos dois casos sem eu precisar saber qual é.
-- =====================================================================

do $$
declare
  linhas int;
begin
  -- Item 141599 -- REBITE POP ALUMINIO BRANCO 3,2X10MM
  update estoque
     set estoque_minimo = 50
   where unidade = '106'
     and item = '141599';
  get diagnostics linhas = row_count;

  if linhas = 0 then
    insert into estoque
      (item, descricao, um, localizacao, quantidade, estoque_minimo, unidade, atualizado_em, atualizado_por)
    values
      ('141599', 'REBITE POP ALUMINIO BRANCO 3,2X10MM', 'Ct', null, 0, 50, '106', now(), 'Robson (item zerado)');
  end if;

  -- Item 712229 -- FITA CREPE 50MM X 50M
  update estoque
     set estoque_minimo = 100
   where unidade = '106'
     and item = '712229';
  get diagnostics linhas = row_count;

  if linhas = 0 then
    insert into estoque
      (item, descricao, um, localizacao, quantidade, estoque_minimo, unidade, atualizado_em, atualizado_por)
    values
      ('712229', 'FITA CREPE 50MM X 50M', 'Pç', null, 0, 100, '106', now(), 'Robson (item zerado)');
  end if;
end $$;

-- Verificacao
select unidade, item, descricao, quantidade, estoque_minimo
  from estoque
 where unidade = '106'
   and item in ('141599', '712229');
