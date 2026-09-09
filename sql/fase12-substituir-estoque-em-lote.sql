-- =====================================================================
-- SUBSTITUIR ESTOQUE EM TRANSAÇÃO — e em lote, várias unidades de uma vez
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- ⚠️ Se der "deadlock detected", feche as abas do portal e rode de novo.
-- =====================================================================
--
-- POR QUE ISTO EXISTE
--
-- Atualizar a planilha de uma unidade sempre foi assim, no navegador:
--
--     delete from estoque where unidade = X;   -- passou
--     insert into estoque ...;                 -- e se falhar AQUI?
--
-- Não há transação. Se o insert falhar depois de o delete passar — queda de
-- rede no celular, payload grande, um dado inválido no meio da planilha — a
-- unidade fica **sem estoque nenhum** e não há rollback. É o item A2 da
-- AUDITORIA.md, e era o mais grave que restava.
--
-- Duas chamadas separadas do navegador nunca serão uma transação. Dentro de
-- uma função plpgsql, sim: o corpo inteiro roda numa transação só. Falha
-- qualquer linha, o Postgres desfaz tudo e o estoque antigo continua lá.
--
-- E é isso que torna seguro o que a função também passou a permitir: colar
-- UMA planilha com o estoque de várias unidades e deixar o banco separar.
-- Sem transação, um erro no meio poderia esvaziar meia empresa.
--
-- COMO O TIPO DA COLUNA É RESPEITADO
--
-- `jsonb_populate_record(null::estoque, item)` converte o objeto JSON numa
-- linha de `estoque` usando a função de entrada de CADA coluna. Assim não
-- importa se `quantidade` é text ou numeric: quem converte é a própria
-- definição da tabela, não um palpite escrito aqui.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — Estoque (almoxarifado das unidades e SESMT, mesma tabela)
--
-- Formato do payload:
--
--   [ { "unidade": "106",
--       "atualizado_por": "Victor Hugo",
--       "itens": [ {"item":"141590","descricao":"...","um":"Pç",
--                   "localizacao":"A-01-01-01","quantidade":"15925"}, ... ] },
--     { "unidade": "SESMT", ... } ]
--
-- Devolve { ok, unidades: [ {unidade, itens} ] } para a tela conferir.
-- ---------------------------------------------------------------------

create or replace function public.substituir_estoque(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bloco         jsonb;
  uni           text;
  itens         jsonb;
  quem          text;
  resumo        jsonb := '[]'::jsonb;
  minimo_bkp    jsonb;
  minimo_antes  int;
  minimo_depois int;
begin
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'O payload precisa ser uma lista de blocos { unidade, itens }.';
  end if;
  if jsonb_array_length(payload) = 0 then
    raise exception 'O payload está vazio: nada a atualizar.';
  end if;

  -- ---- Passo 1: confere TUDO antes de apagar QUALQUER coisa ----
  -- Se a décima unidade da lista não for permitida, ou vier sem itens, o
  -- certo é não ter mexido nas nove primeiras. Como a transação desfaria de
  -- todo modo, isto é cinto e suspensório -- mas deixa o erro claro antes de
  -- o banco escrever nada.
  for bloco in select * from jsonb_array_elements(payload) loop
    uni := btrim(coalesce(bloco ->> 'unidade', ''));

    if uni = '' then
      raise exception 'Há um bloco sem unidade no payload.';
    end if;
    if not public.pode_atualizar_estoque(uni) then
      raise exception 'Sem permissão para atualizar o estoque da unidade %.', uni;
    end if;

    itens := bloco -> 'itens';
    if jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) = 0 then
      -- Recusar lista vazia é de propósito: "atualizar com zero itens" é
      -- indistinguível de "apagar o estoque da unidade", e apagar tem de ser
      -- um pedido explícito, não o resultado de uma planilha mal filtrada.
      raise exception 'A unidade % veio sem itens. Para apagar o estoque dela, faça isso explicitamente.', uni;
    end if;
  end loop;

  -- ---- Passo 2: substitui, unidade por unidade, numa transação só ----
  for bloco in select * from jsonb_array_elements(payload) loop
    uni   := btrim(bloco ->> 'unidade');
    itens := bloco -> 'itens';
    quem  := nullif(btrim(coalesce(bloco ->> 'atualizado_por', '')), '');

    -- Guarda o Estoque Seguro (estoque_minimo) de cada item antes de apagar.
    -- Sem isso, colar uma planilha nova apagava tudo que a pessoa tinha
    -- configurado manualmente ali -- a planilha colada nunca trouxe essa
    -- coluna, e o delete+insert abaixo não tem como recriar o que já não
    -- existe mais. Casa por `item` (não por `id`, que é novo a cada
    -- substituição), usando btrim() dos dois lados -- um espaço a mais/a
    -- menos copiado do Excel (comum: célula com espaço à direita) já fazia
    -- o casamento falhar em silêncio pra aquele item, mesmo com o resto da
    -- planilha preservado certinho. Bug relatado pelo Robson em 2026-09-08
    -- (perda geral) e de novo em 2026-09-09 (perda de item avulso depois de
    -- editar e colar planilha nova -- este segundo caso é o que btrim()
    -- corrige).
    select jsonb_object_agg(btrim(item), estoque_minimo), count(*)
      into minimo_bkp, minimo_antes
      from estoque where unidade = uni and estoque_minimo is not null;

    delete from estoque where unidade = uni;

    insert into estoque (item, descricao, um, localizacao, quantidade,
                         unidade, atualizado_em, atualizado_por)
    select r.item, r.descricao, r.um, r.localizacao, r.quantidade,
           uni, now(), quem
      from jsonb_array_elements(itens) i,
           jsonb_populate_record(null::estoque, i) r;

    minimo_depois := 0;
    if minimo_bkp is not null then
      update estoque e
         set estoque_minimo = (minimo_bkp ->> btrim(e.item))::numeric
       where e.unidade = uni and minimo_bkp ? btrim(e.item);
      get diagnostics minimo_depois = row_count;
    end if;

    -- Devolve a contagem de antes/depois pro app poder avisar se algum item
    -- ficou pra trás no casamento (ex.: código de item que mudou de
    -- formatação entre uma planilha e outra) -- sem isso a perda é
    -- silenciosa, e só aparece quando alguém repara dias depois.
    resumo := resumo || jsonb_build_object('unidade', uni,
                                           'itens', jsonb_array_length(itens),
                                           'estoque_minimo_existia_antes', coalesce(minimo_antes, 0),
                                           'estoque_minimo_preservado', minimo_depois);
  end loop;

  return jsonb_build_object('ok', true, 'unidades', resumo);
end $$;

grant execute on function public.substituir_estoque(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 2 — Bobinas de aço: NÃO ESTÁ MAIS AQUI
--
-- ⚠️ Este script definia `substituir_bobinas()` apagando a tabela INTEIRA:
--
--     delete from bobinas_aco where id >= 0;   -- TODAS as unidades
--
-- Isso está errado desde 08/09/2026. A substituição passou a ser POR UNIDADE,
-- em `sql/fase15-bobinas-por-unidade.sql`: apaga e repõe só as unidades
-- presentes na planilha, e unidade que não aparecer não é tocada. Com a versão
-- antiga, colar a planilha de uma unidade apagava as bobinas das outras sete —
-- e ninguém descobriria antes do inventário.
--
-- A definição foi tirada daqui de propósito, e não só marcada como obsoleta:
-- enquanto as duas versões existissem no repositório, rodar este arquivo de
-- novo (para conferir, para refazer o banco, ou por ser o script "oficial" da
-- substituição em lote) desfaria a correção em silêncio. Uma função, um
-- arquivo.
--
-- Ordem de execução num banco novo: este script e depois o fase15.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- PARTE 3 — Conferência
--
-- Esperado: as duas funções listadas, ambas security definer (prosecdef = t).
-- `substituir_bobinas` só aparece depois de rodar o fase15 (ver PARTE 2).
-- ---------------------------------------------------------------------

select p.proname            as funcao,
       p.prosecdef          as security_definer,
       pg_get_function_arguments(p.oid) as argumentos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('substituir_estoque', 'substituir_bobinas')
 order by p.proname;
