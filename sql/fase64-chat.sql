-- Fase 64 -- Chat entre os usuários do portal
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase1a-colunas-e-funcoes.sql (esta_aprovado(), eh_admin()).
--
-- O Robson: "monte um chat aonde eu possa conversar com os usuarios ativos"
-- (17/09/2026). Perguntado o alcance e o formato, ele escolheu:
--   * TODAS as unidades, não só a dele -- quem está na mesma unidade
--     normalmente está no mesmo prédio; o valor é falar com quem está em
--     Anápolis ou Cambuí.
--   * Mural geral + conversa privada entre duas pessoas.
--
-- POR QUE ESTA TABELA NÃO É POR UNIDADE
--
-- Todo o resto do portal filtra por `minha_unidade()`. Aqui não, e é de
-- propósito (resposta do Robson acima). O que o RLS separa aqui é PÚBLICO x
-- PRIVADO -- mural que todo aprovado lê, contra mensagem que só as duas
-- pontas leem -- e não uma fábrica da outra.
--
-- A IDENTIDADE É `auth.uid()`, NÃO O E-MAIL
--
-- É a mesma chave de `usuarios_permitidos.user_id` e a única que o banco
-- consegue conferir sozinho dentro do RLS. E-mail aqui seria pior: neste
-- tenant o mesmo login aparece em domínios diferentes (ver eh_super_admin()
-- em fase1a), então "quem é você" por e-mail teria exceção desde o dia um.

create table if not exists chat_mensagens (
  id                uuid primary key default gen_random_uuid(),
  remetente_id      uuid not null,
  -- Nome gravado junto (não buscado por join na hora de mostrar): é o mesmo
  -- padrão de `contado_por`/`atualizado_por` do resto do portal. Quem mudar
  -- de nome depois não reescreve a autoria do que já foi dito.
  remetente_nome    text not null,
  remetente_unidade text,
  -- NULL = mural geral. Preenchido = conversa privada com essa pessoa.
  destinatario_id   uuid,
  texto             text not null,
  -- Só a conversa privada usa: o destinatário marca quando abre a conversa.
  lido_em           timestamptz,
  criado_em         timestamptz not null default now(),

  constraint chat_mensagens_texto_nao_vazio check (length(btrim(texto)) > 0),
  constraint chat_mensagens_texto_limite    check (length(texto) <= 2000)
);

-- As últimas mensagens do mural.
create index if not exists idx_chat_mensagens_mural
  on chat_mensagens (criado_em desc)
  where destinatario_id is null;

-- Uma conversa privada é lida nos DOIS sentidos (o que eu mandei pra ela e o
-- que ela mandou pra mim), por isso os dois lados entram no índice.
create index if not exists idx_chat_mensagens_privadas
  on chat_mensagens (destinatario_id, remetente_id, criado_em desc)
  where destinatario_id is not null;

alter table chat_mensagens enable row level security;

drop policy if exists "Leitura chat_mensagens"            on chat_mensagens;
drop policy if exists "Escrita chat_mensagens"            on chat_mensagens;
drop policy if exists "Marcar chat_mensagens como lida"   on chat_mensagens;
drop policy if exists "Apagar a própria mensagem"         on chat_mensagens;

-- A PRIVACIDADE DA CONVERSA MORA AQUI, no banco -- não na tela. Mesmo que
-- alguém monte a consulta na mão pelo console, mensagem privada de terceiros
-- não volta.
create policy "Leitura chat_mensagens" on chat_mensagens
  for select to authenticated
  using (
    public.esta_aprovado() and (
      destinatario_id is null
      or remetente_id   = auth.uid()
      or destinatario_id = auth.uid()
    )
  );

-- `remetente_id = auth.uid()`: só dá pra escrever como você mesmo. Sem esta
-- linha daria pra inserir mensagem no nome de outra pessoa.
create policy "Escrita chat_mensagens" on chat_mensagens
  for insert to authenticated
  with check (public.esta_aprovado() and remetente_id = auth.uid());

-- O destinatário marca como lida. O GRANT POR COLUNA logo abaixo é o que
-- impede que "marcar como lida" vire "reescrever o texto da mensagem que a
-- outra pessoa mandou" -- a política sozinha liberaria a linha inteira.
create policy "Marcar chat_mensagens como lida" on chat_mensagens
  for update to authenticated
  using      (public.esta_aprovado() and destinatario_id = auth.uid())
  with check (public.esta_aprovado() and destinatario_id = auth.uid());

revoke update on chat_mensagens from authenticated;
grant  update (lido_em) on chat_mensagens to authenticated;

-- Mandou pra pessoa errada, escreveu errado: apaga a PRÓPRIA mensagem. Não
-- existe política de apagar a dos outros, nem pra admin -- conversa dos
-- outros não é do portal pra mexer.
create policy "Apagar a própria mensagem" on chat_mensagens
  for delete to authenticated
  using (public.esta_aprovado() and remetente_id = auth.uid());


-- ---------------------------------------------------------------------
-- Quem está online agora
--
-- "usuarios ativos" (Robson) precisa de uma resposta que valha AGORA, e o
-- log de `acessos` não serve: ele registra o login e nunca mais é tocado --
-- quem entrou de manhã e foi embora continuaria "ativo" à tarde.
--
-- Cada portal aberto regrava o próprio `ultimo_ping` de tempos em tempos
-- (js/chat.js); "ativo" é ping recente. Tabela comum, de propósito, em vez
-- do Presence do Realtime: dá pra abrir no Supabase e VER quem está online,
-- que é o que torna isto explicável quando alguém disser "fulano aparece
-- online e não está".
-- ---------------------------------------------------------------------

create table if not exists chat_presenca (
  user_id     uuid primary key,
  nome        text not null,
  email       text,
  unidade     text,
  ultimo_ping timestamptz not null default now()
);

alter table chat_presenca enable row level security;

drop policy if exists "Leitura chat_presenca"        on chat_presenca;
drop policy if exists "Escrita da própria presença"  on chat_presenca;

-- Todo mundo aprovado vê quem está online (o chat é da empresa inteira).
create policy "Leitura chat_presenca" on chat_presenca
  for select to authenticated
  using (public.esta_aprovado());

-- Mas cada um só escreve a PRÓPRIA linha: ninguém marca outra pessoa como
-- online (nem como offline).
create policy "Escrita da própria presença" on chat_presenca
  for all to authenticated
  using      (public.esta_aprovado() and user_id = auth.uid())
  with check (public.esta_aprovado() and user_id = auth.uid());


-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select table_name, column_name, data_type
  from information_schema.columns
 where table_name in ('chat_mensagens', 'chat_presenca')
 order by table_name, ordinal_position;

select tablename as tabela, policyname as politica, cmd as comando
  from pg_policies
 where tablename in ('chat_mensagens', 'chat_presenca')
 order by tablename, policyname;

-- Deve listar só `lido_em` para UPDATE em chat_mensagens.
select column_name, privilege_type
  from information_schema.column_privileges
 where table_name = 'chat_mensagens' and grantee = 'authenticated' and privilege_type = 'UPDATE'
 order by column_name;
