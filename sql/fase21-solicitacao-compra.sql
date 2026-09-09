-- =====================================================================
-- SOLICITAÇÃO DE COMPRA POR ITEM — e-mail do Compras e marca de solicitado
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Rode DEPOIS do sql/fase20-analise-notas-item.sql.
-- =====================================================================
--
-- O QUE ISTO HABILITA
--
-- Na Análise de Compras, cada item ganha um botão 🛒 que abre o e-mail de
-- solicitação de compra já preenchido, no mesmo desenho da Requisição ALM:
-- o e-mail sai do Outlook da própria pessoa, então o Compras responde direto
-- para quem pediu.
--
-- Duas coisas precisam existir no banco para isso:
--
-- 1. PARA QUEM MANDAR. `config_unidade` já guarda `emails_alm` (Requisição
--    ALM) e `email_pcp` (Programação). Compras é um terceiro destinatário,
--    e por unidade: cada fábrica tem o seu comprador. Unidade sem e-mail
--    cadastrado deixa o botão DESABILITADO, com o aviso de procurar o
--    administrador -- falha fechado, igual à senha de contagem. Adivinhar um
--    endereço aqui seria pior que não mandar: a solicitação sairia para o
--    lugar errado e ninguém saberia.
--
-- 2. O QUE JÁ FOI PEDIDO. `analise_item_notas` ganha `solicitado_em` e
--    `solicitado_por`. Sem essa marca, quem abre a lista no meio da semana
--    não sabe o que já foi solicitado e pede de novo -- o mesmo problema que
--    a coluna de etiqueta resolveu no Controle EXP.
--
--    ⚠️ A marca diz "o e-mail foi ABERTO", não "o e-mail foi enviado". Não
--    existe servidor neste projeto: o `mailto` entrega o rascunho ao Outlook
--    e o portal não tem como saber se a pessoa clicou em enviar. A tela diz
--    isso com essas palavras, e existe um ↺ para tirar a marca de um clique
--    errado. Chamar isso de "solicitado" no banco seria mentir num campo que
--    depois vira decisão de compra.
--
--    Elas ficam em `analise_item_notas` (e não numa tabela nova) pelo motivo
--    que o próprio fase20 registra: é anotação do item por unidade, que
--    sobrevive à troca da planilha. Tabela nova seria mais uma consulta e
--    mais uma chance de sair de sincronia.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PARTE 1 — e-mail do Compras por unidade
-- ---------------------------------------------------------------------

alter table config_unidade add column if not exists email_compras text;

-- Mesmo padrão de emails_alm_da_unidade() (fase7) e email_pcp_da_unidade()
-- (fase8): desde a fase7 `config_unidade` só é lida direto por admin, porque
-- a tabela guarda as senhas de contagem e de EXP na mesma linha. Quem NÃO é
-- admin (estoque_alm, que também usa a Análise de Compras) precisa de uma
-- função própria para ler só este e-mail, sem abrir a tabela inteira.
create or replace function public.email_compras_da_unidade(uni text)
returns text language sql stable security definer set search_path = public as $$
  select case when public.esta_aprovado()
    then (select c.email_compras from public.config_unidade c where c.unidade = uni)
    else null end;
$$;

grant execute on function public.email_compras_da_unidade(text) to authenticated;

-- ---------------------------------------------------------------------
-- PARTE 2 — marca de solicitação por item
-- ---------------------------------------------------------------------

alter table analise_item_notas
  add column if not exists solicitado_em timestamptz;

alter table analise_item_notas
  add column if not exists solicitado_por text;

-- `timestamptz` e não `boolean`, pelo mesmo motivo do etiqueta_emitida_em:
-- um booleano responde "já pedi?"; a data responde também "desde quando" e
-- "quem", que é o que se pergunta quando o material não chegou. Custa o
-- mesmo e diz mais.
--
-- Índice parcial: a pergunta frequente é "o que ainda falta solicitar", então
-- ele fica pequeno -- só as linhas sem solicitação entram.
create index if not exists idx_analise_notas_sem_solicitacao
  on analise_item_notas (unidade, codigo_item)
  where solicitado_em is null;

-- O RLS de analise_item_notas (fase20) já cobre estas colunas: leitura e
-- escrita exigem conta aprovada da mesma unidade, admin em todas. Coluna
-- nova em tabela com RLS ligado NÃO precisa de política nova -- a política é
-- da tabela, não da coluna. Não recrie as políticas aqui: era assim que o
-- sql/bobinas-aco.sql reabria a escrita que a Fase 1 havia fechado.


-- ---------------------------------------------------------------------
-- Conferência
--
-- Esperado na primeira consulta: as três colunas de e-mail de config_unidade.
-- Na segunda: solicitado_em (timestamp with time zone) e solicitado_por.
-- Na terceira: a função listada, com prosecdef = t.
-- Na quarta: quais unidades ainda estão sem o e-mail do Compras -- essas
-- ficam com o botão 🛒 desabilitado até alguém cadastrar na aba
-- Configurações.
-- ---------------------------------------------------------------------

select column_name, data_type
  from information_schema.columns
 where table_name = 'config_unidade'
   and column_name in ('emails_alm', 'email_pcp', 'email_compras')
 order by column_name;

select column_name, data_type
  from information_schema.columns
 where table_name = 'analise_item_notas'
   and column_name in ('solicitado_em', 'solicitado_por')
 order by column_name;

select p.proname   as funcao,
       p.prosecdef as security_definer,
       pg_get_function_arguments(p.oid) as argumentos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'email_compras_da_unidade';

select unidade,
       coalesce(nullif(btrim(email_compras), ''), '(FALTA CADASTRAR)') as email_compras
  from config_unidade
 order by unidade;
