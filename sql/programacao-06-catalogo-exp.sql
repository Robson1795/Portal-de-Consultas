-- =====================================================================
-- CATALOGO EXP -- puxado do sistema (Item, Descricao, UM, Deposito,
-- Referencia, Lote, Quantidade). O Robson exporta essa relacao de vez em
-- quando e cola no app. Serve de banco de dados pra ajudar a preencher
-- Descricao/UM (sempre) e Referencia/Lote (quando so tem 1 lote em estoque
-- pra aquele item) no Controle EXP, sem digitar tudo de novo.
--
-- Um item pode aparecer VARIAS VEZES nessa planilha -- cada linha e um LOTE
-- diferente do mesmo item (referencia/lote/quantidade mudam, descricao/um
-- nao). Por isso nao tem chave unica por item: a tabela e substituida
-- INTEIRA a cada reimportacao (mesmo padrao da Planilha A da Programacao de
-- Separacao), nao um upsert por item -- um item pode ter saido do estoque
-- entre uma importacao e outra.
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende da Fase 1 do portal (esta_aprovado()/eh_admin()/minha_unidade()).
-- =====================================================================

create table if not exists catalogo_exp_itens (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  codigo_item    text not null,
  descricao      text,
  um             text,
  deposito       text,
  referencia     text,
  lote           text,
  quantidade     numeric,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

create index if not exists idx_catalogo_exp_unidade_item on catalogo_exp_itens (unidade, codigo_item);

alter table catalogo_exp_itens enable row level security;

drop policy if exists "Leitura catalogo_exp da unidade" on catalogo_exp_itens;
drop policy if exists "Escrita catalogo_exp da unidade" on catalogo_exp_itens;

create policy "Leitura catalogo_exp da unidade" on catalogo_exp_itens
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita catalogo_exp da unidade" on catalogo_exp_itens
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- Verificacao
select column_name, data_type from information_schema.columns
 where table_name = 'catalogo_exp_itens' order by ordinal_position;
