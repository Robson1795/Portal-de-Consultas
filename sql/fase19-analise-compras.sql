-- =====================================================================
-- ANÁLISE DE COMPRAS -- demanda dos pedidos x saldo do almoxarifado
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende da Fase 1 do portal (esta_aprovado/eh_admin/minha_unidade).
--
-- ⚠️ Se der "deadlock detected", feche as abas do portal e rode de novo.
--
-- POR QUE ISSO EXISTE
--
-- O Robson (09/09/2026): "a ideia é eu não deixar faltar material em estoque,
-- e que eu consiga me antecipar com as solicitações de compra". Ele cola todo
-- dia a planilha dos pedidos que estão entrando pra separação, e precisa saber
-- de imediato: somando TODOS os pedidos, qual item não tem saldo suficiente no
-- almoxarifado, e quanto falta comprar de cada um.
--
-- A conta usa só a coluna Qt. Pedida (decisão dele, 09/09/2026) -- Qt.
-- Atendida é guardada junto porque vem na planilha e ajuda a conferir a linha,
-- mas NÃO entra no cálculo.
--
-- POR QUE UMA TABELA PRÓPRIA, E NÃO pedido_itens
--
-- `pedido_itens` é da Programação de Separação: tem status_separacao, quem
-- separou, quando, e é apagada/recriada a cada importação da Planilha A.
-- Misturar as duas faria uma tela mexer no estado da outra sem querer. Esta
-- aqui é só matéria-prima de análise: entra inteira, é substituída inteira, e
-- ninguém escreve nela pela tela.
--
-- SUBSTITUI TUDO A CADA COLAGEM (decisão do Robson)
--
-- Cada planilha colada é o retrato atual da necessidade -- não guarda
-- histórico. Por isso a função abaixo apaga a unidade inteira e regrava, tudo
-- dentro de UMA transação: se o insert falhar no meio, o Postgres desfaz e a
-- análise anterior continua no lugar (mesmo motivo de substituir_estoque --
-- ver AUDITORIA.md, item A2).
-- =====================================================================

create table if not exists analise_demanda (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  emissao        text,          -- texto: a planilha traz em formatos variados
  numero_pedido  text,
  nome_abreviado text,
  seq_etapa      text,
  codigo_item    text not null,
  descricao      text,
  um             text,
  qt_pedido      numeric,
  qt_atendida    numeric,       -- guardada, mas NÃO entra no cálculo
  data_embarque  text,
  os             text,
  importado_em   timestamptz not null default now(),
  importado_por  text
);

create index if not exists idx_analise_demanda_unidade on analise_demanda (unidade);
create index if not exists idx_analise_demanda_item    on analise_demanda (unidade, codigo_item);

alter table analise_demanda enable row level security;

drop policy if exists "Leitura analise_demanda da unidade" on analise_demanda;
drop policy if exists "Escrita analise_demanda da unidade" on analise_demanda;

create policy "Leitura analise_demanda da unidade" on analise_demanda
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita analise_demanda da unidade" on analise_demanda
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));


-- ---------------------------------------------------------------------
-- Substituição transacional -- apaga a unidade e regrava numa transação só
--
-- Formato do payload:
--   { "unidade": "106",
--     "importado_por": "Robson",
--     "linhas": [ {"emissao":"01/09/2026","numero_pedido":"KV854446",
--                  "nome_abreviado":"CLIENTE X","seq_etapa":"10",
--                  "codigo_item":"141590","descricao":"PAR. PB ...","um":"Pç",
--                  "qt_pedido":500,"qt_atendida":0,
--                  "data_embarque":"15/09/2026","os":"1929055"}, ... ] }
-- ---------------------------------------------------------------------

create or replace function public.substituir_analise_demanda(payload jsonb)
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
  -- Mesma permissão de quem atualiza a planilha de estoque da unidade: quem
  -- pode trocar o estoque inteiro pode trocar a análise dele.
  if not public.pode_atualizar_estoque(uni) then
    raise exception 'Sem permissão para atualizar a análise da unidade %.', uni;
  end if;
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) = 0 then
    -- Recusar lista vazia é de propósito, mesmo motivo de substituir_estoque:
    -- "analisar com zero pedidos" é indistinguível de "apagar a análise", e
    -- apagar tem de ser um pedido explícito, não uma planilha mal filtrada.
    raise exception 'A planilha veio sem linhas. Para limpar a análise, faça isso explicitamente.';
  end if;

  delete from analise_demanda where unidade = uni;

  insert into analise_demanda
    (unidade, emissao, numero_pedido, nome_abreviado, seq_etapa, codigo_item,
     descricao, um, qt_pedido, qt_atendida, data_embarque, os, importado_em, importado_por)
  select uni, r.emissao, r.numero_pedido, r.nome_abreviado, r.seq_etapa, r.codigo_item,
         r.descricao, r.um, r.qt_pedido, r.qt_atendida, r.data_embarque, r.os, now(), quem
    from jsonb_array_elements(linhas) i,
         jsonb_populate_record(null::analise_demanda, i) r;

  return jsonb_build_object('ok', true, 'unidade', uni, 'linhas', jsonb_array_length(linhas));
end $$;

grant execute on function public.substituir_analise_demanda(jsonb) to authenticated;

-- Verificação
select column_name, data_type from information_schema.columns
 where table_name = 'analise_demanda' order by ordinal_position;
