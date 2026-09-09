-- =====================================================================
-- PEDIDO PRONTO PRA ETIQUETA -- detectado sozinho pela troca de Nº Pedido
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--
-- POR QUE ISSO EXISTE
--
-- O Robson pediu (2026-09-08): antes de imprimir a folha/etiqueta de uma
-- localização no Controle EXP Acessórios, ele precisa ter certeza que quem
-- está alimentando a planilha já terminou de colocar todos os itens dali.
--
-- A primeira tentativa foi um botão manual "Concluir localização" -- o
-- Robson pediu pra tirar (2026-09-09) e trocar por algo automático: "quando
-- ela colocar um numero de pedido diferente ao anterior, automaticamente ja
-- e pra entender que ja posso tirar a etiqueta". Ou seja: ela digita item
-- por item pro MESMO pedido; no momento em que aparece um Nº Pedido
-- diferente do último que ela registrou, o pedido anterior é dado como
-- terminado sozinho, sem ela precisar clicar em nada.
--
-- Essa detecção mora em js/programacao.js (atualizarPedidoProntoAoRegistrar,
-- chamada de dentro de gravarMovimentacaoManual) -- esta tabela só guarda o
-- resultado: quando cada pedido foi considerado pronto, e por quem estava
-- logado quando isso foi detectado.
--
-- POR QUE POR PEDIDO, E NÃO POR LOCALIZAÇÃO (a primeira versão)
--
-- O sinal que existe de verdade é a TROCA DE PEDIDO na digitação -- não
-- existe um "botão terminei esta localização" físico. Um pedido pode ter
-- itens em mais de uma localização; todos ficam prontos juntos quando ela
-- passa pro próximo pedido.
-- =====================================================================

create table if not exists exp_pedido_status (
  id            uuid primary key default gen_random_uuid(),
  unidade       text not null,
  numero_pedido text not null,
  pronto_por    text,
  pronto_em     timestamptz not null default now(),

  constraint exp_pedido_status_unica unique (unidade, numero_pedido)
);

create index if not exists idx_exp_pedido_status_unidade on exp_pedido_status (unidade);

alter table exp_pedido_status enable row level security;

-- Mesma regra do resto do Controle EXP: conta aprovada da mesma unidade lê
-- e escreve; admin em todas.
drop policy if exists "Leitura exp_pedido_status da unidade" on exp_pedido_status;
drop policy if exists "Escrita exp_pedido_status da unidade" on exp_pedido_status;

create policy "Leitura exp_pedido_status da unidade" on exp_pedido_status
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita exp_pedido_status da unidade" on exp_pedido_status
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- Se a Fase 17 anterior (localização concluída, manual) chegou a rodar
-- neste banco, a tabela dela fica sem uso a partir de agora -- pode
-- apagar quando quiser, sem afetar nada:
--   drop table if exists exp_localizacao_status;

-- Verificação
select column_name, data_type from information_schema.columns
 where table_name = 'exp_pedido_status' order by ordinal_position;
