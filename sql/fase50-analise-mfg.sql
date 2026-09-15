-- ============================================================================
-- Fase 50 — Análise MFG: consumo teórico x reportado por OP
-- ============================================================================
--
-- O Victor, 15/09/2026: *"preciso que vc faça uma analise pesada nesse arquivo
-- do MFG e desenvolva uma tela MFG. Quero basicamente poder jogar as OPs,
-- talvez subindo um arquivo de Excel e o sistema fazer uma analise bem
-- semelhante ao MFG da empresa só que melhor. Preciso TAMBÉM que ele mostre
-- quais OPs estao com divergencias, tanto pra mais quanto pra menos no consumo.
-- Se puder também detalhar quanto a unidade ta perdendo ou ganhando, valores."*
--
-- ============================================================================
-- ⚠️ A TELA FUNCIONA SEM ESTE SCRIPT
-- ============================================================================
--
-- Subir o arquivo, calcular, filtrar, ver o detalhe de cada OP e exportar não
-- dependem de tabela nenhuma: a conta inteira acontece no navegador. O que este
-- script acrescenta é o **histórico** -- guardar o resultado de cada semana para
-- responder "a unidade está melhorando ou piorando?", que é a pergunta que o
-- arquivo solto nunca responde. Enquanto ele não rodar, o botão "Guardar esta
-- análise" avisa que a tabela não existe e a análise na tela continua valendo.
--
-- ============================================================================
-- ⚠️ GUARDA O RESULTADO, NÃO A MATÉRIA-PRIMA
-- ============================================================================
--
-- O arquivo de uma semana tem ~30.000 linhas de consumo e ~1.900 de produção,
-- que viram **~960 linhas de resultado** (uma por OP). São essas ~960 que ficam
-- aqui -- umas 50 mil por ano, a mesma ordem de grandeza de `analise_demanda`.
--
-- Regravar as 30 mil linhas de origem seriam 1,5 milhão de linhas por ano para
-- responder perguntas que o próprio arquivo já responde, e que ninguém faz duas
-- vezes. O consumo é **insumo**: entra, é calculado e o que importa é o que sai.
--
-- ============================================================================
-- ⚠️ DUAS TABELAS, E POR QUE HISTÓRICO EM VEZ DE SUBSTITUIÇÃO
-- ============================================================================
--
-- `mfg_analises` é o cabeçalho (uma linha por arquivo importado, com os totais
-- já somados) e `mfg_ops` é o detalhe. Mesmo desenho de `inventarios` /
-- `inventario_itens` (fase41) e pelo mesmo motivo: a lista de importações só
-- precisa dos totais, e o detalhe de uma delas tem centenas de linhas.
--
-- ⚠️ E aqui NÃO se substitui, diferente de `analise_demanda` (fase19), que é o
-- retrato do dia e é trocada a cada colagem. Lá o passado não interessa -- o que
-- falta comprar hoje substitui o que faltava ontem. Aqui o passado **é o
-- produto**: a variação de uma semana só vira informação quando comparada com a
-- das outras. Importar de novo a mesma semana cria outra linha, de propósito --
-- é comum reimportar depois de corrigir um cadastro, e as duas são fatos
-- diferentes ("antes da correção" e "depois"). A data e quem importou dizem qual
-- é qual.
--
-- ============================================================================
-- ⚠️ `tolerancia` FICA GRAVADA, e não é enfeite
-- ============================================================================
--
-- Ela é a régua que decidiu quantas OPs contaram como divergentes naquele dia.
-- Sem guardá-la, mudar a régua de 2% para 3% reescreveria o passado: análises
-- antigas passariam a "ter menos divergência" sem nada ter mudado na fábrica.
-- Mesmo princípio dos totais gravados em `inventarios`.
--
-- Rodar no painel do Supabase: SQL Editor → New query → Run.
-- ============================================================================

create table if not exists mfg_analises (
  id                  uuid primary key default gen_random_uuid(),

  arquivo             text,             -- nome do .xlsx importado
  periodo_inicio      date,             -- menor e maior data de OP do arquivo
  periodo_fim         date,
  tolerancia          numeric,          -- a régua usada (%), ver nota acima

  ops_analisadas      integer not null default 0,
  ops_divergentes     integer not null default 0,
  ops_sem_cadastro    integer not null default 0,
  -- ⚠️ OPs que baixaram matéria-prima e NUNCA apontaram produção. Elas não
  -- existem na análise da empresa (que parte do Acabado), e no arquivo real de
  -- setembro eram 16. Fica no cabeçalho porque é um número de saúde do
  -- apontamento, não uma linha de resultado.
  ops_sem_apontamento integer not null default 0,

  valor_perda         numeric,          -- negativo
  valor_ganho         numeric,          -- positivo
  valor_liquido       numeric,

  importado_por       text,
  criado_em           timestamptz not null default now()
);

create table if not exists mfg_ops (
  id                  uuid primary key default gen_random_uuid(),
  analise_id          uuid not null references mfg_analises(id) on delete cascade,

  op                  text not null,
  unidade             text,
  maquina             text,             -- PM ou RB: decide a largura útil
  data_op             date,

  -- ⚠️ Retrato, como em `reservas_aco` (fase38) e `inventario_itens` (fase41):
  -- a Base de Dados do MFG é reescrita a cada versão do arquivo, e este
  -- histórico é lido meses depois. Sem guardar classe e descrição aqui, uma
  -- análise de setembro mostraria o cadastro de hoje -- ou nada.
  classe              text,
  codigo_item         text,
  descricao           text,

  metros_quadrados    numeric,
  densidade_teorica   numeric,
  densidade_realizada numeric,

  quimico_teorico     numeric,
  quimico_reportado   numeric,
  diferenca_kg        numeric,          -- teórico - reportado (negativo = a mais)
  diferenca_pct       numeric,

  aco_teorico         numeric,
  aco_real            numeric,
  filme_teorico       numeric,
  filme_real          numeric,
  aluminio_teorico    numeric,
  aluminio_real       numeric,

  valor_quimico       numeric,
  valor_material      numeric,
  valor_total         numeric,          -- negativo = a OP custou dinheiro

  -- a_mais | a_menos | ok | sem_cadastro
  situacao            text,
  -- por que não deu para calcular o teórico (só quando situacao = sem_cadastro)
  motivo              text
);

-- A tela abre listando as importações mais recentes.
create index if not exists idx_mfg_analises_data
  on mfg_analises (criado_em desc);

-- E abrir uma análise lê só as linhas dela.
create index if not exists idx_mfg_ops_pai
  on mfg_ops (analise_id);

-- "Esta OP já apareceu antes?" e "como esta unidade vem evoluindo?"
create index if not exists idx_mfg_ops_op      on mfg_ops (op);
create index if not exists idx_mfg_ops_unidade on mfg_ops (unidade, data_op);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table mfg_analises enable row level security;
alter table mfg_ops      enable row level security;

-- ⚠️ LEITURA e ESCRITA por `pode_ver_analise_compras()`, a MESMA trava da
-- Análise de Compras (fase21) -- e não `esta_aprovado()`.
--
-- Isto aqui é resultado industrial com preço de matéria-prima dentro: quanto
-- custa o aço de cada fábrica, quanto cada unidade está perdendo, e em quais
-- OPs. É a mesma natureza de dado que fez a Análise de Compras ser restrita, e
-- seria incoerente fechar uma e deixar a outra aberta a qualquer conta.
--
-- Reusar a função também evita criar uma segunda lista de permissão para manter
-- em sincronia com a primeira -- quem responde por compras numa unidade é quem
-- responde pelo resultado de material dela.
--
-- ⚠️ `pode_ver_analise_compras(uni)` recebe a UNIDADE, e o cabeçalho não tem
-- uma: um arquivo do MFG traz as cinco fábricas juntas. Por isso o cabeçalho
-- usa a permissão da unidade da PESSOA (`minha_unidade()`), e o admin passa em
-- qualquer caso. O detalhe, esse sim, é conferido pela unidade da própria linha.
drop policy if exists "Leitura analise MFG" on mfg_analises;
create policy "Leitura analise MFG" on mfg_analises
  for select to authenticated
  using (public.pode_ver_analise_compras(public.minha_unidade()));

drop policy if exists "Gravar analise MFG" on mfg_analises;
create policy "Gravar analise MFG" on mfg_analises
  for insert to authenticated
  with check (public.pode_ver_analise_compras(public.minha_unidade()));

drop policy if exists "Leitura ops MFG" on mfg_ops;
create policy "Leitura ops MFG" on mfg_ops
  for select to authenticated
  using (public.pode_ver_analise_compras(coalesce(unidade, public.minha_unidade())));

-- O detalhe herda a permissão do cabeçalho: quem pôde criar a análise escreve
-- as linhas dela, e ninguém pendura linha na análise alheia. Mesmo desenho de
-- `inventario_itens` (fase41).
drop policy if exists "Gravar ops MFG" on mfg_ops;
create policy "Gravar ops MFG" on mfg_ops
  for insert to authenticated
  with check (exists (
    select 1 from mfg_analises a
     where a.id = analise_id
       and public.pode_ver_analise_compras(public.minha_unidade())
  ));

-- ⚠️ SEM política de UPDATE. Resultado apurado que pode ser reescrito não serve
-- de histórico -- mesma decisão de `inventarios`.
--
-- Mas EXISTE delete, e aqui é diferente do inventário: uma importação é um
-- arquivo, e arquivo errado (a semana trocada, o export pela metade) acontece.
-- Sem poder apagar, o primeiro engano ficaria para sempre torcendo a série
-- histórica. O `on delete cascade` do detalhe leva as linhas junto.
drop policy if exists "Apagar analise MFG" on mfg_analises;
create policy "Apagar analise MFG" on mfg_analises
  for delete to authenticated using (public.eh_admin());

-- ---------------------------------------------------------------------------
-- ⚠️ AO CRIAR TABELA NOVA, ACRESCENTE-A EM `TABELAS_BACKUP`
-- ---------------------------------------------------------------------------
-- A lista do backup de um clique (js/configuracoes.js) é mantida à mão, e
-- tabela que não entrar nela fica de fora do backup **em silêncio**. As duas
-- daqui já foram acrescentadas no mesmo commit deste script.

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — o que deve aparecer depois de rodar
-- ---------------------------------------------------------------------------
select 'tabelas' as o_que, string_agg(table_name, ', ') as resultado
  from information_schema.tables
 where table_schema = 'public' and table_name in ('mfg_analises', 'mfg_ops')
union all
select 'indices', string_agg(indexname, ', ')
  from pg_indexes
 where schemaname = 'public' and tablename in ('mfg_analises', 'mfg_ops')
union all
select 'politicas', string_agg(tablename || '.' || policyname, ', ')
  from pg_policies
 where schemaname = 'public' and tablename in ('mfg_analises', 'mfg_ops');
