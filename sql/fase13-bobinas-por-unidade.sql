-- =====================================================================
-- BOBINAS POR UNIDADE — substituir só as unidades que vierem na planilha
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Rode DEPOIS do sql/fase12-substituir-estoque-em-lote.sql.
-- =====================================================================
--
-- O QUE MUDA E POR QUE
--
-- `bobinas_aco` guarda as bobinas de TODAS as unidades na mesma tabela,
-- distinguidas pela coluna `est` (estabelecimento). Em 08/09/2026 eram 3.436
-- linhas com `est` valendo 106, 101 e outras.
--
-- A versão anterior de `substituir_bobinas()` apagava a tabela inteira:
--
--     delete from bobinas_aco where id >= 0;   -- TUDO
--
-- Isso estava certo quando a planilha vinha completa, com todas as unidades.
-- Mas quem colasse a planilha de uma unidade só apagaria as bobinas de todas
-- as outras — e descobriria isso no inventário. É a mesma família do item A2
-- da auditoria: perda silenciosa de dado por uma operação de substituição
-- mais larga do que a intenção.
--
-- Agora a substituição é POR UNIDADE, igual a `substituir_estoque()`:
-- apaga e repõe apenas as unidades presentes na planilha. Unidade que não
-- aparecer não é tocada. Planilha completa continua funcionando como antes,
-- porque aí todas as unidades aparecem.
--
-- Efeito colateral bem-vindo: `delete from bobinas_aco where est = e` tem
-- cláusula WHERE por natureza, então a trava do banco que recusa `delete`
-- sem WHERE deixa de ser um caso especial. O `where id >= 0` era remendo.
-- =====================================================================

create or replace function public.substituir_bobinas(linhas jsonb, quem text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ests     text[];
  e        text;
  n        integer;
  sem_est  integer;
  resumo   jsonb := '[]'::jsonb;
begin
  if not public.pode_atualizar_bobinas() then
    raise exception 'Sem permissão para atualizar a planilha de bobinas.';
  end if;
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) = 0 then
    raise exception 'A planilha de bobinas veio vazia: nada a atualizar.';
  end if;

  -- Sem `est` não há como saber de qual unidade é a bobina, e adivinhar aqui
  -- seria pior que recusar: a linha iria para a unidade errada e apareceria
  -- na tela de quem não tem nada com ela.
  select count(*) into sem_est
    from jsonb_array_elements(linhas) i
   where coalesce(btrim(i ->> 'est'), '') = '';
  if sem_est > 0 then
    raise exception '% linha(s) da planilha estão sem a coluna Est. Sem ela não sei de qual unidade é a bobina.', sem_est;
  end if;

  select array_agg(distinct btrim(i ->> 'est')) into ests
    from jsonb_array_elements(linhas) i;

  -- Tudo dentro de uma função plpgsql roda numa transação só: se qualquer
  -- unidade falhar, nenhuma é alterada.
  foreach e in array ests loop
    delete from bobinas_aco where est = e;

    insert into bobinas_aco (item, descricao, est, dep, localizacao, lote, um,
                             qtd_liquida, atualizado_em, atualizado_por)
    select r.item, r.descricao, e, r.dep, r.localizacao, r.lote, r.um,
           r.qtd_liquida, now(), nullif(btrim(coalesce(quem, '')), '')
      from jsonb_array_elements(linhas) i,
           jsonb_populate_record(null::bobinas_aco, i) r
     where btrim(i ->> 'est') = e;

    select count(*) into n
      from jsonb_array_elements(linhas) i
     where btrim(i ->> 'est') = e;

    resumo := resumo || jsonb_build_object('est', e, 'bobinas', n);
  end loop;

  return jsonb_build_object('ok', true,
                            'unidades', resumo,
                            'bobinas', jsonb_array_length(linhas));
end $$;

grant execute on function public.substituir_bobinas(jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- Conferência
--
-- A primeira consulta mostra quantas bobinas há por unidade hoje — útil
-- para conferir depois de colar uma planilha, e para saber o que uma
-- substituição parcial deixaria de tocar.
-- ---------------------------------------------------------------------

select coalesce(nullif(btrim(est), ''), '(sem est)') as unidade,
       count(*)                                      as bobinas,
       max(atualizado_em)                            as ultima_atualizacao,
       max(atualizado_por)                           as por
  from bobinas_aco
 group by 1
 order by 1;

select p.proname   as funcao,
       p.prosecdef as security_definer,
       pg_get_function_arguments(p.oid) as argumentos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'substituir_bobinas';
