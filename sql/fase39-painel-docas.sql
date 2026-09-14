-- Fase 39 -- Painel de Docas (monitoramento de carregamento em tempo real)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/programacao-04-exp-saida.sql e sql/fase36-doca.sql
-- (estado `na_doca` em exp_controle_itens).
--
-- O Robson, 14/09/2026: "Queremos uma nova aba/painel (Dashboard em Tempo
-- Real) focado na gestão das 3 Docas de Carregamento da fábrica... que
-- conferentes e o encarregado alimentem o sistema na linha de frente,
-- enquanto gerentes e diretores visualizam o status de qualquer lugar."
--
-- O QUE FALTAVA (e é só isso)
--
-- O Controle EXP já sabe que um item saiu do endereço e está "na doca"
-- (fase36), quem levou e quando. O que ele NÃO sabe é EM QUAL doca e DE
-- QUAL caminhão -- "na doca" hoje é um lugar só, abstrato. Estas tabelas
-- dão nome e dono a esse lugar: cada baixa passa a pertencer a um
-- carregamento concreto (placa, transportadora, cronômetro), e é isso que
-- transforma as baixas que JÁ são feitas em barra de progresso, tempo de
-- doca e histórico -- sem nenhuma digitação nova no meio do carregamento.
--
-- Esta é a FASE 1 da proposta: quadro das docas, cronômetro e progresso.
-- SLA por tipo de veículo, motivos de atraso e justificativa travando o
-- fechamento são a fase 2, em migration própria (doca_sla, doca_motivos,
-- doca_ocorrencias) -- não adiantam nada antes de existir tempo medido.

-- ---------------------------------------------------------------------
-- 1. Cadastro das docas
-- ---------------------------------------------------------------------
-- Tabela, e não três valores fixos no código: são 3 docas em Araquari
-- hoje, mas o nome que a operação usa pode não ser "Doca 1" (o quadro vai
-- numa TV no galpão, tem de falar a língua de quem está lá), e outra
-- unidade pode ter outro número. Trocar nome/quantidade vira cadastro,
-- não deploy.
create table if not exists docas (
  id      uuid primary key default gen_random_uuid(),
  unidade text not null,
  nome    text not null,
  ordem   integer not null default 0,   -- ordem das colunas no quadro
  ativa   boolean not null default true,

  constraint docas_unicas unique (unidade, nome)
);

-- Só a 106 (Araquari) -- é a unidade que pediu o módulo. Para ligar o
-- painel em Anápolis (101) ou Cambuí (105), basta inserir as docas de lá.
insert into docas (unidade, nome, ordem) values
  ('106', 'Doca 1', 1),
  ('106', 'Doca 2', 2),
  ('106', 'Doca 3', 3)
on conflict (unidade, nome) do nothing;

-- ---------------------------------------------------------------------
-- 2. Carregamentos -- um registro por caminhão
-- ---------------------------------------------------------------------
-- É a tabela de FATOS do módulo: todo indicador do relatório sai daqui.
-- Por isso nada é apagado -- cancelar é status, não delete (mesmo
-- princípio do resto do portal, onde retirada desfeita continua no
-- histórico).
--
-- Os quatro carimbos de tempo são separados de propósito, e cada um
-- responde uma pergunta diferente:
--   chegada_em -> chamado_em  = tempo de FILA no pátio   (gargalo de pátio)
--   inicio_em  -> fim_em      = tempo de CARREGAMENTO    (gargalo de doca)
-- Juntar os dois num "tempo total" esconderia qual dos dois é o problema.
--
-- `sla_minutos` é CÓPIA da meta vigente no momento do início, não um
-- link pra tabela de metas: se a meta mudar em dezembro, o carregamento
-- de setembro tem de continuar medido pela meta de setembro, senão o
-- histórico se reescreve sozinho toda vez que alguém ajusta um número.
-- Na fase 1 fica nulo (ainda não existe cadastro de SLA) -- a coluna já
-- nasce aqui pra não precisar mexer na tabela de fatos depois.
create table if not exists doca_carregamentos (
  id                uuid primary key default gen_random_uuid(),
  unidade           text not null,
  setor             text not null default 'exp',  -- mesmo recorte do Controle EXP
  doca_id           uuid references docas (id),   -- nulo enquanto está na fila do pátio

  placa             text not null,
  motorista         text,
  transportadora    text,
  tipo_veiculo      text,

  meta_itens        numeric,      -- previsto do embarque (soma dos itens dos pedidos)

  chegada_em        timestamptz not null default now(),
  chamado_em        timestamptz,
  inicio_em         timestamptz,
  fim_em            timestamptz,
  sla_minutos       integer,

  status            text not null default 'aguardando',
  conferente_inicio text,
  conferente_fim    text,
  observacao        text,

  criado_por        text,
  criado_em         timestamptz not null default now(),

  constraint doca_carregamentos_status_valido
    check (status in ('aguardando', 'carregando', 'finalizado', 'cancelado'))
);

-- O quadro busca sempre "o que está aberto nesta unidade" -- é a consulta
-- que roda a cada atualização de tela, então é a que precisa de índice.
create index if not exists idx_doca_carregamentos_abertos
  on doca_carregamentos (unidade, status);
create index if not exists idx_doca_carregamentos_periodo
  on doca_carregamentos (unidade, inicio_em);

-- ---------------------------------------------------------------------
-- 3. Pedidos de cada carregamento (N:N)
-- ---------------------------------------------------------------------
-- Tabela à parte, e não uma coluna `numero_pedido` no carregamento: um
-- caminhão leva mais de um pedido no mesmo embarque (confirmado pelo
-- Robson), e um pedido grande pode sair em dois caminhões. Guardar isso
-- numa coluna de texto separada por vírgula quebraria toda consulta de
-- "quais embarques levaram o pedido KV876431".
create table if not exists doca_carregamento_pedidos (
  id              uuid primary key default gen_random_uuid(),
  carregamento_id uuid not null references doca_carregamentos (id) on delete cascade,
  numero_pedido   text not null,

  constraint doca_carregamento_pedidos_unicos unique (carregamento_id, numero_pedido)
);

create index if not exists idx_doca_carregamento_pedidos_pedido
  on doca_carregamento_pedidos (numero_pedido);

-- ---------------------------------------------------------------------
-- 4. Log de eventos do carregamento
-- ---------------------------------------------------------------------
-- Append-only: nunca é editado nem apagado. É o que responde, seis meses
-- depois, "por que este carregamento ficou quatro horas?" -- a tabela de
-- fatos guarda o resultado, esta guarda a história de como chegou nele.
create table if not exists doca_eventos (
  id              uuid primary key default gen_random_uuid(),
  carregamento_id uuid not null references doca_carregamentos (id) on delete cascade,
  evento          text not null,   -- chegou / chamou / iniciou / finalizou / reabriu / cancelou
  dados           jsonb,
  por             text,
  em              timestamptz not null default now()
);

create index if not exists idx_doca_eventos_carregamento
  on doca_eventos (carregamento_id, em);

-- ---------------------------------------------------------------------
-- 5. A ponte: qual baixa pertence a qual caminhão
-- ---------------------------------------------------------------------
-- UMA coluna. É ela que faz a barra de progresso andar sozinha: quando o
-- conferente marca "✓ Carregou" na aba DOCA (exatamente como já faz
-- hoje), o item é carimbado com o carregamento em curso daquele pedido.
-- Progresso = itens carimbados ÷ meta do embarque.
--
-- Propositalmente SEM foreign key. log_movimentacao tem FK NOT NULL para
-- `pedidos` e isso já obrigou um remendo no portal ("só loga se achar o
-- pedido de verdade na grade carregada agora", ver marcarSaidaExpControle()
-- em js/programacao.js): uma FK aqui faria a BAIXA DO ITEM -- que é a
-- operação principal, a que não pode falhar -- depender de um registro
-- acessório existir. Item baixado fora de um embarque registrado
-- simplesmente fica com a coluna nula, e a baixa acontece do mesmo jeito.
alter table exp_controle_itens add column if not exists doca_carregamento_id uuid;

create index if not exists idx_exp_controle_itens_carregamento
  on exp_controle_itens (doca_carregamento_id);

-- ---------------------------------------------------------------------
-- 6. RLS -- mesmo padrão de todo o Controle EXP
-- ---------------------------------------------------------------------
-- esta_aprovado() + (eh_admin() or minha_unidade() = unidade), igual a
-- conferir_exp_notas, exp_pedido_status e exp_conferencia_fisica.
-- As duas tabelas filhas (pedidos e eventos) não têm coluna `unidade`
-- própria: herdam a do carregamento pai, via EXISTS -- duplicar a unidade
-- nelas abriria espaço pra ficar diferente da do pai.
alter table docas                     enable row level security;
alter table doca_carregamentos        enable row level security;
alter table doca_carregamento_pedidos enable row level security;
alter table doca_eventos              enable row level security;

drop policy if exists "Leitura docas da unidade" on docas;
drop policy if exists "Escrita docas da unidade" on docas;
create policy "Leitura docas da unidade" on docas
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));
-- Cadastro de doca é coisa de admin: mexe no quadro de todo mundo.
create policy "Escrita docas da unidade" on docas
  for all to authenticated
  using (public.esta_aprovado() and public.eh_admin())
  with check (public.esta_aprovado() and public.eh_admin());

drop policy if exists "Leitura doca_carregamentos da unidade" on doca_carregamentos;
drop policy if exists "Escrita doca_carregamentos da unidade" on doca_carregamentos;
create policy "Leitura doca_carregamentos da unidade" on doca_carregamentos
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));
create policy "Escrita doca_carregamentos da unidade" on doca_carregamentos
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

drop policy if exists "Leitura doca_carregamento_pedidos" on doca_carregamento_pedidos;
drop policy if exists "Escrita doca_carregamento_pedidos" on doca_carregamento_pedidos;
create policy "Leitura doca_carregamento_pedidos" on doca_carregamento_pedidos
  for select to authenticated
  using (public.esta_aprovado() and exists (
    select 1 from doca_carregamentos c
     where c.id = carregamento_id
       and (public.eh_admin() or public.minha_unidade() = c.unidade)));
create policy "Escrita doca_carregamento_pedidos" on doca_carregamento_pedidos
  for all to authenticated
  using (public.esta_aprovado() and exists (
    select 1 from doca_carregamentos c
     where c.id = carregamento_id
       and (public.eh_admin() or public.minha_unidade() = c.unidade)))
  with check (public.esta_aprovado() and exists (
    select 1 from doca_carregamentos c
     where c.id = carregamento_id
       and (public.eh_admin() or public.minha_unidade() = c.unidade)));

drop policy if exists "Leitura doca_eventos" on doca_eventos;
drop policy if exists "Escrita doca_eventos" on doca_eventos;
create policy "Leitura doca_eventos" on doca_eventos
  for select to authenticated
  using (public.esta_aprovado() and exists (
    select 1 from doca_carregamentos c
     where c.id = carregamento_id
       and (public.eh_admin() or public.minha_unidade() = c.unidade)));
-- Só INSERT: log não se edita nem se apaga, nem por quem escreveu.
create policy "Escrita doca_eventos" on doca_eventos
  for insert to authenticated
  with check (public.esta_aprovado() and exists (
    select 1 from doca_carregamentos c
     where c.id = carregamento_id
       and (public.eh_admin() or public.minha_unidade() = c.unidade)));

-- ---------------------------------------------------------------------
-- 7. Tempo real
-- ---------------------------------------------------------------------
-- O portal já usa Supabase Realtime (WebSocket) na contagem física, nas
-- bobinas e nas atribuições de corredor -- o painel usa o MESMO
-- mecanismo, sem servidor novo. Sem este passo a tela não recebe nada,
-- e é o tropeço clássico: tudo grava certo e nenhuma outra tela atualiza.
--
-- exp_controle_itens entra junto porque é a baixa do item que faz a barra
-- de progresso andar -- é a tabela que o conferente mexe, e o quadro do
-- encarregado (e a TV) precisa reagir a ela.
-- O `do $$ ... exception` deixa o script seguro pra rodar de novo (mesmo
-- padrão de contagem_bobinas, em sql/bobinas-aco.sql).
do $$ begin
  alter publication supabase_realtime add table doca_carregamentos;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table exp_controle_itens;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select unidade, nome, ordem, ativa from docas order by unidade, ordem;

select table_name, column_name, data_type
  from information_schema.columns
 where table_name in ('doca_carregamentos', 'doca_carregamento_pedidos', 'doca_eventos')
 order by table_name, ordinal_position;

select column_name, data_type from information_schema.columns
 where table_name = 'exp_controle_itens' and column_name = 'doca_carregamento_id';

select tablename as tabela, policyname as politica, cmd as comando
  from pg_policies
 where tablename in ('docas', 'doca_carregamentos', 'doca_carregamento_pedidos', 'doca_eventos')
 order by tablename, policyname;

select tablename as tabela_em_tempo_real
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename in ('doca_carregamentos', 'exp_controle_itens')
 order by tablename;
