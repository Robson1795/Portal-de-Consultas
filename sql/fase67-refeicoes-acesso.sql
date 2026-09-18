-- Fase 67 -- Refeições de fim de semana: acesso restrito por pessoa
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase66-refeicoes-fds.sql e de sql/fase1a-colunas-e-funcoes.sql.
--
-- O Robson (18/09/2026), logo depois de pedir a aba: *"dai eu vou selecionar
-- as pessoas que vao ter acesso"* -> *"por enquanto só eu e o Victor e o
-- Ivair"*.
--
-- MESMO DESENHO DA ANÁLISE DE COMPRAS (fase21), de propósito: lista de
-- e-mails + uma função `security definer` que responde "eu posso?". A função
-- é necessária porque a LISTA é só de admin -- sem ela, quem está liberado
-- mas não é admin não conseguiria nem ler a própria permissão.
--
-- Perfil continua decidindo o resto do menu; esta lista decide só esta aba.
create table if not exists refeicoes_acesso (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  adicionado_por text,
  adicionado_em  timestamptz not null default now()
);

alter table refeicoes_acesso enable row level security;

drop policy if exists "Leitura refeicoes_acesso admin" on refeicoes_acesso;
drop policy if exists "Escrita refeicoes_acesso admin" on refeicoes_acesso;

create policy "Leitura refeicoes_acesso admin" on refeicoes_acesso
  for select to authenticated using (public.eh_admin());

create policy "Escrita refeicoes_acesso admin" on refeicoes_acesso
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Admin entra sempre (Robson e Victor são super admin -- as linhas abaixo não
-- são o que os libera, é a lista ficar auto-explicativa pra quem abrir a
-- tabela depois e não saber de cor quem é super admin).
-- Os três de agora -- Robson, 18/09/2026: "por enquanto só eu e o Victor e o
-- Ivair" (o e-mail do Ivair veio dele na mesma conversa). Robson e Victor são
-- super admin e entrariam de qualquer jeito; ficam aqui pra lista ser
-- auto-explicativa pra quem abrir a tabela depois. Pra mudar essa lista
-- depois NÃO precisa voltar no SQL: Configurações -> "Quem acessa Refeições
-- FDS".
insert into refeicoes_acesso (email, adicionado_por) values
  ('r.alves1@portal.kingspanisoeste.local',      'Robson'),
  ('robson_alves1995@live.com',                  'Robson'),
  ('victor.dobner@portal.kingspanisoeste.local', 'Robson'),
  ('ivair@portal.kingspanisoeste.local',         'Robson')
on conflict (email) do nothing;

-- Eu posso ver a aba Refeições FDS? Admin, ou estou na lista.
create or replace function public.pode_ver_refeicoes()
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin()
     or exists (
       select 1 from public.refeicoes_acesso a
       where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     );
$$;

grant execute on function public.pode_ver_refeicoes() to authenticated;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select email, adicionado_por, adicionado_em from refeicoes_acesso order by email;
select public.pode_ver_refeicoes() as eu_posso_ver;
