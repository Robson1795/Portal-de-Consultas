-- Fase 60 -- Painel do Separador: cadastro de quem separa
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende da Fase 1 do portal (perfis, esta_aprovado(), minha_unidade()).
--
-- A lista de nomes do Painel do Separador (fase 59) nasceu fixa no código --
-- JOEL, NILSON, ANGEL, ANGELO, MAIKO -- com a aposta de que mudaria de ano em
-- ano, não de semana em semana. O Robson, olhando o pop-up de Concluir
-- Pedido: *"AQUI QUERO PODER OS NOMES"*. Aposta errada: nome de quem separa
-- é rotatividade de almoxarifado, e ele não vai abrir um chamado de código
-- toda vez que alguém entra ou sai da equipe.
--
-- Por unidade: quem separa em Araquari não é quem separa em Anápolis, e uma
-- lista única encheria o pop-up de nome de gente de outra fábrica.
create table if not exists separadores (
  id            uuid primary key default gen_random_uuid(),
  unidade       text not null,
  nome          text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  criado_por    text,

  constraint separadores_unico unique (unidade, nome)
);

alter table separadores enable row level security;

drop policy if exists "Leitura separadores da unidade" on separadores;
drop policy if exists "Escrita separadores da unidade" on separadores;

create policy "Leitura separadores da unidade" on separadores
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita separadores da unidade" on separadores
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- Quem já estava no código, pra unidade 106, pra ninguém abrir o Painel
-- amanhã e encontrar a lista vazia. Ajuste a unidade se for rodar pra outra.
insert into separadores (unidade, nome)
values ('106', 'JOEL'), ('106', 'NILSON'), ('106', 'ANGEL'), ('106', 'ANGELO'), ('106', 'MAIKO')
on conflict (unidade, nome) do nothing;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'separadores' order by ordinal_position;

select unidade, nome, ativo from separadores order by unidade, nome;
