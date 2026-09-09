-- =====================================================================
-- ANÁLISE DE COMPRAS -- itens que não precisam de reposição
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende de sql/fase19-analise-compras.sql já ter rodado.
--
-- ⚠️ Se der "deadlock detected", feche as abas do portal e rode de novo.
--
-- POR QUE ISSO EXISTE
--
-- O Robson (09/09/2026): "coloque um botão de excluir, tem itens que não
-- preciso repor". Item que ele nunca compra (fabricado internamente, vem
-- direto de outro setor, descontinuado) aparecia na análise todo dia
-- pedindo compra e poluía a lista do que realmente falta.
--
-- POR QUE NÃO É SÓ UM DELETE NA analise_demanda
--
-- A análise é substituída inteira a cada colagem (fase19). Apagar a linha
-- resolveria só até a próxima planilha do dia seguinte, quando o item
-- voltaria -- e ele teria que apagar os mesmos itens todo santo dia. "Não
-- preciso repor" é característica DO ITEM, não daquela colagem: por isso
-- mora numa tabela própria, que a substituição da análise não toca.
--
-- Por unidade, de propósito: um item pode ser comprado pela 106 e não pela
-- 101. E é reversível pela tela (botão "Voltar pra lista") -- esconder um
-- item pra sempre por um clique errado, numa tela que existe pra não deixar
-- faltar material, seria o pior tipo de bug silencioso.
-- =====================================================================

create table if not exists analise_itens_ignorados (
  id           uuid primary key default gen_random_uuid(),
  unidade      text not null,
  codigo_item  text not null,
  ignorado_por text,
  ignorado_em  timestamptz not null default now(),

  constraint analise_itens_ignorados_unico unique (unidade, codigo_item)
);

create index if not exists idx_analise_ignorados_unidade on analise_itens_ignorados (unidade);

alter table analise_itens_ignorados enable row level security;

drop policy if exists "Leitura analise_ignorados da unidade" on analise_itens_ignorados;
drop policy if exists "Escrita analise_ignorados da unidade" on analise_itens_ignorados;

create policy "Leitura analise_ignorados da unidade" on analise_itens_ignorados
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita analise_ignorados da unidade" on analise_itens_ignorados
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- Verificação
select column_name, data_type from information_schema.columns
 where table_name = 'analise_itens_ignorados' order by ordinal_position;
