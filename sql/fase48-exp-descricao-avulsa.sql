-- Fase 48 -- Descrição digitada na mão pra item fora do Catálogo EXP
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/programacao-06-catalogo-exp.sql (catalogo_exp_itens).
--
-- O Robson: "não consigo inserir itens que nao esta na planilha do exp,
-- preciso que libere para eu digitar o que nao caiu ainda no sistema, as
-- vezes é só por falta de reporte ou eu nao atualizei a planilha, esses
-- itens pode deixar no banco de dados, na proxima vez que digitar ele ja
-- vai puxar a descrição".
--
-- Até aqui, registrar um item no Controle EXP (formulário completo e
-- passo-a-passo) travava se o código não estivesse em `catalogo_exp_itens`
-- -- e como essa tabela é APAGADA E RECRIADA inteira a cada "Importar"
-- (fonte da verdade é sempre a planilha mais recente do Datasul, ver
-- sql/programacao-06-catalogo-exp.sql), item que ainda não caiu ali
-- (relatório desatualizado, ou item ainda não "reportado" no sistema
-- deles) não tinha como ser cadastrado -- nem digitando a descrição na
-- mão, porque não existe campo de descrição no Controle EXP em lugar
-- nenhum: quem preenche esse dado é sempre a busca em cascata
-- (buscarDescricoesItens(), js/programacao.js).
--
-- POR QUE UMA TABELA PRÓPRIA, E NÃO GRAVAR DIRETO EM catalogo_exp_itens
--
-- Porque catalogo_exp_itens é substituído por completo a cada importação
-- (drop-in da planilha do sistema) -- uma descrição digitada na mão hoje
-- desapareceria no próximo "Importar", bem quando o Robson mais espera
-- que ela "já esteja lá da próxima vez". Esta tabela é o oposto: só
-- cresce por ação explícita da pessoa, nunca é substituída em lote.
create table if not exists exp_item_descricao_avulsa (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  codigo_item    text not null,
  descricao      text not null,
  um             text,
  cadastrado_por text,
  cadastrado_em  timestamptz not null default now(),

  constraint exp_item_descricao_avulsa_unico unique (unidade, codigo_item)
);

create index if not exists idx_exp_item_descricao_avulsa_unidade
  on exp_item_descricao_avulsa (unidade);

alter table exp_item_descricao_avulsa enable row level security;

drop policy if exists "Leitura exp_item_descricao_avulsa da unidade" on exp_item_descricao_avulsa;
drop policy if exists "Escrita exp_item_descricao_avulsa da unidade" on exp_item_descricao_avulsa;

-- Mesmo padrão de sempre: esta_aprovado() + (admin ou dono da unidade).
create policy "Leitura exp_item_descricao_avulsa da unidade" on exp_item_descricao_avulsa
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita exp_item_descricao_avulsa da unidade" on exp_item_descricao_avulsa
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_item_descricao_avulsa' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'exp_item_descricao_avulsa'
 order by policyname;
