-- Fase 40 -- Destino e telefone do motorista no Painel de Docas
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase39-painel-docas.sql.
--
-- O Robson, com o painel já rodando: "preciso que coloque tambem destino
-- e numero do telefone do motorista".
--
-- Os dois entram como coluna própria em doca_carregamentos, e não como
-- texto solto em `observacao`:
--
--   `destino`             vira indicador depois (carregamento por rota,
--                         tempo médio por destino) -- dentro de um campo
--                         de observação livre isso nunca seria agrupável.
--   `telefone_motorista`  vira link de ligar no celular do conferente.
--                         É o caso real do pátio: o motorista sumiu e o
--                         caminhão está ocupando a doca.
--
-- Texto, não número, no telefone: a pessoa digita com DDD, parênteses,
-- hífen e às vezes ramal, e transformar isso em número perderia o zero à
-- esquerda e a formatação que ajuda a conferir se está certo.

alter table doca_carregamentos add column if not exists destino text;
alter table doca_carregamentos add column if not exists telefone_motorista text;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type
  from information_schema.columns
 where table_name = 'doca_carregamentos'
   and column_name in ('destino', 'telefone_motorista')
 order by ordinal_position;
