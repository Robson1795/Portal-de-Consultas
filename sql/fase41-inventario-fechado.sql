-- ============================================================================
-- Fase 41 — Fechar o inventário, em vez de jogar a contagem fora
-- ============================================================================
--
-- O Victor, 14/09/2026, perguntando o que mais dava para fazer no projeto.
--
-- ============================================================================
-- O PROBLEMA: a contagem era APAGADA, e com ela a única prova do trabalho
-- ============================================================================
--
-- Até aqui o fim de um inventário era o botão **"Limpar tudo"**: um `delete` em
-- `contagem_fisica` da unidade e do depósito. Some tudo -- o que foi contado,
-- quem contou, o que divergiu e quanto.
--
-- Consequência: **o portal nunca conseguiu responder "qual é a nossa
-- acuracidade de inventário?"**, que é o número que um gestor de estoque leva
-- para a diretoria, e o único que mostra se o trabalho de contar está
-- melhorando ou piorando. Cada inventário existia por algumas horas e virava pó.
--
-- Agora "Fechar inventário" **congela a contagem aqui** e só então limpa. O
-- "Limpar tudo" continua existindo (virou "Descartar contagem"), porque contagem
-- de teste ou começada errada não pode virar histórico -- mas deixou de ser o
-- único caminho.
--
-- ============================================================================
-- ⚠️ DUAS TABELAS, E NÃO UMA
-- ============================================================================
--
-- `inventarios` é o cabeçalho (uma linha por fechamento, com os totais já
-- somados) e `inventario_itens` é o detalhe (uma linha por item+endereço
-- contado). Mesmo desenho de `requisicoes_alm` / `requisicoes_alm_itens`, e pelo
-- mesmo motivo: a tela de histórico lista dezenas de fechamentos e só precisa
-- dos totais; o detalhe de um deles pode ter milhares de linhas e só é lido
-- quando alguém abre aquele inventário.
--
-- ⚠️ Os totais ficam GRAVADOS no cabeçalho, não recalculados na leitura. Não é
-- desnormalização por preguiça: é o retrato do que foi apurado naquele dia. Se
-- um dia a régua da acuracidade mudar, os inventários antigos continuam
-- mostrando o número que foi apresentado na época -- recalcular reescreveria o
-- passado.
--
-- ============================================================================
-- ⚠️ O QUE "ACURACIDADE" QUER DIZER AQUI
-- ============================================================================
--
--     acuracidade = itens que conferem ÷ itens CONTADOS × 100
--
-- O denominador é o que foi contado, **não** o que existe na unidade. Item que
-- ninguém contou não está errado -- está não contado, e misturar as duas coisas
-- daria uma acuracidade que despenca só porque o inventário não terminou.
-- A tela diz isso em letras, para o número não ser lido como outra coisa.
--
-- Rodar no painel do Supabase: SQL Editor → New query → Run.
-- ============================================================================

create table if not exists inventarios (
  id                uuid primary key default gen_random_uuid(),

  unidade           text not null,
  -- Um inventário é de um depósito (alm / sesmt / benchmark): contar o
  -- almoxarifado não diz nada sobre o EPI da mesma unidade, e juntar os dois
  -- num número só esconderia qual dos dois está ruim.
  deposito          text not null default 'alm',

  fechado_em        timestamptz not null default now(),
  fechado_por       text,

  -- Retrato do que foi apurado -- ver a nota sobre não recalcular, acima.
  itens_contados    integer not null default 0,
  itens_conferem    integer not null default 0,
  itens_divergentes integer not null default 0,
  acuracidade       numeric,          -- 0 a 100

  observacao        text
);

create table if not exists inventario_itens (
  id                 uuid primary key default gen_random_uuid(),
  inventario_id      uuid not null references inventarios(id) on delete cascade,

  -- ⚠️ Retrato, igual ao de `reservas_aco` (fase38): a planilha do estoque é
  -- substituída a cada colagem, e este histórico é lido meses depois. Sem
  -- guardar descrição e endereço aqui, o inventário de setembro mostraria o
  -- dado de hoje -- ou nada, se o item já tiver saído da planilha.
  codigo_item        text not null,
  descricao          text,
  localizacao        text,
  um                 text,

  quantidade_sistema numeric,
  quantidade_fisica  numeric,
  diferenca          numeric,         -- física - sistema (negativo = falta)

  contado_por        text,
  contado_em         timestamptz
);

-- A tela abre listando os fechamentos mais recentes da unidade.
create index if not exists idx_inventarios_unidade
  on inventarios (unidade, fechado_em desc);

-- E abrir um inventário lê só as linhas dele.
create index if not exists idx_inventario_itens_pai
  on inventario_itens (inventario_id);

-- Achar rapidamente o histórico de um item ("este código vive divergindo?").
create index if not exists idx_inventario_itens_codigo
  on inventario_itens (codigo_item);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table inventarios      enable row level security;
alter table inventario_itens enable row level security;

-- LEITURA para qualquer conta aprovada: acuracidade de inventário é indicador
-- de operação, não dado comercial -- e quem conta merece ver o resultado do que
-- contou. (Diferente da Análise de Compras, que é restrita por pessoa porque
-- mostra o que falta comprar, para quem e com que urgência.)
drop policy if exists "Leitura para aprovados" on inventarios;
create policy "Leitura para aprovados" on inventarios
  for select to authenticated using (public.esta_aprovado());

drop policy if exists "Leitura para aprovados" on inventario_itens;
create policy "Leitura para aprovados" on inventario_itens
  for select to authenticated using (public.esta_aprovado());

-- ESCRITA para quem já podia APAGAR a contagem daquela unidade: é exatamente a
-- mesma decisão ("este inventário acabou"), só que agora ela guarda em vez de
-- jogar fora. Reusar `pode_atualizar_estoque()` evita criar uma segunda lista de
-- permissão para manter em sincronia com a primeira.
drop policy if exists "Fechar inventario" on inventarios;
create policy "Fechar inventario" on inventarios
  for insert to authenticated
  with check (public.pode_atualizar_estoque(unidade));

-- O detalhe herda a permissão do cabeçalho: quem pôde criar o inventário pode
-- escrever as linhas dele, e ninguém pode pendurar linha no inventário alheio.
drop policy if exists "Itens do proprio inventario" on inventario_itens;
create policy "Itens do proprio inventario" on inventario_itens
  for insert to authenticated
  with check (exists (
    select 1 from inventarios i
     where i.id = inventario_id
       and public.pode_atualizar_estoque(i.unidade)
  ));

-- ⚠️ NÃO existe política de UPDATE nem de DELETE nas duas tabelas, e isso é o
-- ponto: histórico de inventário que pode ser reescrito não serve de histórico.
-- Fechamento errado se corrige fechando outro -- e a data de cada um diz qual é
-- qual. Se algum dia precisar apagar de verdade (um fechamento de teste), que
-- seja pelo painel, à mão, e com intenção.

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — o que deve aparecer depois de rodar
-- ---------------------------------------------------------------------------
select 'tabelas' as o_que, string_agg(table_name, ', ') as resultado
  from information_schema.tables
 where table_schema = 'public' and table_name in ('inventarios', 'inventario_itens')
union all
select 'indices', string_agg(indexname, ', ')
  from pg_indexes
 where schemaname = 'public' and tablename in ('inventarios', 'inventario_itens')
union all
select 'politicas', string_agg(tablename || '.' || policyname, ', ')
  from pg_policies
 where schemaname = 'public' and tablename in ('inventarios', 'inventario_itens');
