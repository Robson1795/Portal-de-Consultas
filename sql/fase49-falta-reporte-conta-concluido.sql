-- Fase 49 -- "Falta reporte" passa a contar como item concluído
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/programacao-01-tabelas-e-rls.sql e
--             sql/programacao-02-gatilhos-e-prioridade.sql.
--
-- Até aqui `status_separacao = 'falta_reporte'` só chegava pela planilha
-- (coluna STATUS com "FALTA REPORTE") e o gatilho `recalcular_status_pedido`
-- (fase 02) e a view `vw_pedidos_prioridade` (fase 02) tratavam esse estado
-- como NÃO concluído -- de propósito, era suposição registrada no comentário
-- da fase 02 ("SUPOSICAO A CONFIRMAR COM O USUARIO").
--
-- O Robson, ao pedir um botão manual pra marcar esse estado na tela de
-- Separação: perguntado se "separado, falta reporte" significa material já
-- separado (só falta o papel no sistema) ou ainda não pronto pra sair,
-- respondeu que **já está pronto pra sair** -- só falta o registro. Isso já
-- mudou `itemConcluido()` em js/programacao.js (contava 2 estados, passou a
-- contar 3); esta fase muda o lado do banco pra não desalinhar: sem ela, um
-- pedido com todo item em falta_reporte ficaria com status_geral travado em
-- 'em_separacao' e continuaria aparecendo como urgente/atrasado no painel de
-- prioridade, mesmo já podendo embarcar de verdade.
--
-- O botão de liberar o caminhão (cardPedidoCarregamento, js/programacao.js)
-- NÃO lê status_geral -- calcula direto de pedido_itens a cada render
-- (statusConsolidado/itemConcluido) e por isso já funcionava certo mesmo
-- antes desta fase. O que esta fase corrige é o que o BANCO acha que é
-- verdade: status_geral e o painel de prioridade (vw_pedidos_prioridade),
-- que são os dois lugares fora da tela de Carregamento que também olham pra
-- "pedido está pronto?".

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
         count(*) filter (where status_separacao in ('separado', 'reportado', 'falta_reporte'))
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

-- Backfill: pedido que já tinha item(ns) em falta_reporte e por isso ficou
-- parado em 'aguardando'/'em_separacao' precisa ser recalculado uma vez --
-- o gatilho só roda em INSERT/UPDATE/DELETE novo, não sozinho nos dados que
-- já estavam na tabela antes desta fase.
with contagem as (
  select pedido_id,
         count(*) as total,
         count(*) filter (where status_separacao in ('separado', 'reportado', 'falta_reporte')) as concluidos
    from pedido_itens
   group by pedido_id
)
update pedidos p
   set status_geral = case
                         when c.total = 0             then 'aguardando'
                         when c.concluidos = c.total   then 'separado'
                         when c.concluidos > 0         then 'em_separacao'
                         else                                'aguardando'
                       end
  from contagem c
 where c.pedido_id = p.id
   and p.status_geral not in ('pronto', 'carregado', 'enderecado')
   and p.status_geral is distinct from (
         case
           when c.total = 0             then 'aguardando'
           when c.concluidos = c.total   then 'separado'
           when c.concluidos > 0         then 'em_separacao'
           else                                'aguardando'
         end
       );

drop view if exists vw_pedidos_prioridade;

create view vw_pedidos_prioridade
with (security_invoker = true) as
select
  p.*,

  coalesce(i.total, 0)      as itens_total,
  coalesce(i.concluidos, 0) as itens_concluidos,

  -- Momento do carregamento como timestamp unico, quando ha os dois campos.
  (p.data_carregamento + p.horario_carregamento)         as momento_carregamento,

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
         count(*)                                                                     as total,
         count(*) filter (where status_separacao in ('separado', 'reportado', 'falta_reporte')) as concluidos
    from pedido_itens
   group by pedido_id
) i on i.pedido_id = p.id;

grant select on vw_pedidos_prioridade to authenticated;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select relname, reloptions from pg_class where relname = 'vw_pedidos_prioridade';

select status_geral, count(*) from pedidos group by status_geral order by 1;
