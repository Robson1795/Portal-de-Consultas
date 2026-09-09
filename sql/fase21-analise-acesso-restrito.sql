-- =====================================================================
-- ANÁLISE DE COMPRAS -- acesso restrito (lista de pessoas + responsável
-- de cada unidade), sem senha
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende de sql/fase19-analise-compras.sql e sql/fase20-analise-notas-
-- item.sql já terem rodado.
--
-- ⚠️ Se der "deadlock detected", feche as abas do portal e rode de novo.
--
-- POR QUE ISSO EXISTE
--
-- O RLS original da Fase 19/20 deixava QUALQUER conta aprovada ver a
-- análise da própria unidade (`esta_aprovado() and minha_unidade() =
-- unidade`) -- mais aberto do que devia pra dado comercial (o que falta
-- comprar, pra quem, com que urgência). O Robson (09/09/2026): "quero
-- limitar o acesso desse para o Joel, eu, Victor, Maiko e Gian do PCP" +
-- "essa tela só quero pra eles" + "deixe liberado sem senha pra eles" --
-- é lista de quem pode ver, não senha por unidade (diferente do Controle
-- EXP Acessórios).
--
-- E, no meio da conversa: "E os responsáveis de cada unidade" + "cada
-- unidade terá essa aba, só que não misture as coisas". Ou seja, dois
-- concEITOs SEPARADOS, cada um resolvendo uma pergunta diferente:
--
--   1. DE QUAL UNIDADE você pode ver a análise? -- a sua (minha_unidade()),
--      ou todas se for admin. Isso já existia e NÃO muda aqui.
--   2. Você pode ver a aba, PRA COMEÇO DE CONVERSA? -- só quem está nesta
--      lista, OU é o responsável (gerentes_unidade) daquela unidade
--      específica. É o que esta fase adiciona.
--
-- POR QUE REAPROVEITAR gerentes_unidade EM VEZ DE DUPLICAR OS NOMES
--
-- "O responsável de cada unidade" já é exatamente o que gerentes_unidade
-- guarda (hoje: Joel-106, David-101, João Ricardo-105, e quem mais for
-- cadastrado lá, ex.: Edvaldo-104). Copiar esses e-mails pra uma lista
-- nova criaria duas listas pra manter sincronizadas -- cadastrar um novo
-- responsável de unidade exigiria lembrar de mexer nas DUAS. Reaproveitar
-- significa que só entrar em gerentes_unidade (o que já se faz hoje pra
-- dar permissão de planilha) já libera a Análise de Compras da própria
-- unidade também, de graça.
--
-- analise_compras_acesso é só pra quem NÃO é responsável de unidade
-- nenhuma mas ainda assim precisa ver (Robson e Victor já são admin --
-- entram de qualquer forma; Joel some daqui se já estiver em
-- gerentes_unidade -- mas não faz mal repetir; Maiko e Gian entram aqui
-- quando o Robson mandar os e-mails deles).
-- =====================================================================

create table if not exists analise_compras_acesso (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  adicionado_por text,
  adicionado_em  timestamptz not null default now()
);

alter table analise_compras_acesso enable row level security;

drop policy if exists "Leitura analise_compras_acesso admin" on analise_compras_acesso;
drop policy if exists "Escrita analise_compras_acesso admin" on analise_compras_acesso;

-- Só admin mexe nesta lista -- não tem tela pra isso ainda (mesmo padrão de
-- gerentes_unidade/editores_bobinas: edita direto aqui no SQL Editor
-- quando precisar adicionar alguém, ex.: Maiko e Gian assim que o Robson
-- mandar os e-mails de login deles).
create policy "Leitura analise_compras_acesso admin" on analise_compras_acesso
  for select to authenticated using (public.eh_admin());

create policy "Escrita analise_compras_acesso admin" on analise_compras_acesso
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

insert into analise_compras_acesso (email, adicionado_por) values
  ('j.lisboa@kingspanisoeste.com.br', 'Robson'),
  ('victor.dobner@portal.kingspanisoeste.local', 'Robson')
on conflict (email) do nothing;

-- Robson e Victor são super admin (eh_super_admin/eh_admin) e já passam por
-- qualquer checagem de eh_admin() -- não precisam de linha aqui pra
-- funcionar, mas cadastrar não atrapalha e deixa a lista auto-explicativa
-- (quem lê a tabela entende quem foi liberado, sem precisar saber de cor
-- quem é super admin).
insert into analise_compras_acesso (email, adicionado_por) values
  ('r.alves1@portal.kingspanisoeste.local', 'Robson'),
  ('robson_alves1995@live.com', 'Robson')
on conflict (email) do nothing;


-- Pode ver/alimentar a Análise de Compras desta unidade? Admin, ou está na
-- lista acima, ou é o responsável (gerentes_unidade) desta unidade
-- específica -- os TRÊS caminhos, qualquer um libera.
create or replace function public.pode_ver_analise_compras(uni text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin()
     or exists (
       select 1 from public.analise_compras_acesso a
        where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     )
     or exists (
       select 1 from public.gerentes_unidade g
        where g.unidade = uni
          and lower(g.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     );
$$;

grant execute on function public.pode_ver_analise_compras(text) to authenticated;


-- ---------------------------------------------------------------------
-- Troca o RLS de analise_demanda e analise_item_notas: continuam
-- filtrando por unidade (minha_unidade() = unidade -- isso NÃO muda), só
-- que agora exigem pode_ver_analise_compras(unidade) em vez de
-- esta_aprovado() puro. É a mesma unidade de sempre, só que com a
-- pergunta "posso ver ESTA aba" mais restrita.
-- ---------------------------------------------------------------------

drop policy if exists "Leitura analise_demanda da unidade" on analise_demanda;
drop policy if exists "Escrita analise_demanda da unidade" on analise_demanda;

create policy "Leitura analise_demanda restrita" on analise_demanda
  for select to authenticated
  using (public.pode_ver_analise_compras(unidade) and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita analise_demanda restrita" on analise_demanda
  for all to authenticated
  using (public.pode_ver_analise_compras(unidade) and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.pode_ver_analise_compras(unidade) and (public.eh_admin() or public.minha_unidade() = unidade));

drop policy if exists "Leitura analise_notas da unidade" on analise_item_notas;
drop policy if exists "Escrita analise_notas da unidade" on analise_item_notas;

create policy "Leitura analise_notas restrita" on analise_item_notas
  for select to authenticated
  using (public.pode_ver_analise_compras(unidade) and (public.eh_admin() or public.minha_unidade() = unidade));

create policy "Escrita analise_notas restrita" on analise_item_notas
  for all to authenticated
  using (public.pode_ver_analise_compras(unidade) and (public.eh_admin() or public.minha_unidade() = unidade))
  with check (public.pode_ver_analise_compras(unidade) and (public.eh_admin() or public.minha_unidade() = unidade));

-- A função que grava a planilha colada também precisa da mesma trava --
-- sem isso, alguém sem acesso à ABA ainda conseguiria gravar dados nela
-- via RPC direto (o RLS de cima só protege leitura/escrita direta na
-- tabela, não o que a função faz por dentro, que roda como security
-- definer). Trocado de pode_atualizar_estoque(uni) pra
-- pode_ver_analise_compras(uni).
create or replace function public.substituir_analise_demanda(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uni    text;
  linhas jsonb;
  quem   text;
begin
  uni    := btrim(coalesce(payload ->> 'unidade', ''));
  linhas := payload -> 'linhas';
  quem   := nullif(btrim(coalesce(payload ->> 'importado_por', '')), '');

  if uni = '' then
    raise exception 'O payload veio sem unidade.';
  end if;
  if not public.pode_ver_analise_compras(uni) then
    raise exception 'Sem permissão para atualizar a análise da unidade %.', uni;
  end if;
  if jsonb_typeof(linhas) <> 'array' or jsonb_array_length(linhas) = 0 then
    raise exception 'A planilha veio sem linhas. Para limpar a análise, faça isso explicitamente.';
  end if;

  delete from analise_demanda where unidade = uni;

  insert into analise_demanda
    (unidade, emissao, numero_pedido, nome_abreviado, seq_etapa, codigo_item,
     descricao, um, qt_pedido, qt_atendida, data_embarque, os, importado_em, importado_por)
  select uni, r.emissao, r.numero_pedido, r.nome_abreviado, r.seq_etapa, r.codigo_item,
         r.descricao, r.um, r.qt_pedido, r.qt_atendida, r.data_embarque, r.os, now(), quem
    from jsonb_array_elements(linhas) i,
         jsonb_populate_record(null::analise_demanda, i) r;

  return jsonb_build_object('ok', true, 'unidade', uni, 'linhas', jsonb_array_length(linhas));
end $$;

grant execute on function public.substituir_analise_demanda(jsonb) to authenticated;

-- Verificação: quem tem acesso hoje (lista + responsável de cada unidade)
select a.email, 'lista' as origem from analise_compras_acesso a
union all
select g.email, 'responsável da unidade ' || g.unidade from gerentes_unidade g
order by 2, 1;
