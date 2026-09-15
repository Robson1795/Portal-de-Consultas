-- Fase 45 -- Aviso "preparar pedido" (encarregado da expedição -> EXP)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase36-doca.sql (exp_controle_itens).
--
-- O Robson: "o encarregado da expedição quando receber a lista do pcp,
-- coloca o numero do pedido que a gente tem que deixar na doca que os
-- conferentes pegam o material, e por esse numero abre um aviso para que
-- a gente entenda que devemos deixar o material preparado ja... quero
-- que envie uma alerta bem chamativo, pode colocar o alerta nesse painel
-- que o victor criou".
--
-- Perguntado se o fluxo precisava de 3 status (aguardando/em separação/
-- pronto, com um conferente "assumindo" o pedido) ou algo mais simples,
-- escolheu o simples: avisado -> preparado. Sem leitor de código de
-- barras, sem fila de quem pegou o quê -- só "isso aqui precisa ser
-- separado antes do caminhão chegar" e "já separei".
--
-- Reaproveita o mesmo padrão de tabela reversível de sempre
-- (conferir_exp_notas, exp_pedido_faturamento_confirmado): NÃO mexe nos
-- itens de exp_controle_itens, só anota que aquele pedido foi avisado.
create table if not exists exp_pedido_aviso_preparo (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  numero_pedido  text not null,
  status         text not null default 'pendente',
  avisado_por    text,
  avisado_em     timestamptz not null default now(),
  preparado_por  text,
  preparado_em   timestamptz,

  constraint exp_pedido_aviso_preparo_unico unique (unidade, numero_pedido),
  constraint exp_pedido_aviso_preparo_status_valido check (status in ('pendente', 'preparado'))
);

create index if not exists idx_exp_pedido_aviso_preparo_pendente
  on exp_pedido_aviso_preparo (unidade, status);

alter table exp_pedido_aviso_preparo enable row level security;

drop policy if exists "Leitura exp_pedido_aviso_preparo da unidade" on exp_pedido_aviso_preparo;
drop policy if exists "Escrita exp_pedido_aviso_preparo da unidade" on exp_pedido_aviso_preparo;

-- Mesmo padrão de sempre: esta_aprovado() + (admin ou dono da unidade).
create policy "Leitura exp_pedido_aviso_preparo da unidade" on exp_pedido_aviso_preparo
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita exp_pedido_aviso_preparo da unidade" on exp_pedido_aviso_preparo
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_pedido_aviso_preparo' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'exp_pedido_aviso_preparo'
 order by policyname;
