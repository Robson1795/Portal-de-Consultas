-- =====================================================================
-- DEPÓSITO BENCHMARK: Referência e Lote, e correção da validação de
-- depósito em substituir_estoque()
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Depende de sql/fase29-benchmark-deposito.sql já ter rodado.
-- =====================================================================
--
-- PARTE 1 — Referência e Lote
--
-- O Robson, vendo a planilha real do Benchmark: *"benchmark é um pouco
-- diferente tem referencia e lote"*. O fase29 tratou o Benchmark como saldo
-- idêntico ao Almoxarifado/SESMT (item, descrição, UM, localização,
-- quantidade) -- faltavam essas duas colunas, que a planilha do Benchmark
-- tem e o Almoxarifado/SESMT não têm.
--
-- Colunas NULLABLE na própria `estoque` (não uma tabela nova) -- mesmo
-- princípio de `deposito`: quem não usa (Almoxarifado, SESMT) fica com elas
-- em branco, e nenhuma tela nem consulta muda pra quem não pediu.
--
-- PARTE 2 — o bug que isso revelou
--
-- substituir_estoque() (fase23) tem uma validação própria, separada da
-- restrição da coluna:
--
--     if dep not in ('alm', 'sesmt') then raise exception ...
--
-- O fase29 mudou a RESTRIÇÃO DA COLUNA (`estoque_deposito_valido`) pra
-- aceitar 'benchmark', mas essa validação de dentro da função é outro
-- lugar, com a própria lista -- ficou pra trás. Sem este fase30, colar
-- planilha na aba Benchmark do lote falharia com "Depósito desconhecido:
-- benchmark. Use alm ou sesmt.", mesmo com a restrição da coluna já
-- corrigida. Achado ao revisar a função de novo por causa da Parte 1, antes
-- de qualquer um chegar a tentar colar a planilha de verdade.
-- =====================================================================

alter table estoque add column if not exists referencia text;
alter table estoque add column if not exists lote text;

create or replace function public.substituir_estoque(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bloco         jsonb;
  uni           text;
  dep           text;
  itens         jsonb;
  quem          text;
  minimo_bkp    jsonb;
  minimo_antes  integer;
  minimo_depois integer;
  resumo        jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception 'A planilha veio vazia: nada a atualizar.';
  end if;

  -- ---- Passo 1: confere TUDO antes de apagar qualquer coisa ----
  for bloco in select * from jsonb_array_elements(payload) loop
    uni := btrim(bloco ->> 'unidade');
    dep := coalesce(nullif(btrim(bloco ->> 'deposito'), ''), 'alm');
    itens := bloco -> 'itens';

    if uni is null or uni = '' then
      raise exception 'Há um bloco da planilha sem unidade.';
    end if;
    if dep not in ('alm', 'sesmt', 'benchmark') then
      raise exception 'Depósito desconhecido: %. Use alm, sesmt ou benchmark.', dep;
    end if;
    if not public.pode_atualizar_estoque(uni) then
      raise exception 'Sem permissão para atualizar o estoque da unidade %.', uni;
    end if;
    if jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) = 0 then
      raise exception 'A unidade % veio sem itens: substituir por nada apagaria o estoque dela.', uni;
    end if;
  end loop;

  -- ---- Passo 2: substitui, (unidade, depósito) por vez, numa transação só ----
  for bloco in select * from jsonb_array_elements(payload) loop
    uni   := btrim(bloco ->> 'unidade');
    dep   := coalesce(nullif(btrim(bloco ->> 'deposito'), ''), 'alm');
    itens := bloco -> 'itens';
    quem  := nullif(btrim(coalesce(bloco ->> 'atualizado_por', '')), '');

    select jsonb_object_agg(btrim(item), estoque_minimo), count(*)
      into minimo_bkp, minimo_antes
      from estoque
     where unidade = uni and deposito = dep and estoque_minimo is not null;

    delete from estoque where unidade = uni and deposito = dep;

    insert into estoque (item, descricao, um, localizacao, quantidade, referencia, lote,
                         unidade, deposito, atualizado_em, atualizado_por)
    select r.item, r.descricao, r.um, r.localizacao, r.quantidade, r.referencia, r.lote,
           uni, dep, now(), quem
      from jsonb_array_elements(itens) i,
           jsonb_populate_record(null::estoque, i) r;

    minimo_depois := 0;
    if minimo_bkp is not null then
      update estoque e
         set estoque_minimo = (minimo_bkp ->> btrim(e.item))::numeric
       where e.unidade = uni and e.deposito = dep and minimo_bkp ? btrim(e.item);
      get diagnostics minimo_depois = row_count;
    end if;

    resumo := resumo || jsonb_build_object(
      'unidade', uni,
      'deposito', dep,
      'itens', jsonb_array_length(itens),
      'estoque_minimo_antes', coalesce(minimo_antes, 0),
      'estoque_minimo_depois', coalesce(minimo_depois, 0));
  end loop;

  return jsonb_build_object('ok', true, 'blocos', resumo);
end $$;

grant execute on function public.substituir_estoque(jsonb) to authenticated;

-- Conferência: as colunas novas, e a função com a lista de depósitos certa.
select column_name, data_type from information_schema.columns
 where table_name = 'estoque' and column_name in ('referencia', 'lote');

select pg_get_functiondef('public.substituir_estoque(jsonb)'::regprocedure) like '%benchmark%' as aceita_benchmark;
