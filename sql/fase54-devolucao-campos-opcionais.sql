-- Fase 54 -- Devolução: chave de mesclagem por Item+Referência+Lote (não
-- Protocolo), Nº Pedido/UM/Depósito/Referência/Lote/Localização na
-- importação, e tudo opcional no registro manual.
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase52-devolucao.sql e sql/fase53-devolucao-manual-
-- localizacao.sql.
--
-- O Robson, olhando o formulário "Registrar manual": *"agora da devolução,
-- nessa aba quero NUMERO DO PROTOCOLO + N° Pedido, NOME DO CLIENTE, Item,
-- Descricao, UM, Deposito, Referencia, Lote, Quantidade todas pode ser
-- opcional para preenchumento"*. Depois, mostrando a planilha real que vai
-- puxar do sistema (Estab, Item, Descricao, UM, Deposito, Referencia,
-- Lote, Quantidade — SEM protocolo, SEM pedido, SEM cliente): *"e a
-- planilha que vou puxar do sistema assim, mais a aba de localização"*.
-- Perguntado o que identifica cada devolução nessa planilha pra não
-- duplicar numa recolagem: é uma FOTO do que está parado no depósito DEV
-- agora, sem protocolo nenhum.
--
-- ⚠️ MUDANÇA DE CHAVE -- ISSO QUEBRARIA SE JÁ TIVESSE DADO EM PRODUÇÃO
--
-- A fase52 original mesclava por (unidade, id_devolucao, cod_produto) --
-- fazia sentido quando eu ainda achava que toda linha vinha com um
-- protocolo. A planilha real não tem protocolo nenhum: se a chave
-- continuasse exigindo id_devolucao, toda linha da planilha (sempre com
-- id_devolucao nulo) nunca bateria com ela mesma numa recolagem -- cada
-- vez que o Robson colasse a mesma planilha de novo, DUPLICARIA tudo, em
-- vez de atualizar. A chave nova é (unidade, cod_produto, referencia,
-- lote) -- os três dados que a planilha real sempre traz e que, juntos,
-- identificam UM material específico devolvido (mesmo item pode aparecer
-- várias vezes com referência/lote diferentes, cada ocorrência é uma
-- devolução física distinta). `id_devolucao`/`numero_pedido` continuam
-- existindo, mas viraram informação de contexto (pro registro manual,
-- quando o Robson sabe o protocolo/pedido antes de a NF existir) -- não
-- fazem mais parte da chave de mesclagem.
--
-- Como esta fase roda ANTES de qualquer dado real ter entrado na tabela
-- (a aba Devolução é nova nesta mesma sessão), não há histórico pra migrar
-- -- só troca a constraint.
alter table devolucao_itens drop constraint if exists devolucao_itens_chave;

-- Sem NOT NULL em nenhuma das quatro -- ver o aviso abaixo sobre o
-- registro manual sem referência/lote preenchidos.
alter table devolucao_itens alter column id_devolucao drop not null;
alter table devolucao_itens alter column cod_produto drop not null;

alter table devolucao_itens add column if not exists numero_pedido text;
alter table devolucao_itens add column if not exists um           text;
alter table devolucao_itens add column if not exists deposito     text;
alter table devolucao_itens add column if not exists referencia   text;
alter table devolucao_itens add column if not exists lote         text;

-- ⚠️ Postgres nunca considera NULL = NULL pra unicidade -- um registro
-- MANUAL sem referência/lote preenchidos (o Robson não tinha esse dado na
-- hora) nunca gera conflito com nada, nem consigo mesmo: cada vez que
-- salvar de novo sem preencher os dois, gera uma linha nova em vez de
-- atualizar a mesma. Aceitável pro caso de uso (registro rápido,
-- incompleto de propósito) -- pra planilha vinda do sistema, que sempre
-- traz os quatro campos preenchidos, a mesclagem funciona certinho.
create unique index if not exists idx_devolucao_itens_chave
  on devolucao_itens (unidade, cod_produto, referencia, lote);

-- mesclar_devolucao (fase52) reescrita: chave nova, mais os campos que
-- faltavam (numero_pedido/um/deposito/referencia/lote/localizacao).
-- qtd_fisico/observacoes/conferido_*/ ficam de fora do UPDATE de
-- propósito -- reimportar a mesma foto do DEV não pode apagar conferência
-- já feita. `localizacao` ENTRA no update (ao contrário dos campos de
-- conferência): é dado que também pode vir do sistema/planilha, e uma
-- localização mais nova da planilha é informação válida a atualizar --
-- diferente de qtd_fisico/observacoes, que só a PESSOA pode dizer.
create or replace function public.mesclar_devolucao(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bloco    jsonb;
  uni      text;
  quem     text;
  total    integer := 0;
  unidades text[] := '{}';
begin
  quem := nullif(btrim(coalesce(payload ->> 'importado_por', '')), '');

  if jsonb_typeof(payload -> 'blocos') <> 'array' or jsonb_array_length(payload -> 'blocos') = 0 then
    raise exception 'O payload veio sem blocos de unidade.';
  end if;

  for bloco in select * from jsonb_array_elements(payload -> 'blocos') loop
    uni := btrim(coalesce(bloco ->> 'unidade', ''));
    if uni = '' then
      raise exception 'Um dos blocos veio sem unidade.';
    end if;
    if not public.pode_atualizar_estoque(uni) then
      raise exception 'Sem permissão para atualizar a devolução da unidade %.', uni;
    end if;
    if jsonb_typeof(bloco -> 'itens') <> 'array' or jsonb_array_length(bloco -> 'itens') = 0 then
      raise exception 'O bloco da unidade % veio sem itens.', uni;
    end if;

    insert into devolucao_itens
      (unidade, id_devolucao, numero_pedido, nf_original, nf_devolucao, data_emissao, cliente,
       cod_produto, descricao_produto, um, deposito, referencia, lote, localizacao, qtd_nf,
       importado_em, importado_por)
    select uni, r.id_devolucao, r.numero_pedido, r.nf_original, r.nf_devolucao, r.data_emissao,
           r.cliente, r.cod_produto, r.descricao_produto, r.um, r.deposito, r.referencia, r.lote,
           r.localizacao, r.qtd_nf, now(), quem
      from jsonb_array_elements(bloco -> 'itens') i,
           jsonb_populate_record(null::devolucao_itens, i) r
    on conflict (unidade, cod_produto, referencia, lote) do update set
      id_devolucao      = coalesce(excluded.id_devolucao, devolucao_itens.id_devolucao),
      numero_pedido     = coalesce(excluded.numero_pedido, devolucao_itens.numero_pedido),
      nf_original       = coalesce(excluded.nf_original, devolucao_itens.nf_original),
      nf_devolucao      = coalesce(excluded.nf_devolucao, devolucao_itens.nf_devolucao),
      data_emissao      = coalesce(excluded.data_emissao, devolucao_itens.data_emissao),
      cliente           = coalesce(excluded.cliente, devolucao_itens.cliente),
      descricao_produto = excluded.descricao_produto,
      um                = excluded.um,
      deposito          = excluded.deposito,
      localizacao       = excluded.localizacao,
      qtd_nf            = excluded.qtd_nf,
      importado_em      = now(),
      importado_por     = excluded.importado_por;
      -- qtd_fisico/observacoes/conferido_por/conferido_em ficam DE FORA do
      -- update de propósito -- ver fase52/fase53. Os campos "de contexto"
      -- (id_devolucao/numero_pedido/nf/cliente) usam coalesce(novo, antigo):
      -- a planilha do sistema não traz protocolo/pedido/cliente nenhum, e
      -- sem o coalesce um `excluded.id_devolucao` nulo apagaria um
      -- protocolo que um registro manual anterior tivesse preenchido.

    unidades := array_append(unidades, uni);
    total := total + jsonb_array_length(bloco -> 'itens');
  end loop;

  return jsonb_build_object('ok', true, 'unidades', unidades, 'linhas', total);
end $$;

grant execute on function public.mesclar_devolucao(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type, is_nullable from information_schema.columns
 where table_name = 'devolucao_itens' order by ordinal_position;

select indexname from pg_indexes
 where tablename = 'devolucao_itens' and indexname = 'idx_devolucao_itens_chave';
