-- Fase 65 -- Agenda do chat: achar a pessoa mesmo que ela nunca tenha aberto o portal
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase1-perfis-e-permissoes.sql (esta_aprovado()) e da fase64.
--
-- O Victor (18/09/2026): *"quando uma pessoa não estiver online, poder
-- pesquisar o nome da pessoa mesmo estando offline"*.
--
-- O QUE FALTAVA
--
-- A lista de contatos do chat vinha só de `chat_presenca` (fase64), que é
-- preenchida pelo ping de quem ABRE o portal. Isso resolvia "quem está
-- online", mas deixava de fora quem ainda não tinha entrado nenhuma vez
-- desde que o chat existe -- e, no primeiro dia, isso é quase todo mundo.
-- Procurar o nome de um colega simplesmente não achava nada.
--
-- POR QUE UMA FUNÇÃO, E NÃO UMA POLÍTICA NOVA EM usuarios_permitidos
--
-- O RLS daquela tabela (fase1c) deixa cada um ver só a PRÓPRIA linha, e a
-- lista inteira é de admin. Abrir a tabela para todo aprovado, só para
-- montar uma agenda, alargaria o acesso a perfil, unidade, situação de
-- aprovação e e-mail de cadastro -- caro demais pelo que se ganha.
--
-- Esta função devolve TRÊS colunas e nada mais: id, nome e unidade. É o
-- mínimo para escrever o nome de alguém e mandar mensagem. Perfil, e-mail e
-- o campo `aprovado` continuam fora do alcance de quem não é admin.
--
-- `security definer` para poder ler a tabela por dentro do RLS; o
-- `esta_aprovado()` no WHERE é o que impede conta pendente de baixar a
-- agenda da empresa. Mesmo desenho de emails_alm_da_unidade() (fase8) e
-- pode_ver_analise_compras() (fase21).

create or replace function public.chat_contatos()
returns table (user_id uuid, nome text, unidade text)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.user_id,
    -- Cadastro antigo pode estar sem nome preenchido. Cair para a parte do
    -- e-mail antes do @ é melhor que devolver linha em branco: a pessoa
    -- existe e precisa ser localizável. O e-mail inteiro NÃO sai daqui.
    coalesce(nullif(btrim(u.nome), ''), split_part(coalesce(u.email, ''), '@', 1), 'Sem nome') as nome,
    u.unidade
  from public.usuarios_permitidos u
  where public.esta_aprovado()
    and u.aprovado = true
    and u.user_id is not null;
$$;

-- `public` inclui anônimo; só quem está autenticado executa -- e, mesmo
-- autenticado, o esta_aprovado() de dentro decide se volta alguma linha.
revoke all on function public.chat_contatos() from public;
grant execute on function public.chat_contatos() to authenticated;


-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------

-- Deve listar a função com security_type = DEFINER.
select routine_name, security_type
  from information_schema.routines
 where routine_schema = 'public' and routine_name = 'chat_contatos';

-- Rodando como você mesmo (admin no SQL Editor), deve devolver a lista de
-- aprovados com as três colunas -- e nenhuma a mais.
select * from public.chat_contatos() order by nome;
