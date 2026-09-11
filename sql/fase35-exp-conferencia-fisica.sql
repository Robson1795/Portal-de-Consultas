-- Fase 35 -- Auditoria física do Controle EXP (Robson caminha pela
-- expedição, endereço por endereço, conferindo se os itens estão lá)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- O Robson: "vou lá na expedição, vou ver cada endereço pra ver se os
-- itens estão lá, monte uma aba aonde eu possa conferir se está tudo
-- certo". Perguntado o formato: "só confirmar presença" (não quantidade
-- -- já existe o Modo Contagem pra isso no Almoxarifado, aqui é outro
-- fluxo, mais rápido) e "salvar (recomendado)" -- pra retomar se for
-- interrompido no meio da caminhada, e pra mostrar "conferido há quanto
-- tempo" em cada endereço. Depois: "daí a próxima etapa eu passar os
-- itens para o datasul no sistema" -- ou seja, o que sai desta tela é só
-- a conferência; lançar no Datasul é um passo manual do Robson, fora do
-- portal, e esta tabela não precisa saber nada sobre isso.
--
-- Uma linha por linha física (exp_controle_itens.id), não por item: o
-- mesmo código pode estar em duas localizações ao mesmo tempo (dois
-- pedidos diferentes), e cada uma precisa da própria conferência --
-- confirmar uma não pode confirmar a outra sozinha.
--
-- `exp_controle_id` guardado como TEXT de propósito, mesmo motivo já
-- registrado em fase34: o tipo real de `exp_controle_itens.id` não está
-- definido em nenhum arquivo deste repositório (tabela anterior à
-- numeração por fase) -- texto evita risco de incompatibilidade numa FK
-- que este arquivo não tem como conferir com certeza.
--
-- UPSERT por (unidade, setor, exp_controle_id): a auditoria de HOJE
-- substitui a de ontem pro mesmo item -- não é histórico de todo clique,
-- é "qual o estado atual da conferência deste item". Quem quiser saber
-- "há quanto tempo" lê `conferido_em`.

create table if not exists exp_conferencia_fisica (
  id               uuid primary key default gen_random_uuid(),
  exp_controle_id  text not null,
  unidade          text not null,
  setor            text not null,
  status           text not null check (status in ('confere', 'nao_achei')),
  conferido_por    text,
  conferido_em     timestamptz not null default now(),
  constraint exp_conferencia_fisica_unico unique (unidade, setor, exp_controle_id)
);

create index if not exists idx_exp_conferencia_fisica_busca
  on exp_conferencia_fisica (unidade, setor);

alter table exp_conferencia_fisica enable row level security;

drop policy if exists "Leitura exp_conferencia_fisica da unidade" on exp_conferencia_fisica;
drop policy if exists "Escrita exp_conferencia_fisica da unidade"  on exp_conferencia_fisica;

-- Mesmo padrão de conferir_exp_notas (fase33) -- mesma família de telas
-- (Controle EXP Acessórios): esta_aprovado() + (admin ou dono da unidade).
create policy "Leitura exp_conferencia_fisica da unidade" on exp_conferencia_fisica
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita exp_conferencia_fisica da unidade" on exp_conferencia_fisica
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- ---------------------------------------------------------------------
-- Conferência (rode por último, em aba própria)
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_conferencia_fisica' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'exp_conferencia_fisica'
 order by policyname;
