-- =====================================================================
-- FASE 1 — MODELO DE PERFIS E PERMISSÕES  (fase1a-colunas-e-funcoes.sql)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NÃO cole este arquivo no GitHub (ver sql/README.md).
--
-- Este script SUBSTITUI o sql/corrige-permissoes.sql: ele já inclui a
-- correção da escrita aberta no `estoque`. Rode só este.
--
-- Passo A — colunas novas e funcoes de autorizacao.
-- Nao mexe em politica nenhuma, entao praticamente nao disputa tranca.
-- =====================================================================
--
-- O QUE ESTE SCRIPT FAZ
--
--   1. Acrescenta perfil, unidade e localizacao em usuarios_permitidos.
--   2. Cria as funções que respondem "quem é você e o que pode".
--   3. Fecha a escrita aberta no `estoque` (o furo do diagnóstico de 02/09).
--   4. Reescreve o RLS de todas as tabelas em cima do perfil.
--   5. Cria a única porta para mudar perfil, com as travas de escalonamento.
--   6. Migra os 12 usuários atuais sem ninguém ganhar nem perder acesso.
--   7. Verifica.
--
-- DESENHO DAS PERMISSÕES
--
--   consultor    -> consulta
--   estoque_alm  -> consulta + contagem ALM da própria unidade
--   estoque_aco  -> consulta + contagem de bobinas
--   admin        -> tudo, incluindo a aba Configurações
--
--   Atualizar PLANILHA é um nível acima de contar, e continua controlado
--   pelas tabelas que já existem: `gerentes_unidade` (estoque, por unidade)
--   e `editores_bobinas` (bobinas). Assim o perfil define o setor e essas
--   tabelas definem quem carrega planilha dentro dele — exatamente como é
--   hoje, sem ninguém ganhar poder na migração.
--
--   SUPER ADMIN (Victor e Robson) é raiz de confiança, fixa no código deste
--   script. Só eles concedem o perfil `admin`. É intencional que não seja
--   configurável pelo portal: é o que impede um admin de criar outro admin.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — Colunas novas em usuarios_permitidos
--
-- `aprovado` (boolean) continua existindo e continua sendo a fonte de
-- verdade de "conta liberada", porque o portal atual já a lê. O status que
-- a tela mostra é derivado dela, para não haver duas verdades.
-- ---------------------------------------------------------------------

alter table usuarios_permitidos
  add column if not exists perfil      text not null default 'consultor',
  add column if not exists unidade     text,
  add column if not exists localizacao text;

do $$
begin
  alter table usuarios_permitidos
    add constraint usuarios_permitidos_perfil_valido
    check (perfil in ('consultor', 'estoque_alm', 'estoque_aco', 'admin'));
exception
  when duplicate_object then null;
end $$;



-- ---------------------------------------------------------------------
-- PARTE 2 — As funções que respondem "quem é você"
--
-- Todas são `security definer` com search_path fixo: leem
-- usuarios_permitidos ignorando o RLS daquela tabela, o que evita recursão
-- (política que consulta a tabela que tem política).
-- ---------------------------------------------------------------------

-- Raiz de confiança. Robson tem dois logins e os dois valem aqui, para ele
-- não perder o acesso entrando pelo `.local`.
create or replace function public.eh_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'robson_alves1995@live.com',
    'r.alves1@portal.kingspanisoeste.local',
    'victor.dobner@portal.kingspanisoeste.local'
  );
$$;

create or replace function public.meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.eh_super_admin() then 'admin'
    else coalesce((
      select u.perfil from public.usuarios_permitidos u
      where u.user_id = auth.uid() and u.aprovado = true
    ), 'nenhum')
  end;
$$;

create or replace function public.esta_aprovado()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_perfil() <> 'nenhum';
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_perfil() = 'admin';
$$;

create or replace function public.minha_unidade()
returns text language sql stable security definer set search_path = public as $$
  select u.unidade from public.usuarios_permitidos u where u.user_id = auth.uid();
$$;

-- Pode carregar a planilha do estoque daquela unidade?
create or replace function public.pode_atualizar_estoque(uni text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin()
     or (public.meu_perfil() = 'estoque_alm'
         and exists (
           select 1 from public.gerentes_unidade g
           where g.unidade = uni
             and lower(g.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         ));
$$;

-- Pode carregar a planilha de bobinas?
create or replace function public.pode_atualizar_bobinas()
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin()
     or (public.meu_perfil() = 'estoque_aco'
         and exists (
           select 1 from public.editores_bobinas e
           where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         ));
$$;

grant execute on function
  public.eh_super_admin(), public.meu_perfil(), public.esta_aprovado(),
  public.eh_admin(), public.minha_unidade(),
  public.pode_atualizar_estoque(text), public.pode_atualizar_bobinas()
  to authenticated;


