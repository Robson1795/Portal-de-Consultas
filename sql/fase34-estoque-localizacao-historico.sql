-- Fase 34 -- Histórico de localização do estoque (Consulta de Itens)
--
-- Robson, 11/09/2026, olhando a Consulta de Itens ordenada por Localização
-- (vários "REC" e "null" empilhados): "localização editavel para o
-- almoxarifado, e ter um botao de historico de movimentação de qual
-- localizaçao saiu e localização que deu entrada".
--
-- Duas coisas juntas:
--   1) o campo Localização da Consulta de Itens passa a ser editável (só
--      pra quem já pode editar o estoque desta unidade -- mesma trava do
--      Estoque Seguro e do excluir linha, fase 11/09 anteriores).
--   2) toda vez que alguém edita, fica registrado de onde saiu e pra onde
--      foi -- sem isso, editar por cima da localização atual apagaria a
--      pergunta "onde é que esse item estava antes?", que é exatamente o
--      que o Robson quer poder responder.
--
-- Não reaproveita `log_movimentacao` (fase da Programação de Separação):
-- aquela tabela tem `pedido_id uuid not null references pedidos(id)`, e
-- localização do Almoxarifado não tem pedido nenhum por trás -- forçar um
-- FK obrigatório pra um evento que não é de pedido seria remendo, não
-- reuso. Tabela nova, do jeito que `conferir_exp_notas` já foi separada de
-- `analise_item_notas` por motivo parecido (domínios diferentes, mesma
-- forma por coincidência).
--
-- `estoque_id` guardado como TEXT de propósito: o tipo real da coluna
-- `estoque.id` não está definido em nenhum arquivo deste repositório (a
-- tabela `estoque` nasceu antes da numeração por fase) -- texto evita
-- qualquer risco de incompatibilidade de tipo numa FK que este arquivo não
-- tem como conferir com certeza. Quem lê o histórico busca por
-- unidade+depósito+item, não pelo id da linha.

create table if not exists estoque_localizacao_historico (
  id                    uuid primary key default gen_random_uuid(),
  estoque_id            text not null,
  unidade               text not null,
  deposito              text not null,
  item                  text not null,
  localizacao_anterior  text,
  localizacao_nova      text,
  alterado_por          text,
  alterado_em           timestamptz not null default now()
);

create index if not exists idx_estoque_loc_historico_busca
  on estoque_localizacao_historico (unidade, deposito, item, alterado_em desc);

alter table estoque_localizacao_historico enable row level security;

drop policy if exists "Leitura estoque_localizacao_historico"  on estoque_localizacao_historico;
drop policy if exists "Escrita estoque_localizacao_historico"  on estoque_localizacao_historico;

-- Mesmo recorte de leitura do `estoque` (fase31): consultor não vê
-- histórico de depósito que ele também não vê a linha de estoque.
create policy "Leitura estoque_localizacao_historico" on estoque_localizacao_historico
  for select to authenticated
  using (
    public.esta_aprovado()
    and (deposito = 'alm' or public.meu_perfil() <> 'consultor')
  );

-- Só quem já pode editar o estoque desta unidade grava histórico -- mesma
-- função usada pra Estoque Seguro e pra excluir linha (fase1-perfis-e-
-- permissoes.sql). Sem UPDATE/DELETE de propósito: histórico não se
-- corrige, se corrigiu é porque teve OUTRA mudança, que também vira linha.
create policy "Escrita estoque_localizacao_historico" on estoque_localizacao_historico
  for insert to authenticated
  with check (public.pode_atualizar_estoque(unidade));

-- ---------------------------------------------------------------------
-- Conferência (rode por último, em aba própria -- ver CLAUDE.md sobre por
-- que colar o script inteiro de novo aciona "policy already exists" nas
-- fases antigas, e isso é esperado).
-- ---------------------------------------------------------------------
select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'estoque_localizacao_historico'
 order by policyname;
