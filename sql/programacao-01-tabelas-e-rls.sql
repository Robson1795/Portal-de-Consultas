-- =====================================================================
-- PROGRAMACAO DE SEPARACAO (modulo do Portal de Estoque -- aba "Programacao")
-- Migration 001 - tabelas, RLS e indices
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA cole este arquivo na interface web do GitHub.
--             (Foi assim que o index.html do portal foi perdido 3x.)
--
-- PRE-REQUISITO OBRIGATORIO
--
--    Este script depende das funcoes criadas na Fase 1 do portal:
--
--        esta_aprovado()   eh_admin()   minha_unidade()   meu_perfil()
--
--    Elas vem de sql/fase1a-colunas-e-funcoes.sql do repositorio
--    Portal-de-Consultas. Se a Fase 1 ainda nao foi aplicada neste banco,
--    RODE-A PRIMEIRO -- senao todas as policies abaixo falham na criacao.
--
--    Confira antes com:
--        select proname from pg_proc
--         where proname in ('esta_aprovado','eh_admin','minha_unidade','meu_perfil');
--    Devem voltar as quatro linhas.
--
-- DECISAO DE DESENHO: nao existe tabela de papel nova.
--
--    O desenho original previa uma `usuarios_perfil` com os papeis
--    separador / responsavel_exp / responsavel_carregamento. Ela nao foi
--    criada de proposito: `usuarios_permitidos.perfil` ja e a fonte de
--    verdade de papel neste banco, com RLS, trava anti-escalonamento e a
--    aba Configuracoes administrando. Duas tabelas de papel seriam duas
--    verdades -- o mesmo erro que a coluna `localizacao` causou e que ja
--    foi corrigido em 04/09/2026.
--
--    E nao faz falta: a especificacao diz que os papeis servem so para
--    RASTREABILIDADE, sem bloquear tela. Rastreabilidade aqui e o
--    `usuario_id` gravado em cada acao, que e o que estas tabelas fazem.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 -- Tabelas
--
-- Sobre `unidade`: nao estava no desenho original, e e indispensavel.
-- O portal e multi-unidade e todo o RLS filtra por unidade. Sem esta
-- coluna, Araquari enxergaria a programacao de Anapolis.
-- ---------------------------------------------------------------------

create table if not exists pedidos (
  id                      uuid primary key default gen_random_uuid(),
  unidade                 text not null,
  numero_pedido           text not null,
  cliente                 text,
  cidade                  text,
  uf                      text,
  modalidade_frete        text,          -- CIF / FOB
  tipo_veiculo            text,          -- CARRETA, TRUCK, TRUCK 8,5M
  data_carregamento       date,
  horario_carregamento    time,
  placa_veiculo           text,          -- pre-preenche a tela de carregamento quando a planilha traz
  observacao_carregamento text,
  flag_adicional          boolean,       -- coluna "Sim/Nao" da planilha B -- significado A CONFIRMAR
  cor_origem              text,          -- cor da linha na planilha original -- metadado, sem uso na logica
  status_geral            text not null default 'aguardando',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- O mesmo numero de pedido pode existir em unidades diferentes.
  -- A unicidade e do par, nao do numero sozinho.
  constraint pedidos_numero_por_unidade unique (unidade, numero_pedido),

  constraint pedidos_status_valido check (status_geral in
    ('aguardando','em_separacao','separado','enderecado','pronto','carregado'))
);

create table if not exists pedido_itens (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references pedidos(id) on delete cascade,
  seq              int,
  codigo_item      text,
  descricao        text,
  unidade_medida   text,          -- UN da planilha. NAO confundir com pedidos.unidade (a fabrica).
  quantidade       numeric,
  numero_os_op     text,
  observacao       text,
  status_separacao text not null default 'aguardando',
  separado_por     uuid references auth.users(id),
  separado_em      timestamptz,
  created_at       timestamptz not null default now(),

  -- Reimportar a planilha A nao pode duplicar item: a chave natural da
  -- linha e o pedido + a sequencia dele.
  constraint pedido_itens_seq_unico unique (pedido_id, seq),

  constraint pedido_itens_status_valido check (status_separacao in
    ('aguardando','separado','reportado'))
);

create table if not exists exp_acessorios (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references pedidos(id) on delete cascade,
  endereco       text,                  -- "Doca 3", "Pallet 12"
  responsavel_id uuid references auth.users(id),
  status         text not null default 'aguardando_endereco',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  -- Um pedido tem um enderecamento so. Sem isto, clicar duas vezes em
  -- "marcar como separado" criaria duas linhas para o mesmo pedido.
  constraint exp_acessorios_pedido_unico unique (pedido_id),

  constraint exp_acessorios_status_valido check (status in
    ('aguardando_endereco','pronto_para_carregamento'))
);

create table if not exists registro_saida (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references pedidos(id) on delete cascade,
  conferente      text not null,
  placa_veiculo   text,
  data_hora_saida timestamptz not null default now(),
  observacoes     text,
  registrado_por  uuid references auth.users(id)
);

create table if not exists log_movimentacao (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references pedidos(id) on delete cascade,
  evento     text not null,   -- item_separado, pedido_separado, endereco_definido, saida_registrada, importacao
  usuario_id uuid references auth.users(id),
  detalhe    jsonb,
  criado_em  timestamptz not null default now()
);

-- Indices: o que as tres telas realmente consultam.
create index if not exists idx_pedidos_unidade_status on pedidos (unidade, status_geral);
create index if not exists idx_pedidos_carregamento   on pedidos (data_carregamento, horario_carregamento);
create index if not exists idx_pedido_itens_pedido    on pedido_itens (pedido_id);
create index if not exists idx_exp_status             on exp_acessorios (status);
create index if not exists idx_log_pedido             on log_movimentacao (pedido_id, criado_em desc);


-- ---------------------------------------------------------------------
-- PARTE 2 -- Quem enxerga o que
--
-- `security definer` para ler pedidos.unidade sem esbarrar no RLS da
-- propria tabela pedidos (politica que consulta a tabela que tem
-- politica = recursao). Mesmo padrao das funcoes da Fase 1.
-- ---------------------------------------------------------------------

create or replace function public.pedido_e_da_minha_unidade(p_pedido_id uuid)
returns boolean language sql stable security definer set search_path = public as $func$
  select public.eh_admin()
      or exists (
           select 1 from public.pedidos p
            where p.id = p_pedido_id
              and p.unidade = public.minha_unidade()
         );
$func$;

grant execute on function public.pedido_e_da_minha_unidade(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 3 -- RLS
--
-- Regra: conta APROVADA e da MESMA UNIDADE. Admin em todas.
--
-- O desenho original pedia "escrita liberada para qualquer usuario
-- autenticado". Isso NAO foi seguido, de proposito: e exatamente a
-- politica `using (true)` que a AUDITORIA.md marcou como critica
-- (itens #2 e #3) e que a Fase 1 removeu do resto do banco.
-- Repeti-la aqui reabriria o mesmo buraco em cinco tabelas novas.
--
-- `minha_unidade()` nulo resulta em NULL na comparacao, que o RLS trata
-- como negado. Cadastro sem unidade nao ve nada em vez de ver tudo:
-- falha fechado, igual a Fase 2 do portal.
-- ---------------------------------------------------------------------

alter table pedidos          enable row level security;
alter table pedido_itens     enable row level security;
alter table exp_acessorios   enable row level security;
alter table registro_saida   enable row level security;
alter table log_movimentacao enable row level security;

-- ---- pedidos ----
drop policy if exists "Leitura pedidos da unidade" on pedidos;
drop policy if exists "Escrita pedidos da unidade" on pedidos;

create policy "Leitura pedidos da unidade" on pedidos
  for select to authenticated
  using (public.esta_aprovado()
         and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita pedidos da unidade" on pedidos
  for all to authenticated
  using (public.esta_aprovado()
         and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado()
         and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---- tabelas filhas: herdam a unidade do pedido ----
drop policy if exists "Leitura itens da unidade" on pedido_itens;
drop policy if exists "Escrita itens da unidade" on pedido_itens;

create policy "Leitura itens da unidade" on pedido_itens
  for select to authenticated
  using (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id));

create policy "Escrita itens da unidade" on pedido_itens
  for all to authenticated
  using (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id))
  with check (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id));

drop policy if exists "Leitura exp da unidade" on exp_acessorios;
drop policy if exists "Escrita exp da unidade" on exp_acessorios;

create policy "Leitura exp da unidade" on exp_acessorios
  for select to authenticated
  using (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id));

create policy "Escrita exp da unidade" on exp_acessorios
  for all to authenticated
  using (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id))
  with check (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id));

drop policy if exists "Leitura saida da unidade" on registro_saida;
drop policy if exists "Escrita saida da unidade" on registro_saida;

create policy "Leitura saida da unidade" on registro_saida
  for select to authenticated
  using (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id));

-- Saida e registro historico: cria-se, nao se altera nem se apaga.
create policy "Escrita saida da unidade" on registro_saida
  for insert to authenticated
  with check (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id));

-- ---- log: quem e aprovado da unidade escreve, ninguem edita ----
drop policy if exists "Leitura log da unidade" on log_movimentacao;
drop policy if exists "Escrita log da unidade" on log_movimentacao;

create policy "Leitura log da unidade" on log_movimentacao
  for select to authenticated
  using (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id));

create policy "Escrita log da unidade" on log_movimentacao
  for insert to authenticated
  with check (public.esta_aprovado() and public.pedido_e_da_minha_unidade(pedido_id));
