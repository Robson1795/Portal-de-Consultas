-- Fase 56 -- Aba Parados: excluir pedido cancelado + observação por pedido
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/programacao-03-controle-exp.sql (exp_controle_itens).
--
-- O Robson, olhando a aba "⏰ Parados": *"QUERO UM BOTAO DE LIXEIRA DAQUI,
-- ALGUNS PEDISOS SAO CANCELADOS E EU VOLTO PARA O ALMOXARIFADO, DAI PODE
-- COLOAR UM CAMPO PARA EU COLOCAR OBSERVAÇÃO TAMBÉM"*.
--
-- O botão 🗑 exclui direto de `exp_controle_itens` (não precisa de coluna
-- nova pra isso, RLS já cobre DELETE -- for all, fase1). A observação é o
-- que precisa de tabela nova: um pedido parado agrupa VÁRIOS itens de
-- `exp_controle_itens`, e a nota é sobre o PEDIDO ("cancelado, voltou pro
-- almoxarifado"), não sobre um item isolado -- gravar em cada item
-- duplicaria o mesmo texto várias vezes e desincronizaria se alguém
-- editasse um item e esquecesse os outros. Mesmo motivo de
-- `exp_pedido_status` (fase17) e `analise_item_notas` (fase20): nota por
-- CHAVE (aqui, pedido), tabela própria, upsert.
create table if not exists exp_pedido_parado_obs (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  numero_pedido  text not null,
  observacao     text,
  atualizado_por text,
  atualizado_em  timestamptz not null default now(),

  constraint exp_pedido_parado_obs_unico unique (unidade, numero_pedido)
);

alter table exp_pedido_parado_obs enable row level security;

drop policy if exists "Leitura exp_pedido_parado_obs da unidade" on exp_pedido_parado_obs;
drop policy if exists "Escrita exp_pedido_parado_obs da unidade" on exp_pedido_parado_obs;

create policy "Leitura exp_pedido_parado_obs da unidade" on exp_pedido_parado_obs
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita exp_pedido_parado_obs da unidade" on exp_pedido_parado_obs
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_pedido_parado_obs' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'exp_pedido_parado_obs'
 order by policyname;
