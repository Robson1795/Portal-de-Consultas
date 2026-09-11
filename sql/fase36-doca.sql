-- Fase 36 -- Estado intermediário "Na DOCA" (Controle EXP)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/programacao-04-exp-saida.sql (status/retirado_por/retirado_em).
--
-- O Robson: "esses itens do EXP saem do endereço e vai para area de
-- carregamento" (11/09/2026) e, no mesmo dia: "quero uma aba só de DOCA,
-- aí quando eu marcar na aba de saída da localização automaticamente o
-- material é transferido pra lá". Perguntado se DOCA é fim de linha ou uma
-- etapa a mais antes do carregamento de verdade, a resposta foi etapa
-- intermediária:
--
--   1. na_expedicao  -- item no endereço (prateleira)
--   2. na_doca        -- saiu do endereço, esperando o caminhão na doca
--   3. retirado        -- carregou de verdade (fim de linha, vira histórico)
--
-- Até aqui só existiam os estados 1 e 3 -- o botão "DOCA" pulava direto pra
-- retirado. Agora ele para em na_doca, e só um "✓ Carregou" na aba DOCA
-- grava o retirado de verdade.
--
-- `na_doca_por`/`na_doca_em`: MESMO padrão de `retirado_por`/`retirado_em`
-- (fase da migration 04) -- não reaproveita essas duas colunas pro
-- carimbo da doca porque um item pode passar pelas duas etapas (entrar na
-- doca, depois carregar), e usar as mesmas colunas pras duas apagaria a
-- resposta de "há quanto tempo esse item ficou parado na doca antes de
-- carregar" assim que a segunda etapa acontecesse.

alter table exp_controle_itens add column if not exists na_doca_por text;
alter table exp_controle_itens add column if not exists na_doca_em timestamptz;

-- Troca a constraint pra aceitar o estado novo. drop+create em vez de só
-- create: um ALTER TABLE ... ADD CONSTRAINT com o MESMO nome falharia
-- "already exists" se rodado de novo, e a Conferência deste script já
-- roda no fim -- então precisa ser seguro rodar mais de uma vez.
alter table exp_controle_itens drop constraint if exists exp_controle_itens_status_valido;
alter table exp_controle_itens
  add constraint exp_controle_itens_status_valido
  check (status in ('na_expedicao', 'na_doca', 'retirado'));

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_controle_itens'
   and column_name in ('status', 'na_doca_por', 'na_doca_em', 'retirado_por', 'retirado_em')
 order by ordinal_position;

select conname as restricao, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'exp_controle_itens'::regclass
   and conname = 'exp_controle_itens_status_valido';
