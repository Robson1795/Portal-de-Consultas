-- =====================================================================
-- LOCALIZAÇÃO CONCLUÍDA -- pra saber com certeza que já pode imprimir
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--
-- POR QUE ISSO EXISTE
--
-- O Robson pediu (2026-09-08): a responsável pelo Controle EXP Acessórios
-- alimenta a planilha aos poucos, item por item ou colando de uma vez, e
-- antes de IMPRIMIR a folha pra uma localização (o que já marca a etiqueta
-- como emitida -- ver fase16), ele precisa ter certeza que ela terminou de
-- colocar TODOS os itens daquela localização ali. Sem isso, ele podia
-- imprimir com a lista pela metade sem saber.
--
-- Esta tabela guarda só isso: quando a localização foi marcada como
-- concluída, e por quem. Uma linha por (unidade, localização) -- marcar de
-- novo (depois que mais itens entrarem) atualiza a mesma linha.
--
-- POR QUE NÃO É UMA COLUNA EM exp_controle_itens
--
-- "Concluído" é um estado da LOCALIZAÇÃO inteira, não de um item. Se
-- morasse em cada linha de item, marcar um item como concluído não diria
-- nada sobre os outros itens da mesma localização, e um item novo entrando
-- depois não "reabriria" a localização sozinho. Tabela própria, ligada só
-- pelo texto da localização (mesmo padrão de exp_controle_itens ligado só
-- pelo número do pedido -- ver o comentário lá).
-- =====================================================================

create table if not exists exp_localizacao_status (
  id            uuid primary key default gen_random_uuid(),
  unidade       text not null,
  localizacao   text not null,
  concluido_por text,
  concluido_em  timestamptz not null default now(),

  constraint exp_localizacao_status_unica unique (unidade, localizacao)
);

create index if not exists idx_exp_localizacao_status_unidade on exp_localizacao_status (unidade);

alter table exp_localizacao_status enable row level security;

-- Mesma regra do resto do Controle EXP: conta aprovada da mesma unidade lê
-- e escreve; admin em todas.
drop policy if exists "Leitura exp_localizacao_status da unidade" on exp_localizacao_status;
drop policy if exists "Escrita exp_localizacao_status da unidade" on exp_localizacao_status;

create policy "Leitura exp_localizacao_status da unidade" on exp_localizacao_status
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita exp_localizacao_status da unidade" on exp_localizacao_status
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- Verificação
select column_name, data_type from information_schema.columns
 where table_name = 'exp_localizacao_status' order by ordinal_position;
