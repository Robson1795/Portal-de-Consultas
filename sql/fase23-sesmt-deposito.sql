-- =====================================================================
-- SESMT DEIXA DE SER UMA "UNIDADE" E PASSA A SER UM DEPÓSITO
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Rode DEPOIS do sql/fase12-substituir-estoque-em-lote.sql (ele define
-- substituir_estoque, que este script redefine).
-- =====================================================================
--
-- O PROBLEMA
--
-- Não existe "unidade SESMT". SESMT é o depósito onde ficam os EPIs, e cada
-- uma das oito fábricas (mais a Trading) tem o seu. Estava modelado como uma
-- unidade falsa: `estoque.unidade = 'SESMT'`, fora de UNIDADES, com entrada
-- própria no menu e o seletor de unidade escondido. Consequência: existia UM
-- estoque de EPI para a empresa inteira, e não dava para saber de qual
-- fábrica era cada luva.
--
-- O DESENHO NOVO — depósito, igual ao almoxarifado e ao aço
--
-- `estoque` ganha a coluna `deposito` (`alm` | `sesmt`). Unidade continua
-- sendo unidade (101..1101), e o depósito diz em qual armazém daquela unidade
-- o item está. É o mesmo padrão que o `setor` de `exp_controle_itens`
-- (`sql/fase18-deposito-benchmark.sql`): uma coluna em vez de uma tabela nova,
-- porque o formato do dado é idêntico e toda a lógica de tela é compartilhada.
--
-- ⚠️ AS DUAS ARMADILHAS QUE ISTO FECHA
--
-- 1. `substituir_estoque()` apagava por unidade e nada mais:
--
--        delete from estoque where unidade = uni;
--
--    Com dois depósitos na mesma unidade, colar a planilha do almoxarifado da
--    106 apagaria o estoque de EPI da 106 junto. E o sintoma só apareceria
--    quando alguém fosse procurar um EPI e não achasse — dias depois, sem
--    ligação com a colagem. Agora o recorte é (unidade, depósito), e a
--    planilha de um depósito não toca no outro.
--
-- 2. `contagem_fisica` tem chave única por (item, unidade, localizacao) e é
--    lida e limpa por unidade. O mesmo item, no mesmo endereço, nos dois
--    depósitos da mesma unidade, colidiria: contar no almoxarifado
--    sobrescreveria a contagem do EPI, e "Limpar tudo" levaria as duas. A
--    chave passa a incluir o depósito. Mesma coisa em
--    `atribuicoes_corredor` (quem conta cada corredor).
--
-- AS LINHAS ANTIGAS SÃO APAGADAS, e isso foi decidido com o Victor em
-- 09/09/2026: as linhas gravadas com `unidade = 'SESMT'` não têm como ser
-- atribuídas a uma fábrica (a informação nunca existiu naquele modelo), e ele
-- vai colar a planilha de EPI de todas as unidades de uma vez pela aba de
-- lote, que agora lê a coluna de unidade igual à do almoxarifado. Deixá-las
-- na tabela seria pior que apagar: com 'SESMT' fora de UNIDADES, nenhuma tela
-- as mostraria, e elas ficariam ocupando a tabela para sempre sem ninguém
-- conseguir vê-las nem corrigi-las.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PARTE 1 — a coluna, nas três tabelas
-- ---------------------------------------------------------------------

alter table estoque              add column if not exists deposito text not null default 'alm';
alter table contagem_fisica      add column if not exists deposito text not null default 'alm';
alter table atribuicoes_corredor add column if not exists deposito text not null default 'alm';

-- `default 'alm'` de propósito: tudo que já existe é almoxarifado (o EPI
-- estava na unidade falsa, e sai na PARTE 3). Sem o default, a coluna nasceria
-- nula e nenhuma tela acharia nada.
do $$
declare t text;
begin
  foreach t in array array['estoque', 'contagem_fisica', 'atribuicoes_corredor'] loop
    begin
      execute format('alter table %I add constraint %I check (deposito in (''alm'', ''sesmt''))',
                     t, t || '_deposito_valido');
    exception
      when duplicate_object then null;   -- já rodou antes
    end;
  end loop;
end $$;

create index if not exists idx_estoque_unidade_deposito
  on estoque (unidade, deposito);


-- ---------------------------------------------------------------------
-- PARTE 2 — as chaves passam a incluir o depósito
--
-- ⚠️ TEM DE SER RECRIADA COMO PRIMARY KEY, e não como `unique`.
--
-- A primeira versão deste script derrubava a PRIMARY KEY e criava uma `unique`
-- no lugar. `contagem_fisica` e `atribuicoes_corredor` estão publicadas no
-- tempo real, e o Postgres exige IDENTIDADE DE RÉPLICA para replicar um
-- `delete` -- identidade que, por padrão, É a chave primária. Sem PK, o
-- `delete` da PARTE 3 foi recusado com:
--
--     55000: cannot delete from table "contagem_fisica" because it does not
--            have a replica identity and publishes deletes
--
-- O editor do Supabase roda o script numa transação, então aquele erro desfez
-- tudo -- conferido pela API em 09/09/2026: a coluna `deposito` não havia
-- ficado em nenhuma das três tabelas. Nada de meio aplicado para limpar.
--
-- As duas tabelas são anteriores aos scripts deste repositório (foram criadas
-- pelo painel), então o nome da restrição não está em lugar nenhum do código:
-- o bloco procura pelas COLUNAS que ela cobre, em vez de chutar um nome. E
-- recria com o MESMO TIPO que encontrou -- PK vira PK, unique vira unique --
-- para não repetir o erro em outra tabela um dia.
-- ---------------------------------------------------------------------

do $$
declare
  alvo    record;
  nome    text;
  tipo    "char";
  desejadas text[];
  ja_ok   boolean;
begin
  for alvo in
    select 'contagem_fisica'::text                       as tabela,
           array['item','unidade','localizacao']          as colunas,
           'contagem_fisica_deposito_pk'::text            as novo
    union all
    select 'atribuicoes_corredor', array['unidade','corredor'],
           'atribuicoes_corredor_deposito_pk'
  loop
    desejadas := alvo.colunas || array['deposito'];

    -- Já está do jeito certo? Então não mexe (o script pode ser rodado de novo).
    select exists (
      select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
       where t.relname = alvo.tabela
         and c.contype = 'p'
         and (select array_agg(a.attname::text order by a.attname)
                from unnest(c.conkey) k
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
             = (select array_agg(x order by x) from unnest(desejadas) x)
    ) into ja_ok;

    if ja_ok then
      raise notice '%: a chave ja inclui o deposito, nada a fazer', alvo.tabela;
      continue;
    end if;

    -- Acha a restrição atual: a antiga (sem depósito) ou uma `unique` com as
    -- colunas certas, que é o que a primeira versão deste script criava.
    select c.conname, c.contype into nome, tipo
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = alvo.tabela
       and c.contype in ('u', 'p')
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(c.conkey) k
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
           in ((select array_agg(x order by x) from unnest(alvo.colunas) x),
               (select array_agg(x order by x) from unnest(desejadas) x))
     limit 1;

    if nome is null then
      raise exception 'Nao achei a restricao de % cobrindo (%) -- rode o sql/diagnostico-chaves-contagem.sql antes de seguir.',
                      alvo.tabela, array_to_string(alvo.colunas, ', ');
    end if;

    execute format('alter table %I drop constraint %I', alvo.tabela, nome);
    raise notice '%: removida a restricao % (tipo %)', alvo.tabela, nome, tipo;

    -- PRIMARY KEY se era PK -- é o que devolve a identidade de réplica.
    -- `deposito` é NOT NULL com default, e as outras colunas já eram NOT NULL
    -- por estarem na PK, então a chave nova é válida sem tocar em dado nenhum.
    if tipo = 'p' then
      execute format('alter table %I add constraint %I primary key (%s)',
                     alvo.tabela, alvo.novo, array_to_string(desejadas, ', '));
      raise notice '%: criada a PRIMARY KEY %', alvo.tabela, alvo.novo;
    else
      execute format('alter table %I add constraint %I unique (%s)',
                     alvo.tabela, alvo.novo, array_to_string(desejadas, ', '));
      -- Sem PK, a identidade de réplica tem de ser dita na mão, senão o
      -- `delete` volta a ser recusado.
      execute format('alter table %I replica identity using index %I',
                     alvo.tabela, alvo.novo);
      raise notice '%: criada a UNIQUE % e a identidade de replica aponta pra ela',
                   alvo.tabela, alvo.novo;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- PARTE 3 — fora as linhas da unidade falsa
--
-- O `where` recorta pela unidade falsa e por nada mais: nenhuma linha de
-- fábrica de verdade é tocada. Decisão do Victor em 09/09/2026 (ver o
-- cabeçalho). A planilha de EPI de cada unidade entra depois, pela aba
-- "Atualizar estoques em lote" das Configurações.
-- ---------------------------------------------------------------------

delete from contagem_fisica      where unidade = 'SESMT';
delete from atribuicoes_corredor where unidade = 'SESMT';
delete from estoque              where unidade = 'SESMT';


-- ---------------------------------------------------------------------
-- PARTE 4 — substituir_estoque() passa a recortar por depósito
--
-- Formato do payload (o `deposito` é opcional e vale 'alm' se faltar, para
-- uma chamada antiga continuar funcionando igual):
--
--   [ { "unidade": "106",
--       "deposito": "sesmt",
--       "atualizado_por": "Victor",
--       "itens": [ {"item":"...","descricao":"...","um":"UN",
--                   "localizacao":"...","quantidade":"12"}, ... ] }, ... ]
-- ---------------------------------------------------------------------

create or replace function public.substituir_estoque(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bloco         jsonb;
  uni           text;
  dep           text;
  itens         jsonb;
  quem          text;
  minimo_bkp    jsonb;
  minimo_antes  integer;
  minimo_depois integer;
  resumo        jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception 'A planilha veio vazia: nada a atualizar.';
  end if;

  -- ---- Passo 1: confere TUDO antes de apagar qualquer coisa ----
  -- Uma unidade sem permissão ou com lista vazia no meio do payload tem de
  -- abortar o lote inteiro ANTES do primeiro delete, senão as unidades
  -- anteriores já teriam sido substituídas quando o erro aparecesse.
  for bloco in select * from jsonb_array_elements(payload) loop
    uni := btrim(bloco ->> 'unidade');
    dep := coalesce(nullif(btrim(bloco ->> 'deposito'), ''), 'alm');
    itens := bloco -> 'itens';

    if uni is null or uni = '' then
      raise exception 'Há um bloco da planilha sem unidade.';
    end if;
    if dep not in ('alm', 'sesmt') then
      raise exception 'Depósito desconhecido: %. Use alm ou sesmt.', dep;
    end if;
    if not public.pode_atualizar_estoque(uni) then
      raise exception 'Sem permissão para atualizar o estoque da unidade %.', uni;
    end if;
    -- Unidade com zero itens é recusada: substituir por nada é apagar, e
    -- quem colou a planilha não pediu isso.
    if jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) = 0 then
      raise exception 'A unidade % veio sem itens: substituir por nada apagaria o estoque dela.', uni;
    end if;
  end loop;

  -- ---- Passo 2: substitui, (unidade, depósito) por vez, numa transação só ----
  for bloco in select * from jsonb_array_elements(payload) loop
    uni   := btrim(bloco ->> 'unidade');
    dep   := coalesce(nullif(btrim(bloco ->> 'deposito'), ''), 'alm');
    itens := bloco -> 'itens';
    quem  := nullif(btrim(coalesce(bloco ->> 'atualizado_por', '')), '');

    -- Guarda o Estoque Seguro (estoque_minimo) de cada item antes de apagar.
    -- Sem isso, colar uma planilha nova apagava tudo que a pessoa tinha
    -- configurado manualmente ali. Casa por `item` com btrim() dos dois
    -- lados -- um espaço a mais copiado do Excel já fazia o casamento falhar
    -- em silêncio pra aquele item. O recorte por depósito importa aqui
    -- também: o mesmo código de item pode existir nos dois, com Estoque
    -- Seguro diferente.
    select jsonb_object_agg(btrim(item), estoque_minimo), count(*)
      into minimo_bkp, minimo_antes
      from estoque
     where unidade = uni and deposito = dep and estoque_minimo is not null;

    -- O recorte por depósito é o ponto desta fase: sem `and deposito = dep`,
    -- colar a planilha do almoxarifado apagaria o EPI da mesma unidade.
    delete from estoque where unidade = uni and deposito = dep;

    insert into estoque (item, descricao, um, localizacao, quantidade,
                         unidade, deposito, atualizado_em, atualizado_por)
    select r.item, r.descricao, r.um, r.localizacao, r.quantidade,
           uni, dep, now(), quem
      from jsonb_array_elements(itens) i,
           jsonb_populate_record(null::estoque, i) r;

    minimo_depois := 0;
    if minimo_bkp is not null then
      update estoque e
         set estoque_minimo = (minimo_bkp ->> btrim(e.item))::numeric
       where e.unidade = uni and e.deposito = dep and minimo_bkp ? btrim(e.item);
      get diagnostics minimo_depois = row_count;
    end if;

    resumo := resumo || jsonb_build_object(
      'unidade', uni,
      'deposito', dep,
      'itens', jsonb_array_length(itens),
      'estoque_minimo_antes', coalesce(minimo_antes, 0),
      'estoque_minimo_depois', coalesce(minimo_depois, 0));
  end loop;

  return jsonb_build_object('ok', true, 'blocos', resumo);
end $$;

grant execute on function public.substituir_estoque(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Conferência
--
-- 1ª: a coluna nas três tabelas.
-- 2ª: as restrições únicas novas, já com `deposito`.
-- 3ª: quantas linhas há por unidade e depósito. Esperado logo depois de
--     rodar: nenhuma linha 'SESMT' e nenhuma linha com deposito = 'sesmt'
--     (o EPI entra pela aba de lote). Tudo o que existe fica como 'alm'.
-- ---------------------------------------------------------------------

select table_name, column_name, data_type, column_default
  from information_schema.columns
 where column_name = 'deposito'
   and table_name in ('estoque', 'contagem_fisica', 'atribuicoes_corredor')
 order by table_name;

-- Esperado: uma PRIMARY KEY por tabela, JÁ COM `deposito` na lista, e
-- tem_primary_key = 1. Se aparecer 0, o `delete` volta a ser recusado nessas
-- tabelas (elas publicam no tempo real) -- me mande o resultado.
select t.relname                   as tabela,
       c.conname                   as restricao,
       case c.contype when 'p' then 'PRIMARY KEY' else 'UNIQUE' end as tipo,
       pg_get_constraintdef(c.oid) as definicao
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
 where t.relname in ('contagem_fisica', 'atribuicoes_corredor')
   and c.contype in ('u', 'p')
 order by t.relname, c.contype, c.conname;

select c.relname      as tabela,
       c.relreplident as identidade_replica,
       (select count(*) from pg_constraint k
         where k.conrelid = c.oid and k.contype = 'p') as tem_primary_key
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('contagem_fisica', 'atribuicoes_corredor')
 order by c.relname;

select unidade, deposito, count(*) as linhas
  from estoque
 group by unidade, deposito
 order by unidade, deposito;
