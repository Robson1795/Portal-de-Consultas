-- =====================================================================
-- MÓDULO "BOBINAS DE AÇO" — estrutura das tabelas
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- ⚠️ ESTE SCRIPT NÃO DEFINE PERMISSÃO. Ele só cria tabela, índice e o
--    tempo real. Quem manda em quem lê e escreve é o RLS da Fase 1
--    (sql/fase1c-rls.sql). A ordem num banco novo é:
--
--        1) bobinas-aco.sql   (este: a estrutura)
--        2) fase1a ... fase1d (as permissões)
--
--    Reescrito em 04/09/2026. A versão anterior era pior do que
--    desatualizada: criava `bobinas_aco` com `codigo, largura, espessura,
--    peso, saldo_sistema` (colunas que a produção não usa) e, pior,
--    recriava as políticas abertas `using (true)` em `contagem_bobinas` e
--    a política de e-mail fixo em `bobinas_aco`. Rodá-la depois da Fase 1
--    **reabria** a escrita que a Fase 1 tinha fechado. O `create table if
--    not exists` fazia o script parecer inofensivo; as políticas não são
--    condicionais, e essas rodavam sempre.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — Saldo do sistema, vindo da planilha da empresa
--
-- As colunas são exatamente as oito da planilha colada, na ordem em que
-- ela sai: Item, Descrição Item, Est, Dep, Localizacao, Lote, Un,
-- Qtd Liquida. Conferido contra a estrutura em produção em 04/09/2026.
--
-- Ao colar a planilha, o portal APAGA todas as linhas e insere as novas:
-- é substituição total, não atualização incremental (ver AUDITORIA.md,
-- item A2 — hoje sem transação).
-- ---------------------------------------------------------------------

create table if not exists bobinas_aco (
  id             bigint generated always as identity primary key,
  item           text not null,
  descricao      text,
  est            text,
  dep            text,
  localizacao    text,
  lote           text,
  um             text,
  qtd_liquida    numeric not null default 0,
  atualizado_em  timestamptz default now(),
  atualizado_por text
);

-- A mesma bobina aparece várias vezes: o que identifica uma linha é
-- item + localização + lote, não o item sozinho.
create index if not exists idx_bobinas_aco_chave
  on bobinas_aco (item, localizacao, lote);


-- ---------------------------------------------------------------------
-- PARTE 2 — Contagem física das bobinas
--
-- Separada do saldo do sistema de propósito: colar a planilha de novo
-- não apaga o que já foi contado.
--
-- A chave é composta, e é a mesma do índice acima. `localizacao` e `lote`
-- são `not null default ''` porque coluna de chave primária não aceita
-- nulo no Postgres, e o portal grava string vazia quando a planilha vem
-- sem lote — é o que faz o `onConflict: 'item,localizacao,lote'` do
-- upsert funcionar em vez de criar linha duplicada.
-- ---------------------------------------------------------------------

create table if not exists contagem_bobinas (
  item         text not null,
  localizacao  text not null default '',
  lote         text not null default '',
  saldo_fisico numeric,
  contado_por  text,
  contado_em   timestamptz default now(),
  primary key (item, localizacao, lote)
);

do $$
begin
  alter publication supabase_realtime add table contagem_bobinas;
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------
-- PARTE 3 — Validação da bobina por foto da etiqueta (módulo de OCR)
--
-- Não havia script criando esta tabela: ela nasceu à mão no painel, e um
-- banco novo ficaria sem ela. Como o módulo de OCR não conferia o erro do
-- insert (AUDITORIA.md, item O1), a falha apareceria como "Registrado!"
-- em verde. Colunas conferidas contra a produção em 04/09/2026.
-- ---------------------------------------------------------------------

create table if not exists contagem_bobinas_ocr (
  id                  bigint generated always as identity primary key,
  bobina_id           text not null,
  peso_etiqueta       numeric,
  peso_sistema        numeric,
  localizacao_sistema text,
  localizacao_real    text,
  status              text,
  alerta_sistema      boolean default false,
  motivo_alerta       text,
  foto_url            text,
  operador            text,
  criado_em           timestamptz default now()
);

create index if not exists idx_contagem_ocr_bobina
  on contagem_bobinas_ocr (bobina_id, criado_em desc);

-- ⚠️ `foto_url` só é preenchida se existir um bucket chamado
--    `fotos-bobinas` no Storage. Em 04/09/2026 ele NÃO existe: a API
--    responde "Bucket not found", e toda foto de etiqueta é descartada.
--    Criar em Storage -> New bucket -> nome `fotos-bobinas`.


-- ---------------------------------------------------------------------
-- PARTE 4 — Quem pode atualizar a planilha de bobinas
--
-- O perfil `estoque_aco` conta bobinas; carregar a planilha é um nível
-- acima, e é esta tabela que diz quem pode. Mantida em vez de virar
-- perfil justamente para separar as duas coisas.
--
-- A escrita nesta tabela é do admin, pelo RLS da Fase 1 — não por e-mail
-- fixo, como era antes.
-- ---------------------------------------------------------------------

create table if not exists editores_bobinas (
  email text primary key
);

insert into editores_bobinas (email) values
  ('j.palace@portal.kingspanisoeste.local'),
  ('victor.dobner@portal.kingspanisoeste.local'),
  ('izabelladeoliveiramazotto@gmail.com')
on conflict (email) do nothing;


-- ---------------------------------------------------------------------
-- PARTE 5 — Conferência
--
-- Deve devolver as quatro tabelas. Se `rls` vier `false` em alguma,
-- os scripts da Fase 1 ainda não rodaram — rode-os antes de usar.
-- ---------------------------------------------------------------------

select c.relname as tabela,
       c.relrowsecurity as rls,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as politicas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('bobinas_aco', 'contagem_bobinas',
                     'contagem_bobinas_ocr', 'editores_bobinas')
 order by c.relname;
