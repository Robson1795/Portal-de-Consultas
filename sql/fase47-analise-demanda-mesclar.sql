-- Fase 47 -- Análise de Compras: colar planilha JUNTA, não substitui mais
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase19-analise-compras.sql.
--
-- O Robson, vendo a prévia listar 23 itens que sumiriam ao colar uma
-- planilha menor: *"não quero que desapareça"*. Antes desta fase, "
-- Substituir análise" (substituir_analise_demanda, fase19) apagava a
-- unidade inteira e regravava só com o que foi colado -- item que não
-- vinha na planilha nova sumia sozinho.
--
-- Perguntado como lidar com pedido que realmente sai do relatório do
-- Datasul (faturado/cancelado) se nada mais é apagado sozinho, escolheu
-- remoção manual: um botão "Remover da análise" por item, que ele usa
-- quando confirma que aquele pedido não serve mais.
--
-- ⚠️ NÃO apaga `substituir_analise_demanda()` (fase19) -- só para de ser
-- chamada pela tela. Continua existindo caso um dia precise mesmo de um
-- "recomeçar do zero".
--
-- A CHAVE DE MESCLAGEM
--
-- Cada linha da planilha é um (pedido, item, etapa) -- o mesmo item pode
-- aparecer em vários pedidos, e (raramente) o mesmo pedido+item em mais
-- de uma etapa. `numero_pedido` e `seq_etapa` podem vir em branco na
-- planilha (viram NULL no parser) -- e no Postgres, NULL nunca bate com
-- NULL num índice único, o que quebraria o ON CONFLICT. Por isso o
-- backfill abaixo troca NULL por '' nessas duas colunas antes de criar o
-- índice, e os dois ganham default '' pra colagens futuras.

update analise_demanda set numero_pedido = '' where numero_pedido is null;
update analise_demanda set seq_etapa = '' where seq_etapa is null;

alter table analise_demanda alter column numero_pedido set default '';
alter table analise_demanda alter column seq_etapa set default '';

-- Linhas que hoje colidiriam na chave nova (pode acontecer se duas
-- colagens anteriores tiverem deixado duplicata, já que até aqui a tabela
-- não tinha unicidade nenhuma) -- mantém a mais recente de cada grupo, e
-- em empate de horário, a de maior id (critério só pra ser determinístico).
delete from analise_demanda a using analise_demanda b
 where a.unidade = b.unidade and a.numero_pedido = b.numero_pedido
   and a.codigo_item = b.codigo_item and a.seq_etapa = b.seq_etapa
   and a.importado_em < b.importado_em;

delete from analise_demanda a using analise_demanda b
 where a.unidade = b.unidade and a.numero_pedido = b.numero_pedido
   and a.codigo_item = b.codigo_item and a.seq_etapa = b.seq_etapa
   and a.importado_em = b.importado_em and a.id < b.id;

create unique index if not exists idx_analise_demanda_chave
  on analise_demanda (unidade, numero_pedido, codigo_item, seq_etapa);

-- ---------------------------------------------------------------------
-- mesclar_analise_demanda: upsert em lote, mesma transação, nunca apaga
-- ---------------------------------------------------------------------
-- Mesmo formato de payload de substituir_analise_demanda (fase19); só
-- troca DELETE+INSERT por INSERT ... ON CONFLICT DO UPDATE. Pedido/item
-- que já existia e voltou a aparecer na planilha tem os dados atualizados
-- (qt_pedido pode ter mudado); o que não veio nesta colagem fica como
-- estava -- ninguém apaga ele sozinho.
create or replace function public.mesclar_analise_demanda(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uni    text;
  linhas jsonb;
  quem   text;
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

  insert into analise_demanda
    (unidade, emissao, numero_pedido, nome_abreviado, seq_etapa, codigo_item,
     descricao, um, qt_pedido, qt_atendida, data_embarque, os, importado_em, importado_por)
  select uni, r.emissao, coalesce(r.numero_pedido, ''), r.nome_abreviado, coalesce(r.seq_etapa, ''),
         r.codigo_item, r.descricao, r.um, r.qt_pedido, r.qt_atendida, r.data_embarque, r.os, now(), quem
    from jsonb_array_elements(linhas) i,
         jsonb_populate_record(null::analise_demanda, i) r
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

  return jsonb_build_object('ok', true, 'unidade', uni, 'linhas', jsonb_array_length(linhas));
end $$;

grant execute on function public.mesclar_analise_demanda(jsonb) to authenticated;

-- "Remover da análise" (botão por item, feito na tela) não precisa de
-- função nova -- a policy "Escrita analise_demanda da unidade" (fase19)
-- já é `for all` e cobre DELETE com a mesma regra de permissão.

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select indexname from pg_indexes
 where tablename = 'analise_demanda' and indexname = 'idx_analise_demanda_chave';

select routine_name from information_schema.routines
 where routine_name = 'mesclar_analise_demanda';

select count(*) as linhas_com_pedido_ou_etapa_nulos
  from analise_demanda where numero_pedido is null or seq_etapa is null;
