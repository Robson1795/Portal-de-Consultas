-- Fase 53 -- Devolução: localização (pra etiqueta) + registro manual sem NF
--
-- Onde rodar: painel do Supabase -> SQL Editor -> New query -> Run.
--             NUNCA na interface web do GitHub (ver sql/README.md).
-- Depende de sql/fase52-devolucao.sql.
--
-- O Robson, mostrando o formulário "passo a passo" do Controle EXP
-- Acessórios: *"Em devolução coloque outra aba, quero fazer igual ao do
-- exp acessórios, quando chegar devolução eu alimento mesmo que nao tenha
-- dado entrada no sistema, pode colocar botao de imprimir também"*.
--
-- Duas coisas novas:
--
--   1) `localizacao` -- a devolução até aqui só tinha os dados da NF
--      (cliente, produto, quantidade). Pra imprimir uma etiqueta (igual à
--      da Trading/Itens Débito Direto: "aonde esse material está guardado")
--      precisa de onde ele foi colocado no almoxarifado.
--
--   2) Registro manual pela tela, sem vir de planilha nenhuma -- mesma
--      ideia do Controle EXP ("digite um item de cada vez") e dos Itens
--      Débito Direto (material físico sem registro formal ainda). Quando o
--      Robson recebe uma devolução que ainda não apareceu no ERP, ele
--      digita ali mesmo: `qtd_nf` E `qtd_fisico` são gravados com o MESMO
--      número digitado, e a linha já nasce CONFERIDA (`conferido_por`/
--      `conferido_em` preenchidos na hora) -- afinal é ele mesmo, vendo o
--      material físico, quem está registrando. Se depois a NF de verdade
--      for importada com um número diferente pro mesmo (unidade,
--      id_devolucao, cod_produto), `mesclar_devolucao()` atualiza só
--      `qtd_nf` (fase52 já protege `qtd_fisico`/conferido_* de reimportação)
--      -- e a divergência aparece sozinha se o que ele contou no olho não
--      bateu com o que a NF diz.

alter table devolucao_itens add column if not exists localizacao text;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select column_name, data_type from information_schema.columns
 where table_name = 'devolucao_itens' order by ordinal_position;
