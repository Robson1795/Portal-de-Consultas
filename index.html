-- =====================================================================
-- SQL COMPLETO - Módulo "Bobinas de Aço"
-- Cria as tabelas, permissões e libera os editores autorizados.
-- Seguro rodar de novo mesmo se partes já existirem.
-- =====================================================================

-- Tabela de bobinas de aço (saldo do sistema, populado por colar planilha)
create table if not exists bobinas_aco (
  id bigint generated always as identity primary key,
  codigo text not null,
  descricao text,
  largura text,
  espessura text,
  peso text,
  saldo_sistema numeric not null default 0,
  atualizado_em timestamptz default now(),
  atualizado_por text
);

alter table bobinas_aco enable row level security;

drop policy if exists "Leitura para logados" on bobinas_aco;
create policy "Leitura para logados"
  on bobinas_aco for select
  to authenticated
  using (true);

-- Tabela da contagem física das bobinas (separada do saldo do sistema)
create table if not exists contagem_bobinas (
  codigo text primary key,
  saldo_fisico numeric,
  contado_por text,
  contado_em timestamptz default now()
);

alter table contagem_bobinas enable row level security;

drop policy if exists "Leitura para logados" on contagem_bobinas;
create policy "Leitura para logados"
  on contagem_bobinas for select
  to authenticated
  using (true);

drop policy if exists "Escrita para logados" on contagem_bobinas;
create policy "Escrita para logados"
  on contagem_bobinas for all
  to authenticated
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table contagem_bobinas;
exception
  when duplicate_object then null;
end $$;

-- Tabela com quem, além do admin geral, pode atualizar a planilha de bobinas
create table if not exists editores_bobinas (
  email text primary key
);

alter table editores_bobinas enable row level security;

drop policy if exists "Leitura para logados" on editores_bobinas;
create policy "Leitura para logados"
  on editores_bobinas for select
  to authenticated
  using (true);

drop policy if exists "Admin gerencia" on editores_bobinas;
create policy "Admin gerencia"
  on editores_bobinas for all
  to authenticated
  using (auth.jwt() ->> 'email' = 'robson_alves1995@live.com')
  with check (auth.jwt() ->> 'email' = 'robson_alves1995@live.com');

-- Editores autorizados a atualizar a planilha de bobinas (além do admin geral)
insert into editores_bobinas (email) values
('j.palace@portal.kingspanisoeste.local'),
('victor.dobner@portal.kingspanisoeste.local'),
('izabelladeoliveiramazotto@gmail.com')
on conflict (email) do nothing;

-- Restringe a escrita da tabela de bobinas: só admin geral ou quem estiver em editores_bobinas
drop policy if exists "Escrita para logados" on bobinas_aco;
drop policy if exists "Escrita admin ou editor" on bobinas_aco;
create policy "Escrita admin ou editor"
  on bobinas_aco for all
  to authenticated
  using (
    auth.jwt() ->> 'email' = 'robson_alves1995@live.com'
    or exists (select 1 from editores_bobinas e where e.email = auth.jwt() ->> 'email')
  )
  with check (
    auth.jwt() ->> 'email' = 'robson_alves1995@live.com'
    or exists (select 1 from editores_bobinas e where e.email = auth.jwt() ->> 'email')
  );
  
