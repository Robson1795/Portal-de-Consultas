-- =====================================================================
-- CADA PESSOA CONTA SÓ NA PRÓPRIA UNIDADE
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             Rode DEPOIS do fase1-perfis-e-permissoes.sql.
--
-- Cole tudo de uma vez; o resultado da última consulta é o que confere.
-- =====================================================================
--
-- POR QUE
--
-- A Fase 1 deixou uma folga de propósito, para ninguém ficar travado na
-- migração:
--
--     using (eh_admin() OR (meu_perfil() = 'estoque_alm'
--            AND (minha_unidade() IS NULL OR minha_unidade() = unidade)))
--                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ a folga
--
-- Com `minha_unidade()` nulo, a pessoa contava qualquer unidade. A regra
-- correta é: cada um na sua, admin em todas. Este script tira a folga.
--
-- `minha_unidade() = unidade` com unidade nula resulta em NULL, que o RLS
-- trata como "não autorizado" -- ou seja, cadastro sem unidade nao conta
-- nada, em vez de contar tudo. Falha fechado, que e o certo aqui.
--
-- A interface acompanha: o seletor de unidade do cabecalho aparece apenas
-- para admin (js/navegacao.js). Mas a tela e conveniencia; a regra que vale
-- e esta.
--
-- ⚠️ EFEITO IMEDIATO: quem estiver com `unidade` nula em
--    usuarios_permitidos para de conseguir lancar contagem. Hoje isso nao
--    afeta ninguem -- as duas unicas contas sao admin, na unidade 106 --
--    mas todo cadastro novo nasce sem unidade, e o admin precisa defini-la
--    antes de a pessoa poder contar.
-- =====================================================================


-- ---- contagem do estoque geral: so a propria unidade -----------------
drop policy if exists "Contagem ALM" on contagem_fisica;
create policy "Contagem ALM" on contagem_fisica
  for all to authenticated
  using (
    public.eh_admin()
    or (public.meu_perfil() = 'estoque_alm' and public.minha_unidade() = unidade)
  )
  with check (
    public.eh_admin()
    or (public.meu_perfil() = 'estoque_alm' and public.minha_unidade() = unidade)
  );


-- ---- responsavel por corredor: idem ----------------------------------
-- Na Fase 1 esta politica nao checava unidade nenhuma, so o perfil.
drop policy if exists "Corredor ALM" on atribuicoes_corredor;
create policy "Corredor ALM" on atribuicoes_corredor
  for all to authenticated
  using (
    public.eh_admin()
    or (public.meu_perfil() = 'estoque_alm' and public.minha_unidade() = unidade)
  )
  with check (
    public.eh_admin()
    or (public.meu_perfil() = 'estoque_alm' and public.minha_unidade() = unidade)
  );


-- ---------------------------------------------------------------------
-- VERIFICAÇÃO
--
-- Nas duas linhas abaixo, a coluna `usando` NAO deve mais conter
-- "minha_unidade() IS NULL".
-- ---------------------------------------------------------------------

select tablename, policyname, cmd, qual as usando
from pg_policies
where schemaname = 'public'
  and tablename in ('contagem_fisica', 'atribuicoes_corredor')
order by tablename, policyname;
