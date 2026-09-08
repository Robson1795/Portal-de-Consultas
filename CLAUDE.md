# CLAUDE.md — Portal de Estoque Kingspan Isoeste

Contexto do projeto para qualquer agente de IA ou pessoa que for mexer neste repositório.
Sempre em **português do Brasil**.

**Atualizado:** 08/09/2026
**Mantenedores:** Robson (dono do projeto e admin geral) · Victor Dobner (colaborador)

> Este arquivo é lido automaticamente pelo Claude Code ao abrir a pasta do projeto.
> Não é preciso colar contexto no início da conversa.
> Quando o sistema mudar, atualize este arquivo **no mesmo commit** da mudança.

---

## 1. Visão geral

Portal web de consulta e contagem de estoque para a Kingspan Isoeste, cobrindo oito unidades,
com login individual, permissões por papel,
contagem física em tempo real, fichas técnicas de itens com foto, e um módulo separado para
auditoria de bobinas de aço.

**Estado atual: em desenvolvimento. Ainda não há usuários em operação.**

**Stack:** HTML + CSS + JavaScript puro, sem frameworks e **sem etapa de build** — os arquivos
servidos são o próprio código-fonte. Divididos na Fase 2a (03/09/2026):

| Arquivo | O quê |
|---|---|
| `index.html` | Só a estrutura (~340 linhas) |
| `styles.css` | Todo o estilo, incluindo a casca da Fase 2b |
| `js/config.js` | Constantes, cliente do Supabase, lista de super admins |
| `js/navegacao.js` | Menu lateral, cabeçalho e troca de página por perfil |
| `js/auth.js` | Login, cadastro, aprovação, carga do perfil |
| `js/estoque.js` | Consulta e contagem do estoque geral |
| `js/bobinas.js` | Módulo Bobinas de Aço |
| `js/ocr.js` | Validação de bobina por foto |
| `js/configuracoes.js` | Aba Configurações: administração de usuários (Fase 4) |
| `js/requisicao.js` | Tela Requisição ALM e o cadastro de centro de custo e item (Fase 6) |
| `js/programacao.js` | Programação de Separação e Controle EXP Acessórios — o maior arquivo do projeto (~2.200 linhas) |

São **scripts clássicos, não módulos**, carregados nessa ordem no fim do `body`. O `let`/`const` de
nível superior vai para o escopo lexical global, compartilhado entre os arquivos — é por isso que o
`sb` do `config.js` é visível no `estoque.js`. Trocar para `type="module"` quebraria tudo.
Banco de dados, autenticação e tempo real no Supabase. Publicado no Vercel, versionado no GitHub.

---

## 2. Onde tudo está

| O quê | Onde |
|---|---|
| Portal publicado | https://consulta-estoque-kingspan-araquari.vercel.app/ |
| Repositório | https://github.com/Robson1795/Portal-de-Consultas |
| Projeto Vercel | consulta-estoque-kingspan-araquari |
| Projeto Supabase | ID `muhfzfdynbpzdjconpio` — https://muhfzfdynbpzdjconpio.supabase.co |

---

## 3. Como trabalhar neste repositório

**O repositório é a fonte de verdade do código.** Não a conversa do Claude, não o arquivo no
computador de alguém, não o que está publicado no Vercel.

Fluxo:

1. `git pull` antes de começar.
2. Criar uma branch para a mudança (`git checkout -b assunto-da-mudanca`).
3. Editar os arquivos na pasta, commitar e `git push`.
4. Abrir Pull Request. O Vercel gera um link de preview da branch — testar ali.
5. Aprovado, juntar no `main`. É o `main` que vai para produção.

**Não editar arquivo pela interface web do GitHub, e não colar arquivo inteiro por lá.**
Foi assim que o código do portal foi perdido três vezes (ver seção 12).

### Ativar a trava de pré-commit (uma vez por cópia do repositório)

```
git config core.hooksPath .githooks
```

Isso liga o `.githooks/pre-commit`, que recusa o commit se o `index.html` deixar de ser HTML
(o acidente que apagou o portal três vezes), se aparecer um token JWT ou menção a
`service_role` fora do `index.html`, ou se um `.md` parecer conter senha escrita.

Em falso positivo, `git commit --no-verify` passa por cima — mas leia o aviso antes.

### Regra que não pode ser esquecida

**Script SQL roda no painel do Supabase** (`SQL Editor → New query → Run`), **nunca** no GitHub.
As duas telas são um campo de texto onde se cola código e se clica em salvar — a troca é fácil de
fazer e apaga o portal. Os scripts do projeto ficam em `sql/` (ver `sql/README.md`).

---

## 4. Credenciais — não ficam neste arquivo

Este arquivo é versionado, e no Git o histórico é permanente: senha commitada não se apaga depois.
**Nunca escreva chave, senha ou PIN aqui.** Peça ao Robson quando precisar.

O que é útil saber sem expor valor nenhum:

- A **chave anon do Supabase** está no `index.html` e é pública por desenho. Isso é aceitável:
  a proteção real são as políticas de RLS de cada tabela.
- **Nenhuma senha está no código.** Até 04/09/2026 havia quatro em texto claro no JavaScript
  (`EDIT_PIN`, `PINS_CONTAGEM`, `SENHA_AUDITORIA`) — públicas, bastava Ctrl+U. Hoje:

  | Senha | Onde está |
  |---|---|
  | Contagem, por unidade | `config_unidade.senha_contagem`, editável na aba Configurações |
  | PIN de edição, por unidade | `config_unidade.pin_edicao`, idem |
  | Bobinas (`aço2026`) | **removida na Fase 2b** — o perfil controla o acesso |

  A conferência acontece **dentro do banco**, por função `security definer`: o navegador chama
  `senha_contagem_confere(unidade, tentativa)` e recebe apenas `true` ou `false`. A tabela é
  legível só para admin, então a senha nunca chega ao navegador — de trava contra clique
  acidental ela passou a ser proteção de verdade.

  Unidade sem senha cadastrada **não abre o modo contagem**: falha fechado. Se alguém não
  conseguir entrar na contagem, confira a aba Configurações primeiro — foi o que travou a
  apresentação na unidade 104.

---

## 5. Papéis e permissões

| Quem | O que pode fazer |
|---|---|
| **Admin geral** (Robson) | Tudo: editar estoque de qualquer unidade, aprovar contas, editar fichas, editar bobinas. Entra sem precisar de aprovação |
| **Usuário comum aprovado** | Consulta; participa da contagem física se souber a senha da unidade |
| **Gerente de unidade** (`gerentes_unidade`) | Edita o estoque só da própria unidade. Hoje: Joel (106), David (101), João Ricardo (105) |
| **Editor de fichas técnicas** | Admin + Joel — editam embalagem (caixa master/fracionada) |
| **Editor de bobinas** (`editores_bobinas`) | Admin + Jhonatan Palace, Victor Dobner, Izabella — colam a planilha de bobinas |
| **Novo cadastro** | Fica "aguardando aprovação" até o admin liberar em `usuarios_permitidos` |

### As oito unidades

`101` Anápolis (GO) · `103` Várzea Grande · `104` Vitória de Santo Antão · `105` Cambuí (MG) ·
`106` Araquari (SC) · `107` Loja · `109` *(a confirmar)* · `110` Leme.

**Não existem 102 nem 108.** As UF de 103, 104, 107 e 110 ainda não foram confirmadas, e a cidade
da 109 também não — `rotuloUnidade()` em `js/estoque.js` cobre os três casos e nunca imprime
`Unidade 107 — Loja ()`.

### Localização quer dizer duas coisas diferentes

| Onde | O que é |
|---|---|
| **Usuário** | Localização **é a própria unidade**. Não existe campo separado — a coluna `usuarios_permitidos.localizacao` foi removida em 04/09/2026 justamente para não haver duas verdades |
| **Item de estoque** (`estoque.localizacao`) | O endereço físico no almoxarifado: rua, corredor, prateleira. Ex.: `A-01-01-01`, `CANT B` |

`bobinas_aco.localizacao` segue a segunda definição — é onde a bobina está no pátio.

### Cadastro: unidade e cargo obrigatórios

Quem se cadastra escolhe **unidade** e **cargo**, e as duas são obrigatórias. O cargo é um
**pedido**, não uma concessão: o gatilho `forca_cadastro_neutro` no banco recusa `admin` e força
`aprovado = false`, então escolher cargo no cadastro não dá acesso a nada. Quem libera é o
administrador, na aba Configurações. `Admin` não aparece como opção no cadastro.

### Perfis (Fase 1, 03/09/2026)

A coluna `perfil` em `usuarios_permitidos` passou a ser a fonte de verdade, e o RLS é construído
sobre ela (`sql/fase1-perfis-e-permissoes.sql`).

| Perfil | Vê no menu | Pode |
|---|---|---|
| `consultor` | Consulta de Itens | Consultar |
| `estoque_alm` | Consulta de Itens | Consultar e contar a própria unidade |
| `estoque_aco` | Estoque de Aço | Consultar e contar bobinas |
| `admin` | Tudo + Configurações | Tudo |

**Atualizar planilha** é um nível acima de contar, e continua controlado por `gerentes_unidade`
(estoque, por unidade) e `editores_bobinas` (bobinas). O perfil define o setor; essas tabelas
definem quem carrega planilha dentro dele.

**Super admin** (Victor e Robson) é raiz de confiança fixa no SQL e em `js/config.js`. Só eles
concedem ou removem o perfil `admin`. A aba **Configurações** (Fase 4) administra tudo isso pela
tela, mas não decide nada: toda alteração passa pela função `definir_acesso()` no banco, e o
cadeado 🔒 na linha apenas antecipa o que o banco recusaria. Não é configurável pelo portal de propósito — é o que
impede um admin de criar outro admin.

⚠️ O menu decide o que **aparece**; o RLS decide o que a pessoa **lê e escreve**. Forçar a
exibição de uma página pelo inspetor não dá acesso a dado nenhum.

### Unidade: escrita fechada, leitura aberta — decisão de 03/09/2026

**Contar e editar:** só na própria unidade. `admin` em todas. Vale na tela (o seletor do cabeçalho
só aparece para admin) e no banco (`sql/fase2-unidade-por-usuario.sql`). Cadastro sem `unidade`
**não conta nada** — falha fechado, e o cabeçalho diz para procurar o administrador.

**Consultar:** livre entre as unidades, para qualquer conta aprovada. **Isto é intencional, não é
esquecimento.** Foi decidido para o botão ⇄ "Comparar entre unidades" continuar funcionando —
restringir a leitura o tornaria inútil, e o valor dele é justamente cruzar. É estoque interno da
mesma empresa. Se um dia mudar, saiba o que se perde: o ⇄ passa a mostrar só a unidade da pessoa.

**Login sem e-mail real:** quem se cadastra só com um nome de usuário (sem @) tem o login
convertido para `usuario@portal.kingspanisoeste.local`, para não gastar o limite de e-mails do
Supabase gratuito. Quem tem e-mail real digita o e-mail completo. Por isso os editores aparecem
no banco com o domínio `.local`, e não com o e-mail corporativo.

---

## 6. Banco de dados (Supabase)

Onze tabelas. Os scripts que as criam estão em `sql/` — mas confira a seção 12 antes de rodar.

| Tabela | Para quê | Observação |
|---|---|---|
| `estoque` | Estoque principal, uma linha por item **por endereço** | O mesmo item aparece em vários endereços da mesma unidade — é normal |
| `fichas_tecnicas` | Foto, uso e embalagem por item | Global, não é por unidade. PK: `item` |
| `acessos` | Log de cada login | Preenchido pelo app |
| `usuarios_permitidos` | Aprovação manual de conta | Usuário cria a própria linha com `aprovado=false`; só o admin aprova |
| `gerentes_unidade` | Quem edita o estoque de cada unidade | PK: `unidade` + `email` |
| `contagem_fisica` | Contagem do estoque geral | PK: `item` + `unidade` + `localizacao`. Tempo real |
| `atribuicoes_corredor` | Responsável por contar cada corredor | PK: `unidade` + `corredor`. Tempo real |
| `editores_bobinas` | Quem atualiza a planilha de bobinas | PK: `email` |
| `bobinas_aco` | Saldo do sistema das bobinas | Colunas em uso: `id, item, descricao, est, dep, localizacao, lote, um, qtd_liquida` |
| `contagem_bobinas` | Contagem física das bobinas | PK: `item` + `localizacao` + `lote` — **não** `codigo`. Tempo real |
| `contagem_bobinas_ocr` | Validação de bobina por foto da etiqueta (módulo de OCR) | Colunas: `bobina_id, peso_etiqueta, peso_sistema, localizacao_sistema, localizacao_real, status, alerta_sistema, motivo_alerta, foto_url, operador, criado_em`. `status` é `OK`, `Divergente` ou `OK com ressalva` |

---

## 7. Funcionalidades (estoque geral)

- **Login/cadastro** com aprovação manual; admin entra direto.
- **Multi-unidade:** botões 106 / 101 / 105 trocam a lista.
- **Busca** livre (item, descrição, localização, UM) e dois formatos especiais:
  - `corredor A-B` → endereços tipo `A-01-01-01` cujo corredor está entre A e B.
  - `CANT A-G` → endereços tipo `CANT A`, `CANT B`… até G.
- **Carga inicial:** não existe mais no código. Havia um `SEED_DATA` com 539 itens de estoque
  dentro do JavaScript público — removido em 04/09/2026 (AUDITORIA.md, C1). Carga inicial é
  tarefa de script SQL, rodado uma vez no Supabase.
- **Aviso de gravação falhada:** o cliente do Supabase devolve `{ error }` em vez de lançar
  exceção. Quando uma contagem não grava, o campo fica **vermelho** com o badge `⚠ não salvou` e
  a mensagem do banco no tooltip — nunca verde. Ver `marcarFalhaContagem()` em `js/estoque.js`.
- **Filtros (painel embutido, Fase 3):** localização parcial, UM, padrão de caixa, e o grupo
  "Status do Item" com estoque zerado / com foto / com divergência — combináveis entre si.
- **Paginação (Fase 3):** 10 itens por página por padrão, ajustável para 25, 50 ou 100.
  ⚠️ A impressão renderiza **todas** as linhas filtradas, não só a página visível
  (`imprimindoTudo` em `js/estoque.js`) — sem isso a quebra de página por corredor perderia
  sentido.
- **Ficha do item (🖼️):** foto, uso recomendado, embalagem.
- **Comparar entre unidades (⇄):** o mesmo item nas três unidades, somado por unidade,
  do maior para o menor, com total geral.
- **Padrão de caixas (📦):** quantas caixas master + fracionadas + peças soltas correspondem
  ao saldo do sistema.
- **Impressão:** respeita o filtro atual; com `corredor A-B` ou `CANT A-G`, agrupa, quebra
  página a cada troca de corredor e repete o cabeçalho em cada folha.
- **Modo Contagem (📋, senha por unidade):** estoque físico por item+endereço com diferença na
  hora (✅ / +X / −X), cálculo de caixas, tempo real entre todos na mesma unidade, "quem já
  contou" por pessoa e corredor, responsável por corredor, limpar item ou tudo.
  A senha é liberada uma vez por sessão do navegador.
- **Atualizar dados (admin/gerente):** cola planilha TSV (Item, Descrição, UM, Localização,
  Quantidade); substitui só os itens da unidade selecionada e grava `atualizado_por`.
- **Atualizar estoques em lote (aba Configurações, só admin):** cola **uma** planilha com o
  estoque de **todas** as unidades e o portal separa por unidade sozinho, lendo a coluna de
  unidade do cabeçalho. Três sub-abas: Almoxarifado, SESMT e Aço (bobinas).
  Nada é gravado sem a prévia — quantos itens caem em cada unidade, quais colunas foram
  reconhecidas, e o que foi ignorado e por quê. Unidade que não aparece na planilha **não é
  tocada**; unidade com zero itens é **recusada** (seria o mesmo que apagar).
  ⚠️ A confirmação é um segundo clique na própria tela e **não é o confirm() do navegador**.
  O Chrome oferece "impedir que esta página crie novos diálogos" depois de alguns avisos e,
  marcado isso, `confirm()` devolve `false` na hora: o clique não faz nada e nenhuma mensagem
  aparece — indistinguível de botão quebrado. Aconteceu em 08/09/2026. Ver
  `pedirConfirmacaoLote()` em `js/configuracoes.js`. **Não troque de volta por `confirm()`.**
  ⚠️ A gravação é uma chamada a `substituir_estoque()`/`substituir_bobinas()`
  (`sql/fase12-substituir-estoque-em-lote.sql`), que rodam **numa transação**: falha qualquer
  linha, nada muda. Foi o que fechou o item A2 da auditoria — antes o `delete` e o `insert`
  eram duas chamadas do navegador, e uma falha no meio deixava a unidade sem estoque.
  A coluna de unidade é achada por sinônimo (Unidade, Estab, Estabelecimento, Est, Filial), e a
  **UM é resolvida antes** — em português "unidade" é ambíguo, e sem essa ordem uma coluna "Un"
  de unidade de medida seria lida como estabelecimento.

---

## 8. Requisição ALM

Rascunho para lançamento no **CD1406 do Datasul**. **Não abre requisição no Datasul** — a pessoa
monta o pedido no portal, ele fica registrado, e um botão abre o e-mail já preenchido para o ALM
da unidade, que lança lá.

Disponível para **todos os perfis**: qualquer conta aprovada pode pedir material.

| Tabela | Para quê |
|---|---|
| `requisicoes_alm` | Cabeçalho: unidade, solicitante, centro de custo, narrativa, status |
| `requisicoes_alm_itens` | Itens do pedido. Duas tabelas porque um pedido leva vários itens, como no CD1406 |
| `centros_custo` | Lista de centros de custo. Escrita só para admin |
| `itens_requisicao` | **Catálogo**, não estoque: serve para pedir item que a unidade ainda não tem. A tela oferece o catálogo **mais** os itens do estoque da unidade |
| `config_unidade` | Por ora, os e-mails do ALM de cada unidade |

**Quem vê a requisição:** o autor, o `estoque_alm` da unidade e o admin. Um consultor não vê o
pedido de outro.

**Por que o e-mail sai pelo Outlook da pessoa.** Não existe servidor neste projeto — enviar por
conta própria exigiria uma Edge Function no Supabase mais um provedor de e-mail com chave de API.
O caminho atual tem uma vantagem real: o pedido sai do e-mail de quem pediu, então o ALM responde
direto. E como a requisição também fica gravada, o ALM a vê no portal mesmo que o e-mail não saia.

⚠️ **Limite do `mailto`:** alguns clientes cortam URL muito longa. Acima de ~1900 caracteres a
tela avisa que o e-mail pode sair truncado. Pedido com muitos itens: melhor o ALM abrir no portal.

**Importar do Excel ou CSV.** No modal **Cadastros** há a opção de colar as células copiadas do
Excel (Ctrl+C já sai separado por tabulação) ou escolher um arquivo `.csv`, lido no próprio
navegador. O separador é detectado sozinho — tabulação, ponto e vírgula ou vírgula —, o cabeçalho
é pulado, código repetido resolve pelo último e linha sem código é ignorada, com aviso de quantas.
Formato: centro de custo é `Código, Descrição`; item é `Código, Descrição, UM`.
Não há biblioteca de `.xlsx` de propósito: colar resolve o caso do Excel, e uma dependência a mais
por CDN seria peso sem ganho.

**Centro de custo e item vêm de lista cadastrada, não de texto livre** — texto livre gera "1406",
"CC1406", "1.406" e "cd1406" para a mesma coisa. Só admin cadastra, pelo botão **Cadastros** na
própria tela de Requisição.

---

## 9. Módulo "Bobinas de Aço"

Aba separada, por um link acima da tabela principal. **Não há senha aqui** — a de
bobinas saiu na Fase 2b e quem controla o acesso é o perfil (`estoque_aco` ou `admin`).

- **Planilha de entrada:** TSV com 8 colunas nesta ordem — Item, Descrição Item, Est, Dep,
  Localizacao, Lote, Un, Qtd Liquida. Cola direto da planilha da empresa.
- **Tabela:** todas as colunas + Saldo Físico (editável) + Divergência + Saldo Ajustado.
- **Cards:** total auditado, com divergência, OK.
- **Tempo real** igual à contagem geral.
- **A tela mostra só a unidade selecionada** (`.eq('est', unidadeAtual)` em `loadBobinas()`), e
  trocar a unidade no cabeçalho recarrega a lista. Até 08/09/2026 mostrava as bobinas de todas
  as unidades juntas, com o endereço de outra fábrica no meio da contagem.
- ⚠️ **A carga é paginada de mil em mil, e a paginação não é enfeite:** o PostgREST devolve no
  máximo 1.000 linhas por requisição e **não avisa** que cortou. Sem o laço de `.range()` a
  tela mostrava as primeiras mil de 3.436 e parecia completa. Não simplifique para uma
  consulta só.
- Ao colar a planilha, a **substituição é por unidade**: `substituir_bobinas()`
  (`sql/fase15-bobinas-por-unidade.sql`) apaga e repõe apenas as unidades presentes na planilha,
  numa transação. **Unidade que não aparecer não é tocada** — antes o `delete` levava a tabela
  inteira, então colar a planilha de uma unidade apagava as bobinas de todas as outras, e isso
  só apareceria no inventário. Linha sem a coluna `Est` faz a função **recusar a planilha
  inteira**: sem ela não há como saber de qual unidade é a bobina, e adivinhar manda a linha
  para a tela de quem não tem nada com ela.

---

## 10. Módulo de validação por OCR (bobinas)

Entrou em 03/09/2026. Botão **"Registrar contagem por foto"** na página de bobinas.

Fluxo: a pessoa fotografa a etiqueta da bobina no pátio → **Tesseract.js** (carregado por CDN,
roda no próprio celular, sem custo de API) extrai o texto → `acharCodigoBobina()` e
`acharPesoEtiqueta()` garimpam código e peso do texto bruto → compara com o saldo do sistema →
mostra um veredito e grava em `contagem_bobinas_ocr`. Divergência dispara
`dispararAlertaBobina()`.

Tudo vive em `js/ocr.js` (317 linhas). Funções: `abrirValidacaoBobina` · `lerEtiquetaComOcr` ·
`acharCodigoBobina` · `numeroDaEtiqueta` · `acharPesoEtiqueta` · `bobinasDoItem` ·
`mostrarVeredito` · `salvarValidacaoBobina` · `dispararAlertaBobina`.
A chave de bobina é `chaveBobina(item, localizacao, lote)`, em `js/bobinas.js` — não só o item.

### Auditado em 04/09/2026

O módulo foi lido de ponta a ponta e rendeu **nove achados (O1–O9), na `AUDITORIA.md`**. Os dois
graves foram corrigidos no mesmo dia:

- **O peso era lido errado em quase toda bobina real.** O regex casava no máximo três dígitos,
  então `4820 KG` virava 820 e `12480 KG` virava 480 — e o veredito automático acusava
  divergência com um número plausível na tela. Hoje `numeroDaEtiqueta()` decide milhar ou
  decimal pela posição do separador, e `acharPesoEtiqueta()` prefere o número que vem depois de
  PESO/LÍQUIDO. **Não use `parseNum()` para peso de etiqueta:** ele apaga todo ponto e
  multiplicava `1234.56` por cem.
- **O `insert` podia falhar em silêncio** e a tela dizia "Registrado!" em verde — o mesmo item
  A1 da auditoria, já corrigido nos outros módulos e esquecido neste.

Duas coisas seguem pela metade, de propósito:

- **Veredito com vários lotes.** A mesma bobina existe em vários lotes; antes o código usava
  `find()` e comparava contra o primeiro. Agora, com mais de um lote, o veredito automático é
  **suprimido** e os lotes são listados. Corrigir de verdade exige campo de lote no modal e na
  tabela `contagem_bobinas_ocr`.
- ⚠️ **O balde `fotos-bobinas` não existe no Storage.** Conferido em 04/09/2026: a API responde
  `Bucket not found`, e toda foto de etiqueta tirada até hoje foi descartada. A tela agora avisa
  que a foto não foi guardada, mas **falta criar o balde** (Storage → New bucket →
  `fotos-bobinas`).

O RLS de `contagem_bobinas_ocr` deixou de ser aberto na Fase 1: leitura exige conta aprovada e
escrita exige perfil `estoque_aco` ou admin.

---

## 11. Avisos técnicos

- **Supabase Free:** o projeto pausa sozinho após 7 dias sem uso; reativar no painel.
- **Sem backup automático.** Export manual de todas as tabelas (`Table Editor → Export`, CSV) de vez
  em quando. O CSV salva os **dados**; a **estrutura** está em `sql/`. Os dois juntos permitem
  refazer o banco.
- **Vercel Hobby:** nominalmente só para uso não-comercial.
- **Cache do navegador:** depois de publicar, sempre Ctrl+F5 antes de concluir que não funcionou.
- **O Vercel serve a raiz do repositório.** Tudo que entra no `main` fica acessível por URL
  pública — conferido em 03/09/2026, quando `/sql/bobinas-aco.sql` respondia HTTP 200 no
  endereço do portal. O `.vercelignore` exclui `*.md`, `sql/`, `.githooks/` e `.claude/` do
  deploy. **Ao criar arquivo novo que não deva ser público, confira se ele está coberto por
  esse arquivo.**

---

## 12. Problemas conhecidos e pendências

### Já resolvido — fica registrado para não repetir

**Perda do código (28/08 a 02/09/2026).** O `index.html` foi sobrescrito três vezes por scripts
SQL colados na interface web do GitHub. A última versão boa no histórico era de 27/08, sem os
módulos de bobinas, contagem em tempo real, fichas técnicas e responsável por corredor. O código
real (200.120 bytes) existia **só no deploy do Vercel**, que não estava conectado a este
repositório. Foi recuperado do portal publicado em 02/09 — possível porque é arquivo único sem
build — e conferido byte a byte contra o que o Claude do Robson tinha gerado. Origem do erro:
confundir a caixa de SQL do Supabase com a caixa de editar arquivo do GitHub.

**Segunda deriva, no dia seguinte (03/09/2026).** Poucas horas depois, o módulo de OCR (seção 9)
foi desenvolvido e publicado direto no Vercel, existindo em nenhum commit — 379 linhas. Foi
percebido ao comparar o tamanho do arquivo no ar (218.464 bytes) com o do `main` (200.120) e
recuperado antes do primeiro push, que o teria apagado do ar. **Origem: o Vercel ainda não
estava ligado ao repositório, então publicar e versionar eram dois atos separados.**

**Resolvido em 03/09/2026:** o Vercel foi conectado a este repositório e a ligação foi conferida
por fora — o arquivo servido pelo portal e o `index.html` do `main` têm o mesmo md5. Publicar e
versionar passaram a ser o mesmo ato: `push` no `main` vai ao ar em cerca de 10 segundos.

**Fechados em 04/09/2026** (o banco foi sondado pela API, não é conferência de memória): a
escrita aberta no `estoque`, a leitura liberada para conta não aprovada, o log `acessos` visível
para todos, as senhas em texto claro no código, o `SEED_DATA`, o `sql/bobinas-aco.sql`
desatualizado, a divisão do `index.html` em módulos e a auditoria do módulo de OCR. Detalhe item
por item na `AUDITORIA.md`.

O `sql/bobinas-aco.sql` merece nota: ele não estava só desatualizado nas colunas — **recriava as
políticas abertas**, então rodá-lo depois da Fase 1 reabria a escrita que a Fase 1 havia fechado.
Hoje ele cria só estrutura, e o RLS é assunto dos scripts da Fase 1.

### Aberto

**De painel — destrava o resto, e não é código:**

1. **Rodar `sql/fase11-limpar-contagem-restrito.sql`** no Supabase. Sem ele, "Limpar tudo" está
   travado só na tela, e um inspetor de navegador contorna. O script **substitui** a política
   `for all` de `contagem_fisica` por três (insert, update, delete) — tem de ser substituição,
   porque política permissiva se soma e a aberta anularia a restrita.

2. **Criar o balde `fotos-bobinas`** (Storage → New bucket). Enquanto não existir, toda foto de
   etiqueta do módulo de OCR é descartada — hoje com aviso na tela, mas descartada.

3. **Cadastrar os e-mails do ALM e as senhas de contagem das oito unidades** na aba
   Configurações. Unidade sem e-mail tem o envio da Requisição ALM desabilitado; unidade sem
   senha não abre o modo contagem. Foi o que travou a apresentação na 104.

**De código:**

4. **Veredito do OCR com vários lotes** (O3) — hoje é suprimido em vez de errado; corrigir de
   verdade pede campo de lote no modal e em `contagem_bobinas_ocr`. E **o alerta de bobina não
   tem recorte por unidade** (O7): um consultor de Anápolis recebe o banner de Araquari.

5. **Pessoas com nome fixo no código** (M2): `ADMIN_EMAIL` em `js/config.js` e
   `j.lisboa@kingspanisoeste.com.br` em `js/estoque.js`. Já existe o padrão certo no projeto —
   tabelas como `gerentes_unidade` e `editores_bobinas`. E **os três logos idênticos em base64**
   no `index.html` (M3): 24 KB baixados sem necessidade a cada acesso.

**De operação:**

6. **Hospedagem com ponto único de falha.** O repositório está numa conta pessoal do GitHub e o
   banco num projeto Supabase de conta pessoal, ambos com um único dono. Se aquela conta se
   perder, o acesso ao banco vai com ela e ninguém mais consegue recuperar. Duas melhorias
   baratas: adicionar um segundo membro ao projeto no Supabase (`Settings → Members`) e manter o
   export das tabelas em dia. Vale reavaliar a hospedagem antes de o sistema entrar em uso real.

7. **Dados de produto:** cadastrar mais itens com foto e embalagem em `fichas_tecnicas`; fotos das
   massas vedantes (Chemiseal); aguardando a Multi-Fix sobre catálogo de parafusos com códigos
   internos.

8. **Unidades 101 e 105 sem dados reais** — só a estrutura está pronta.

9. **Confirmar as UF de 103, 104, 107 e 110 e a cidade da 109.** Até então `rotuloUnidade()`
    imprime só o que sabe, em vez de `Unidade 107 — Loja ()`.

---

## 13. Programação de Separação e Controle EXP Acessórios

Entraram em 08/09/2026, vivem em `js/programacao.js` e não estavam neste
documento até 08/09. **Só `estoque_alm` e `admin` veem essas duas páginas**: elas
movem material de verdade, diferente da Requisição, que é só pedir.

### Programação de Separação (três sub-abas)

Cruza as **duas planilhas manuais do PCP** pelo `numero_pedido`:
Programação de Acessórios (os itens) e Pedidos Programados (o agendamento do
caminhão).

| Sub-aba | Para quê |
|---|---|
| **Separação** | Item a item, ordenado pelo caminhão que sai primeiro — não pela ordem em que a planilha foi digitada. É a razão de a aba existir |
| **Endereçamento** | Onde cada item ficou guardado na expedição |
| **Carregamento** | Agrupado por veículo (CARRETA, TRUCK, TRUCK 8,5M) e horário, com o aviso da planilha em destaque e o botão de registrar saída |

Tabelas: `pedidos`, `pedido_itens`, `exp_acessorios`, `registro_saida`,
`log_movimentacao`, e a view **`vw_pedidos_prioridade`**, que calcula no banco
`momento_carregamento`, `minutos_para_carregamento` e `prioridade`
(atrasado / urgente / atenção / no prazo / concluído / sem agenda).
Scripts: `sql/programacao-01` e `-02`.

⚠️ Sem a view a tela **não carrega a lista** — foi o que aconteceu quando o
`programacao-02` ficou sem rodar.

### Controle EXP Acessórios (três sub-abas)

Plataforma própria de entrada e saída dos itens já separados. **Não depende das
planilhas**: o item pode ser digitado direto. Tabela `exp_controle_itens`
(`sql/programacao-03` a `-06`).

| Sub-aba | Para quê |
|---|---|
| **Entrada** | Onde o item foi guardado. A localização por item é o que responde "onde está?" sem procurar |
| **Saída / Conferência** | O mesmo registro muda de status (`na_expedicao` → `retirado`), guardando quem retirou e quando. Nunca apaga: vira histórico pesquisável |
| **Catálogo** | `catalogo_exp_itens`, a planilha do sistema, para ajudar a preencher item, referência e lote |

Duas interfaces para o mesmo registro — "tudo de uma vez" no computador e
"passo a passo" no celular, um campo grande por tela. Entra no passo a passo
sozinho em tela pequena, e a escolha fica salva.

Imprimir e exportar (Excel, CSV, HTML) **respeitam a busca**: para tirar só uma
localização, digite ela na busca antes de clicar.

### Indicador de etiqueta emitida (08/09/2026)

Coluna **Etiqueta** na aba Entrada: ✓ verde para o item cuja etiqueta já saiu,
com a data e quem emitiu no tooltip. Sem isso, quem chega no meio do turno não
sabe o que já foi etiquetado — e etiqueta de novo, ou deixa passar.

**Quem marca é o próprio Imprimir**, porque imprimir a lista *é* o ato de
emitir as etiquetas. Marcar num segundo clique seria mais um passo para
esquecer, e a lista passaria a mentir.

- Marca só as linhas **daquela impressão** (respeita a busca).
- Marca só as que **ainda não tinham** etiqueta: reimprimir não reescreve a
  data da primeira emissão, que é a que responde "desde quando está
  etiquetado?".
- `etiqueta_emitida_em` é `timestamptz`, não `boolean`: a data também responde
  "desde quando" e "quem", que é o que se pergunta quando há divergência no
  inventário. Ver `sql/fase16-etiqueta-emitida.sql`.
- Se a gravação falhar, a tela diz que **a impressão saiu mas a marcação não** —
  senão a pessoa acha que nada aconteceu e imprime de novo.

**Exportar não marca**, só Imprimir. Se a etiqueta passar a sair também do
Excel, isto precisa mudar junto.
