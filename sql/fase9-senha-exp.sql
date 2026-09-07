-- =====================================================================
-- SENHA DO CONTROLE EXP ACESSORIOS, por unidade
--
-- O Robson pediu uma senha propria pra essa pagina, uma por unidade
-- (cada uma diferente) -- mesmo padrao ja usado pra liberar a coluna de
-- Contagem Fisica (senha_contagem, ver fase7-senhas-na-aba-admin.sql):
-- a senha fica no banco, a comparacao acontece DENTRO do banco (funcao
-- security definer), o navegador nunca recebe a senha, só sim/nao.
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             Precisa do fase7-senhas-na-aba-admin.sql (esta_aprovado()
--             já existe desde a Fase 1, mas o padrão de função copiado
--             daqui é o do fase7).
-- =====================================================================

alter table config_unidade add column if not exists senha_exp text;

create or replace function public.senha_exp_confere(uni text, tentativa text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.esta_aprovado() and exists (
    select 1 from public.config_unidade c
     where c.unidade = uni
       and c.senha_exp is not null
       and c.senha_exp = tentativa
  );
$$;

grant execute on function public.senha_exp_confere(text, text) to authenticated;

-- Verificacao (a senha nunca aparece, só se tem ou falta)
select unidade,
       case when senha_exp is null then 'FALTA' else 'ok' end as senha_exp
  from config_unidade order by unidade;
