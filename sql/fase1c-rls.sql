-- =====================================================================
-- FASE 1 — MODELO DE PERFIS E PERMISSÕES  (fase1c-rls.sql)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NÃO cole este arquivo no GitHub (ver sql/README.md).
--
-- Este script SUBSTITUI o sql/corrige-permissoes.sql: ele já inclui a
-- correção da escrita aberta no `estoque`. Rode só este.
--
-- Passo C — as politicas de RLS. E AQUI que o deadlock acontece:
-- cada drop policy pede a tranca mais forte na tabela.
--
-- FECHE TODAS AS ABAS DO PORTAL (suas e do Robson) e do Table Editor
-- antes de rodar este. Se travar de novo, rode bloco por bloco: o
-- arquivo esta separado por comentarios '---- nome_da_tabela ----'.
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
-- PARTE 5 — RLS: quem lê e escreve o quê
--
-- ⚠️ A PARTE 5 é onde a escrita aberta no `estoque` é removida
--    ("Escrita para logados", using (true)) — o furo do diagnóstico.
-- ---------------------------------------------------------------------

-- ---- usuarios_permitidos ----
drop policy if exists "Ver proprio status"       on usuarios_permitidos;
drop policy if exists "Admin ve todos"           on usuarios_permitidos;
drop policy if exists "Admin aprova"             on usuarios_permitidos;
drop policy if exists "Inserir proprio cadastro" on usuarios_permitidos;

create policy "Ver proprio status" on usuarios_permitidos
  for select to authenticated using (auth.uid() = user_id);
create policy "Admin ve todos" on usuarios_permitidos
  for select to authenticated using (public.eh_admin());
create policy "Inserir proprio cadastro" on usuarios_permitidos
  for insert to authenticated with check (auth.uid() = user_id);
-- Admin faz UPDATE, mas o gatilho da PARTE 3 barra perfil/aprovado fora da função.
create policy "Admin edita cadastro" on usuarios_permitidos
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- ---- estoque ----
drop policy if exists "Escrita para logados"                on estoque;  -- <== O FURO
drop policy if exists "Leitura para logados"                on estoque;
drop policy if exists "Escrita admin ou gerente da unidade" on estoque;
drop policy if exists "Leitura para aprovados"              on estoque;

create policy "Leitura para aprovados" on estoque
  for select to authenticated using (public.esta_aprovado());
create policy "Escrita admin ou gerente da unidade" on estoque
  for all to authenticated
  using (public.pode_atualizar_estoque(unidade))
  with check (public.pode_atualizar_estoque(unidade));

-- ---- contagem_fisica: contar é do estoque_alm da própria unidade ----
drop policy if exists "Escrita para logados"     on contagem_fisica;
drop policy if exists "Leitura para logados"     on contagem_fisica;
drop policy if exists "Contagem para aprovados"  on contagem_fisica;

create policy "Leitura para aprovados" on contagem_fisica
  for select to authenticated using (public.esta_aprovado());
create policy "Contagem ALM" on contagem_fisica
  for all to authenticated
  using (public.eh_admin() or (public.meu_perfil() = 'estoque_alm'
         and (public.minha_unidade() is null or public.minha_unidade() = unidade)))
  with check (public.eh_admin() or (public.meu_perfil() = 'estoque_alm'
         and (public.minha_unidade() is null or public.minha_unidade() = unidade)));

-- ---- atribuicoes_corredor ----
drop policy if exists "Escrita para logados"    on atribuicoes_corredor;
drop policy if exists "Leitura para logados"    on atribuicoes_corredor;
drop policy if exists "Corredor para aprovados" on atribuicoes_corredor;

create policy "Leitura para aprovados" on atribuicoes_corredor
  for select to authenticated using (public.esta_aprovado());
create policy "Corredor ALM" on atribuicoes_corredor
  for all to authenticated
  using (public.eh_admin() or public.meu_perfil() = 'estoque_alm')
  with check (public.eh_admin() or public.meu_perfil() = 'estoque_alm');

-- ---- bobinas_aco: planilha é de quem está em editores_bobinas ----
drop policy if exists "Leitura para logados"      on bobinas_aco;
drop policy if exists "Escrita admin ou editor"   on bobinas_aco;
drop policy if exists "Leitura para aprovados"    on bobinas_aco;

create policy "Leitura para aprovados" on bobinas_aco
  for select to authenticated using (public.esta_aprovado());
create policy "Escrita admin ou editor" on bobinas_aco
  for all to authenticated
  using (public.pode_atualizar_bobinas())
  with check (public.pode_atualizar_bobinas());

-- ---- contagem_bobinas e contagem_bobinas_ocr: contar é do estoque_aco ----
drop policy if exists "Escrita para logados"    on contagem_bobinas;
drop policy if exists "Leitura para logados"    on contagem_bobinas;
drop policy if exists "Contagem para aprovados" on contagem_bobinas;

create policy "Leitura para aprovados" on contagem_bobinas
  for select to authenticated using (public.esta_aprovado());
create policy "Contagem aco" on contagem_bobinas
  for all to authenticated
  using (public.eh_admin() or public.meu_perfil() = 'estoque_aco')
  with check (public.eh_admin() or public.meu_perfil() = 'estoque_aco');

drop policy if exists "Escrita para logados" on contagem_bobinas_ocr;
drop policy if exists "Leitura para logados" on contagem_bobinas_ocr;
drop policy if exists "OCR para aprovados"   on contagem_bobinas_ocr;

create policy "Leitura para aprovados" on contagem_bobinas_ocr
  for select to authenticated using (public.esta_aprovado());
create policy "OCR aco" on contagem_bobinas_ocr
  for all to authenticated
  using (public.eh_admin() or public.meu_perfil() = 'estoque_aco')
  with check (public.eh_admin() or public.meu_perfil() = 'estoque_aco');

-- ---- fichas_tecnicas: embalagem é editada pelo ALM (hoje é o Joel) ----
drop policy if exists "Leitura para logados"   on fichas_tecnicas;
drop policy if exists "Escrita admin ou joel"  on fichas_tecnicas;
drop policy if exists "Leitura para aprovados" on fichas_tecnicas;

create policy "Leitura para aprovados" on fichas_tecnicas
  for select to authenticated using (public.esta_aprovado());
create policy "Escrita ficha" on fichas_tecnicas
  for all to authenticated
  using (public.eh_admin() or public.meu_perfil() = 'estoque_alm')
  with check (public.eh_admin() or public.meu_perfil() = 'estoque_alm');

-- ---- tabelas de apoio: leitura para aprovados, escrita só admin ----
drop policy if exists "Leitura para logados"   on gerentes_unidade;
drop policy if exists "Admin gerencia"         on gerentes_unidade;
drop policy if exists "Leitura para aprovados" on gerentes_unidade;
create policy "Leitura para aprovados" on gerentes_unidade
  for select to authenticated using (public.esta_aprovado());
create policy "Admin gerencia" on gerentes_unidade
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "Leitura para logados"   on editores_bobinas;
drop policy if exists "Admin gerencia"         on editores_bobinas;
drop policy if exists "Leitura para aprovados" on editores_bobinas;
create policy "Leitura para aprovados" on editores_bobinas
  for select to authenticated using (public.esta_aprovado());
create policy "Admin gerencia" on editores_bobinas
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- ---- acessos: o portal só INSERE (conferido no index.html), nunca lê ----
drop policy if exists "Ver acessos"       on acessos;
drop policy if exists "Ver acessos - admin" on acessos;
create policy "Ver acessos - admin" on acessos
  for select to authenticated using (public.eh_admin());


