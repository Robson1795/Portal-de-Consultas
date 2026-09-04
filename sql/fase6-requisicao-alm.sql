-- =====================================================================
-- REQUISIÇÃO ALM — rascunho para o CD1406 do Datasul
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             Rode DEPOIS do fase1-perfis-e-permissoes.sql.
--
-- ⚠️ Se der "deadlock detected", feche as abas do portal (as suas e as do
--    Robson) e rode de novo. As tabelas de contagem têm tempo real, e uma
--    aba aberta segura a tranca. Aconteceu duas vezes neste projeto.
-- =====================================================================
--
-- O QUE É
--
-- Uma requisição aqui NÃO abre nada no Datasul. É rascunho: a pessoa monta
-- o pedido no portal, fica registrado, e um botão abre o e-mail já
-- preenchido para o ALM da unidade, que então lança no CD1406.
--
-- Duas tabelas porque um pedido leva vários itens, como no CD1406:
-- cabeçalho (unidade, centro de custo, narrativa) e itens.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — Configuração por unidade
--
-- Por ora guarda só os e-mails do ALM, que a tela de requisição precisa
-- para montar o destinatário. As senhas de contagem entram aqui na
-- próxima entrega.
--
-- `emails_alm` aceita vários endereços separados por ponto e vírgula.
-- ---------------------------------------------------------------------

create table if not exists config_unidade (
  unidade      text primary key,
  emails_alm   text,
  atualizado_em timestamptz default now(),
  atualizado_por text
);

alter table config_unidade enable row level security;

-- Leitura para conta aprovada: quem faz a requisição precisa saber para
-- quem ela vai. São e-mails internos, não segredo.
drop policy if exists "Leitura para aprovados" on config_unidade;
create policy "Leitura para aprovados" on config_unidade
  for select to authenticated using (public.esta_aprovado());

drop policy if exists "Admin gerencia" on config_unidade;
create policy "Admin gerencia" on config_unidade
  for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- Cria a linha das oito unidades, sem e-mail ainda. Assim a aba admin
-- lista todas e mostra quais faltam preencher.
insert into config_unidade (unidade) values
  ('101'), ('103'), ('104'), ('105'), ('106'), ('107'), ('109'), ('110')
on conflict (unidade) do nothing;


-- ---------------------------------------------------------------------
-- PARTE 1b — Cadastros que a tela de requisição consome
--
-- Centro de custo e item deixam de ser texto livre. Texto livre numa
-- requisição gera "1406", "CC1406", "1.406" e "cd1406" para a mesma coisa,
-- e o ALM que se entenda depois.
--
-- `itens_requisicao` é catálogo, não estoque: serve para pedir item que a
-- unidade ainda não tem em estoque. A tela oferece este catálogo MAIS os
-- itens do estoque da unidade.
--
-- Escrita só para admin, de propósito: código de centro de custo vem da
-- contabilidade, e lista que qualquer um alimenta apodrece rápido.
-- ---------------------------------------------------------------------

create table if not exists centros_custo (
  codigo    text primary key,
  descricao text,
  ativo     boolean not null default true
);

alter table centros_custo enable row level security;

drop policy if exists "Leitura para aprovados" on centros_custo;
create policy "Leitura para aprovados" on centros_custo
  for select to authenticated using (public.esta_aprovado());

drop policy if exists "Admin gerencia" on centros_custo;
create policy "Admin gerencia" on centros_custo
  for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());


create table if not exists itens_requisicao (
  codigo    text primary key,
  descricao text,
  um        text,
  ativo     boolean not null default true
);

alter table itens_requisicao enable row level security;

drop policy if exists "Leitura para aprovados" on itens_requisicao;
create policy "Leitura para aprovados" on itens_requisicao
  for select to authenticated using (public.esta_aprovado());

drop policy if exists "Admin gerencia" on itens_requisicao;
create policy "Admin gerencia" on itens_requisicao
  for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());


-- ---------------------------------------------------------------------
-- PARTE 2 — Cabeçalho da requisição
-- ---------------------------------------------------------------------

create table if not exists requisicoes_alm (
  id                bigint generated always as identity primary key,
  unidade           text not null,
  criado_por        uuid not null references auth.users(id) on delete cascade,
  solicitante_nome  text,
  solicitante_email text,
  centro_custo      text,
  narrativa         text,
  status            text not null default 'rascunho',
  criado_em         timestamptz default now(),
  enviado_em        timestamptz
);

do $$
begin
  alter table requisicoes_alm
    add constraint requisicoes_alm_status_valido
    check (status in ('rascunho', 'enviada'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_requisicoes_alm_unidade on requisicoes_alm (unidade, status);
create index if not exists idx_requisicoes_alm_autor   on requisicoes_alm (criado_por);

alter table requisicoes_alm enable row level security;

-- Quem vê: o autor, o ALM da própria unidade, e o admin. Um consultor não
-- vê o pedido de outro.
drop policy if exists "Ver requisicoes" on requisicoes_alm;
create policy "Ver requisicoes" on requisicoes_alm
  for select to authenticated
  using (
    criado_por = auth.uid()
    or public.eh_admin()
    or (public.meu_perfil() = 'estoque_alm' and public.minha_unidade() = unidade)
  );

-- Criar: qualquer conta aprovada, mas só em nome de si mesma.
drop policy if exists "Criar propria requisicao" on requisicoes_alm;
create policy "Criar propria requisicao" on requisicoes_alm
  for insert to authenticated
  with check (public.esta_aprovado() and criado_por = auth.uid());

-- Alterar e apagar: o autor, ou o admin. `enviada` também pode ser
-- alterada pelo autor, porque a pessoa pode precisar reenviar.
drop policy if exists "Autor edita requisicao" on requisicoes_alm;
create policy "Autor edita requisicao" on requisicoes_alm
  for update to authenticated
  using (criado_por = auth.uid() or public.eh_admin())
  with check (criado_por = auth.uid() or public.eh_admin());

drop policy if exists "Autor apaga requisicao" on requisicoes_alm;
create policy "Autor apaga requisicao" on requisicoes_alm
  for delete to authenticated
  using (criado_por = auth.uid() or public.eh_admin());


-- ---------------------------------------------------------------------
-- PARTE 3 — Itens da requisição
--
-- As políticas seguem o cabeçalho: quem pode ver a requisição pode ver os
-- itens dela. `on delete cascade` apaga os itens junto.
-- ---------------------------------------------------------------------

create table if not exists requisicoes_alm_itens (
  id            bigint generated always as identity primary key,
  requisicao_id bigint not null references requisicoes_alm(id) on delete cascade,
  item          text not null,
  descricao     text,
  um            text,
  quantidade    numeric
);

create index if not exists idx_requisicoes_itens_req on requisicoes_alm_itens (requisicao_id);

alter table requisicoes_alm_itens enable row level security;

drop policy if exists "Ver itens da requisicao" on requisicoes_alm_itens;
create policy "Ver itens da requisicao" on requisicoes_alm_itens
  for select to authenticated
  using (exists (
    select 1 from requisicoes_alm r
    where r.id = requisicao_id
      and (r.criado_por = auth.uid()
           or public.eh_admin()
           or (public.meu_perfil() = 'estoque_alm' and public.minha_unidade() = r.unidade))
  ));

drop policy if exists "Autor mexe nos itens" on requisicoes_alm_itens;
create policy "Autor mexe nos itens" on requisicoes_alm_itens
  for all to authenticated
  using (exists (
    select 1 from requisicoes_alm r
    where r.id = requisicao_id and (r.criado_por = auth.uid() or public.eh_admin())
  ))
  with check (exists (
    select 1 from requisicoes_alm r
    where r.id = requisicao_id and (r.criado_por = auth.uid() or public.eh_admin())
  ));


-- ---------------------------------------------------------------------
-- VERIFICAÇÃO — é este resultado que deve ser enviado de volta.
-- ---------------------------------------------------------------------

select 'tabela'::text as secao, table_name::text as item,
       (select count(*)::text from information_schema.columns c
         where c.table_name = t.table_name and c.table_schema = 'public') || ' colunas' as detalhe
  from information_schema.tables t
 where t.table_schema = 'public'
   and t.table_name in ('config_unidade', 'centros_custo', 'itens_requisicao',
                        'requisicoes_alm', 'requisicoes_alm_itens')

union all

select 'politica'::text, tablename::text, policyname::text
  from pg_policies
 where schemaname = 'public'
   and tablename in ('config_unidade', 'centros_custo', 'itens_requisicao',
                     'requisicoes_alm', 'requisicoes_alm_itens')

union all

select 'unidade'::text, unidade::text, coalesce(emails_alm, '(sem e-mail cadastrado)')::text
  from config_unidade

order by 1, 2, 3;
