-- Fase 37 -- Pedido confirmado "certo no sistema, esperando faturamento"
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- O Robson, na telinha "Onde está" da aba Conferir, situação "A mais no
-- sistema": "ali aonde está a flecha laranja coloca um botao que vou
-- colocar que o pedido esta certo no sistema esperando faturamento".
-- Perguntado o que o botão deve fazer na prática, confirmou: só marca o
-- pedido como já verificado -- fica registrado (quem, quando) e o pedido
-- some do destaque de "pedido suspeito" dali em diante, mostrando em vez
-- disso "confirmado por Fulano, aguardando faturamento".
--
-- NÃO muda a conta de sistema x físico nem a situação do item (o Robson
-- não pediu isso) -- é só uma marca de "já revisei este pedido, tá tudo
-- bem, só falta o Datasul processar". Mesmo espírito de
-- `conferir_exp_notas` (fase33): anotação reversível que não mexe no
-- dado real.
--
-- POR QUE UMA TABELA PRÓPRIA, E NÃO `exp_pedido_status` (fase17)
--
-- Já existe uma tabela por (unidade, numero_pedido) com carimbo de
-- por/em -- mas é de outro assunto: `exp_pedido_status.pronto_em` marca
-- quando o pedido terminou de ser DIGITADO na Entrada (detectado sozinho
-- pela troca de Nº Pedido), pra liberar a etiqueta. Aqui é sobre a
-- CONFERÊNCIA sistema x físico, dias ou semanas depois. Reaproveitar a
-- mesma linha misturaria "terminou de digitar" com "confirmei que está
-- esperando faturamento" -- mesmo motivo que já separou
-- `conferir_exp_notas` de `analise_item_notas`.

create table if not exists exp_pedido_faturamento_confirmado (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  numero_pedido  text not null,
  confirmado_por text,
  confirmado_em  timestamptz not null default now(),

  constraint exp_pedido_faturamento_confirmado_unico unique (unidade, numero_pedido)
);

create index if not exists idx_exp_pedido_faturamento_unidade
  on exp_pedido_faturamento_confirmado (unidade);

alter table exp_pedido_faturamento_confirmado enable row level security;

drop policy if exists "Leitura exp_pedido_faturamento_confirmado da unidade" on exp_pedido_faturamento_confirmado;
drop policy if exists "Escrita exp_pedido_faturamento_confirmado da unidade" on exp_pedido_faturamento_confirmado;

-- Mesmo padrão de conferir_exp_notas/exp_pedido_status (mesma família de
-- telas do Controle EXP): esta_aprovado() + (admin ou dono da unidade).
create policy "Leitura exp_pedido_faturamento_confirmado da unidade" on exp_pedido_faturamento_confirmado
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita exp_pedido_faturamento_confirmado da unidade" on exp_pedido_faturamento_confirmado
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_pedido_faturamento_confirmado' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'exp_pedido_faturamento_confirmado'
 order by policyname;
