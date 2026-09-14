-- Fase 43 -- Qual doca física recebeu o material (Controle EXP)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase36-doca.sql (status `na_doca`) e sql/fase39-painel-
-- docas.sql (tabela `docas`, as 3 docas cadastradas).
--
-- O Robson, olhando o botão 🚚 DOCA na aba Entrada: "nessa aba das docas
-- quando sai para carergar a minha responsavel que deixou o material la
-- ela coloca o numero da doca, entao tem que ter as opçoes das 03 docas
-- pra ela marcar o carregamento".
--
-- Até aqui, "na_doca" (fase36) era um lugar só, indiferenciado -- o botão
-- só marcava "saiu do endereço", sem dizer PRA QUAL das 3 docas físicas.
-- Quem leva o material fisicamente já sabe pra qual doca está indo (é ela
-- quem carrega a caixa até lá); esta coluna registra essa escolha no
-- mesmo instante, em vez de deixar a informação só na cabeça de quem
-- carregou.
--
-- `doca_id`, não um texto solto: aponta pra `docas` (fase39), a mesma
-- lista que já alimenta o Painel de Docas -- Doca 1/2/3 tem UM cadastro
-- só no sistema inteiro, não um texto "Doca 1" digitado aqui e outro lá
-- que podem divergir.
--
-- ⚠️ DIFERENTE de `doca_carregamento_id` (fase39): aquela coluna aponta
-- pra um CAMINHÃO específico (um `doca_carregamentos`), e só é
-- preenchida quando existe um caminhão de verdade encostado carregando
-- aquele pedido. Esta aqui (`doca_id`) é só o ENDEREÇO FÍSICO (Doca 1, 2
-- ou 3) -- o material pode chegar na doca ANTES de qualquer caminhão ser
-- registrado ali, e mesmo assim precisa registrar em qual das três ele
-- está fisicamente parado.
alter table exp_controle_itens add column if not exists doca_id uuid references docas (id);

create index if not exists idx_exp_controle_itens_doca_fisica on exp_controle_itens (doca_id);

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'exp_controle_itens' and column_name = 'doca_id';
