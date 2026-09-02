-- Tabela que controla quem já foi aprovado a usar o Portal
create table usuarios_permitidos (
  user_id uuid primary key references auth.users(id),
  email text,
  aprovado boolean not null default false,
  solicitado_em timestamptz default now()
);

alter table usuarios_permitidos enable row level security;

-- Ao se cadastrar, o usuário só consegue criar a própria linha, e sempre como "não aprovado"
-- (não é possível ele mesmo se auto-aprovar)
create policy "Inserir proprio cadastro"
  on usuarios_permitidos for insert
  to authenticated
  with check (auth.uid() = user_id and aprovado = false);

-- Cada usuário pode ver o próprio status (aprovado ou não)
create policy "Ver proprio status"
  on usuarios_permitidos for select
  to authenticated
  using (auth.uid() = user_id);

-- Só o admin pode ver a lista completa de solicitações
create policy "Admin ve todos"
  on usuarios_permitidos for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'robson_alves1995@live.com');

-- Só o admin pode aprovar (mudar aprovado para true)
create policy "Admin aprova"
  on usuarios_permitidos for update
  to authenticated
  using (auth.jwt() ->> 'email' = 'robson_alves1995@live.com')
  with check (auth.jwt() ->> 'email' = 'robson_alves1995@live.com');
  
