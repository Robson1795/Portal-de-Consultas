-- =====================================================================
-- CONTROLE EXP -- localizacao dos itens ja separados, por item (nao por
-- pedido inteiro), pra ajudar o inventario da area de expedicao.
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende da Fase 1 do portal e de programacao-01-tabelas-e-rls.sql (usa
-- esta_aprovado()/eh_admin()/minha_unidade()).
--
-- POR QUE UMA TABELA PROPRIA, E NAO ESTENDER pedido_itens
--
-- pedido_itens e APAGADA E RECRIADA inteira a cada reimportacao da
-- Planilha A (ver js/programacao.js, importarPlanilhaA -- nao ha chave
-- natural nos dados reais, entao a importacao substitui tudo). Se a
-- localizacao de expedicao morasse la, uma reimportacao feita depois do
-- pedido ja estar na expedicao apagaria a localizacao registrada junto.
-- Por isso esta tabela e independente, ligada só pelo NUMERO do pedido
-- (texto), nao por uma FK que sofreria cascade.
--
-- POR QUE NAO TEM DESCRICAO/UM
--
-- A tela busca a descricao e a UM automaticamente (primeiro em
-- itens_requisicao, depois em estoque, ver "Como o app busca a
-- descricao" no js) -- gravar de novo aqui duplicaria dado que ja existe
-- em dois lugares e sairia de sincronia se a descricao mudar la.
-- =====================================================================

create table if not exists exp_controle_itens (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  numero_pedido  text,
  codigo_item    text not null,
  quantidade     numeric,
  localizacao    text,
  lote           text,
  referencia     text,
  registrado_por text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists idx_exp_controle_unidade_loc on exp_controle_itens (unidade, localizacao);
create index if not exists idx_exp_controle_pedido       on exp_controle_itens (unidade, numero_pedido);

create or replace function public.carimba_atualizado_em_exp_controle()
returns trigger language plpgsql set search_path = public as $func$
begin
  new.atualizado_em := now();
  return new;
end $func$;

drop trigger if exists trg_exp_controle_atualizado_em on exp_controle_itens;
create trigger trg_exp_controle_atualizado_em
  before update on exp_controle_itens
  for each row execute function public.carimba_atualizado_em_exp_controle();

alter table exp_controle_itens enable row level security;

-- Mesma regra do resto da Programacao de Separacao: conta aprovada da
-- mesma unidade le e escreve; admin em todas.
drop policy if exists "Leitura exp_controle da unidade" on exp_controle_itens;
drop policy if exists "Escrita exp_controle da unidade" on exp_controle_itens;

create policy "Leitura exp_controle da unidade" on exp_controle_itens
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita exp_controle da unidade" on exp_controle_itens
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- Verificacao
select column_name, data_type from information_schema.columns
 where table_name = 'exp_controle_itens' order by ordinal_position;
