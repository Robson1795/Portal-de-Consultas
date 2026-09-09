-- =====================================================================
-- ANÁLISE DE COMPRAS -- anotações por item (não repor + observação)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende de sql/fase19-analise-compras.sql já ter rodado.
--
-- ⚠️ Se der "deadlock detected", feche as abas do portal e rode de novo.
--
-- POR QUE ISSO EXISTE
--
-- Dois pedidos do Robson (09/09/2026), que são a mesma coisa por baixo:
--
--   1. "coloque um botão de excluir, tem itens que não preciso repor" --
--      item fabricado internamente, que vem direto de outro setor, ou
--      descontinuado, aparecia todo dia pedindo compra e poluía a lista.
--   2. "uma aba de observação que eu possa colocar se já tem pedido, se já
--      fiz solicitação de compra etc" -- pra ele não solicitar duas vezes a
--      mesma coisa, nem esquecer o que já encaminhou.
--
-- POR QUE NÃO É UMA COLUNA NA analise_demanda
--
-- A análise é substituída inteira a cada colagem (fase19). Anotação que
-- morasse lá sumiria na planilha do dia seguinte -- e ele teria que
-- reescrever "já solicitei compra" todo santo dia. As duas informações são
-- característica DO ITEM, não daquela colagem: por isso moram aqui, numa
-- tabela que a substituição da análise não toca.
--
-- UMA TABELA SÓ PRAS DUAS
--
-- "não repor" e "observação" são a mesma coisa: anotação do Robson sobre um
-- item, por unidade, que sobrevive à troca da planilha. Duas tabelas quase
-- idênticas seriam duas consultas, dois caminhos de gravação e duas chances
-- de sair de sincronia.
-- =====================================================================

create table if not exists analise_item_notas (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  codigo_item    text not null,
  ignorado       boolean not null default false, -- "não preciso repor este item"
  observacao     text,                           -- "já solicitei compra", "pedido 1234"...
  atualizado_por text,
  atualizado_em  timestamptz not null default now(),

  constraint analise_item_notas_unico unique (unidade, codigo_item)
);

create index if not exists idx_analise_notas_unidade on analise_item_notas (unidade);

alter table analise_item_notas enable row level security;

drop policy if exists "Leitura analise_notas da unidade" on analise_item_notas;
drop policy if exists "Escrita analise_notas da unidade" on analise_item_notas;

create policy "Leitura analise_notas da unidade" on analise_item_notas
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita analise_notas da unidade" on analise_item_notas
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));


-- ---------------------------------------------------------------------
-- Migração da versão anterior (analise_itens_ignorados), se ela chegou a
-- ser criada neste banco. A primeira versão desta fase tinha uma tabela só
-- pro "não repor"; virou esta aqui quando a observação entrou junto. Se a
-- tabela antiga não existir, este bloco não faz nada.
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('public.analise_itens_ignorados') is not null then
    insert into analise_item_notas (unidade, codigo_item, ignorado, atualizado_por, atualizado_em)
    select unidade, codigo_item, true, ignorado_por, ignorado_em
      from analise_itens_ignorados
    on conflict (unidade, codigo_item) do update set ignorado = true;

    drop table analise_itens_ignorados;
  end if;
end $$;

-- Verificação
select column_name, data_type from information_schema.columns
 where table_name = 'analise_item_notas' order by ordinal_position;
