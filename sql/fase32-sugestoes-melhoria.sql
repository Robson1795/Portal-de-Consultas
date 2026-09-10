-- =====================================================================
-- SUGESTÕES DE MELHORIA — canal do consultor para o Robson e o Victor
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- =====================================================================
--
-- O PEDIDO
--
-- O Robson (10/09/2026): *"quero que crie um botão para que os consultores
-- coloquem sugestões de melhorias, aí essa sugestão é enviada para o meu
-- usuário e o do Victor"*.
--
-- POR QUE TABELA, E NÃO E-MAIL
--
-- Ele disse "enviada para o meu USUÁRIO", não "para o meu e-mail" -- e a
-- diferença importa. Um `mailto` (o caminho da Requisição ALM e da
-- Solicitação de compra) depende de a pessoa clicar em enviar no Outlook:
-- some sem avisar se ela fechar a janela, e ninguém fica sabendo que a
-- sugestão existiu. Aqui é o contrário do pedido de material -- não tem
-- prazo, não tem alguém esperando do outro lado, e o valor está em NÃO
-- PERDER nenhuma. Gravada na tabela, a sugestão chega inteira aos dois, no
-- próprio portal, e continua lá depois de lida.
--
-- QUEM LÊ: `eh_super_admin()` já é exatamente as duas pessoas do pedido --
-- o Robson (nos dois logins dele) e o Victor (fase1-perfis-e-permissoes).
-- Não precisou de lista nova pra manter em sincronia.
-- =====================================================================

create table if not exists sugestoes_melhoria (
  id            uuid primary key default gen_random_uuid(),
  mensagem      text not null,
  -- Quem mandou fica gravado junto: sugestão anônima vira caixa de
  -- reclamação sem resposta possível -- sem saber quem é, não dá nem pra
  -- perguntar "como assim?" nem pra avisar que foi feito.
  nome_usuario  text,
  email_usuario text,
  unidade       text,
  perfil        text,
  lida_em       timestamptz,
  lida_por      text,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_sugestoes_nao_lidas
  on sugestoes_melhoria (criado_em desc)
  where lida_em is null;

alter table sugestoes_melhoria enable row level security;

drop policy if exists "Escrita sugestao propria" on sugestoes_melhoria;
drop policy if exists "Leitura sugestoes super admin" on sugestoes_melhoria;
drop policy if exists "Marcar sugestao lida super admin" on sugestoes_melhoria;

-- Qualquer conta aprovada MANDA (é o ponto: o consultor é justamente quem
-- não tem outro canal), mas ninguém a não ser os dois LÊ o que os outros
-- mandaram -- inclusive quem escreveu, que não tem select nenhum aqui.
create policy "Escrita sugestao propria" on sugestoes_melhoria
  for insert to authenticated
  with check (public.esta_aprovado());

create policy "Leitura sugestoes super admin" on sugestoes_melhoria
  for select to authenticated using (public.eh_super_admin());

-- Marcar como lida é update, e só dos dois. Sem política de delete de
-- propósito: sugestão não se apaga, se marca como lida -- apagar seria a
-- forma silenciosa de a pessoa nunca saber que foi ignorada.
create policy "Marcar sugestao lida super admin" on sugestoes_melhoria
  for update to authenticated
  using (public.eh_super_admin()) with check (public.eh_super_admin());


-- ---------------------------------------------------------------------
-- Conferência
--
-- 1ª: as colunas da tabela.
-- 2ª: as três políticas, e nenhuma de delete.
-- 3ª: quantas sugestões existem hoje (deve ser 0 na primeira vez).
-- ---------------------------------------------------------------------

select column_name, data_type
  from information_schema.columns
 where table_name = 'sugestoes_melhoria'
 order by ordinal_position;

-- `pg_policies` (a VIEW), e não `pg_policy` (a tabela do catálogo): a coluna
-- `cmd` só existe na view -- na tabela ela se chama `polcmd`. A primeira
-- versão deste script usava a tabela com o nome da view e morria aqui com
-- "column cmd does not exist" -- e, como o editor do Supabase roda o script
-- inteiro numa transação, o erro na ÚLTIMA linha desfez a criação da tabela
-- também. Mesma pegadinha do fase23 (Victor, 09/09/2026).
select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'sugestoes_melhoria'
 order by policyname;

select count(*) as sugestoes, count(*) filter (where lida_em is null) as nao_lidas
  from sugestoes_melhoria;
