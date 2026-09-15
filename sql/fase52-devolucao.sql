-- Fase 52 -- Devolução: NF de devolução x conferência física, com divergência
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende da Fase 1 do portal (esta_aprovado()/eh_admin()/minha_unidade()/
-- pode_atualizar_estoque()).
--
-- O Robson pediu originalmente uma planilha (Base_Sistema + Conferência
-- Física, com PROCV/XLOOKUP) pra não perder o controle de mercadoria que
-- volta dos clientes e pra expor divergência entre o que foi faturado na NF
-- de devolução e o que chegou de verdade no físico. Perguntado se era pra
-- virar aba no portal em vez do Excel avulso: *"sobre ABA DEVOLUÇAO"* --
-- confirmado que é aba nova, e que precisa aceitar colar a planilha de
-- TODAS as unidades de uma vez ("quero alimentar aqui de todas as
-- unidade, conforme faço do exp e do alm"), igual ao Almoxarifado e ao
-- Catálogo EXP em Configurações > Atualizar estoques em lote.
--
-- UMA TABELA SÓ, NÃO DUAS PLANILHAS LIGADAS POR PROCV
--
-- No Excel fazia sentido separar "Base_Sistema" (o que a NF diz) de
-- "Conferência Física" (o que o operador viu), porque a segunda aba
-- precisa buscar da primeira com fórmula. No portal isso é uma AGRAVANTE,
-- não uma vantagem: um site web não tem "duas abas olhando a mesma
-- linha" -- é a MESMA linha, só que com dois grupos de coluna preenchidos
-- em momentos diferentes (a NF quando a devolução chega, o físico quando
-- alguém confere). Uma tabela só, com a divergência calculada na hora de
-- exibir (não precisa nem gravar: dá pra tirar de qtd_fisico - qtd_nf
-- direto na tela).
--
-- POR QUE MESCLAR, E NÃO SUBSTITUIR (como o Almoxarifado faz)
--
-- O Almoxarifado substitui porque é uma FOTO do saldo agora -- reimportar
-- e não aparecer mais é a notícia certa (o item saiu do estoque).
-- Devolução é o oposto: é HISTÓRICO que só cresce. Uma reimportação do
-- relatório do ERP que não traga mais uma devolução antiga NÃO pode
-- apagá-la -- ela só saiu do relatório porque já foi processada há mais
-- tempo, não porque deixou de existir (mesma lição do fase47, Análise de
-- Compras: "não quero que desapareça"). Por isso `mesclar_devolucao` faz
-- upsert (ON CONFLICT ... DO UPDATE), nunca DELETE.
--
-- E, ainda mais importante: reimportar a NF de uma devolução que JÁ FOI
-- CONFERIDA fisicamente não pode apagar a conferência. `qtd_fisico`,
-- `observacoes`, `conferido_por` e `conferido_em` ficam de fora do
-- `DO UPDATE` -- só os dados que vieram da NF (cliente, descrição,
-- quantidade) são atualizados; o que o operador já digitou continua lá.
create table if not exists devolucao_itens (
  id                uuid primary key default gen_random_uuid(),
  unidade           text not null,
  id_devolucao      text not null,   -- chave da devolução no ERP (uma devolução pode ter vários produtos)
  nf_original       text,
  nf_devolucao      text,
  data_emissao      date,
  cliente           text,
  cod_produto       text not null,
  descricao_produto text,
  qtd_nf            numeric,

  -- Conferência física -- preenchidos na tela, não na importação.
  qtd_fisico        numeric,
  observacoes       text,
  conferido_por     text,
  conferido_em      timestamptz,

  importado_em      timestamptz not null default now(),
  importado_por     text,

  -- Um produto pode aparecer mais de uma vez na mesma devolução (raro, mas
  -- a Análise de Compras já ensinou a não confiar demais na planilha) --
  -- por isso a chave é (unidade, id_devolucao, cod_produto), não só
  -- (unidade, id_devolucao).
  constraint devolucao_itens_chave unique (unidade, id_devolucao, cod_produto)
);

create index if not exists idx_devolucao_itens_unidade on devolucao_itens (unidade);

alter table devolucao_itens enable row level security;

drop policy if exists "Leitura devolucao_itens da unidade" on devolucao_itens;
drop policy if exists "Escrita devolucao_itens da unidade" on devolucao_itens;

-- Mesma regra do resto do estoque: conta aprovada da mesma unidade lê e
-- escreve (a escrita direta é o que a tela de conferência usa pra gravar
-- qtd_fisico/observacoes por item); admin em todas.
create policy "Leitura devolucao_itens da unidade" on devolucao_itens
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita devolucao_itens da unidade" on devolucao_itens
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---------------------------------------------------------------------
-- mesclar_devolucao: upsert em lote, multi-unidade numa chamada só
--
-- Mesmo formato de payload dos outros lotes de Configurações
-- (substituir_estoque, substituir_catalogo_exp): um array de blocos, um
-- por unidade -- a pessoa cola a planilha inteira com todas as unidades
-- juntas, o portal separa sozinho lendo a coluna Unidade/Estab
-- (js/devolucao.js, prepararImportacaoDevolucao()), e grava tudo numa
-- transação: falha uma unidade, nenhuma é gravada.
-- ---------------------------------------------------------------------
create or replace function public.mesclar_devolucao(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bloco    jsonb;
  uni      text;
  quem     text;
  total    integer := 0;
  unidades text[] := '{}';
begin
  quem := nullif(btrim(coalesce(payload ->> 'importado_por', '')), '');

  if jsonb_typeof(payload -> 'blocos') <> 'array' or jsonb_array_length(payload -> 'blocos') = 0 then
    raise exception 'O payload veio sem blocos de unidade.';
  end if;

  for bloco in select * from jsonb_array_elements(payload -> 'blocos') loop
    uni := btrim(coalesce(bloco ->> 'unidade', ''));
    if uni = '' then
      raise exception 'Um dos blocos veio sem unidade.';
    end if;
    if not public.pode_atualizar_estoque(uni) then
      raise exception 'Sem permissão para atualizar a devolução da unidade %.', uni;
    end if;
    if jsonb_typeof(bloco -> 'itens') <> 'array' or jsonb_array_length(bloco -> 'itens') = 0 then
      raise exception 'O bloco da unidade % veio sem itens.', uni;
    end if;

    insert into devolucao_itens
      (unidade, id_devolucao, nf_original, nf_devolucao, data_emissao, cliente,
       cod_produto, descricao_produto, qtd_nf, importado_em, importado_por)
    select uni, r.id_devolucao, r.nf_original, r.nf_devolucao, r.data_emissao, r.cliente,
           r.cod_produto, r.descricao_produto, r.qtd_nf, now(), quem
      from jsonb_array_elements(bloco -> 'itens') i,
           jsonb_populate_record(null::devolucao_itens, i) r
    on conflict (unidade, id_devolucao, cod_produto) do update set
      nf_original       = excluded.nf_original,
      nf_devolucao      = excluded.nf_devolucao,
      data_emissao      = excluded.data_emissao,
      cliente           = excluded.cliente,
      descricao_produto = excluded.descricao_produto,
      qtd_nf            = excluded.qtd_nf,
      importado_em      = now(),
      importado_por     = excluded.importado_por;
      -- qtd_fisico/observacoes/conferido_por/conferido_em ficam DE FORA do
      -- update de propósito -- ver o comentário grande no topo do arquivo.

    unidades := array_append(unidades, uni);
    total := total + jsonb_array_length(bloco -> 'itens');
  end loop;

  return jsonb_build_object('ok', true, 'unidades', unidades, 'linhas', total);
end $$;

grant execute on function public.mesclar_devolucao(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'devolucao_itens' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'devolucao_itens'
 order by policyname;

select routine_name from information_schema.routines
 where routine_name = 'mesclar_devolucao';
