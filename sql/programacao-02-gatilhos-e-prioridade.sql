-- =====================================================================
-- PROGRAMACAO DE SEPARACAO (modulo do Portal) -- Migration 02
-- Gatilhos de status, carimbo de tempo e a view de prioridade.
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Rode DEPOIS de 001-tabelas-e-rls.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 -- updated_at / atualizado_em automaticos
--
-- Carimbo de tempo em gatilho, e nao na aplicacao: a importacao mexe em
-- centenas de linhas de uma vez e nao ha por que confiar em cada caminho
-- de codigo lembrar de preencher.
-- ---------------------------------------------------------------------

create or replace function public.carimba_updated_at()
returns trigger language plpgsql set search_path = public as $func$
begin
  new.updated_at := now();
  return new;
end $func$;

drop trigger if exists trg_pedidos_updated_at on pedidos;
create trigger trg_pedidos_updated_at
  before update on pedidos
  for each row execute function public.carimba_updated_at();

create or replace function public.carimba_atualizado_em()
returns trigger language plpgsql set search_path = public as $func$
begin
  new.atualizado_em := now();
  return new;
end $func$;

drop trigger if exists trg_exp_atualizado_em on exp_acessorios;
create trigger trg_exp_atualizado_em
  before update on exp_acessorios
  for each row execute function public.carimba_atualizado_em();


-- ---------------------------------------------------------------------
-- PARTE 2 -- status_geral do pedido, derivado dos itens
--
-- POR QUE EM GATILHO, E NAO NA TELA
--
--   O status do pedido e uma funcao dos itens dele. Se a tela calculasse,
--   haveria dois caminhos capazes de escrever a mesma verdade (a tela de
--   separacao e a importacao), e eles divergiriam no primeiro erro de
--   rede. No gatilho existe um caminho so, e ele roda sempre.
--
-- SUPOSICAO A CONFIRMAR COM O USUARIO
--
--   `reportado` conta como concluido, junto com `separado`. A planilha A
--   traz a coluna de status como o rotulo unico "SEPARADO/REPORTADO", o
--   que sugere que sao o mesmo estagio do processo. Se `reportado` for
--   na verdade um estagio ANTERIOR (item apontado no sistema mas ainda
--   nao fisicamente separado), basta tirar 'reportado' da lista abaixo.
--
-- POR QUE NAO REBAIXA
--
--   Pedido que ja esta `pronto` (enderecado) ou `carregado` nao volta
--   para `separado` so porque alguem reimportou a planilha. Estado que
--   ja avancou na expedicao nao e recalculado a partir dos itens.
-- ---------------------------------------------------------------------

create or replace function public.recalcular_status_pedido()
returns trigger language plpgsql security definer set search_path = public as $func$
declare
  v_pedido_id  uuid;
  v_total      integer;
  v_concluidos integer;
  v_atual      text;
  v_novo       text;
begin
  v_pedido_id := coalesce(new.pedido_id, old.pedido_id);

  select status_geral into v_atual from pedidos where id = v_pedido_id;
  if v_atual is null then
    return coalesce(new, old);              -- pedido ja removido (cascade)
  end if;

  -- Estado que ja passou da separacao nao e recalculado.
  if v_atual in ('pronto', 'carregado', 'enderecado') then
    return coalesce(new, old);
  end if;

  select count(*),
         count(*) filter (where status_separacao in ('separado', 'reportado'))
    into v_total, v_concluidos
    from pedido_itens
   where pedido_id = v_pedido_id;

  v_novo := case
              when v_total = 0            then 'aguardando'
              when v_concluidos = v_total then 'separado'
              when v_concluidos > 0       then 'em_separacao'
              else                             'aguardando'
            end;

  if v_novo is distinct from v_atual then
    update pedidos set status_geral = v_novo where id = v_pedido_id;
  end if;

  return coalesce(new, old);
end $func$;

drop trigger if exists trg_recalcula_status on pedido_itens;
create trigger trg_recalcula_status
  after insert or update of status_separacao or delete on pedido_itens
  for each row execute function public.recalcular_status_pedido();


-- ---------------------------------------------------------------------
-- PARTE 3 -- View de prioridade
--
-- ATENCAO -- security_invoker = true e obrigatorio.
--
--   View no Postgres roda, por padrao, com o privilegio do DONO dela, e
--   isso CONTORNA o RLS das tabelas de baixo. Sem esta clausula, esta
--   view entregaria a programacao de todas as unidades para qualquer
--   conta autenticada -- exatamente o furo que a Fase 1 fechou nas
--   tabelas. Com security_invoker, a view roda como quem consulta e o
--   RLS de `pedidos` continua valendo.
--
--   Exige Postgres 15+. O Supabase deste projeto atende.
--
-- FUSO
--
--   `data_carregamento` + `horario_carregamento` sao hora de parede
--   (o que esta escrito na planilha). Por isso a comparacao e contra
--   now() convertido para America/Sao_Paulo, e nao contra now() cru,
--   que esta em UTC no servidor.
--
-- DUAS FAIXAS QUE O DESENHO ORIGINAL NAO PREVIA
--
--   `concluido`  -- pedido ja separado/pronto/carregado. Urgencia de
--                   separacao nao se aplica mais; some do vermelho.
--   `sem_agenda` -- pedido sem data ou hora de carregamento (veio da
--                   planilha A e ainda nao apareceu na B). Nao da para
--                   calcular urgencia; fica visivel em vez de sumir.
-- ---------------------------------------------------------------------

drop view if exists vw_pedidos_prioridade;

create view vw_pedidos_prioridade
with (security_invoker = true) as
select
  p.*,

  -- Itens: o "x de y separados" da tela.
  coalesce(i.total, 0)                                   as itens_total,
  coalesce(i.concluidos, 0)                              as itens_concluidos,

  -- Momento do carregamento como timestamp unico, quando ha os dois campos.
  (p.data_carregamento + p.horario_carregamento)         as momento_carregamento,

  -- Minutos que faltam. Negativo = ja passou.
  case
    when p.data_carregamento is null or p.horario_carregamento is null then null
    else round(extract(epoch from
           (p.data_carregamento + p.horario_carregamento)
           - (now() at time zone 'America/Sao_Paulo')
         ) / 60.0)
  end                                                    as minutos_para_carregamento,

  case
    when p.status_geral in ('separado','enderecado','pronto','carregado')
      then 'concluido'
    when p.data_carregamento is null or p.horario_carregamento is null
      then 'sem_agenda'
    when (p.data_carregamento + p.horario_carregamento)
         < (now() at time zone 'America/Sao_Paulo')
      then 'atrasado'
    when (p.data_carregamento + p.horario_carregamento)
         <= (now() at time zone 'America/Sao_Paulo') + interval '2 hours'
      then 'urgente'
    when (p.data_carregamento + p.horario_carregamento)
         <= (now() at time zone 'America/Sao_Paulo') + interval '4 hours'
      then 'atencao'
    else 'no_prazo'
  end                                                    as prioridade

from pedidos p
left join (
  select pedido_id,
         count(*)                                                          as total,
         count(*) filter (where status_separacao in ('separado','reportado')) as concluidos
    from pedido_itens
   group by pedido_id
) i on i.pedido_id = p.id;

grant select on vw_pedidos_prioridade to authenticated;


-- ---------------------------------------------------------------------
-- VERIFICACAO
--
-- 1. A view precisa aparecer com security_invoker ligado:
--        select relname, reloptions from pg_class where relname = 'vw_pedidos_prioridade';
--    O resultado deve conter {security_invoker=true}.
--
-- 2. Os gatilhos:
--        select tgname, tgrelid::regclass from pg_trigger
--         where not tgisinternal
--           and tgrelid::regclass::text in ('pedidos','pedido_itens','exp_acessorios');
-- ---------------------------------------------------------------------
