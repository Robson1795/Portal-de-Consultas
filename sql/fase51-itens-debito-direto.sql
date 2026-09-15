-- Fase 51 -- Itens Débito Direto: material no almoxarifado sem código no
-- sistema
--
-- ⚠️ Numerada 51, não 50: o Victor usou fase50 pra Análise MFG em paralelo
-- (mesmo dia, 15/09/2026) -- mesmo cuidado que ele já teve antes ("Renumera
-- o script do MFG para fase50: o fase42 já existe no main").
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende da Fase 1 do portal (esta_aprovado()/eh_admin()/minha_unidade()).
--
-- O Robson: "quero criar uma aba ITENS DEBITO DIRETO, são itens que temos
-- no estoque mas nao esta no sistema, a ideia é colocar a localização
-- nesses itens também, dai vou colocar o nome do material que esta
-- guardado, isso para eu identificar facil material que nao tem via
-- sistema, os itens estao no almoxarifado".
--
-- POR QUE UMA TABELA PRÓPRIA, E NÃO A TABELA `estoque`
--
-- `estoque` é sempre um ITEM DE CÓDIGO conhecido (planilha do Datasul,
-- substituída em lote a cada importação) -- é exatamente o oposto do que
-- este cadastro resolve: material que NÃO tem código nenhum no sistema,
-- só um nome digitado à mão pelo Robson. Misturar os dois faria um item
-- sem código concorrer com a importação em lote da planilha de verdade.
--
-- Mesmo desenho de sql/programacao-03-controle-exp.sql (mesma ideia:
-- descrição livre + localização, por unidade, sem depender de planilha
-- nenhuma).
create table if not exists itens_debito_direto (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  descricao      text not null,   -- nome do material, digitado à mão
  localizacao    text,
  registrado_por text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists idx_itens_debito_direto_unidade on itens_debito_direto (unidade);

create or replace function public.carimba_atualizado_em_debito_direto()
returns trigger language plpgsql set search_path = public as $func$
begin
  new.atualizado_em := now();
  return new;
end $func$;

drop trigger if exists trg_debito_direto_atualizado_em on itens_debito_direto;
create trigger trg_debito_direto_atualizado_em
  before update on itens_debito_direto
  for each row execute function public.carimba_atualizado_em_debito_direto();

alter table itens_debito_direto enable row level security;

-- Mesma regra do Controle EXP: conta aprovada da mesma unidade lê e
-- escreve; admin em todas.
drop policy if exists "Leitura itens_debito_direto da unidade" on itens_debito_direto;
drop policy if exists "Escrita itens_debito_direto da unidade" on itens_debito_direto;

create policy "Leitura itens_debito_direto da unidade" on itens_debito_direto
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita itens_debito_direto da unidade" on itens_debito_direto
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- =======================================================================
-- Acesso restrito à ABA (não à unidade -- isso continua sendo a policy
-- acima). O Robson: "usuario permitido para visualizar eu Maiko, Joel e
-- Victor". Mesmo desenho de sql/fase21-analise-acesso-restrito.sql: lista
-- de e-mails, sem senha, mantida por admin direto no SQL Editor.
-- =======================================================================
create table if not exists debito_direto_acesso (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  adicionado_por text,
  adicionado_em  timestamptz not null default now()
);

alter table debito_direto_acesso enable row level security;

drop policy if exists "Leitura debito_direto_acesso admin" on debito_direto_acesso;
drop policy if exists "Escrita debito_direto_acesso admin" on debito_direto_acesso;

-- Só admin mexe nesta lista -- mesmo padrão de analise_compras_acesso: sem
-- tela própria, edita direto aqui quando precisar adicionar alguém.
create policy "Leitura debito_direto_acesso admin" on debito_direto_acesso
  for select to authenticated using (public.eh_admin());

create policy "Escrita debito_direto_acesso admin" on debito_direto_acesso
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- E-mails de Joel e Victor conferidos em sql/fase21-analise-acesso-
-- restrito.sql (mesmas pessoas, mesmo login). Robson e Victor já são
-- super admin e passam por eh_admin() de qualquer jeito -- cadastrados
-- aqui só pra lista ficar auto-explicativa, mesmo motivo do fase21.
--
insert into debito_direto_acesso (email, adicionado_por) values
  ('j.lisboa@kingspanisoeste.com.br', 'Robson'),
  ('victor.dobner@portal.kingspanisoeste.local', 'Robson'),
  ('maiko.castro@kingspanisoeste.com', 'Robson'),
  ('r.alves1@portal.kingspanisoeste.local', 'Robson'),
  ('robson_alves1995@live.com', 'Robson')
on conflict (email) do nothing;

create or replace function public.pode_ver_debito_direto()
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin()
     or exists (
       select 1 from public.debito_direto_acesso a
        where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     );
$$;

grant execute on function public.pode_ver_debito_direto() to authenticated;

-- Troca as duas policies de cima pra também exigir a lista -- a unidade
-- continua igual (minha_unidade()/eh_admin()), só que agora com a
-- pergunta "posso ver ESTA aba" mais restrita por cima, mesma composição
-- de analise_demanda no fase21.
drop policy if exists "Leitura itens_debito_direto da unidade" on itens_debito_direto;
drop policy if exists "Escrita itens_debito_direto da unidade" on itens_debito_direto;

create policy "Leitura itens_debito_direto restrita" on itens_debito_direto
  for select to authenticated
  using (public.pode_ver_debito_direto() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita itens_debito_direto restrita" on itens_debito_direto
  for all to authenticated
  using (public.pode_ver_debito_direto() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.pode_ver_debito_direto() and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'itens_debito_direto' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'itens_debito_direto'
 order by policyname;

select email, adicionado_por from debito_direto_acesso order by email;
