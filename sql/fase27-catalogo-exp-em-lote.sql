-- =====================================================================
-- CATÁLOGO EXP EM LOTE — uma planilha, todas as unidades
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Rode DEPOIS do sql/programacao-06-catalogo-exp.sql.
-- =====================================================================
--
-- CORRIGE UM ERRO MEU DE INTERPRETAÇÃO
--
-- O Victor pediu "aba para atualizar todo estoque exp de todas unidades" e eu
-- entendi `exp_controle_itens` -- os itens fisicamente guardados na expedição.
-- Era o **Catálogo EXP** (`catalogo_exp_itens`): a planilha do sistema que
-- serve de referência para preencher item, referência e lote.
--
-- A diferença não é de nome. `exp_controle_itens` é registro de movimentação
-- (append-only, guarda quem retirou o quê); `catalogo_exp_itens` é lista de
-- referência, substituída inteira a cada importação. Mexer na primeira quando
-- o pedido era a segunda apagaria trabalho de gente.
--
-- Por isso este script também **derruba a substituir_exp_controle()**, criada
-- no fase26 hoje e nunca chamada por ninguém. Função destrutiva que sobra no
-- banco é pior que código morto: na próxima leitura ela parece parte do
-- desenho, e alguém a chama.
--
-- DE QUEBRA, FECHA O A2 NESTE CAMINHO
--
-- A importação do catálogo pela aba Catálogo do Controle EXP sempre foi duas
-- chamadas do navegador:
--
--     await sb.from('catalogo_exp_itens').delete().eq('unidade', ...)   -- passou
--     await sb.from('catalogo_exp_itens').insert(registros)             -- e se falhar AQUI?
--
-- Cai rede no meio, ou o insert bate numa restrição, e a unidade fica **sem
-- catálogo nenhum** -- exatamente o item A2 da AUDITORIA.md, que já foi
-- fechado no estoque e nas bobinas e tinha ficado de fora aqui. Esta função
-- roda numa transação: falha qualquer linha, nada muda.
-- =====================================================================

create or replace function public.substituir_catalogo_exp(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bloco  jsonb;
  uni    text;
  itens  jsonb;
  quem   text;
  antes  integer;
  resumo jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception 'A planilha veio vazia: nada a atualizar.';
  end if;

  -- ---- Passo 1: confere TUDO antes de apagar qualquer coisa ----
  -- Uma unidade sem permissão ou com lista vazia no meio do payload tem de
  -- abortar o lote inteiro ANTES do primeiro delete, senão as unidades
  -- anteriores já teriam sido substituídas quando o erro aparecesse.
  for bloco in select * from jsonb_array_elements(payload) loop
    uni   := btrim(bloco ->> 'unidade');
    itens := bloco -> 'itens';

    if uni is null or uni = '' then
      raise exception 'Há um bloco da planilha sem unidade.';
    end if;
    if not public.pode_atualizar_estoque(uni) then
      raise exception 'Sem permissão para atualizar o catálogo da unidade %.', uni;
    end if;
    -- Unidade com zero itens é recusada: substituir por nada é apagar, e quem
    -- colou a planilha não pediu isso.
    if jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) = 0 then
      raise exception 'A unidade % veio sem itens: substituir por nada apagaria o catálogo dela.', uni;
    end if;
  end loop;

  -- ---- Passo 2: substitui, unidade por unidade, numa transação só ----
  for bloco in select * from jsonb_array_elements(payload) loop
    uni   := btrim(bloco ->> 'unidade');
    itens := bloco -> 'itens';
    quem  := nullif(btrim(coalesce(bloco ->> 'atualizado_por', '')), '');

    select count(*) into antes
      from catalogo_exp_itens where unidade = uni;

    -- O catálogo é lista de referência: a planilha do sistema é a verdade, e
    -- mesclar deixaria lote de item que já saiu do estoque. Substituição
    -- inteira, por unidade, é o certo aqui -- ao contrário de
    -- exp_controle_itens, que é registro de movimentação e nunca se apaga.
    delete from catalogo_exp_itens where unidade = uni;

    insert into catalogo_exp_itens
      (unidade, codigo_item, descricao, um, deposito, referencia, lote,
       quantidade, atualizado_em, atualizado_por)
    select uni, r.codigo_item, r.descricao, r.um, r.deposito, r.referencia,
           r.lote, r.quantidade, now(), quem
      from jsonb_array_elements(itens) i,
           jsonb_populate_record(null::catalogo_exp_itens, i) r;

    resumo := resumo || jsonb_build_object(
      'unidade', uni,
      'itens', jsonb_array_length(itens),
      'antes', coalesce(antes, 0));
  end loop;

  return jsonb_build_object('ok', true, 'blocos', resumo);
end $$;

grant execute on function public.substituir_catalogo_exp(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Fora a função errada do fase26
--
-- Nunca foi chamada: a aba de lote passou a apontar para
-- substituir_catalogo_exp no mesmo commit que traz este script. Se um dia
-- fizer sentido substituir `exp_controle_itens` em lote, o fase26 está no
-- histórico do repositório -- mas que seja uma decisão tomada de novo, e não
-- uma função destrutiva encontrada por acaso no banco.
-- ---------------------------------------------------------------------

drop function if exists public.substituir_exp_controle(jsonb);


-- ---------------------------------------------------------------------
-- Conferência
--
-- 1ª: substituir_catalogo_exp listada, e substituir_exp_controle AUSENTE.
-- 2ª: quantas linhas de catálogo há por unidade hoje -- linha de base para
--     conferir depois da primeira colagem.
-- ---------------------------------------------------------------------

select p.proname   as funcao,
       p.prosecdef as security_definer,
       pg_get_function_arguments(p.oid) as argumentos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('substituir_catalogo_exp', 'substituir_exp_controle')
 order by p.proname;

select unidade, count(*) as itens_no_catalogo, max(atualizado_em) as ultima_importacao
  from catalogo_exp_itens
 group by unidade
 order by unidade;
