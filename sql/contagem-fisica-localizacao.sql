-- =====================================================================
-- LOCALIZACAO FISICA NA CONTAGEM (corrigir endereco errado durante a contagem)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--
-- POR QUE
--
-- Itens do Estoque SESMT foram cadastrados com a coluna Localizacao vazia
-- ou generica ("SESMT" em vez do pallet real). Durante a contagem fisica,
-- quem esta contando percebe onde o item REALMENTE esta e precisa
-- registrar isso -- sem sobrescrever a localizacao do sistema na hora (a
-- correcao no cadastro e feita depois, deliberadamente, ao reimportar a
-- planilha ou editar o item).
--
-- `localizacao_fisica` guarda esse valor "o que a pessoa viu de verdade",
-- ao lado de `localizacao` (a do sistema, que e a chave da linha). Mesmo
-- padrao ja usado para quantidade: `quantidade_fisica` ao lado de
-- `estoque.quantidade`, sem um sobrescrever o outro.
-- =====================================================================

alter table contagem_fisica add column if not exists localizacao_fisica text;

-- Sem isto, um upsert que so preenche localizacao_fisica falharia se
-- quantidade_fisica for NOT NULL -- a pessoa pode notar a localizacao
-- errada antes mesmo de contar a quantidade daquele endereco.
alter table contagem_fisica alter column quantidade_fisica drop not null;

-- Verificacao
select column_name, is_nullable, data_type
  from information_schema.columns
 where table_name = 'contagem_fisica'
 order by ordinal_position;
