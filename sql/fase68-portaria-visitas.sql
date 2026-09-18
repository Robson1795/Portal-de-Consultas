-- Fase 68 -- Portaria: visita agendada pelo funcionário, formalizada na recepção
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
--
-- Da caixa de sugestões, trazida pelo Victor (18/09/2026): "funcionários que
-- vão receber visita, cadastrar as informações das pessoas que virão, com
-- nome, dcto, empresa, horario. Portaria recebe as informações e quando o
-- visitante chega só formaliza e informa o funcionário".
--
-- O fluxo tem dois donos e um estado só, que é o ponto do desenho:
--
--   prevista  -> o funcionário cadastrou quem vem e quando
--   presente  -> a portaria confirmou a chegada (e o anfitrião foi avisado)
--   encerrada -> o visitante saiu
--   cancelada -> não veio / não precisa mais
--
-- A SAÍDA não estava no pedido e entrou de propósito: sem ela a tela responde
-- "quem era esperado hoje", mas não "quem está dentro da fábrica agora" --
-- que é a única lista que importa numa emergência. É uma coluna de data, não
-- um módulo a mais.
--
-- ⚠️ DADO PESSOAL DE TERCEIRO. Documento e empresa de visitante não são dado
-- da operação: são dado de uma pessoa que não trabalha aqui e não tem conta no
-- portal. Por isso o RLS abaixo é mais fechado que o padrão do projeto -- não
-- basta `esta_aprovado()`, é preciso ser o anfitrião daquela visita, a portaria
-- da unidade, ou admin. Um consultor de outra fábrica não lê nada disto.
-- PENDÊNCIA em aberto, a decidir com o Robson: por quanto tempo esse histórico
-- fica guardado. Hoje fica para sempre, e um prazo de descarte precisa ser
-- definido -- não criei função de expurgo aqui porque função destrutiva
-- sobrando no banco é pior que código morto (ver o histórico do fase26/fase27).

-- ---------------------------------------------------------------------
-- PARTE 1 -- O perfil 'portaria'
--
-- ⚠️ O VALOR DO PERFIL É VALIDADO EM TRÊS LUGARES, e mexer em um só deixa o
-- defeito silencioso. Isto é a mesma armadilha já registrada no CLAUDE.md
-- quando `status` ganhou o valor 'concluida' (fase24/fase25: "status novo pede
-- DOIS scripts, e eu esqueci o segundo na primeira vez") -- aqui são três:
--
--   1. o CHECK da coluna          -> sem ele, o UPDATE falha
--   2. definir_acesso()           -> sem ele, o admin não consegue conceder
--   3. forca_cadastro_neutro()    -> sem ele, quem se cadastra escolhendo
--                                    "Portaria" vira "Consultor" EM SILÊNCIO
--
-- O nº 3 é o pior dos três: não dá erro nenhum, a conta simplesmente nasce
-- com outro perfil e ninguém entende por quê.
-- ---------------------------------------------------------------------

-- 1) O CHECK da coluna.
alter table usuarios_permitidos
  drop constraint if exists usuarios_permitidos_perfil_valido;

alter table usuarios_permitidos
  add constraint usuarios_permitidos_perfil_valido
  check (perfil in ('consultor', 'estoque_alm', 'estoque_aco', 'portaria', 'admin'));

-- 2) definir_acesso() -- recriada inteira (o Postgres não deixa trocar só uma
--    linha do corpo). Igual à do fase1b, com 'portaria' na lista de perfis
--    válidos; nenhuma outra regra mudou.
create or replace function public.definir_acesso(
  alvo             uuid,
  novo_perfil      text,
  nova_unidade     text default null,
  nova_localizacao text default null,
  novo_aprovado    boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  alterou   integer;
  perfil_antigo text;
begin
  if not public.eh_admin() then
    raise exception 'Somente administradores alteram acesso.';
  end if;

  if novo_perfil not in ('consultor', 'estoque_alm', 'estoque_aco', 'portaria', 'admin') then
    raise exception 'Perfil invalido: %', novo_perfil;
  end if;

  -- Ninguém altera o próprio acesso, nem a raiz de confiança. Evita tanto
  -- escalonamento quanto o erro bobo de se rebaixar sozinho.
  if alvo = auth.uid() then
    raise exception 'Nao e possivel alterar o proprio acesso. Peca a outro administrador.';
  end if;

  select perfil into perfil_antigo from usuarios_permitidos where user_id = alvo;
  if perfil_antigo is null then
    raise exception 'Usuario nao encontrado.';
  end if;

  -- Conceder admin é privilégio da raiz de confiança.
  if novo_perfil = 'admin' and not public.eh_super_admin() then
    raise exception 'Somente Victor ou Robson concedem o perfil admin.';
  end if;

  -- Retirar admin de alguém, também.
  if novo_perfil <> 'admin' and perfil_antigo = 'admin' and not public.eh_super_admin() then
    raise exception 'Somente Victor ou Robson removem o perfil admin.';
  end if;

  perform set_config('app.definir_acesso', 'sim', true);

  update usuarios_permitidos
     set perfil      = novo_perfil,
         unidade     = coalesce(nova_unidade, unidade),
         localizacao = coalesce(nova_localizacao, localizacao),
         aprovado    = coalesce(novo_aprovado, aprovado)
   where user_id = alvo;

  -- Conferido aqui, logo depois do UPDATE: qualquer comando no meio
  -- redefiniria FOUND (PERFORM inclusive) e a checagem viraria letra morta.
  get diagnostics alterou = row_count;

  perform set_config('app.definir_acesso', 'nao', true);

  if alterou = 0 then
    raise exception 'Nenhuma linha alterada para o usuario informado.';
  end if;
end $$;

grant execute on function public.definir_acesso(uuid, text, text, text, boolean) to authenticated;

-- 3) forca_cadastro_neutro() -- 'portaria' entra na lista de cargos que o
--    cadastro aceita como PEDIDO, junto dos outros três de operação. Continua
--    fora dela o 'admin', de propósito: ninguém se cadastra administrador.
--    `aprovado` segue sempre falso -- quem libera é o admin, em Configurações.
create or replace function public.forca_cadastro_neutro()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.perfil is null
     or new.perfil not in ('consultor', 'estoque_alm', 'estoque_aco', 'portaria') then
    new.perfil := 'consultor';
  end if;

  new.aprovado := false;
  return new;
end $$;

drop trigger if exists trg_forca_cadastro_neutro on usuarios_permitidos;
create trigger trg_forca_cadastro_neutro
  before insert on usuarios_permitidos
  for each row execute function public.forca_cadastro_neutro();

-- ---------------------------------------------------------------------
-- PARTE 2 -- A tabela
-- ---------------------------------------------------------------------

create table if not exists portaria_visitas (
  id        uuid primary key default gen_random_uuid(),
  unidade   text not null,

  -- Quem vem. Só o nome é obrigatório: o funcionário nem sempre sabe o
  -- documento de antemão, e exigir todos os campos faria ele deixar de
  -- cadastrar -- aí a portaria volta a descobrir a visita na hora que ela
  -- chega, que é exatamente o que esta tela existe para acabar.
  visitante_nome      text not null,
  visitante_documento text,
  visitante_empresa   text,
  visitante_placa     text,

  -- Quando. `previsto_em` guarda data + hora num campo só (timestamptz):
  -- separar em dois permitiria "dia sem hora" e "hora sem dia", dois estados
  -- que a tela teria de decidir como desenhar.
  previsto_em timestamptz not null,
  motivo      text,

  -- Quem recebe. O id é a chave de verdade (é o que o RLS confere e o que
  -- endereça a notificação); o nome é RETRATO, para a portaria ler a lista
  -- sem depender de join e para o histórico continuar legível se a pessoa
  -- sair da empresa -- mesma decisão de `localizacao_na_reserva` no fase38.
  anfitriao_id   uuid not null default auth.uid(),
  anfitriao_nome text,

  status text not null default 'prevista',

  -- A portaria carimba. `chegada_por` e `saida_por` são o NOME de quem
  -- atendeu, não o id: o posto pode ter mais de um porteiro por turno, e o
  -- que se pergunta depois é "quem atendeu", não "qual login".
  chegada_em timestamptz,
  chegada_por text,
  cracha      text,
  saida_em    timestamptz,
  saida_por   text,
  observacao  text,

  criado_em timestamptz not null default now(),

  constraint portaria_visitas_status_valido
    check (status in ('prevista', 'presente', 'encerrada', 'cancelada'))
);

-- A lista do dia da portaria: unidade + status, ordenada pelo horário previsto.
create index if not exists idx_portaria_visitas_unidade
  on portaria_visitas (unidade, status, previsto_em);

-- "Minhas visitas" do funcionário, e o alvo da notificação de chegada.
create index if not exists idx_portaria_visitas_anfitriao
  on portaria_visitas (anfitriao_id, previsto_em desc);

alter table portaria_visitas enable row level security;

drop policy if exists "Leitura portaria_visitas" on portaria_visitas;
drop policy if exists "Criar visita propria" on portaria_visitas;
drop policy if exists "Atualizar portaria_visitas" on portaria_visitas;

-- ⚠️ Leitura MAIS FECHADA que o padrão do projeto (que é `esta_aprovado()` +
-- unidade). Aqui há dado pessoal de terceiro, então conta aprovada não basta:
-- é preciso ser o anfitrião daquela visita, a portaria DAQUELA unidade, ou
-- admin. O anfitrião não leva recorte de unidade porque a visita é dele --
-- se ele mudar de unidade no cadastro, continua vendo o que agendou.
create policy "Leitura portaria_visitas" on portaria_visitas
  for select to authenticated
  using (
    public.esta_aprovado() and (
      public.eh_admin()
      or anfitriao_id = auth.uid()
      or (public.meu_perfil() = 'portaria' and public.minha_unidade() = unidade)
    )
  );

-- Qualquer conta aprovada agenda visita -- todo funcionário recebe visita --
-- mas só EM NOME PRÓPRIO e na própria unidade. Sem o `anfitriao_id =
-- auth.uid()` daria para cadastrar visita no nome de outra pessoa, e o aviso
-- de chegada sairia para quem não esperava ninguém.
create policy "Criar visita propria" on portaria_visitas
  for insert to authenticated
  with check (
    public.esta_aprovado() and (
      public.eh_admin()
      or (anfitriao_id = auth.uid() and public.minha_unidade() = unidade)
    )
  );

-- Update com o mesmo alcance da leitura: o anfitrião edita e cancela a visita
-- dele enquanto ela não aconteceu; a portaria carimba chegada e saída.
--
-- ⚠️ Não há GRANT por coluna aqui (como o chat faz com `lido_em`), e isso é
-- escolha, não esquecimento: são dois papéis mexendo em conjuntos de colunas
-- diferentes da MESMA linha, e travar isso no banco exigiria duas políticas
-- com lista de colunas que sairiam de sincronia na primeira coluna nova. O
-- risco aceito é baixo -- os dois lados são funcionários identificados, e
-- cada carimbo grava quem o fez. Não é o caso do chat, onde a política aberta
-- deixaria o destinatário REESCREVER o texto de quem mandou.
create policy "Atualizar portaria_visitas" on portaria_visitas
  for update to authenticated
  using (
    public.esta_aprovado() and (
      public.eh_admin()
      or anfitriao_id = auth.uid()
      or (public.meu_perfil() = 'portaria' and public.minha_unidade() = unidade)
    )
  )
  with check (
    public.esta_aprovado() and (
      public.eh_admin()
      or anfitriao_id = auth.uid()
      or (public.meu_perfil() = 'portaria' and public.minha_unidade() = unidade)
    )
  );

-- Sem política de DELETE, de propósito: "não vem mais" é o status 'cancelada'.
-- Um livro de portaria que se apaga não serve de livro de portaria -- mesma
-- decisão de `inventarios` (fase41) e `reservas_aco` (fase38).

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'portaria_visitas' order by ordinal_position;

select policyname as politica, cmd as comando
  from pg_policies
 where tablename = 'portaria_visitas'
 order by policyname;

-- Os três lugares do perfil, conferidos de uma vez. Os três têm de citar
-- 'portaria'; se algum não citar, o script não rodou inteiro.
select 'check da coluna' as onde, pg_get_constraintdef(oid) as tem_portaria
  from pg_constraint where conname = 'usuarios_permitidos_perfil_valido'
union all
select 'definir_acesso()',
       case when prosrc like '%portaria%' then 'sim' else 'NAO -- rode de novo' end
  from pg_proc where proname = 'definir_acesso'
union all
select 'forca_cadastro_neutro()',
       case when prosrc like '%portaria%' then 'sim' else 'NAO -- rode de novo' end
  from pg_proc where proname = 'forca_cadastro_neutro';
