-- =====================================================================
-- MARCA ITEM SEM PADRAO DE CAIXA (item avulso, sem embalagem fixa)
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--
-- POR QUE UMA COLUNA NOVA, E NAO TEXTO LIVRE NO CAMPO DE QUANTIDADE
--
-- js/estoque.js trata qtd_caixa_master como numero em varios lugares
-- (calcularCaixas faz `restante / info.master`). Um texto como "SEM PADRAO"
-- ali dentro passaria pelo filtro `.filter(r => r.qtd_caixa_master)` (texto
-- nao vazio e verdadeiro), o botao 📦 apareceria, e o calculo quebraria
-- tentando dividir numero por string (NaN). Por isso a marcacao "isto nao
-- tem padrao de caixa" vira uma coluna booleana propria, e os dois campos
-- de quantidade continuam so aceitando numero ou vazio.
-- =====================================================================

alter table fichas_tecnicas
  add column if not exists sem_padrao_caixa boolean not null default false;

-- Sem policy nova: a tabela ja tem RLS por inteiro (Fase 1, "Escrita ficha"),
-- e essa coluna e so mais um campo dela.

-- Verificacao
select column_name, data_type, column_default
  from information_schema.columns
 where table_name = 'fichas_tecnicas'
 order by ordinal_position;
