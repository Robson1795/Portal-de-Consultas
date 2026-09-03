-- =====================================================================
-- RESET DE USUÁRIOS — deixa só Victor e Robson, admin na unidade 106
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--
-- ⚠️ ESTE SCRIPT APAGA CONTAS DE VERDADE. As 15 pessoas removidas perdem
--    login e senha, e precisam se cadastrar de novo. Entre elas estão Joel,
--    David, João Ricardo, Jhonatan e Izabella. Avise antes.
--
-- RODE O PASSO 1 PRIMEIRO E CONFIRA A LISTA COM OS PRÓPRIOS OLHOS.
-- Só depois rode o PASSO 2.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASSO 1 — PRÉVIA. Só leitura, não apaga nada.
--
-- Confira: a coluna `acao` deve dizer MANTER exatamente nas três linhas do
-- Victor e do Robson (ele tem dois logins), e APAGAR em todas as outras.
-- ---------------------------------------------------------------------

select
  case when lower(u.email) in (
         'victor.dobner@portal.kingspanisoeste.local',
         'robson_alves1995@live.com',
         'r.alves1@portal.kingspanisoeste.local'
       ) then 'MANTER' else 'APAGAR' end            as acao,
  u.email,
  coalesce(p.nome, '-')                             as nome,
  coalesce(p.perfil, '(sem cadastro)')              as perfil_hoje,
  u.created_at::date                                as criada_em,
  u.last_sign_in_at::date                           as ultimo_acesso
from auth.users u
left join usuarios_permitidos p on p.user_id = u.id
order by acao, u.email;

-- Vale conferir também se há contagem em andamento com nome de gente que
-- será apagada. A contagem NÃO é apagada por este script -- o nome de quem
-- contou fica registrado como texto e permanece.
--   select unidade, contado_por, count(*) from contagem_fisica group by 1,2;
--   select contado_por, count(*) from contagem_bobinas group by 1;


-- ---------------------------------------------------------------------
-- PASSO 2 — A EXCLUSÃO. Rode só depois de conferir a prévia.
--
-- A ordem importa: `usuarios_permitidos.user_id` e `acessos.user_id`
-- apontam para `auth.users`, então as linhas filhas saem primeiro, senão o
-- banco recusa a exclusão da conta.
-- ---------------------------------------------------------------------

-- Libera o gatilho anti-escalonamento para as alterações legítimas abaixo.
select set_config('app.definir_acesso', 'sim', false);

-- 2.1 — log de acesso das contas que vão sair
delete from acessos
 where user_id in (
   select id from auth.users
    where lower(email) not in (
      'victor.dobner@portal.kingspanisoeste.local',
      'robson_alves1995@live.com',
      'r.alves1@portal.kingspanisoeste.local'
    )
 );

-- 2.2 — cadastro/aprovação das contas que vão sair
delete from usuarios_permitidos
 where user_id in (
   select id from auth.users
    where lower(email) not in (
      'victor.dobner@portal.kingspanisoeste.local',
      'robson_alves1995@live.com',
      'r.alves1@portal.kingspanisoeste.local'
    )
 );

-- 2.3 — as contas em si
delete from auth.users
 where lower(email) not in (
   'victor.dobner@portal.kingspanisoeste.local',
   'robson_alves1995@live.com',
   'r.alves1@portal.kingspanisoeste.local'
 );

-- 2.4 — garante linha de cadastro para os três logins mantidos.
-- O gatilho de insert força consultor/não-aprovado, então o UPDATE do 2.5
-- é que define o acesso de verdade.
insert into usuarios_permitidos (user_id, email, nome)
select u.id, u.email,
       case when lower(u.email) like 'victor%' then 'Victor Hugo' else 'Robson' end
  from auth.users u
 where lower(u.email) in (
   'victor.dobner@portal.kingspanisoeste.local',
   'robson_alves1995@live.com',
   'r.alves1@portal.kingspanisoeste.local'
 )
on conflict (user_id) do nothing;

-- 2.5 — os dois viram admin na unidade 106
--
-- O `where` e redundante na sequencia (depois do 2.2 so restam as tres
-- linhas mantidas), mas esta aqui de proposito: sem ele, rodar este bloco
-- isolado por engano tornaria TODO MUNDO admin.
update usuarios_permitidos
   set perfil      = 'admin',
       aprovado    = true,
       unidade     = '106',
       localizacao = null
 where lower(email) in (
   'victor.dobner@portal.kingspanisoeste.local',
   'robson_alves1995@live.com',
   'r.alves1@portal.kingspanisoeste.local'
 );

-- 2.6 — zera as contagens de teste.
--
-- Conferido em 03/09/2026 antes de apagar: existia exatamente um
-- registro em cada tabela, os dois de teste --
--   contagem_fisica : unidade 106, 'Maiko Castro', 1 item
--   contagem_bobinas: 'Admin', 1 bobina
--
-- Nao havia contagem real. Zerar evita a duvida daqui a duas semanas
-- sobre se aquele numero era teste ou inventario de verdade.
delete from contagem_bobinas_ocr;
delete from contagem_bobinas;
delete from contagem_fisica;
delete from atribuicoes_corredor;

select set_config('app.definir_acesso', 'nao', false);


-- ---------------------------------------------------------------------
-- PASSO 3 — Como ficou. É este resultado que deve ser enviado de volta.
-- ---------------------------------------------------------------------

select coalesce(p.nome, '-') as nome,
       u.email,
       coalesce(p.perfil, '(sem cadastro)') as perfil,
       coalesce(p.aprovado::text, '-')      as aprovado,
       coalesce(p.unidade, '-')             as unidade
  from auth.users u
  left join usuarios_permitidos p on p.user_id = u.id
 order by u.email;

-- Observação: `gerentes_unidade` e `editores_bobinas` NÃO são limpos de
-- propósito. Eles registram quem carrega planilha, e servem de memória de
-- quando essas pessoas voltarem. Como admin já pode carregar planilha por
-- si, isso não dá acesso a ninguém enquanto as contas não existirem.
-- Para limpar também:
--   delete from gerentes_unidade;
--   delete from editores_bobinas;
