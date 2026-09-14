-- ============================================================================
-- Fase 38 — Reserva de bobinas de aço pelo PCP
-- ============================================================================
--
-- O Victor, 14/09/2026: *"O PCP frequentemente identifica um aço que está
-- disponível no estoque e solicita que ele seja reservado para um pedido que
-- ainda vai entrar. (...) O problema é que, depois de reservado, muitas vezes o
-- PCP esquece daquele material."*
--
-- Hoje a reserva é só física: muda-se a localização para uma área "Reservado" e
-- cola-se uma etiqueta na bobina. Nada disso fica registrado, então ninguém
-- sabe há quanto tempo a bobina está parada nem para qual pedido.
--
-- ============================================================================
-- ⚠️ POR QUE UMA TABELA PRÓPRIA, E NÃO UMA COLUNA EM `bobinas_aco`
-- ============================================================================
--
-- `substituir_bobinas()` (fase15) faz, por unidade:
--
--     delete from bobinas_aco where est = e;
--     insert into bobinas_aco (...) ...
--
-- Ou seja: **toda colagem da planilha do Datasul recria as linhas e regenera os
-- `id`**. Duas consequências, e as duas matam o desenho "mais simples":
--
--   1. Gravar 'RESERVADO' na coluna `localizacao` seria apagado na colagem
--      seguinte -- e, enquanto durasse, a bobina ficaria SEM o endereço real,
--      que é o que alguém usa para ir buscá-la.
--   2. Uma reserva que apontasse para `bobinas_aco.id` perderia a bobina no dia
--      seguinte, apontando para um id que não existe mais.
--
-- Por isso a reserva mora aqui, chaveada pelo NEGÓCIO. É o mesmo padrão que o
-- projeto já usa em `contagem_bobinas` (PK item+localizacao+lote),
-- `analise_item_notas` (fase20) e `conferir_exp_notas` (fase33): anotação que
-- precisa sobreviver à substituição da planilha não mora na planilha.
--
-- ============================================================================
-- ⚠️ A CHAVE É unidade + item + LOTE, e a localização NÃO entra
-- ============================================================================
--
-- Decisão do Victor (14/09/2026), perguntado explicitamente: o **Lote é o
-- número da bobina** -- item+lote identifica UMA bobina.
--
-- A localização fica de fora de propósito, e isso é o ponto: hoje o processo
-- MOVE a bobina para a área de "Reservado". Se o endereço entrasse na chave, a
-- reserva perderia a bobina exatamente no momento em que ela é reservada. Com
-- item+lote, a reserva segue a bobina para onde ela for.
--
-- O endereço do momento da reserva é guardado como RETRATO (`localizacao_na_
-- reserva`), para a etiqueta e o histórico dizerem onde ela estava.
--
-- ⚠️ `codigo_item` e `lote` são guardados JÁ NORMALIZADOS (maiúsculo, sem
-- espaço nas pontas) -- é o mesmo cuidado de `normalizaCodigoItem()` em
-- js/estoque.js. O projeto já perdeu uma tarde com `996613I` gravado minúsculo
-- numa planilha e maiúsculo na outra (CLAUDE.md, seção 14); aqui o efeito seria
-- pior: a bobina ficaria reservada no banco e a lista não mostraria a marca.
--
-- Rodar no painel do Supabase: SQL Editor → New query → Run.
-- ============================================================================

create table if not exists reservas_aco (
  id                    uuid primary key default gen_random_uuid(),

  -- ---- a chave da bobina ----
  unidade               text not null,          -- o `est` da bobinas_aco
  codigo_item           text not null,          -- normalizado
  lote                  text not null default '',  -- normalizado

  -- ---- retrato da bobina no momento da reserva ----
  -- Não é redundância com `bobinas_aco`: a planilha é substituída inteira todo
  -- dia, e o histórico desta tabela é lido meses depois. Sem o retrato, uma
  -- reserva de março mostraria a descrição e o peso de hoje -- ou nada, se a
  -- bobina já tiver saído da planilha.
  descricao             text,
  dep                   text,
  localizacao_na_reserva text,
  um                    text,
  quantidade            numeric,

  -- ---- a reserva ----
  -- `pedido` é texto livre de propósito: o pedido "ainda vai entrar", então por
  -- definição ele não existe em `pedidos` na hora da reserva. Validar contra uma
  -- tabela aqui impediria exatamente o caso de uso.
  pedido                text not null,
  observacao            text,
  reservado_por         text,
  reservado_em          timestamptz not null default now(),

  -- ---- a liberação ----
  -- Liberar é preencher estas três colunas, NUNCA apagar a linha: o pedido
  -- explícito era manter o histórico de "qual aço, para qual pedido, quem
  -- reservou, quando, quando foi liberado e por quem".
  liberado_em           timestamptz,
  liberado_por          text,
  motivo_liberacao      text
);

-- A lista de reservas ativas é a consulta quente da tela.
create index if not exists idx_reservas_aco_ativas
  on reservas_aco (unidade, reservado_em desc)
  where liberado_em is null;

-- Cruzar a lista de bobinas com as reservas, por unidade.
create index if not exists idx_reservas_aco_chave
  on reservas_aco (unidade, codigo_item, lote);

-- ⚠️ UMA RESERVA ATIVA POR BOBINA, garantido pelo BANCO.
--
-- A regra "um aço já reservado não pode ser reservado de novo para outro
-- pedido" não pode viver só na tela: duas pessoas do PCP com o portal aberto
-- ao mesmo tempo passariam pela checagem do JavaScript as duas, e a segunda
-- gravaria por cima sem ninguém ver. Índice parcial (só onde `liberado_em is
-- null`) porque a MESMA bobina pode ser reservada de novo depois de liberada --
-- e deve poder: é o caso normal de um pedido que caiu e outro que entrou.
create unique index if not exists idx_reservas_aco_uma_ativa
  on reservas_aco (unidade, codigo_item, lote)
  where liberado_em is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table reservas_aco enable row level security;

-- LEITURA para qualquer conta aprovada: é ela que faz o 🟠 aparecer na lista de
-- aços. Quem já lê `bobinas_aco` (mesma regra, fase1c) precisa ler a reserva
-- junto, senão a lista mostraria a bobina como livre.
drop policy if exists "Leitura para aprovados" on reservas_aco;
create policy "Leitura para aprovados" on reservas_aco
  for select to authenticated using (public.esta_aprovado());

-- ESCRITA para quem cuida do aço: `estoque_aco` e admin -- decisão do Victor
-- (14/09/2026): *"Só Estoque Aço e Admin reservam"*, o PCP pede e eles
-- registram.
--
-- ⚠️ NÃO é `pode_atualizar_bobinas()`, apesar de ser sobre aço: aquela função é
-- a lista `editores_bobinas` (quem COLA a planilha -- Jhonatan, Victor,
-- Izabella). Reservar não é atualizar a planilha; é um registro do dia a dia de
-- quem opera o pátio. Usar aquela lista aqui deixaria o time do aço sem
-- conseguir reservar.
drop policy if exists "Reserva do aco" on reservas_aco;
create policy "Reserva do aco" on reservas_aco
  for all to authenticated
  using (public.eh_admin() or public.meu_perfil() = 'estoque_aco')
  with check (public.eh_admin() or public.meu_perfil() = 'estoque_aco');

-- ⚠️ NÃO existe política de DELETE separada, e isso é de propósito: o `for all`
-- acima cobre delete, mas a TELA nunca apaga -- liberar preenche
-- `liberado_em`. Se algum dia precisar apagar de verdade (uma reserva criada
-- por engano em duplicidade), que seja pelo painel, à mão, e com intenção.

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — o que deve aparecer depois de rodar
-- ---------------------------------------------------------------------------
select 'tabela' as o_que, count(*)::text as resultado
  from information_schema.tables
 where table_schema = 'public' and table_name = 'reservas_aco'
union all
select 'indices', string_agg(indexname, ', ')
  from pg_indexes
 where schemaname = 'public' and tablename = 'reservas_aco'
union all
select 'politicas', string_agg(policyname, ', ')
  from pg_policies
 where schemaname = 'public' and tablename = 'reservas_aco';
