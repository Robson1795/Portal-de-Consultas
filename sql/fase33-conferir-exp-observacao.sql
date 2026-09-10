-- =====================================================================
-- ABA CONFERIR (Controle EXP) — Observação por item
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Depende da aba Conferir já existir (sistema × físico, ver comentário de
-- montarConferirExp() em js/programacao.js).
-- =====================================================================
--
-- O Robson, apontando pro fim da tabela da aba Conferir: *"preciso de uma
-- coluna de observação"* -- e, na sequência, *"um botão de excluir, tem
-- itens que não são do meu estoque daí limpo"*, esclarecido depois: *"excluo
-- o item que não preciso contar no inventário, tem itens que são do pátio aí
-- é outra equipe"*.
--
-- "EXCLUIR" AQUI NÃO APAGA catalogo_exp_itens NEM exp_controle_itens
--
-- O pedido é parar de CONFERIR o item aqui, não apagar o registro de outra
-- equipe -- o pátio continua sendo problema de quem cuida do pátio, só deixa
-- de aparecer NESTA tela. Mesmo padrão do "não repor" da Análise de Compras
-- (fase20): uma marca reversível (↺ restaura), não uma exclusão de verdade.
-- Apagar catalogo_exp_itens/exp_controle_itens de verdade tiraria o item de
-- outras telas que dependem dele (Catálogo, descrição no Controle EXP) só
-- porque esta unidade não quer contá-lo NA CONFERÊNCIA.
--
-- POR QUE UMA TABELA PRÓPRIA, E NÃO analise_item_notas
--
-- Já existe uma tabela de observação por item (`analise_item_notas`, fase20),
-- usada na Análise de Compras -- mas é outro assunto: lá a observação é sobre
-- "o que fazer pra comprar este item" (já solicitei, não repor, etc.). Aqui é
-- sobre a DIVERGÊNCIA sistema × físico ("contei nos dois lugares e bate",
-- "esse saldo do sistema tá errado, já avisei o PCP"...). Reaproveitar a
-- mesma tabela misturaria dois assuntos na mesma linha, e um "não repor" ali
-- não tem nada a ver com conferência de estoque.
--
-- A CHAVE é (unidade, codigo_item) NORMALIZADO por normalizaCodigoItem() --
-- mesma normalização que monta a linha da tela (montarConferirExp() soma o
-- item de todas as localizações e pedidos, então a observação também é do
-- ITEM inteiro nesta unidade, não de uma localização ou pedido específico).
-- =====================================================================

create table if not exists conferir_exp_notas (
  id             uuid primary key default gen_random_uuid(),
  unidade        text not null,
  codigo_item    text not null,
  observacao     text,
  -- timestamptz, e não boolean: além de "excluído?", responde "desde quando"
  -- e "quem", que é o que se pergunta quando alguém estranha o item sumido
  -- da lista -- mesmo motivo de etiqueta_emitida_em (fase16) e
  -- solicitado_em (fase22).
  excluido_em    timestamptz,
  excluido_por   text,
  atualizado_por text,
  atualizado_em  timestamptz not null default now(),
  constraint conferir_exp_notas_unico unique (unidade, codigo_item)
);

create index if not exists idx_conferir_exp_notas_unidade on conferir_exp_notas (unidade);

alter table conferir_exp_notas enable row level security;

drop policy if exists "Leitura conferir_exp_notas da unidade" on conferir_exp_notas;
drop policy if exists "Escrita conferir_exp_notas da unidade" on conferir_exp_notas;

-- Mesmo padrão de exp_controle_itens/catalogo_exp_itens (mesma família de
-- telas): esta_aprovado() + (admin ou dono da unidade).
create policy "Leitura conferir_exp_notas da unidade" on conferir_exp_notas
  for select to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita conferir_exp_notas da unidade" on conferir_exp_notas
  for all to authenticated
  using (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.esta_aprovado() and (public.eh_admin() or public.minha_unidade() = unidade));

-- Conferência
select column_name, data_type from information_schema.columns
 where table_name = 'conferir_exp_notas' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'conferir_exp_notas' order by policyname;
