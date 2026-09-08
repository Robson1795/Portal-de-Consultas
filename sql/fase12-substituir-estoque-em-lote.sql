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
  bloco      jsonb;
  uni        text;
  itens      jsonb;
  quem       text;
  resumo     jsonb := '[]'::jsonb;
  minimo_bkp jsonb;
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
    -- existe mais. Casa por `item`, não por `id` (o id é novo a cada
    -- substituição). Bug relatado pelo Robson em 2026-09-08: editou o
    -- Estoque Seguro de vários itens e, ao colar uma planilha nova depois,
    -- os valores voltaram como se nunca tivessem sido salvos.
    select jsonb_object_agg(item, estoque_minimo) into minimo_bkp
      from estoque where unidade = uni and estoque_minimo is not null;

    delete from estoque where unidade = uni;

    insert into estoque (item, descricao, um, localizacao, quantidade,
                         unidade, atualizado_em, atualizado_por)
    select r.item, r.descricao, r.um, r.localizacao, r.quantidade,
           uni, now(), quem
      from jsonb_array_elements(itens) i,
           jsonb_populate_record(null::estoque, i) r;

    if minimo_bkp is not null then
      update estoque e
         set estoque_minimo = (minimo_bkp ->> e.item)::numeric
       where e.unidade = uni and minimo_bkp ? e.item;
    end if;

    resumo := resumo || jsonb_build_object('unidade', uni,
                                           'itens', jsonb_array_length(itens));
  end loop;

  return jsonb_build_object('ok', true, 'unidades', resumo);
end $$;

grant execute on function public.substituir_estoque(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 2 — Bobinas de aço
--
-- Aqui a substituição é da tabela inteira, não por unidade: a planilha de
-- bobinas sai completa da empresa, com a coluna `est` dentro. Mesmo assim
-- ganha a transação, pelo mesmo motivo.
--
-- Formato: [ {"item":"BOB-4471","descricao":"...","est":"01","dep":"PAT",
--             "localizacao":"PATIO A","lote":"L-8891","um":"KG",
--             "qtd_liquida":4820}, ... ]
-- ---------------------------------------------------------------------

create or replace function public.substituir_bobinas(linhas jsonb, quem text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_atualizar_bobinas() then
    raise exception 'Sem permissão para atualizar a planilha de bobinas.';
  end if;
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) = 0 then
    raise exception 'A planilha de bobinas veio vazia: nada a atualizar.';
  end if;

  -- O `where` parece inútil e NÃO É: este banco tem a trava que recusa
  -- `delete` sem cláusula WHERE ("DELETE requires a WHERE clause"), e ela vale
  -- também dentro de função. O código antigo do portal fazia
  -- `.delete().neq('id', 0)` pelo mesmo motivo; ao trazer o delete para cá eu
  -- deixei sem WHERE e reintroduzi o erro. Não "limpe" esta linha.
  --
  -- `id >= 0` em vez de `id is not null`: o id é a chave primária, então o
  -- planejador provaria que `is not null` é sempre verdade e removeria a
  -- cláusula — voltando a cair na trava.
  delete from bobinas_aco where id >= 0;

  insert into bobinas_aco (item, descricao, est, dep, localizacao, lote, um,
                           qtd_liquida, atualizado_em, atualizado_por)
  select r.item, r.descricao, r.est, r.dep, r.localizacao, r.lote, r.um,
         r.qtd_liquida, now(), nullif(btrim(coalesce(quem, '')), '')
    from jsonb_array_elements(linhas) i,
         jsonb_populate_record(null::bobinas_aco, i) r;

  return jsonb_build_object('ok', true, 'bobinas', jsonb_array_length(linhas));
end $$;

grant execute on function public.substituir_bobinas(jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 3 — Conferência
--
-- Esperado: as duas funções listadas, ambas security definer (prosecdef = t).
-- ---------------------------------------------------------------------

select p.proname            as funcao,
       p.prosecdef          as security_definer,
       pg_get_function_arguments(p.oid) as argumentos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('substituir_estoque', 'substituir_bobinas')
 order by p.proname;
