-- Fase 55 -- Análise de Compras: cola planilha com linha duplicada na mesma chave
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase47-analise-demanda-mesclar.sql.
--
-- O Robson colou a planilha de pedidos e recebeu:
-- "NÃO GRAVOU: ON CONFLICT DO UPDATE command cannot affect row a second
-- time -- nada foi alterado, a análise anterior continua no lugar."
--
-- POR QUE ISSO ACONTECE
--
-- `mesclar_analise_demanda` (fase47) faz um INSERT ... ON CONFLICT (unidade,
-- numero_pedido, codigo_item, seq_etapa) DO UPDATE numa tabela só. O
-- Postgres não deixa a MESMA instrução de INSERT tentar fazer DO UPDATE
-- duas vezes na mesma linha de destino -- se a planilha colada trouxer
-- duas linhas com a mesma chave (mesmo pedido + item + etapa), a segunda
-- ocorrência bate na primeira DENTRO do mesmo INSERT e o Postgres recusa a
-- instrução inteira, sem gravar nada (nem a primeira ocorrência). O
-- comentário do fase47 já previa "o mesmo pedido+item em mais de uma
-- etapa" como raro mas possível -- só não previa a MESMA chave duas vezes
-- na mesma colagem.
--
-- A CORREÇÃO: dedupe ANTES do insert, mantém a ÚLTIMA ocorrência
--
-- Em vez de somar as duas linhas (não dá pra saber se é o mesmo pedido
-- reportado duas vezes por engano, ou dois lançamentos que deveriam ser
-- somados -- somar errado seria pior que sobrescrever), a função agora
-- dedupe pela mesma chave do índice único e fica com a ÚLTIMA linha na
-- ordem em que apareceu na planilha colada (`with ordinality`) -- é o
-- mesmo critério de "a de baixo vale mais" que qualquer pessoa lendo a
-- planilha de cima pra baixo aplicaria na hora. O resultado agora avisa
-- quantas linhas duplicadas foram colapsadas, pra aparecer na tela em vez
-- de sumir silenciosamente.
create or replace function public.mesclar_analise_demanda(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uni         text;
  linhas      jsonb;
  quem        text;
  total_bruto integer;
  total_final integer;
begin
  uni    := btrim(coalesce(payload ->> 'unidade', ''));
  linhas := payload -> 'linhas';
  quem   := nullif(btrim(coalesce(payload ->> 'importado_por', '')), '');

  if uni = '' then
    raise exception 'O payload veio sem unidade.';
  end if;
  if not public.pode_atualizar_estoque(uni) then
    raise exception 'Sem permissão para atualizar a análise da unidade %.', uni;
  end if;
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) = 0 then
    raise exception 'A planilha veio sem linhas.';
  end if;

  total_bruto := jsonb_array_length(linhas);

  -- CTE em vez de tabela temporária: dedupe pela MESMA chave do índice
  -- único, ficando com a última ocorrência (`ord desc`) na ordem em que a
  -- linha apareceu na planilha colada.
  with expandido as (
    select t.ord, r.emissao, r.numero_pedido, r.nome_abreviado, r.seq_etapa, r.codigo_item,
           r.descricao, r.um, r.qt_pedido, r.qt_atendida, r.data_embarque, r.os
      from jsonb_array_elements(linhas) with ordinality as t(item, ord),
           jsonb_populate_record(null::analise_demanda, t.item) r
  ),
  dedup as (
    select distinct on (coalesce(numero_pedido, ''), codigo_item, coalesce(seq_etapa, ''))
           emissao, numero_pedido, nome_abreviado, seq_etapa, codigo_item,
           descricao, um, qt_pedido, qt_atendida, data_embarque, os
      from expandido
     order by coalesce(numero_pedido, ''), codigo_item, coalesce(seq_etapa, ''), ord desc
  )
  insert into analise_demanda
    (unidade, emissao, numero_pedido, nome_abreviado, seq_etapa, codigo_item,
     descricao, um, qt_pedido, qt_atendida, data_embarque, os, importado_em, importado_por)
  select uni, emissao, coalesce(numero_pedido, ''), nome_abreviado, coalesce(seq_etapa, ''),
         codigo_item, descricao, um, qt_pedido, qt_atendida, data_embarque, os, now(), quem
    from dedup
  on conflict (unidade, numero_pedido, codigo_item, seq_etapa) do update set
    emissao        = excluded.emissao,
    nome_abreviado = excluded.nome_abreviado,
    descricao      = excluded.descricao,
    um             = excluded.um,
    qt_pedido      = excluded.qt_pedido,
    qt_atendida    = excluded.qt_atendida,
    data_embarque  = excluded.data_embarque,
    os             = excluded.os,
    importado_em   = now(),
    importado_por  = excluded.importado_por;

  -- Linhas de fato afetadas pelo INSERT (uma por chave deduplicada) --
  -- dá o total_final sem precisar de um SELECT count(*) separado.
  get diagnostics total_final = row_count;

  return jsonb_build_object(
    'ok', true, 'unidade', uni, 'linhas', total_final,
    'duplicadas', total_bruto - total_final
  );
end $$;

grant execute on function public.mesclar_analise_demanda(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select routine_name from information_schema.routines
 where routine_name = 'mesclar_analise_demanda';
