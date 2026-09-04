-- =====================================================================
-- CORREÇÃO DE PERMISSÕES (RLS)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NÃO cole este arquivo no GitHub (ver sql/README.md).
--
-- Como rodar: cole tudo de uma vez e clique em Run. O SQL Editor mostra o
--             resultado da ÚLTIMA instrução, que é justamente a verificação
--             da PARTE 5 -- é ela que você me manda de volta.
--
-- Escrito a partir do diagnóstico real do banco (pg_policies) em 02/09/2026.
-- =====================================================================
--
-- O PROBLEMA PRINCIPAL
--
-- A tabela `estoque` tem DUAS políticas de escrita:
--
--     "Escrita admin ou gerente da unidade"  ALL  (admin OU gerente da unidade)
--     "Escrita para logados"                 ALL  using (true)   <== aberta
--
-- No Postgres as políticas se SOMAM: é OU, não E. Basta uma liberar. Então a
-- aberta anula a correta, e hoje qualquer conta autenticada pode ALTERAR e
-- APAGAR o estoque das três unidades -- sem nem precisar estar aprovada,
-- porque a checagem de aprovação é feita em JavaScript, no navegador.
--
-- Efeito colateral: a regra "gerente edita só a própria unidade", que está
-- documentada e aparece na tela, NÃO está valendo.
--
-- Mesmo padrão de escrita aberta em contagem_fisica, contagem_bobinas,
-- contagem_bobinas_ocr e atribuicoes_corredor. Dez tabelas têm leitura aberta.
--
-- =====================================================================
-- ⚠️  LEIA ANTES DE RODAR — DOIS EFEITOS ESPERADOS
--
-- 1. A política de gerente por unidade nunca valeu até agora. Quando ela
--    começar a valer, o conteúdo de `gerentes_unidade` passa a importar pela
--    primeira vez. Se o e-mail cadastrado lá estiver num formato diferente do
--    que a pessoa usa para entrar, ela perde a permissão de atualizar estoque.
--    A PARTE 5 mostra o conteúdo da tabela para conferirmos isso na hora.
--
-- 2. O ADMIN É RECONHECIDO PELO E-MAIL robson_alves1995@live.com.
--    O Robson também tem um login r.alves1@portal.kingspanisoeste.local.
--    Entrando por esse, ele NÃO é admin e perde a edição de estoque.
--    Depois desta correção, entrar sempre com robson_alves1995@live.com.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — A regra única de acesso
--
-- security definer: lê usuarios_permitidos ignorando o RLS daquela tabela,
-- o que evita recursão (política que consulta a tabela que tem política).
-- O admin geral passa sempre, mesmo sem linha em usuarios_permitidos.
-- ---------------------------------------------------------------------

create or replace function public.esta_aprovado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'email', '') = 'robson_alves1995@live.com'
    or exists (
      select 1
      from public.usuarios_permitidos u
      where u.user_id = auth.uid()
        and u.aprovado = true
    );
$$;

grant execute on function public.esta_aprovado() to authenticated;


-- ---------------------------------------------------------------------
-- PARTE 2 — O FURO PRINCIPAL: remover a escrita aberta no estoque
--
-- Só remove a política aberta. A correta já existe e passa a valer sozinha
-- a partir daqui, inclusive a restrição de gerente por unidade.
-- ---------------------------------------------------------------------

drop policy if exists "Escrita para logados" on estoque;


-- ---------------------------------------------------------------------
-- PARTE 3 — Leitura: exigir conta aprovada
--
-- Os nomes vieram do diagnóstico: todas se chamam "Leitura para logados".
-- ---------------------------------------------------------------------

drop policy if exists "Leitura para logados" on estoque;
create policy "Leitura para aprovados" on estoque
  for select to authenticated using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on fichas_tecnicas;
create policy "Leitura para aprovados" on fichas_tecnicas
  for select to authenticated using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on bobinas_aco;
create policy "Leitura para aprovados" on bobinas_aco
  for select to authenticated using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on gerentes_unidade;
create policy "Leitura para aprovados" on gerentes_unidade
  for select to authenticated using (public.esta_aprovado());

drop policy if exists "Leitura para logados" on editores_bobinas;
create policy "Leitura para aprovados" on editores_bobinas
  for select to authenticated using (public.esta_aprovado());

-- As de contagem viram políticas "for all" na PARTE 4, que já cobre a leitura.
drop policy if exists "Leitura para logados" on contagem_fisica;
drop policy if exists "Leitura para logados" on contagem_bobinas;
drop policy if exists "Leitura para logados" on contagem_bobinas_ocr;
drop policy if exists "Leitura para logados" on atribuicoes_corredor;

-- `acessos` é o log de login. O portal só INSERE nessa tabela, nunca lê
-- (conferido no index.html), então restringir a leitura ao admin não quebra
-- nada e para de expor quem entrou e quando para qualquer conta.
drop policy if exists "Ver acessos" on acessos;
create policy "Ver acessos - admin" on acessos
  for select to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'robson_alves1995@live.com');


-- ---------------------------------------------------------------------
-- PARTE 4 — Contagem: leitura e escrita só para conta aprovada
--
-- Aqui NÃO se restringe a "editores": quem conta no chão de fábrica não é
-- editor. A regra certa é "conta aprovada" -- fecha o furo sem quebrar o
-- trabalho de contagem.
-- ---------------------------------------------------------------------

drop policy if exists "Escrita para logados" on contagem_fisica;
drop policy if exists "Contagem para aprovados" on contagem_fisica;
create policy "Contagem para aprovados" on contagem_fisica
  for all to authenticated
  using (public.esta_aprovado()) with check (public.esta_aprovado());

drop policy if exists "Escrita para logados" on contagem_bobinas;
drop policy if exists "Contagem para aprovados" on contagem_bobinas;
create policy "Contagem para aprovados" on contagem_bobinas
  for all to authenticated
  using (public.esta_aprovado()) with check (public.esta_aprovado());

-- contagem_bobinas_ocr: o módulo de OCR insere (index.html ~2440) e lê
-- ordenando por criado_em (~2476). "for all" cobre os dois.
drop policy if exists "Escrita para logados" on contagem_bobinas_ocr;
drop policy if exists "OCR para aprovados" on contagem_bobinas_ocr;
create policy "OCR para aprovados" on contagem_bobinas_ocr
  for all to authenticated
  using (public.esta_aprovado()) with check (public.esta_aprovado());

drop policy if exists "Escrita para logados" on atribuicoes_corredor;
drop policy if exists "Corredor para aprovados" on atribuicoes_corredor;
create policy "Corredor para aprovados" on atribuicoes_corredor
  for all to authenticated
  using (public.esta_aprovado()) with check (public.esta_aprovado());


-- ---------------------------------------------------------------------
-- PARTE 5 — VERIFICAÇÃO. É o resultado desta consulta que você me manda.
--
-- Traz três coisas numa única tabela:
--
--   secao 'politica' -> todas as políticas, agora com USING e WITH CHECK.
--        O que conferir: não deve sobrar `true` na coluna `usando` nas
--        tabelas de dados. Se sobrar, é política permissiva com outro nome,
--        e ela anula a correção.
--        Conferir também o WITH CHECK de usuarios_permitidos: se o INSERT
--        não travar a coluna `aprovado`, uma conta nova pode se auto-aprovar.
--
--   secao 'gerente'  -> conteúdo de gerentes_unidade. Confirma se os gerentes
--        continuam conseguindo atualizar estoque (ver aviso no topo).
--
--   secao 'bucket'   -> visibilidade dos buckets do Storage. O módulo de OCR
--        sobe foto da etiqueta em `fotos-bobinas` e usa getPublicUrl
--        (index.html ~2434), o que só funciona se o bucket for público -- e
--        bucket público significa foto acessível por URL, sem login.
--        Storage tem políticas próprias, fora do alcance deste script.
-- ---------------------------------------------------------------------

select 'politica'::text                     as secao,
       tablename::text                      as item,
       policyname::text                     as detalhe,
       cmd::text                            as operacao,
       coalesce(qual, '-')::text            as usando,
       coalesce(with_check, '-')::text      as verificando
from pg_policies
where schemaname = 'public'

union all

select 'gerente'::text, unidade::text, email::text, '-'::text, '-'::text, '-'::text
from gerentes_unidade

union all

select 'bucket'::text, name::text,
       case when public then 'PUBLICO - foto acessivel sem login' else 'privado' end::text,
       '-'::text, '-'::text, '-'::text
from storage.buckets

order by 1, 2, 3;
