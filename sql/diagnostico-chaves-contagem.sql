-- =====================================================================
-- DIAGNÓSTICO — só lê, não altera nada.
--
-- Rode no painel do Supabase (SQL Editor) e me mande o resultado das três
-- consultas. Serve para saber o que o sql/fase23-sesmt-deposito.sql deixou
-- aplicado antes de falhar, porque o editor do Supabase pode ou não desfazer
-- as alterações anteriores quando um comando no meio dá erro.
-- =====================================================================

-- 1) A coluna `deposito` entrou nas três tabelas?
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where column_name = 'deposito'
   and table_name in ('estoque', 'contagem_fisica', 'atribuicoes_corredor')
 order by table_name;

-- 2) Quais restrições existem hoje, e de que tipo.
--    `p` = primary key, `u` = unique. É isto que importa: se a antiga era
--    PRIMARY KEY e virou apenas UNIQUE, a tabela perdeu a identidade de
--    réplica e o `delete` passa a ser recusado (o erro que você viu).
select t.relname                        as tabela,
       c.conname                        as restricao,
       case c.contype when 'p' then 'PRIMARY KEY'
                      when 'u' then 'UNIQUE'
                      else c.contype::text end as tipo,
       pg_get_constraintdef(c.oid)      as definicao
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
 where t.relname in ('contagem_fisica', 'atribuicoes_corredor', 'estoque')
   and c.contype in ('p', 'u')
 order by t.relname, c.contype, c.conname;

-- 3) A identidade de réplica de cada tabela.
--    `d` = default (usa a PRIMARY KEY) · `f` = full · `n` = nothing ·
--    `i` = um índice específico.
--    Com `d` e SEM primary key, o delete é recusado.
select c.relname                as tabela,
       c.relreplident           as identidade_replica,
       (select count(*) from pg_constraint k
         where k.conrelid = c.oid and k.contype = 'p') as tem_primary_key
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('contagem_fisica', 'atribuicoes_corredor', 'estoque')
 order by c.relname;
