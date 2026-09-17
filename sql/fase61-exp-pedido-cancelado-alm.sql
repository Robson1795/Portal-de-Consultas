-- Fase 61 -- Pedido cancelado no EXP: avisa a equipe pra devolver o material
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase36-doca.sql (exp_controle_itens) e de
-- sql/fase56-parados-excluir-observacao.sql (aba ⏰ Parados).
--
-- O Robson, olhando a aba Parados: "entre esses pedidos tem alguns que foram
-- cancelados, quero que quando eu marcar como cancelado abre uma nova aba ou
-- um aviso para gente voltar material para o almoxarifado, dai a responsavel
-- pelo exp acessorios ja visualiza a notificação" (17/09/2026).
--
-- O botão 🗑 da aba Parados já significava "pedido cancelado, material
-- voltou pro almoxarifado" (ver fase56) -- só que ele apenas excluía a linha
-- de `exp_controle_itens`, sem avisar ninguém. Esta fase acrescenta o aviso,
-- no mesmo desenho de exp_pedido_aviso_preparo (fase45): tabela por unidade +
-- notificação ao vivo (broadcast, js/notificacoes.js) + contagem pra quem
-- entra depois. É o mesmo problema em direção oposta -- lá o encarregado da
-- expedição avisa o almoxarifado pra separar; aqui o almoxarifado avisa quem
-- cuida do EXP que um material físico precisa voltar.
--
-- `itens_resumo` guarda uma FOTO dos itens (código, descrição, quantidade,
-- localização) no momento do cancelamento -- as linhas de
-- `exp_controle_itens` são excluídas no mesmo clique (fase56), então sem
-- este retrato a lista de devolução não teria como dizer o que precisa
-- voltar nem de onde.
create table if not exists exp_pedido_cancelado_alm (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  numero_pedido  text not null,
  itens_resumo   jsonb not null default '[]'::jsonb,
  status         text not null default 'pendente',
  cancelado_por  text,
  cancelado_em   timestamptz not null default now(),
  devolvido_por  text,
  devolvido_em   timestamptz,

  constraint exp_pedido_cancelado_alm_unico unique (unidade, numero_pedido),
  constraint exp_pedido_cancelado_alm_status_valido check (status in ('pendente', 'devolvido'))
);

-- Pra contar rápido quantos estão pendentes (o número que a notificação
-- mostra pra quem entra depois do aviso ao vivo).
create index if not exists idx_exp_pedido_cancelado_alm_pendente
  on exp_pedido_cancelado_alm (unidade, status);

alter table exp_pedido_cancelado_alm enable row level security;

drop policy if exists "Leitura exp_pedido_cancelado_alm da unidade" on exp_pedido_cancelado_alm;
drop policy if exists "Escrita exp_pedido_cancelado_alm da unidade" on exp_pedido_cancelado_alm;

-- Mesmo padrão de sempre: esta_aprovado() + (admin ou dono da unidade).
create policy "Leitura exp_pedido_cancelado_alm da unidade" on exp_pedido_cancelado_alm
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita exp_pedido_cancelado_alm da unidade" on exp_pedido_cancelado_alm
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_pedido_cancelado_alm' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'exp_pedido_cancelado_alm'
 order by policyname;
