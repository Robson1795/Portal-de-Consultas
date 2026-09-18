-- Fase 66 -- Controle de refeições de fim de semana
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase1a-colunas-e-funcoes.sql (esta_aprovado/eh_admin/minha_unidade).
--
-- O Robson (18/09/2026): "Estou montando um sistema de controle de refeições
-- de final de semana na minha empresa" -- cada líder informa quantas
-- refeições o setor dele vai precisar no sábado e no domingo, o gerente vê o
-- consolidado, e sai um texto pronto pra mandar pro refeitório. Pedido
-- primeiro como página separada, depois: "faça uma aba com essa ideia" --
-- dentro do portal, onde já existe login, unidade e permissão.
--
-- UMA LINHA POR (UNIDADE, FIM DE SEMANA, SETOR)
--
-- A chave única é o que faz o líder poder voltar e corrigir o número até a
-- hora do envio sem criar uma segunda linha do mesmo setor -- o upsert
-- reescreve a dele. Sem isso, "Produção: 30" e "Produção: 45" apareceriam
-- os dois no consolidado e o refeitório receberia soma errada.
--
-- O FIM DE SEMANA É A DATA DO SÁBADO
--
-- Guardar a data em vez de "semana 38" deixa o histórico legível sem
-- calendário na mão, e domingo é sempre sábado + 1 (não precisa de segunda
-- coluna que poderia divergir).
create table if not exists refeicoes_fds (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  sabado         date not null,
  setor          text not null,
  qtd_sabado     integer not null default 0,
  qtd_domingo    integer not null default 0,
  observacoes    text,
  preenchido_por text,
  atualizado_em  timestamptz not null default now(),

  constraint refeicoes_fds_unico unique (unidade, sabado, setor),
  -- Quantidade negativa é sempre erro de digitação, e viraria total errado
  -- no relatório do refeitório sem ninguém perceber.
  constraint refeicoes_fds_qtd_positiva check (qtd_sabado >= 0 and qtd_domingo >= 0)
);

-- O consolidado é sempre "um fim de semana desta unidade".
create index if not exists idx_refeicoes_fds_semana
  on refeicoes_fds (unidade, sabado);

alter table refeicoes_fds enable row level security;

drop policy if exists "Leitura refeicoes_fds da unidade" on refeicoes_fds;
drop policy if exists "Escrita refeicoes_fds da unidade" on refeicoes_fds;

-- Mesmo padrão de todas as tabelas do portal: aprovado + (admin ou dono da
-- unidade). Refeição é da fábrica -- o refeitório de Araquari não cozinha
-- pro pessoal de Anápolis.
create policy "Leitura refeicoes_fds da unidade" on refeicoes_fds
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita refeicoes_fds da unidade" on refeicoes_fds
  for all to authenticated
  using      (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'refeicoes_fds' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies where tablename = 'refeicoes_fds' order by policyname;
