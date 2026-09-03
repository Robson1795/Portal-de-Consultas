-- =====================================================================
-- FASE 1 — MODELO DE PERFIS E PERMISSÕES  (fase1d-migracao-e-verificacao.sql)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NÃO cole este arquivo no GitHub (ver sql/README.md).
--
-- Este script SUBSTITUI o sql/corrige-permissoes.sql: ele já inclui a
-- correção da escrita aberta no `estoque`. Rode só este.
--
-- Passo D — migracao dos usuarios e verificacao.
-- O resultado da consulta final e o que deve ser enviado de volta.
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
-- PARTE 6 — Migração dos usuários atuais
--
-- Regra: ninguém ganha nem perde acesso. Quem carrega planilha continua
-- carregando porque continua em gerentes_unidade / editores_bobinas.
--
-- `set_config` libera o gatilho, porque este UPDATE é a migração e não um
-- escalonamento.
-- ---------------------------------------------------------------------

select set_config('app.definir_acesso', 'sim', false);

-- Todos os aprovados viram estoque_alm: hoje qualquer conta aprovada pode
-- contar, e rebaixar para consultor tiraria isso de quem já tem.
update usuarios_permitidos set perfil = 'estoque_alm' where aprovado = true;

-- Quem atualiza bobinas é do setor de aço.
update usuarios_permitidos set perfil = 'estoque_aco'
 where aprovado = true
   and lower(email) in (select lower(email) from editores_bobinas);

-- Admin.
update usuarios_permitidos set perfil = 'admin'
 where lower(email) in ('robson_alves1995@live.com', 'r.alves1@portal.kingspanisoeste.local');

-- Unidade de quem é gerente, para a contagem já sair filtrada.
update usuarios_permitidos u set unidade = g.unidade
  from gerentes_unidade g
 where lower(g.email) = lower(u.email) and u.unidade is null;

select set_config('app.definir_acesso', 'nao', false);



-- ---------------------------------------------------------------------
-- PARTE 7 — VERIFICAÇÃO. É o resultado desta consulta que você me manda.
--
-- O que conferir:
--   secao 'usuario'  -> perfil de cada um, e se pode carregar planilha
--   secao 'politica' -> não deve sobrar `true` em `usando` nas tabelas de dados
--   secao 'bucket'   -> o OCR sobe foto para `fotos-bobinas` e usa
--                       getPublicUrl; bucket público = foto sem login
-- ---------------------------------------------------------------------

select 'usuario'::text as secao,
       coalesce(u.nome, u.email)::text as item,
       u.perfil::text as detalhe,
       (case when u.aprovado then 'aprovado' else 'PENDENTE' end)::text as operacao,
       coalesce(u.unidade, '-')::text as usando,
       (case
          when lower(u.email) in (select lower(email) from gerentes_unidade) then 'carrega planilha ALM'
          when lower(u.email) in (select lower(email) from editores_bobinas) then 'carrega planilha aco'
          else '-'
        end)::text as verificando
from usuarios_permitidos u

union all

select 'politica'::text, tablename::text, policyname::text, cmd::text,
       coalesce(qual, '-')::text, coalesce(with_check, '-')::text
from pg_policies where schemaname = 'public'

union all

select 'bucket'::text, name::text,
       (case when public then 'PUBLICO - foto sem login' else 'privado' end)::text,
       '-'::text, '-'::text, '-'::text
from storage.buckets

order by 1, 2, 3;
