-- ============================================================================
-- Fase 31 — Consultor só consulta: fecha o Depósito SESMT e a Requisição ALM
-- ============================================================================
--
-- O Victor, 10/09/2026: "Consultor apenas consulta de itens, restringir
-- deposito SESMT e requisição ALM."
--
-- O menu já deixou de mostrar as duas páginas para o perfil `consultor`
-- (PERFIS em js/navegacao.js). Este script é a outra metade, e é a que
-- importa: **o menu decide o que APARECE, o RLS decide o que a pessoa LÊ e
-- ESCREVE** (CLAUDE.md, seção 5). Sem rodar isto, um consultor com o
-- inspetor do navegador aberto continua conseguindo:
--
--   * criar requisição — a política "Criar propria requisicao" (fase6) exige
--     apenas `esta_aprovado()`, que ele é;
--   * ler o estoque de EPI — a política de leitura de `estoque` (fase1c) não
--     olha a coluna `deposito`, criada só na fase23.
--
-- ⚠️ É uma REVERSÃO de decisão anterior. Até 09/09/2026 a Requisição ALM era
-- de propósito aberta a todos os perfis ("qualquer conta aprovada pode pedir
-- material", CLAUDE.md seção 8). Se um dia voltar a ser, tem de voltar nos
-- DOIS lugares: devolver a página no menu não devolve a permissão do banco.
--
-- ⚠️ As políticas de leitura são SUBSTITUÍDAS, não somadas. Política
-- permissiva se soma (OR): deixar a antiga no lugar e criar uma restrita ao
-- lado não restringe nada — a antiga continuaria liberando. Mesma lição do
-- comentário do fase11.
--
-- Independe do fase11 (ainda pendente): ele mexe nas políticas de ESCRITA de
-- `contagem_fisica` ("Contagem ALM"), e aqui só a de leitura é tocada. Rodar
-- em qualquer ordem dá no mesmo.
--
-- Rodar no painel do Supabase: SQL Editor → New query → Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1 — quem pode pedir material
-- ---------------------------------------------------------------------------
-- Função com nome próprio em vez de `meu_perfil() <> 'consultor'` espalhado
-- pelas políticas: o dia em que outro perfil entrar no projeto, a regra de
-- "quem pede material" muda num lugar só. Mesmo padrão de
-- `pode_atualizar_estoque()` e `pode_ver_analise_compras()`.
--
-- `security definer` + `set search_path`: a função lê `usuarios_permitidos`
-- (por dentro de `meu_perfil()`), que o próprio usuário não lê inteira.
create or replace function public.pode_pedir_material()
returns boolean language sql stable security definer set search_path = public as $$
  select public.esta_aprovado() and public.meu_perfil() <> 'consultor';
$$;

comment on function public.pode_pedir_material() is
  'Quem pode abrir Requisição ALM. Consultor não pode desde 10/09/2026 (fase29).';

-- ---------------------------------------------------------------------------
-- PARTE 2 — Requisição ALM: consultor não cria
-- ---------------------------------------------------------------------------
-- Só o INSERT precisa de trava. As políticas de update e delete (fase6) são
-- do autor (`criado_por = auth.uid()`), então quem não consegue criar não tem
-- o que editar nem apagar depois.
--
-- A LEITURA fica como está ("Ver requisicoes": autor, estoque_alm da unidade
-- ou admin). Um consultor sem requisição nenhuma não vê nada por ela; e se
-- alguma tiver sido criada antes desta fase, o autor continua vendo a própria
-- — esconder o que ele mesmo escreveu seria pior que deixar visível.
drop policy if exists "Criar propria requisicao" on public.requisicoes_alm;
create policy "Criar propria requisicao" on public.requisicoes_alm
  for insert to authenticated
  with check (public.pode_pedir_material() and criado_por = auth.uid());

-- Os ITENS já dependem da requisição-pai ("Autor mexe nos itens", fase6, que
-- confere por `exists` na `requisicoes_alm`): sem poder criar o cabeçalho,
-- não há linha-pai a que pendurar item. Nada a mudar aqui de propósito.

-- ---------------------------------------------------------------------------
-- PARTE 3 — Depósito SESMT: consultor não lê o EPI
-- ---------------------------------------------------------------------------
-- `estoque.deposito` é `not null default 'alm'` (fase23), então não há caso
-- nulo para tratar.
--
-- ⚠️ A condição é `deposito = 'alm'`, e não `deposito <> 'sesmt'`: desde o
-- fase29 existe um TERCEIRO depósito, `benchmark`, e a restrição aceita os
-- três. Escrita como está, o consultor lê só o almoxarifado — qualquer
-- depósito que nasça amanhã já entra fechado para ele, que é o lado certo de
-- errar. `<> 'sesmt'` teria deixado o Benchmark aberto sem ninguém notar.
--
-- A leitura entre UNIDADES continua aberta, e isso é decisão de 03/09/2026,
-- não esquecimento: é ela que faz o botão ⇄ "Comparar entre unidades"
-- funcionar. O recorte novo é por DEPÓSITO, não por unidade — o ⇄ compara
-- almoxarifado, que o consultor continua lendo em todas as unidades.
drop policy if exists "Leitura para aprovados" on public.estoque;
create policy "Leitura para aprovados" on public.estoque
  for select to authenticated
  using (
    public.esta_aprovado()
    and (deposito = 'alm' or public.meu_perfil() <> 'consultor')
  );

-- A contagem do EPI é o mesmo dado por outro caminho: sem esta linha, o
-- consultor não veria o saldo de EPI mas veria quanto foi contado dele.
drop policy if exists "Leitura para aprovados" on public.contagem_fisica;
create policy "Leitura para aprovados" on public.contagem_fisica
  for select to authenticated
  using (
    public.esta_aprovado()
    and (deposito = 'alm' or public.meu_perfil() <> 'consultor')
  );

-- `atribuicoes_corredor` (quem é responsável por contar cada corredor) também
-- tem a coluna `deposito` desde a fase23. Fica de fora de propósito: é nome
-- de pessoa e letra de corredor, não saldo nem item — e a tela que a usa é o
-- modo contagem, onde o consultor só entra com a senha da unidade.

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — o que deve aparecer depois de rodar
-- ---------------------------------------------------------------------------
-- As duas políticas de leitura têm de citar `deposito`, e a de insert da
-- requisição tem de citar `pode_pedir_material`.
select tablename    as tabela,
       policyname   as politica,
       cmd          as comando,
       coalesce(qual, with_check) as regra
  from pg_policies
 where schemaname = 'public'
   and (
     (tablename in ('estoque', 'contagem_fisica') and policyname = 'Leitura para aprovados')
     or (tablename = 'requisicoes_alm' and policyname = 'Criar propria requisicao')
   )
 order by tablename, policyname;
