-- =====================================================================
-- SENHAS INICIAIS DO CONTROLE EXP ACESSORIOS, uma por unidade
--
-- Padrao sugerido: EXP + codigo da unidade (ex.: unidade 106 -> EXP106).
-- Troque como quiser depois em Configuracoes -> coluna "Senha Controle EXP".
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
-- Depende de sql/fase9-senha-exp.sql (cria a coluna senha_exp e a funcao
-- senha_exp_confere).
--
-- Usa upsert (insert ... on conflict) porque nem toda unidade
-- necessariamente ja tem uma linha em config_unidade -- se ja tiver, so
-- atualiza senha_exp, sem mexer em emails_alm/email_pcp/senha_contagem/
-- pin_edicao que ja estiverem la.
-- =====================================================================

insert into config_unidade (unidade, senha_exp)
values
  ('101',  'EXP101'),
  ('103',  'EXP103'),
  ('104',  'EXP104'),
  ('105',  'EXP105'),
  ('106',  'EXP106'),
  ('107',  'EXP107'),
  ('109',  'EXP109'),
  ('110',  'EXP110'),
  ('1101', 'EXP1101')
on conflict (unidade) do update
  set senha_exp = excluded.senha_exp;

-- Verificacao (a senha nunca aparece, só se tem ou falta)
select unidade,
       case when senha_exp is null then 'FALTA' else 'ok' end as senha_exp
  from config_unidade order by unidade;
