-- =====================================================================
-- CONTROLE EXP EM LOTE — uma planilha, todas as unidades
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Rode DEPOIS do sql/fase18-deposito-benchmark.sql (é ele que cria a coluna
-- `setor`, usada no recorte aqui).
-- =====================================================================
--
-- O PEDIDO
--
-- O Victor (09/09/2026): *"Aba para atualizar todo estoque exp de todas
-- unidades. Mesma lógica dos demais."* Ou seja: colar uma planilha com o
-- Controle EXP de todas as unidades e o portal separa por unidade sozinho,
-- como já faz com o almoxarifado, o SESMT e as bobinas.
--
-- ⚠️ O EXP NÃO É COMO OS OUTROS TRÊS, E ISSO MUDA O QUE "SUBSTITUIR" QUER DIZER
--
-- `estoque` e `bobinas_aco` são retratos: a planilha da empresa é a verdade, e
-- substituir a unidade inteira é exatamente o certo. `exp_controle_itens` é o
-- contrário -- o portal é o sistema de registro, e a tabela é **append-only de
-- propósito**: item retirado não é apagado, muda de status e vira o histórico
-- pesquisável por pedido (`sql/programacao-04-exp-saida.sql`). Na mesma tabela
-- moram ainda a marca de etiqueta emitida (fase16) e o que alimenta a detecção
-- de pedido pronto (fase17).
--
-- Substituir "igual aos outros" apagaria tudo isso: quem retirou, quando, e as
-- etiquetas já emitidas -- sem erro na tela e sem volta.
--
-- Então o recorte aqui é mais estreito de propósito:
--
--     delete ... where unidade = X and setor = Y and status = 'na_expedicao'
--
-- Substitui **o que está na expedição agora**, que é o que a planilha
-- descreve, e **não toca no que já saiu**. Se a intenção for mesmo apagar o
-- histórico junto, é uma linha a mudar aqui -- mas tem de ser uma decisão
-- consciente, não o efeito colateral de uma aba nova.
-- =====================================================================

create or replace function public.substituir_exp_controle(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bloco     jsonb;
  uni       text;
  st        text;
  itens     jsonb;
  quem      text;
  apagados  integer;
  mantidos  integer;
  resumo    jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception 'A planilha veio vazia: nada a atualizar.';
  end if;

  -- ---- Passo 1: confere TUDO antes de apagar qualquer coisa ----
  -- Uma unidade sem permissão ou com lista vazia no meio do payload tem de
  -- abortar o lote inteiro ANTES do primeiro delete, senão as unidades
  -- anteriores já teriam sido substituídas quando o erro aparecesse. Mesmo
  -- desenho de substituir_estoque() -- item A2 da AUDITORIA.md.
  for bloco in select * from jsonb_array_elements(payload) loop
    uni   := btrim(bloco ->> 'unidade');
    st    := coalesce(nullif(btrim(bloco ->> 'setor'), ''), 'exp');
    itens := bloco -> 'itens';

    if uni is null or uni = '' then
      raise exception 'Há um bloco da planilha sem unidade.';
    end if;
    if st not in ('exp', 'benchmark') then
      raise exception 'Setor desconhecido: %. Use exp ou benchmark.', st;
    end if;
    if not public.pode_atualizar_estoque(uni) then
      raise exception 'Sem permissão para atualizar a unidade %.', uni;
    end if;
    if jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) = 0 then
      raise exception 'A unidade % veio sem itens: substituir por nada apagaria o que está na expedição dela.', uni;
    end if;
  end loop;

  -- ---- Passo 2: substitui, (unidade, setor) por vez, numa transação só ----
  for bloco in select * from jsonb_array_elements(payload) loop
    uni   := btrim(bloco ->> 'unidade');
    st    := coalesce(nullif(btrim(bloco ->> 'setor'), ''), 'exp');
    itens := bloco -> 'itens';
    quem  := nullif(btrim(coalesce(bloco ->> 'registrado_por', '')), '');

    -- Quanto histórico existe nesta unidade/setor -- devolvido no resumo pra
    -- a tela poder dizer "não toquei em N registros já retirados". Sem esse
    -- número, "substituído" soaria como "apaguei tudo".
    select count(*) into mantidos
      from exp_controle_itens
     where unidade = uni and setor = st and status = 'retirado';

    -- `status = 'na_expedicao'` é o ponto desta fase: o que já saiu fica.
    delete from exp_controle_itens
     where unidade = uni and setor = st and status = 'na_expedicao';
    get diagnostics apagados = row_count;

    insert into exp_controle_itens
      (unidade, setor, numero_pedido, codigo_item, quantidade, localizacao,
       numero_os_op, lote, referencia, status, registrado_por, criado_em)
    select uni, st, r.numero_pedido, r.codigo_item, r.quantidade, r.localizacao,
           r.numero_os_op, r.lote, r.referencia, 'na_expedicao', quem, now()
      from jsonb_array_elements(itens) i,
           jsonb_populate_record(null::exp_controle_itens, i) r;

    resumo := resumo || jsonb_build_object(
      'unidade', uni,
      'setor', st,
      'itens', jsonb_array_length(itens),
      'substituidos', apagados,
      'historico_preservado', coalesce(mantidos, 0));
  end loop;

  return jsonb_build_object('ok', true, 'blocos', resumo);
end $$;

grant execute on function public.substituir_exp_controle(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Conferência
--
-- 1ª: a função listada, security definer.
-- 2ª: o que existe hoje por unidade, setor e status -- é a linha de base para
--     conferir depois da primeira colagem que o `retirado` não mudou.
-- ---------------------------------------------------------------------

select p.proname   as funcao,
       p.prosecdef as security_definer,
       pg_get_function_arguments(p.oid) as argumentos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'substituir_exp_controle';

select unidade, setor, status, count(*) as registros
  from exp_controle_itens
 group by unidade, setor, status
 order by unidade, setor, status;
