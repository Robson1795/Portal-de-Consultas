# Scripts SQL do Portal

Estes arquivos criam e ajustam as tabelas e as políticas de acesso (RLS) no Supabase.

## ⚠️ Onde rodar

Estes scripts rodam **no painel do Supabase**, em `SQL Editor → New query → colar → Run`.

**Não** cole SQL na caixa de editar arquivo do GitHub. As duas telas são parecidas — um campo
de texto onde se cola código e se clica em salvar — mas colar SQL no GitHub substitui o
código do portal.

Foi o que aconteceu entre 28/08 e 02/09/2026: o `index.html` foi sobrescrito três vezes por
scripts SQL. Estes três arquivos são exatamente aqueles scripts, recuperados do histórico e
guardados no lugar certo.

## Arquivos

| Arquivo | Origem | O que faz |
|---|---|---|
| `fichas-tecnicas.sql` | commit de 28/08/2026 | Cria `fichas_tecnicas` (foto, uso, embalagem) e suas políticas |
| `usuarios-permitidos.sql` | commit de 31/08/2026 | Cria `usuarios_permitidos` (aprovação manual de conta) |
| `bobinas-aco.sql` | commit de 02/09/2026 | Cria `bobinas_aco`, `contagem_bobinas`, `editores_bobinas` e suas políticas |

Os scripts são idempotentes (`create table if not exists`, `drop policy if exists`) — é seguro
rodar de novo.

## Ponto de atenção conhecido

Em `bobinas-aco.sql`, a política de `contagem_bobinas` está como escrita liberada para
qualquer conta autenticada (`using (true) with check (true)`). Isso permite que qualquer conta
logada, inclusive uma ainda não aprovada, altere ou apague a contagem física das bobinas.
Pendente de revisão.

## ⚠️ `bobinas-aco.sql` está desatualizado

Este script cria `bobinas_aco` com as colunas `codigo, largura, espessura, peso,
saldo_sistema`. **Não é a estrutura em uso.** O código em produção lê e escreve
`item, descricao, est, dep, localizacao, lote, um, qtd_liquida`.

Em banco já existente o script não faz nada (`create table if not exists`), então
rodá-lo é inofensivo hoje. Mas num banco novo ele criaria a tabela errada e o módulo
de bobinas não funcionaria. A parte de políticas e de `editores_bobinas` do arquivo
continua válida.

Pendente: corrigir o script a partir da estrutura real do Supabase.

## Correção de permissões

O arquivo `corrige-permissoes.sql` fecha o acesso de contas ainda não aprovadas.
Leia os comentários dele antes de rodar: a Parte 0 é um diagnóstico para rodar
primeiro, e a Parte 4 verifica se a correção surtiu efeito.
