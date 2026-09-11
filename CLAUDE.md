# CLAUDE.md — Portal de Estoque Kingspan Isoeste

Contexto do projeto para qualquer agente de IA ou pessoa que for mexer neste repositório.
Sempre em **português do Brasil**.

**Atualizado:** 11/09/2026 (senhas de tela removidas; sugestão vai pro Teams)
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
| `js/programacao.js` | Programação de Separação, Controle EXP Acessórios e Depósito Benchmark — o maior arquivo do projeto (~2.200 linhas) |
| `js/analise.js` | Análise de Compras: demanda dos pedidos x saldo do almoxarifado (seção 14) |
| `js/notificacoes.js` | Popup de canto: avisa o admin de cadastro pendente, em qualquer tela (seção 21) |

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
| **Usuário comum aprovado** | Consulta. A contagem física é do `estoque_alm` da própria unidade e do admin (seção 22) |
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
| `estoque` | Estoque principal, uma linha por item **por endereço e por depósito** | O mesmo item aparece em vários endereços da mesma unidade — é normal. `deposito` é `alm` ou `sesmt` (seção 15) |
| `fichas_tecnicas` | Foto, uso e embalagem por item | Global, não é por unidade. PK: `item` |
| `acessos` | Log de cada login | Preenchido pelo app |
| `usuarios_permitidos` | Aprovação manual de conta | Usuário cria a própria linha com `aprovado=false`; só o admin aprova |
| `gerentes_unidade` | Quem edita o estoque de cada unidade | PK: `unidade` + `email` |
| `contagem_fisica` | Contagem do estoque geral | Única: `item` + `unidade` + `localizacao` + **`deposito`**. Tempo real |
| `atribuicoes_corredor` | Responsável por contar cada corredor | Única: `unidade` + `corredor` + **`deposito`**. Tempo real |
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
- **Modo Contagem (📋, por cargo — sem senha desde 11/09/2026, seção 22):** estoque físico por item+endereço com diferença na
  hora (✅ / +X / −X), cálculo de caixas, tempo real entre todos na mesma unidade, "quem já
  contou" por pessoa e corredor, responsável por corredor, limpar item ou tudo.
  O botão só aparece para o `estoque_alm` da própria unidade e para o admin.
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

⚠️ **Não é mais de todos os perfis.** Até 09/09/2026 era, de propósito — qualquer
conta aprovada podia pedir material. Em 10/09/2026 o Victor recortou: *"Consultor
apenas consulta de itens, restringir deposito SESMT e requisição ALM"*. Hoje veem
esta tela `estoque_alm`, `estoque_aco` e `admin`; **`consultor` não**.

A trava está nos **dois** lugares, e isso não é redundância: o menu decide o que
aparece (`PERFIS` em `js/navegacao.js`) e o RLS decide o que a pessoa consegue
gravar. A política `"Criar propria requisicao"` da fase6 exigia apenas
`esta_aprovado()`, então tirar a página do menu **não impediria** um consultor de
criar requisição pelo inspetor do navegador. Quem fecha isso é
`sql/fase31-consultor-so-consulta.sql`, pela função `pode_pedir_material()`.
**Se um dia voltar a ser de todos, tem de voltar nos dois** — devolver a página
no menu não devolve a permissão do banco.

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

1. **Rodar `sql/fase32-sugestoes-melhoria.sql`** no Supabase. Sondado pela API em
   10/09/2026: a tabela `sugestoes_melhoria` **não existe** ainda, então clicar em
   Enviar na caixa de sugestões falha (a tela já diz que o script falta). Ficou
   mais urgente depois de 10/09: o tour agora mostra esse botão para **todos** os
   perfis, então é a primeira coisa que um usuário novo vai tentar usar.

2. **Rodar `sql/fase11-limpar-contagem-restrito.sql`** no Supabase. Sem ele, "Limpar tudo" está
   travado só na tela, e um inspetor de navegador contorna. O script **substitui** a política
   `for all` de `contagem_fisica` por três (insert, update, delete) — tem de ser substituição,
   porque política permissiva se soma e a aberta anularia a restrita.

3. **Criar o balde `fotos-bobinas`** (Storage → New bucket). Enquanto não existir, toda foto de
   etiqueta do módulo de OCR é descartada — hoje com aviso na tela, mas descartada.

4. **Cadastrar os e-mails do ALM das oito unidades** na aba
   Configurações. Unidade sem e-mail tem o envio da Requisição ALM desabilitado.
   *(A senha de contagem, que também vivia aqui e travou a apresentação na 104, deixou
   de existir em 11/09/2026 — ver seção 22.)*

**De código:**

5. **Veredito do OCR com vários lotes** (O3) — hoje é suprimido em vez de errado; corrigir de
   verdade pede campo de lote no modal e em `contagem_bobinas_ocr`. E **o alerta de bobina não
   tem recorte por unidade** (O7): um consultor de Anápolis recebe o banner de Araquari.

6. **Pessoas com nome fixo no código** (M2): `ADMIN_EMAIL` em `js/config.js` e
   `j.lisboa@kingspanisoeste.com.br` em `js/estoque.js`. Já existe o padrão certo no projeto —
   tabelas como `gerentes_unidade` e `editores_bobinas`.
   *(Os três logos em base64 dentro do `index.html` — o antigo M3 — saíram em
   10/09/2026: hoje são `logo.png` e `logo-branca.png`, ver seção 16.)*

**De operação:**

7. **Hospedagem com ponto único de falha.** O repositório está numa conta pessoal do GitHub e o
   banco num projeto Supabase de conta pessoal, ambos com um único dono. Se aquela conta se
   perder, o acesso ao banco vai com ela e ninguém mais consegue recuperar. Duas melhorias
   baratas: adicionar um segundo membro ao projeto no Supabase (`Settings → Members`) e manter o
   export das tabelas em dia. Vale reavaliar a hospedagem antes de o sistema entrar em uso real.

8. **Dados de produto:** cadastrar mais itens com foto e embalagem em `fichas_tecnicas`; fotos das
   massas vedantes (Chemiseal); aguardando a Multi-Fix sobre catálogo de parafusos com códigos
   internos.

9. **Unidades 101 e 105 sem dados reais** — só a estrutura está pronta.

10. **Confirmar as UF de 103, 104, 107 e 110 e a cidade da 109.** Até então `rotuloUnidade()`
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

#### A folha impressa é uma ficha por item, não uma tabela (09/09/2026)

O Robson: *"preciso que aumente a letra para visualizar até 03 metros de
altura"* — a folha vai colada no pallet no nível 3 do porta-pallet e é lida do
chão. Numa tabela de doze colunas não cabe letra desse tamanho: a largura da
folha é dividida entre todas as colunas, e sobra pouco justamente para o que
precisa ser lido de longe. Então `montarHtmlExpControle()` passou a gerar **uma
ficha por item** (Imprimir e Exportar HTML usam a mesma função):

- **Código do item em 21 mm**, sozinho na primeira linha, com a quantidade à
  direita em 15 mm. Os tamanhos estão em **milímetros, não em px** — aqui o
  papel é a medida. A conta é a regra de sinalização: altura da maiúscula ≈
  distância ÷ 200, então 3 m pedem 15 mm de maiúscula, que na Arial (maiúscula
  ≈ 0,72 do corpo) dá corpo de 21 mm. O número não é redondo por acaso.
- Descrição em 9 mm; **OP, lote, referência, pedido, status e datas continuam
  na folha**, miúdos (3,5 mm) — esses só são lidos de perto, na conferência.
- `.ficha-topo` usa `flex-wrap`, e não letra menor: item de 8 caracteres mais
  quantidade de 6 dá 183 mm, e na área útil do A4 cabem 178 mm. Sem o wrap o
  navegador quebraria **o código do item** no meio, que é exatamente o que não
  pode ficar ilegível; com ele, a quantidade desce inteira para a linha de
  baixo e o item mantém os 21 mm.
- **Uma folha por PEDIDO** (o Victor, 10/09/2026: *"não separar por item, separar
  por pedido. Se for do mesmo pedido, pode por na mesma pagina. Pedidos
  diferentes, separar por paginas"*). A folha vai colada no pallet, e **o pallet é
  o pedido** — quem separa vê numa folha só tudo o que aquele pedido leva.
  Cabiam 3 a 5 fichas por folha sem critério nenhum, o que obrigava a cortar o
  papel no lugar errado; e a primeira tentativa, de 10/09 pela manhã, separou por
  **item**, o que dava uma folha para cada item do mesmo pallet.
- ⚠️ **Agrupar é obrigatório, não é enfeite.** A carga traz as linhas ordenadas
  por **localização** (o `.order()` de `exp_controle_itens`), então dois itens do
  mesmo pedido guardados em corredores diferentes chegam longe um do outro. Sem
  agrupar, o mesmo pedido sairia em duas folhas **e** uma folha misturaria
  pedidos. O agrupamento é um `Map` por `chavePedidoFolha()`, preservando a ordem
  de aparição.
- **Item sem nº de pedido não é um pedido**: todos caem num grupo único
  (`(sem pedido)`), que sai **por último** — uma folha para cada seria papel
  jogado fora, e deixá-lo no meio empurraria pedido de verdade para trás.
- ⚠️ A regra é `.grupo + .grupo { page-break-before: always }`, e **não**
  `page-break-after` em todo grupo: quebrando ANTES do segundo em diante, o
  primeiro divide a folha 1 com o cabeçalho e **nenhuma folha em branco sobra no
  fim** — com `page-break-after: always` em todos, o último quebra depois de si
  mesmo e o navegador emite uma página vazia. Conferido pelo estilo computado: o
  primeiro grupo dá `auto`, os outros `page`, e as fichas entre si dão `auto`
  (é isso que as deixa dividir a folha).
- **O grupo pode passar de uma folha** (pedido com muitos itens), e por isso ele
  **não** leva `break-inside: avoid` — forçar caberia mal e cortaria letra. Cada
  ficha continua inteira numa folha só (`page-break-inside: avoid`), e o número do
  pedido segue na linha de detalhes de **cada** ficha, então a folha 2 de um
  pedido grande ainda se identifica. O que não repete na folha 2 é o cabeçalho do
  grupo — limite conhecido.
- ⚠️ **`Impresso por` é do GRUPO, não de cada ficha.** Enquanto a folha era por
  item, essa linha estava em cada ficha (o pedido do Robson: *"quando imprimir
  quero que deixe registrado o usuario que imprimiu"*, e cada folha era um item).
  Agora cada folha é um pedido: repetir a mesma linha embaixo de cada item da
  folha gastaria altura sem dizer nada de novo. A data/hora é lida do relógio
  **uma vez** e reusada no cabeçalho e nos grupos — duas chamadas a `new Date()`
  podem cair em minutos diferentes na virada.
- ⚠️ **Acima de 10 folhas o portal pede um segundo clique**
  (`LIMITE_FOLHAS_IMPRESSAO`), e o que conta são **pedidos distintos, não linhas**:
  marcar 30 itens de um pedido só é UMA folha, e avisar "30 folhas" ali seria
  mentira que treina a pessoa a ignorar o aviso. **Não é `confirm()`**: com
  "impedir que esta página crie novos diálogos" marcado, `confirm()` devolve
  `false` na hora e um `if (!confirm(...)) return` deixa de imprimir sem dizer
  nada — indistinguível de botão quebrado (seção 7). Mexer na busca ou na seleção
  cancela a confirmação: o número que ela leu na tela deixou de valer.
- **Alcance da mudança:** só o **Imprimir** e o **Exportar → HTML** da aba
  Entrada, que passam os dois por `montarHtmlExpControle()`. Excel e CSV não
  agrupam (seguem a ordem da tela), e a etiqueta da Trading e a impressão da
  Consulta de Itens são outro código.
- ⚠️ **Comentário de CSS dentro do template literal não pode ter acento grave.**
  O HTML da folha é montado por template string em `montarHtmlExpControle()`, e
  uma crase num comentário **fecha a string** — foi como eu quebrei o
  `js/programacao.js` ao escrever a versão por item. O erro aparece como
  `SyntaxError: Unexpected token '.'`, longe da causa.
- ⚠️ **Comentário de CSS dentro do template literal não pode ter acento grave.**
  O HTML da folha é montado por template string em `montarHtmlExpControle()`, e
  uma crase num comentário **fecha a string** — foi como eu quebrei o
  `js/programacao.js` ao escrever esta mudança. O erro aparece como
  `SyntaxError: Unexpected token '.'`, longe da causa.
- O endereço gigante no fim da folha (quando a busca deixou **uma** localização
  só) continua igual.

**A folha diz quem imprimiu**: `Impresso por <nome> — <data e hora>`, logo
abaixo do título (Robson: *"quando imprimir quero que deixe registrado o
usuario que imprimiu"*). No banco isso já existia — `etiqueta_emitida_por`,
abaixo — mas só da **primeira** emissão e só no tooltip da tela; na folha
colada no pallet não havia nada. Agora o papel carrega a identificação.

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

**Marcar/desmarcar à mão, com caixa de seleção (08/09/2026 — removido em
09/09/2026):** existiu uma versão com caixa de seleção por linha e botões
"✓ Marcar como impresso" / "✗ Desmarcar", só para admin, pensada para etiqueta
que saiu por fora do portal ou lista impressa antes de a coluna existir. O
Robson pediu para tirar assim que a detecção automática de pedido pronto (ver
abaixo) entrou: com o pedido anterior marcado sozinho, a marcação manual
parou de fazer falta. `gravarEtiquetaEmLote(linhas)` (o `.select('id')` como
recibo, os blocos de 100 por causa do tamanho da URL) continua existindo e é
usada só pelo Imprimir — se a marcação manual precisar voltar um dia, a lógica
de gravação em lote já está pronta, só falta a UI de novo.

### Pedido pronto pra etiqueta, detectado sozinho (09/09/2026)

Antes de imprimir, o Robson precisa ter certeza que quem alimenta o Controle
EXP já terminou de colocar todos os itens de um pedido — senão a folha sai
pela metade sem ninguém perceber. Duas tentativas anteriores, as duas
substituídas:

1. Botão manual "Concluir localização" — o Robson pediu para tirar: dava
   trabalho demais precisar clicar toda vez.
2. Caixa de seleção + "Marcar como impresso" (ver acima) — resolvia um
   problema um pouco diferente (etiqueta impressa fora do sistema), não este.

**A solução: detectar a troca de Nº Pedido na própria digitação.** Quem
alimenta o Controle EXP digita item por item para o MESMO pedido — pedido e
localização continuam preenchidos entre um item e o próximo (ver "Duas
interfaces" acima). No instante em que aparece um Nº Pedido **diferente** do
último que ela registrou, dá para concluir sozinho que o pedido anterior
acabou de ficar pronto — ninguém precisa clicar em nada.

- `atualizarPedidoProntoAoRegistrar()`, chamada de dentro de
  `gravarMovimentacaoManual()` (só entrada — uma saída digitada ali é outra
  coisa, não sinaliza nada sobre o pedido anterior nem sobre a planilha
  colada de uma vez, que não tem essa noção de sequência).
- Guarda o resultado em `exp_pedido_status` (`sql/fase17-pedido-pronto-para-
  etiqueta.sql`): uma linha por `(unidade, numero_pedido)`, com quem estava
  logado e quando.
- **Reabre sozinho:** se ela voltar e registrar mais um item para um pedido
  que já tinha sido marcado pronto, a marca é desfeita — óbvio que não estava
  pronto de verdade.
- `ultimoPedidoRegistrado` é reconstruído ao carregar a página (o último
  `criado_em` de `exp_controle_itens`), para a detecção continuar funcionando
  depois de um F5 no meio do trabalho.

⚠️ **O aviso no botão Imprimir foi removido em 09/09/2026** (o Robson: "essa
mensagem pode tirar também, não precisa mais, na hora de imprimir mostrou
isso"). A detecção em si (`exp_pedido_status`) continua rodando por baixo —
só não tem mais nenhum lugar na tela que leia `expPedidoProntoMap` pra
avisar nada. Fica gravado caso um dia sirva pra outra coisa (um relatório de
pedidos prontos, por exemplo), mas hoje é dado que ninguém olha.

### Depósito Benchmark (09/09/2026)

Itens da expedição às vezes ficam guardados fisicamente no espaço do
Benchmark, não no setor de acessórios — contar tudo junto confundia o
inventário (não dava pra saber, só pela tela, onde o item estava de
verdade). O Robson pediu uma segunda tela **"mesmo modelo"** do Controle EXP
Acessórios, reaproveitando o **mesmo Catálogo EXP** como referência.

**Mesma tabela, mesma tela, coluna nova.** Em vez de duplicar
`exp_controle_itens` (e com ela, toda a lógica de gravação, edição por
célula, etiqueta, exportar, imprimir e relatório do PCP em
js/programacao.js — ~800 linhas), a tabela ganhou uma coluna `setor` (`exp`
| `benchmark`, `sql/fase18-deposito-benchmark.sql`). "Controle EXP
Acessórios" e "Depósito Benchmark" apontam pro **mesmo** `elemento` em
`PAGINAS` (`js/navegacao.js`) — é a mesma tela, só o que aparece nela muda.
Mesmo truque já usado pelo Estoque SESMT (reusa `estoqueContent`).

- `setorExpAtual` (`'exp'` ou `'benchmark'`) é trocado por
  `js/navegacao.js` ao abrir cada uma das duas páginas, e lido por
  `linhasDoSetorAtual()` — o único ponto que filtra `progExpControle` (que
  chega da unidade inteira, os dois setores juntos, numa query só) pro que
  aquela tela deve mostrar. `renderExpControle`, `renderConferencia`,
  `renderHistoricoRetiradas`, `montarRelatorioPcp`, Exportar e Imprimir usam
  todos essa mesma função — corrigir o filtro num lugar só corrige nos dois
  setores.
- `gravarMovimentacaoManual()` e a gravação em lote (`gravarExpControle()`)
  gravam `setor: setorExpAtual` na hora de inserir.
- **O Catálogo EXP não ganhou coluna de setor** — de propósito, é o mesmo
  catálogo pros dois (pedido explícito do Robson).
- A senha de entrada (`sql/fase9-senha-exp.sql`, `unidadeExpDesbloqueada`)
  também é a mesma pros dois — é a mesma área física de expedição, mesmo
  "cofre", só o setor dentro dela muda. `gateAlvoPagina` guarda pra qual das
  duas telas ir depois da senha confirmada (o modal é o mesmo pras duas).
- Relatório do PCP: o assunto do e-mail agora diz "Saídas EXP" ou "Saídas
  Benchmark" conforme a tela aberta, pra não virar um relatório misturado
  sem ninguém perceber.

## 14. Análise de Compras (09/09/2026)

O Robson: *"a ideia é eu não deixar faltar material em estoque, e que eu
consiga me antecipar com as solicitações de compra"*. Ele cola todo dia a
planilha dos pedidos que estão entrando pra separação, e a tela responde:
somando **todos** os pedidos, qual item não tem saldo no almoxarifado e
quanto falta comprar de cada um.

Tela: **Análise de Compras** (`js/analise.js`, `sql/fase19-analise-compras.sql`).

**O cálculo, por item:**

| | |
|---|---|
| Qtd. pedida (total) | soma de `Qt. pedida` de **todas** as linhas daquele item, de todos os pedidos |
| Saldo almoxarifado | soma de `estoque.quantidade` do item **em todas as localizações** da unidade |
| Comprar | `max(0, pedida − saldo)` |

- ⚠️ **`Qt. atendida` não entra na conta** — decisão do Robson em 09/09/2026
  ("preciso que olhe só a coluna qtd pedida"). É gravada junto porque vem na
  planilha e ajuda a conferir a linha, mas nenhuma fórmula a usa. Se um dia a
  regra mudar, o dado já está lá.
- **Somar o saldo de todas as localizações é obrigatório:** o mesmo item tem
  uma linha por endereço em `estoque`. Pegar só a primeira mandaria comprar o
  que já está no estoque, em outro endereço.
- **A ordem da lista é a ordem da urgência:** falta primeiro e, entre as
  faltas, o embarque mais próximo na frente (`data_embarque` mínima entre os
  pedidos do item). Não é ordem alfabética — é a ordem em que o material
  precisa chegar.
- Data de embarque é montada por partes (DD/MM/AAAA), nunca por `new Date()`
  na string brasileira — mesmo motivo do `parseDataHoraBR()` do Controle EXP.

**Cada colagem substitui a análise inteira da unidade** (decisão do Robson):
é o retrato do dia, não histórico. A substituição é transacional
(`substituir_analise_demanda`), pelo mesmo motivo de `substituir_estoque` —
se o insert falhar no meio, a análise de ontem continua no lugar em vez de a
unidade ficar sem nada (AUDITORIA.md, item A2).

**Tabela própria, e não `pedido_itens`:** `pedido_itens` é da Programação de
Separação (tem `status_separacao`, quem separou, e é recriada a cada
importação da Planilha A). Misturar faria uma tela mexer no estado da outra
sem querer. `analise_demanda` é só matéria-prima de análise: entra inteira, é
substituída inteira, e ninguém escreve nela pela tela.

**A tela só LÊ o estoque** — não escreve saldo nenhum. Exportar (Excel/CSV)
respeita a busca e o filtro "só o que falta comprar", pra mandar a lista
pronta pra Compras.

### Transferência entre unidades, em vez de comprar (09/09/2026)

O Robson: *"quero que os itens que não tenho, ele me indique de outras
unidades para eu pedir transferência"*. Comprar o que a empresa já tem em
outro galpão é dinheiro jogado fora.

Coluna **"Outras unidades"**: mesmo botão ⇄ da Consulta de Itens
(`.compare-btn`), sem texto resumido na célula -- o Robson pediu pra tirar o
resumo (`103: 18.337 · 105: 2.049 +3`) e deixar só a flecha, "igual ao ALM".
O detalhe (quais unidades têm saldo) vira tooltip do botão; o clique abre
`openCompareModal()`, com saldo e localização de cada unidade. O texto
completo continua indo pro Exportar (arquivo estático, sem botão pra clicar).

**O modal de comparação ganhou uma seção extra, só quando vem da Análise de
Compras:** a lista de pedidos que precisam daquele item, ordenada pelo
embarque mais próximo. O Robson: *"quero que apareça pra quais pedidos
preciso, aí a ideia é eu enviar um print pro responsável do almoxarifado que
vou pedir"* — é o que ele manda por print pra justificar o pedido de
transferência.

- `openCompareModal(itemCode, extraHtml)` ganhou um segundo parâmetro
  **opcional**: HTML pronto que entra depois da tabela de unidades. Só
  `js/analise.js` passa algo (`pedidosDoItemHtml()`, montada a partir de
  `analiseDemanda`); os outros lugares que chamam essa função (Consulta de
  Itens) continuam chamando com um argumento só, e a seção nem aparece.
- Ficou na função existente, e não num modal novo, pra não duplicar a
  montagem da tabela de unidades (mesmo motivo de reaproveitar o modal
  inteiro, ver acima).
- **Rodapé com o total (10/09/2026)**: o Robson, apontando pro fim dessa
  mesma tabela: *"coloque a qtd total que preciso atender faça soma de
  todos os itens"*. `pedidosDoItemHtml()` ganhou um `<tfoot>` somando
  `qt_pedido` de todas as linhas ordenadas. `qt_pedido` é `numeric` de
  verdade (não texto formatado à brasileira, ao contrário de
  `estoque.quantidade`) — a soma usa `Number(l.qt_pedido) || 0` direto,
  **não** o `parseFloat`+troca de vírgula usado noutros lugares deste
  arquivo pra campos de texto; usar aquele padrão aqui teria corrompido
  qualquer quantidade com ponto decimal de verdade.

- **Soma os endereços da mesma unidade**: `estoque` tem uma linha por
  endereço; sem somar, a tela ofereceria transferir só o que está na primeira
  prateleira.
- Unidade com saldo zero não aparece — não serve pra transferência.
- A consulta enxerga as outras unidades porque a leitura de `estoque` no RLS
  só exige conta aprovada, sem filtro de unidade (`fase1c-rls.sql`).
- **Em blocos de 100** (`carregarSaldoOutrasUnidades`): o `in` do PostgREST
  viaja na URL e uma análise cheia tem centenas de itens em falta. O sintoma
  sem isso seria "com 5 itens funciona, com 300 não".

### Anotações por item: "não repor" e observação (09/09/2026)

Dois pedidos do Robson que são a mesma coisa por baixo — anotação **do item**,
por unidade, que sobrevive à troca da planilha (`analise_item_notas`,
`sql/fase20-analise-notas-item.sql`):

| | |
|---|---|
| Botão 🚫 **"não preciso repor"** | *"tem itens que não preciso repor"* — fabricado internamente, vem de outro setor, descontinuado. Poluía a lista todo dia |
| Campo **Observação** | *"se já tem pedido, se já fiz solicitação de compra etc"* — pra não solicitar duas vezes nem esquecer o que já encaminhou |

**Nenhum dos dois mora na `analise_demanda`**, que é substituída inteira a
cada colagem: a anotação sumiria na planilha do dia seguinte, e ele teria que
reescrever "já solicitei compra" todo santo dia.

- **Uma tabela só pras duas**, com `upsert ... onConflict (unidade,
  codigo_item)`: marcar "não repor" num item que já tem observação **não pode
  apagar a observação**, e vice-versa. `gravarNotaItem()` monta a linha
  inteira a partir do que já existe antes de gravar.
- **Reversível**: o botão `🚫 Ver "não repor" (N)` abre a lista dos
  escondidos, cada um com `↺` pra voltar. Esconder item pra sempre por um
  clique errado, numa tela que existe pra **não deixar faltar material**,
  seria o pior tipo de bug silencioso.
- Sem `confirm()` a cada clique: é um item só, é reversível ali do lado, e
  pedir confirmação numa limpeza de lista seria só atrito.
- Ignorado não conta em "sem saldo pra atender tudo" e **não vai no
  Exportar** — ninguém vai comprar ele, então inflaria o número que ela usa
  pra medir o tamanho do problema do dia, e sujaria a lista mandada pro
  Compras.
- ⚠️ O `upsert` pede recibo (`.select()`): sem ele, um upsert barrado pelo
  RLS volta com `error null` e nada gravado — a tela diria "salvo" e o F5
  desmentiria. Mesmo furo do item A1 da auditoria.

### Observação desaparece sozinha quando o item volta a ter saldo (09/09/2026)

O Robson: *"quero que deixe salvo as observações mesmo que eu atualize a
planilha, só sair quando o item estiver em estoque"*. A observação já
sobrevivia à troca de planilha (seção acima) — faltava o outro lado: ela não
podia ficar pra sempre grudada num item que já foi resolvido.

`limparObservacoesResolvidas()` roda a cada carga da tela (depois de saldo e
demanda frescos), acha os itens com `comprar <= 0` que ainda têm observação,
e apaga só a observação (mantém `ignorado` como estava — "não repor" não
depende do estoque estar baixo). Um `upsert` em lote, silencioso: é limpeza
de fundo, não uma ação que a pessoa pediu, então erro de rede aqui vira
`console.warn`, não uma mensagem pra ela.

### Bug: código do item com maiúscula/minúscula diferente entre planilhas (09/09/2026)

O Robson relatou: item `996613I` (2 pedidos, precisa de 2) aparecia com saldo
**0** e mandando comprar, mas o TOTVS mostrava **43** no almoxarifado (print
em anexo). *"Esse item eu tenho, a conta não está certo, favor verificar pra
todos os itens."*

**Causa:** o código estava gravado como `996613I` (maiúsculo) na planilha de
pedidos colada, e como `996613i` (minúsculo) na tabela `estoque` — mesmo
item, letra diferente. Duas comparações diferentes, dois bugs diferentes:

1. **No cliente** (`analiseSaldoMap.get(codigo)`): `Map` do JavaScript
   diferencia maiúscula de minúscula, então o saldo carregado (a tabela
   inteira da unidade, sem filtro por item) nunca era encontrado na hora de
   somar por item.
2. **No banco** (`.eq('item', codigo)` / `.in('item', [...])`): o Postgres
   também diferencia, então uma busca filtrada por código (outras unidades,
   `openCompareModal`) também não achava a linha.

**Correção, nos dois lados:**

- `normalizaCodigoItem()` (`js/analise.js`) — maiúsculo + sem espaço — vira a
  chave de `analiseSaldoMap`, do agrupamento em `agruparAnalise()` e de
  `analiseOutrasUnidades`. Resolve o problema nº 1 por completo: a tabela
  `estoque` é lida inteira (sem filtro por item), então o dado já chega
  certo, só a comparação em JS precisava ignorar a caixa.
- Para buscas **filtradas** no banco (problema nº 2), não dá pra normalizar
  no JS e pronto — o filtro roda no Postgres. Duas soluções, conforme o caso:
  - **Um item só** (`openCompareModal`): trocou `.eq('item', cod)` por
    `.ilike('item', escapeIlike(cod))` — sem `%`/`_`, `ilike` é uma
    comparação exata que ignora maiúscula/minúscula.
  - **Lista de itens** (`carregarSaldoOutrasUnidades`, `.in('item', [...])`):
    não existe um `.in` case-insensitive pronto no PostgREST. A lista de
    busca ganhou a variante minúscula de cada código
    (`[...new Set(pedaco.flatMap(c => [c, c.toLowerCase()]))]`), e o
    resultado é normalizado de volta na hora de juntar no mapa. Blocos
    caíram de 100 para 50 códigos: cada um agora entra até duas vezes na
    lista, e o motivo dos blocos (tamanho da URL do `in`) dobra junto.

### Coluna Observação maleável (09/09/2026)

O Robson: *"pode deixar aqui maleável, dependendo do tamanho do texto aumenta
o tamanho dessa coluna, tem itens que escrevo e não cabe tudo"*.

O campo cresce em tempo real conforme digita (170px a 420px), com a tabela
já preparada pra rolar pro lado (`.scroll-area`) quando isso empurra o
resto. Duas camadas de precisão:

- **Estimativa por caractere** (`larguraObservacao()`) pro tamanho inicial,
  antes mesmo do campo entrar no DOM (é só uma string de HTML nesse ponto).
- **Medição real** (`ajustarLarguraObservacao()` + `medirLarguraTexto()`) —
  um `<span>` invisível fora da tela, com a MESMA fonte do campo
  (`getComputedStyle`), recebe o texto e `offsetWidth` dá a largura exata.
  Refina o tamanho a cada tecla e de novo, pra todos os campos, logo depois
  de desenhar a tabela.

⚠️ **`scrollWidth` de um `<input>` não serve pra isso** — ao contrário de uma
`<div>`, não reflete de forma confiável o texto que passa da largura visível
em todo navegador. Foi a primeira tentativa aqui, e o teste pegou: a largura
não crescia nunca, presa no mínimo. Daí o `<span>` de medição.

### Análise de Compras: acesso restrito, sem senha (09/09/2026)

O RLS original (Fase 19/20) deixava qualquer conta aprovada ver a análise da
própria unidade -- mais aberto do que devia pra dado comercial (o que falta
comprar, pra quem, com que urgência). O Robson: *"quero limitar o acesso
desse para o Joel, eu, Victor, Maiko e Gian do PCP"* + *"essa tela só quero
pra eles"* + *"deixe liberado sem senha pra eles"* (diferente do Controle
EXP Acessórios, que usa senha por unidade).

E, no meio do pedido: *"E os responsáveis de cada unidade"* + *"cada unidade
terá essa aba, só que não misture as coisas"* -- **dois conceitos
separados**, cada um resolvendo uma pergunta diferente:

1. **De qual unidade você vê a análise?** A sua (`minha_unidade()`), ou
   todas se for admin. Isso já existia e não mudou.
2. **Você pode ver a aba, pra começo de conversa?** Só quem está numa lista,
   OU é o responsável daquela unidade específica. É o que esta fase
   adiciona -- `pode_ver_analise_compras(uni)`
   (`sql/fase21-analise-acesso-restrito.sql`): `eh_admin()` OU está em
   `analise_compras_acesso` OU está em `gerentes_unidade` **daquela
   unidade**.

**Por que reaproveitar `gerentes_unidade` em vez de duplicar nomes:** "o
responsável de cada unidade" já é exatamente o que essa tabela guarda (hoje
Joel-106, David-101, João Ricardo-105, Edvaldo-104...). Copiar pra uma lista
nova criaria duas listas pra manter sincronizadas -- cadastrar um novo
responsável de unidade exigiria lembrar de mexer nas duas. `analise_compras
_acesso` é só pra quem precisa ver **sem ser** responsável de unidade
nenhuma (hoje: Joel — já também é gerente da 106, então essa entrada é
redundante mas inofensiva —, Victor e Robson — já são super admin, também
redundante; Maiko e Gian entram aqui quando os e-mails de login deles
chegarem).

- **Sem tela de admin pra editar a lista** — mesmo padrão de
  `gerentes_unidade`/`editores_bobinas`: adiciona por SQL direto no
  Supabase quando precisar. Confirmado com o Explore desta sessão: não
  existe (e nunca existiu) uma UI de "adicionar e-mail" pra nenhuma dessas
  listas neste projeto.
- **`podeVerAnaliseCache`** (`js/analise.js`) é buscado uma vez, em
  `js/auth.js` logo depois de `montarCabecalho()` (que já resolveu
  `unidadeAtual`) e antes de `montarMenu()` — o menu é síncrono e precisa do
  resultado já pronto. `montarMenu()` filtra `'analise'` da lista de
  páginas visíveis se a cache for falsa; `mostrarPagina('analise')` repete a
  checagem como cinto e suspensório.
- A trava por PERFIL (`PERFIS[perfil].paginas`, decide o SETOR — Estoque
  ALM vê a página, Estoque Aço não) e a trava por PESSOA
  (`podeVerAnaliseCache`, decide QUEM dentro do setor) são independentes —
  as duas precisam passar.
- `substituir_analise_demanda()` trocou a checagem de `pode_atualizar_estoque
  (uni)` pra `pode_ver_analise_compras(uni)`: o RLS da tabela só protege
  escrita/leitura direta, não uma função `security definer` chamada por RPC
  — sem trocar ali, alguém sem acesso à aba ainda conseguiria gravar dados
  nela.

### Sugestão de item substituto (09/09/2026)

O Robson: item que o cliente quer (rebite inox, difícil achar fornecedor)
não tinha em estoque, mas ele tinha OUTRO rebite inox da mesma medida — só
que um terceiro rebite, mesma medida mas não inox, **não** deveria ser
sugerido. Botão 💡 na coluna **Substituto**, só pra item **zerado no
almoxarifado** (`saldo <= 0`) e ainda em falta — com algum saldo, o item já
resolve sozinho ou por transferência (coluna "Outras unidades"), sugerir
troca aí só complicaria.

**A regra, em `sugerirSubstitutos()` (js/analise.js):** mesma **medida**
(a parte numérica da descrição, tipo "4,0 X 15MM" — `extrairMedida()`,
regex tolerante a vírgula/ponto e espaço ao redor do X) **e** pelo menos
uma **palavra em comum** fora do tipo do item e da própria medida
(`palavrasQualificadoras()` — tira a primeira palavra, que é sempre o tipo
tipo "REBITE"/"PARAFUSO", e a medida já extraída à parte).

- **Por que "palavra em comum" e não uma lista fixa de materiais**
  (inox/alumínio/galvanizado...): a mesma lógica serve pra qualquer
  categoria de item sem o código ter que conhecer o vocabulário de cada
  uma — "RAL9006" bate com "RAL9006", "316L" bate com "316L", etc., sem
  precisar cadastrar nada disso à parte.
- Candidatos vêm de `analiseEstoqueLista` (estoque da própria unidade, só
  itens com saldo > 0) — carregado junto com o saldo em `carregarAnalise()`
  (a query de `estoque` ganhou a coluna `descricao`, que antes não vinha).
  Ordenados por quantas palavras batem (mais em comum primeiro).
- O modal reaproveita o MESMO `compareModal`/`compareModalBox` de
  `openCompareModal()` (js/estoque.js) — muda só o conteúdo de dentro, não é
  um terceiro modal desenhado do zero.
- Vai no Exportar como texto (`Substituto sugerido`), só pra quem entra no
  botão — pra quem decide comprar ou não já ver a alternativa na planilha
  mandada pro Compras.

### Sugestão de substituto também na Consulta de Itens (09/09/2026)

O Robson: *"use a mesma regra para os itens do ALM para que os consultores
consigam visualizar também"* -- a sugestão de item equivalente (seção
acima) só existia na Análise de Compras, que tem acesso restrito. Consulta
de Itens é aberta a todo mundo, inclusive `consultor`.

**Refatoração pra não duplicar a regra**: `normalizaCodigoItem()`,
`extrairMedida()`, `palavrasQualificadoras()` e `sugerirSubstitutos()`
saíram de `js/analise.js` e foram pra `js/estoque.js` (carregado antes,
disponível pros dois arquivos). `sugerirSubstitutos()` ganhou um terceiro
parâmetro (`listaEstoque`) em vez de ler `analiseEstoqueLista` direto --
quem chama decide a origem: a Análise de Compras passa
`analiseEstoqueLista` (estoque da unidade, já carregado por
`carregarAnalise()`), a Consulta de Itens passa `currentData` filtrado por
`quantidade > 0` (já carregado por `loadData()` -- nenhuma consulta nova ao
banco).

- Botão 💡 na coluna de Ações, só pra item com **quantidade zero**
  (`parseQtd(r.quantidade) === 0`) -- mesmo critério de "zerado" já usado no
  filtro `filtros.zerado`.
- Reaproveita o mesmo `compareModal`/`compareModalBox` do comparativo entre
  unidades (síncrono aqui -- `currentData` já está em memória, sem
  "Carregando..." como o comparativo tem, que precisa buscar do banco).
- Nenhuma trava de perfil: quem já vê Consulta de Itens (todo perfil,
  incluindo `consultor`) vê o botão.

### Solicitação de compra por item (09/09/2026)

Cada item em falta ganha um botão **🛒** na coluna Ação, que abre o e-mail de
solicitação de compra já preenchido — mesmo desenho da Requisição ALM
(seção 8): o `mailto` entrega o rascunho ao Outlook da própria pessoa, então o
Compras responde direto para quem pediu. Não existe servidor neste projeto.

**Destinatário:** `config_unidade.email_compras`, por unidade — cada fábrica
tem o seu comprador. Lido pela função `email_compras_da_unidade()`, no mesmo
padrão de `emails_alm_da_unidade()` e `email_pcp_da_unidade()`: desde a Fase 7
só admin lê `config_unidade` direto, porque a tabela guarda as senhas na mesma
linha. Cadastra-se na aba **Configurações**. **Unidade sem e-mail deixa o botão
desabilitado**, dizendo para procurar o administrador — falha fechado, porque
adivinhar um endereço mandaria a solicitação para o lugar errado sem ninguém
saber. Script: `sql/fase22-solicitacao-compra.sql`.

**O e-mail leva a conta, não só o número:** quantidade a comprar, quanto os
pedidos pedem, quanto tem no almoxarifado, a lista dos pedidos que dependem do
item (ordenada pelo embarque), o primeiro embarque, a observação do
almoxarifado — e, quando existe, **o aviso de que outra unidade tem saldo**,
com quanto e onde. Esse aviso é o ponto: comprar o que a empresa já tem em
outro galpão é dinheiro jogado fora, e o comprador precisa saber disso antes de
comprar, não depois.

- **O botão não aparece habilitado para item que não falta.** O e-mail sairia
  com "QUANTIDADE A COMPRAR: 0", que é um pedido sem pedido. Para comprar por
  outro motivo (estoque mínimo, reposição programada) existe a Requisição ALM,
  que é a tela de pedir sem partir de falta. A trava vale na tela **e** na
  ação, não só no botão.
- ⚠️ **A marca diz "e-mail aberto", não "enviado".** `solicitado_em` e
  `solicitado_por` em `analise_item_notas` registram que o rascunho foi
  gerado; o portal **não tem como saber** se a pessoa clicou em enviar no
  Outlook. A tela usa essas palavras, e existe um **↺** para tirar a marca de
  um clique errado. Chamar isso de "solicitado" seria mentir num campo que
  depois vira decisão de compra.
- **Reabrir o e-mail não reescreve a data.** É ela que responde "desde quando
  este item está pedido?" — mesma regra da primeira emissão da etiqueta no
  Controle EXP.
- **A lista de pedidos é cortada pelo limite real do `mailto`**, não por um
  número fixo: `corpoEmailCompraQueCabe()` tira pedidos um a um até o endereço
  caber em ~1900 caracteres, e o corpo termina com "e mais N pedido(s)".
  Deixar o cliente de e-mail cortar seria pior — ele corta onde der, no meio de
  uma linha, sem dizer que cortou.

**`gravarNotaItem()` passou a gravar só os campos que mudaram**, em vez de
remontar a linha inteira a partir do mapa em memória. Isso não foi arrumação:
do jeito anterior, (a) se a leitura das notas tivesse falhado — o mapa fica
vazio e a falha só vai para o console — gravar uma observação reescrevia
`ignorado: false` e **desmarcava um "não repor"** que existia no banco; e
(b) digitar na observação e clicar direto no 🚫 fazia a segunda gravação
reescrever a **observação antiga**, apagando o texto recém-digitado. O `upsert`
do PostgREST só sobrescreve as colunas que vão no payload, então mandar menos
é mandar certo.

**Trocar de unidade agora recarrega a Análise** (`trocarUnidade()` em
`js/estoque.js`). Faltava o par do Estoque de Aço, e sem ele o admin trocava de
unidade, continuava vendo a lista da anterior, e a partir dali a solicitação
sairia com os dados de uma unidade e o e-mail de outra — e "Substituir análise"
apagaria a análise da unidade **nova**. Era perda silenciosa de dado, não só
tela desatualizada.

---

## Estoque Seguro é do item, não da localização

O Robson (09/09/2026, print do item 144268 em 3 endereços — A-01-06-01,
A-03-01-02, A-03-06-01, cada um com um saldo diferente): "tem alguns itens que
tem em mais de uma localização ai o estoque seguro embaralha um pouco, arrume
isso".

O desenho original (fase12, comentário de lá) guardava o Estoque Seguro **por
linha** (item+localização), de propósito. Fazia sentido enquanto a maioria dos
itens tinha um endereço só, mas quebra pra quem tem vários: cada prateleira
podia acabar com um número diferente (o fase13, por exemplo, preencheu 25% da
quantidade de **cada linha**, não do item somado), e o aviso de estoque baixo
comparava a quantidade de **uma** prateleira com esse número — dava alarme (ou
deixava de dar) errado numa prateleira só, mesmo com o item saudável no total
das três.

Ajuste em `js/estoque.js`:

- `itensAbaixoDoEstoqueSeguro(dados)` soma a `quantidade` do item em **todas**
  as localizações da unidade atual antes de comparar com o
  `estoque_minimo` — usada no card "Estoque baixo", no aviso ao abrir a tela e
  no filtro "Estoque baixo". Todas liam por linha antes; agora leem por item,
  uma vez só (item com 3 localizações não vira 3 alarmes).
- `salvarEstoqueMinimo()` grava o valor em **todas** as linhas do item nesta
  unidade **e depósito** (`.eq('unidade', ...).eq('item', ...).eq('deposito',
  depositoAtual)`, não mais só `.eq('id', id)`), e atualiza os outros campos já
  na tela (`.estmin-input[data-item=...]`) pra não ficar um número na tela e
  outro no banco até recarregar. O recorte por `deposito` é o mesmo motivo da
  seção 15 logo abaixo: sem ele, o mesmo código de item no ALM e no SESMT
  (dois depósitos, mesma unidade) ficaria com um só Estoque Seguro para os
  dois — editar na Consulta de Itens vazaria para o Depósito SESMT.

`sql/fase27-estoque-seguro-por-item.sql` arruma o que já estava divergente no
banco (sobra do preenchimento antigo por linha): unifica as localizações do
mesmo item para o **maior** valor de `estoque_minimo` já cadastrado entre elas
— não inventa número novo, só copia o que já existia pra quem ficou pra trás.

## Compartilhar o modal de comparação/sugestão (09/09/2026)

O Robson, vendo o comparativo entre unidades com a lista de pedidos que
precisam do item: *"preciso de um esquema pra mim copiar essa tabela, isso
facilita eu enviar para o pessoal de outra unidade quando eu estiver
precisando de transferência, até mesmo para eu enviar para compras para eu
justificar que preciso repor o estoque"* — depois, direto: *"um botão de
compartilhar"*.

Botão **📤 Compartilhar** logo abaixo do código do item, presente nos **três**
usos do modal (`compareModalBox` é a mesma caixa reaproveitada por
`openCompareModal` — comparativo + pedidos —, `abrirSugestoesSubstituto` na
Análise de Compras e `abrirSugestoesSubstitutoEstoque` na Consulta de Itens):

- **No celular, `navigator.share()`** abre a caixa nativa de compartilhamento
  (WhatsApp, e-mail, o que estiver instalado) — é o caminho mais direto pro
  que o Robson pediu.
- **Sem isso (a maioria dos navegadores de computador), cai para copiar**
  (`navigator.clipboard.writeText`) e o próprio botão avisa "✓ Copiado! Cole
  onde precisar" por 2 segundos — sem `alert()`, que travaria a tela à toa
  pra uma ação que não precisa de confirmação.
- **Cancelar a caixa de compartilhamento não é erro** (`AbortError`) e não cai
  no fallback de copiar — a pessoa decidiu não compartilhar, ponto.

**`textoDoModal()` lê o próprio HTML já renderizado**, em vez de remontar o
texto a partir dos dados de novo em cada uma das três telas — percorre os
filhos do modal na ordem em que aparecem: título e código viram linha; uma
`<table>` vira um bloco de texto (colunas separadas por tabulação, cola
certo numa planilha); um `<div>` com filhos (o envelope do bloco de "pedidos
que precisam deste item") é aberto por dentro, pra o rótulo da seção sair
antes da tabela dela. Assim o botão funciona nos três usos do modal sem
duplicar a lógica de montagem de cada um — e se o conteúdo do modal mudar um
dia, o texto compartilhado muda junto sozinho.

### 🖼️ Compartilhar como imagem — pro WhatsApp de verdade (09/09/2026)

O Robson: *"faça a opção de compartilhar em html também para whats"*.
Perguntado o que resolveria — WhatsApp não renderiza HTML colado, só texto
puro ou uma imagem — a resposta foi direta: **gerar uma imagem da tabela**.

Segundo botão, **🖼️ Imagem**, ao lado do 📤 Compartilhar, nos mesmos três
usos do modal:

- **`html2canvas`** (carregado só no primeiro uso, mesmo padrão de
  `CDN_XLSX`/`CDN_TESSERACT` em `js/config.js`) tira uma "foto" do
  `compareModalBox` inteiro — cores, negrito, borda e o 🏆 da unidade com
  mais saldo saem exatamente como na tela. Desenhar a tabela célula a célula
  num `<canvas>` à mão reinventaria o que a biblioteca já resolve.
- **Os três botões (fechar, Compartilhar, Imagem) somem só durante a
  captura** (`display:none` nos elementos com `.modal-close` ou
  `.modal-acao-compartilhar`, restaurado logo depois) — ninguém quer print de
  botão clicável na imagem que vai pro cliente ou pro compras.
- **`scale: 2`**: a imagem sai numa tela de celular depois de passar pelo
  WhatsApp (que recomprime), então vale nascer maior que o normal em vez de
  ficar borrada.
- **`navigator.canShare({ files })` antes de `navigator.share()`**: tem
  navegador que compartilha texto mas recusa arquivo — teria que ser
  conferido ANTES de chamar `share()`, senão o erro só aparece depois de já
  ter gerado a imagem inteira.
- **Sem compartilhamento de arquivo** (a maioria dos navegadores de
  computador): baixa o PNG (`comparativo-AAAA-MM-DD.png`) e o botão avisa
  "✓ Baixada! Anexe no WhatsApp" — pra anexar à mão no WhatsApp Web.
- Cancelar a caixa de compartilhamento (`AbortError`) não cai no fallback de
  baixar — mesma regra do botão de texto.

## Etiqueta de localização — só na Trading (09/09/2026)

O Robson: *"agora só para o estoque da trading, pode colocar no lugar de estoque
seguro um botão para impressão de cada item por localização (…) um botão para eu
flegar caso eu queira imprimir a localização de todos de uma vez, aí sai a folha
de cada item"*.

Na unidade **1101 (Trading)** — e só nela — a coluna **Estoque Seguro** vira
**Etiqueta**: caixa de marcação + 🖨️ por linha, e um botão
`🖨️ Etiquetas (N)` na barra. Reaproveita a coluna em vez de criar mais uma
porque a tabela já avisa "arraste para o lado para ver todas as colunas"; e
na Trading o Estoque Seguro não é usado. Fora da Trading nada muda.

- **`etiquetasTrading` é um `Set` de ids**, não um atributo no DOM: a tabela é
  redesenhada inteira a cada filtro, ordenação e troca de página, e o que foi
  marcado na página 1 tem de continuar marcado na volta da página 3.
- **"Marcar todas" age sobre o filtro inteiro, não sobre a página visível** —
  por isso `applyFilterAndSort()` guarda o resultado em `linhasFiltradasAtual`
  (o `render()` só recebe a fatia da página).
- **Trocar de unidade limpa a marcação** (`loadData()`): id de linha é da
  unidade e do depósito; o de antes imprimiria item de outro galpão.
- **Acima de 10 folhas o portal pergunta antes.** Sai uma folha por item, e
  marcar a lista inteira é resma — quem clicou merece saber pela tela, não
  pela impressora.
  ⚠️ **Era `confirm()`, e foi trocado em 10/09/2026.** Num
  `if (!confirm(...)) return` o `confirm()` falha **fechado e em silêncio**:
  marcado "impedir que esta página crie novos diálogos", o Chrome devolve
  `false` na hora, o clique deixa de imprimir e nenhuma mensagem aparece —
  indistinguível de botão quebrado. É o mesmo modo de falha de 08/09/2026 na aba
  de lote (seção 7), e estava aqui desde que a etiqueta nasceu. Hoje a
  confirmação é um **segundo clique no próprio botão**, que passa a dizer
  `⚠️ Confirmar N folhas`, com a explicação em `#etiquetaTradingMsg`. Mexer na
  marcação cancela a confirmação pendente — o número que a pessoa leu na tela
  deixou de valer, e é `atualizarBotaoEtiquetas()` que reescreve o rótulo.
- **O limite é um número só para os dois lugares** (`LIMITE_FOLHAS_IMPRESSAO`,
  em `js/estoque.js`, que carrega antes): é a MESMA regra da etiqueta da Trading
  e do Imprimir do Controle EXP, e dois números iguais em arquivos diferentes
  sairiam de sincronia na primeira vez que um deles mudasse.

A folha usa o mesmo desenho da do Controle EXP (milímetros, não px), **em
paisagem**: **TRADING** no topo, item em 32 mm, descrição em 9 mm, quantidade
em 16 mm e a **localização em 40 mm** entre dois filetes, com `Impresso por
<nome> — <data hora>` no rodapé. Só entram os dados que a planilha da Trading
tem.

**Por que paisagem** (Robson, 09/09/2026): não é só girar o papel. Quem limita
a letra desta etiqueta é a **largura** — o endereço é uma linha só e comprida —
e na horizontal a linha útil passa de 178 mm para 265 mm. Por isso os corpos
subiram junto ao girar; manter os de retrato desperdiçaria exatamente o que a
paisagem deu.

Os 40 mm da localização são medidos, não chutados: `B-01-01-01` neste peso
ocupa 5,98 em (o hífen é ponto de quebra natural), e nos 265 mm úteis da
paisagem qualquer corpo acima de ~44 mm parte o endereço em duas linhas —
`B-01-01-` numa e `01` na outra, que é pior que letra menor. Em 40 mm lê-se a
quase 6 metros, e cada etiqueta ocupa 165 mm dos 190 mm de altura da folha.

---

## 15. Depósitos: Almoxarifado e SESMT (09/09/2026)

O Victor: *"Não existe unidade SESMT. Sesmt seria um novo depósito, onde ficam
materiais de EPI. Todas as telas onde tem a 'unidade SESMT' devem ser
reformuladas como se fossem um depósito, igual funciona o almoxarifado e o aço.
Também deve ser separado pelas unidades de 101 a 1101."*

**Como era, e por que estava errado.** O SESMT era uma **unidade falsa**:
`estoque.unidade = 'SESMT'`, fora de `UNIDADES`, com o seletor de unidade do
topo escondido e `unidadeAtual` trocado por esse código ao abrir a página.
Consequência: existia **um** estoque de EPI para a empresa inteira, e não havia
como saber de qual fábrica era cada luva.

**Como é.** Unidade continua unidade (101…1101) e o depósito é uma coluna à
parte — `estoque.deposito`, `alm` ou `sesmt`. É o mesmo padrão do `setor` de
`exp_controle_itens` (seção 13) e pelo mesmo motivo: o formato do dado é
idêntico e a tela é a mesma, então uma coluna resolve onde uma tabela nova
duplicaria toda a lógica de contagem, filtro, impressão e exportação.
Script: `sql/fase23-sesmt-deposito.sql`.

- `DEPOSITOS` e `depositoAtual` vivem em `js/estoque.js`; `js/navegacao.js`
  troca `depositoAtual` ao abrir "Consulta de Itens" (`alm`) ou
  "Depósito SESMT" (`sesmt`) e remonta o cabeçalho.
- **O seletor de unidade continua funcionando nas duas** — é o ponto da
  mudança. Um crachá laranja ao lado da unidade diz qual depósito está na
  frente, porque as duas telas são a MESMA e as listas se parecem.
- ⚠️ **TODA consulta a `estoque`, `contagem_fisica` e `atribuicoes_corredor`
  tem de recortar por depósito.** As exceções são de propósito e estão
  comentadas no código: a Análise de Compras, a Requisição ALM e a busca de
  descrição do Controle EXP fixam `'alm'` (EPI não atende pedido de cliente
  nem se pede ao ALM). O `update` do Estoque Seguro (seção acima) também
  recorta por `deposito` desde 09/09/2026 — deixou de casar só por `id`
  quando passou a gravar em todas as localizações do item de uma vez.

**As duas armadilhas que isto fechou** — as duas eram perda silenciosa:

1. **`substituir_estoque()` apagava por unidade e nada mais.** Com dois
   depósitos na mesma unidade, colar a planilha do almoxarifado da 106
   apagaria o estoque de EPI da 106 junto, e o sintoma só apareceria quando
   alguém fosse procurar um EPI — dias depois, sem ligação com a colagem.
   Agora o recorte é `(unidade, deposito)`, e o `deposito` vai no payload
   (ausente = `alm`, para uma chamada antiga continuar igual).
2. **A chave da contagem era `item + unidade + localizacao`.** O mesmo item,
   no mesmo endereço, nos dois depósitos, colidiria: contar no almoxarifado
   sobrescreveria a contagem do EPI, e "Limpar tudo" levaria as duas. A chave
   passou a incluir o depósito, nela e em `atribuicoes_corredor`. **O
   `onConflict` do `upsert` no JavaScript tem de casar com a restrição nova** —
   se ficar `item,unidade,localizacao`, o PostgREST recusa a gravação inteira.

**A planilha de EPI agora precisa da coluna de unidade**, igual à do
almoxarifado — antes ela ia toda para a unidade falsa. Sem a coluna não há como
saber de qual fábrica é cada EPI, e chutar mandaria a luva para o galpão
errado. A aba de lote das Configurações lê a coluna por sinônimo, como já fazia
para o ALM.

**As linhas antigas foram apagadas**, e isso foi decidido em 09/09/2026: as
linhas gravadas com `unidade = 'SESMT'` não tinham como ser atribuídas a uma
fábrica (a informação nunca existiu naquele modelo), e o Victor vai colar a
planilha de EPI de todas as unidades pela aba de lote. Deixá-las seria pior que
apagar: com `'SESMT'` fora de `UNIDADES`, nenhuma tela as mostraria, e elas
ficariam ocupando a tabela para sempre sem ninguém conseguir vê-las nem
corrigi-las.

### Requisição ALM: quatro mudanças (09/09/2026)

Pedidos do Victor, na mesma conversa.

**1. Só as requisições da unidade.** `carregarMinhasRequisicoes()` não filtrava
por unidade. O RLS já barrava outra unidade para quem não é admin, mas o admin
via as oito misturadas numa lista só — e o número do pedido não diz de qual
fábrica é. Trocar a unidade no cabeçalho agora recarrega a tela.

**2. Marcar como concluída.** `status` só tinha `rascunho` e `enviada`, então
requisição atendida ficava "enviada" para sempre e a lista só crescia.
`concluida` é um **terceiro estado do status**, e não uma coluna booleana à
parte: os três são mutuamente exclusivos, e um booleano ao lado do status
abriria a porta para "rascunho e concluída ao mesmo tempo" — estado que não
existe e que a tela teria de decidir como desenhar. `concluido_em`
(`timestamptz`) e `concluido_por` respondem "quando" e "quem", que é o que se
pergunta quando alguém diz que não recebeu. Script:
`sql/fase24-requisicao-concluida.sql`.

- **Concluída sai da lista por padrão** — é o ponto de concluir. O botão
  `✅ Ver concluídas (N)` abre o histórico, com `↩ Reabrir` em cada uma. Mesmo
  padrão do "Ver não repor" da Análise de Compras.
- **Rascunho não oferece "Concluir"**: não foi enviado a ninguém, então não há
  o que ter sido atendido. Sai da lista sendo enviado ou excluído.
- Quem já podia editar a requisição pode concluí-la, **inclusive o autor** —
  "recebi o material" é informação dele, e quem concluiu fica gravado.
- O `update` pede recibo (`.select('id')`): sem ele, um update barrado pelo RLS
  volta com `error null` e zero linha afetada, e a tela diria "concluída" com o
  F5 desmentindo. Item A1 da `AUDITORIA.md`.
- ⚠️ **Status novo pede DOIS scripts, e eu esqueci o segundo na primeira vez.**
  O `fase24` criou as colunas, mas `status` tem uma trava desde o `fase6`
  (`check (status in ('rascunho','enviada'))`), então "Concluir" devolvia
  *violates check constraint "requisicoes_alm_status_valido"*. O
  `sql/fase25-status-concluida.sql` refaz a trava com os três valores. **Da
  próxima vez que um status ganhar valor novo neste projeto, procure o `check`
  antes:** existem outros quatro, em `pedidos`, `pedido_itens`,
  `exp_acessorios` e `exp_controle_itens`, todos no padrão
  `<tabela>_status_valido`. A trava é boa e fica — é ela que impede
  "Concluida"/"concluído"/"CONCLUIDA" de virarem quatro estados onde deveria
  haver um.

**3. Pesquisar o item pela descrição.** O `datalist` só tinha o código. Agora
cada opção leva `código · descrição` no texto, e o Chrome filtra o `datalist`
pelo `value` **e** pelo texto — digitar "parafuso" acha o item sem a pessoa
saber o código de cabeça. O `value` continua sendo só o código, que é o que o
resto da tela lê.

**4. Pesquisar o centro de custo pelo nome.** Era um `<select>`, onde digitar
só salta pela primeira letra. Virou campo de texto com `datalist`, que filtra
pelo código e pelo nome. Como agora dá para digitar qualquer coisa, o centro de
custo passou a ser **validado contra a lista** (mesma regra do item: código
inventado só gera retrabalho para o ALM) e o campo fica com a borda laranja
enquanto o que está escrito não bate com nenhum cadastrado.

### Catálogo EXP em lote (09/09/2026)

Quarta aba do "Atualizar estoques em lote": cola uma planilha com o **Catálogo
EXP** de todas as unidades e o portal separa por unidade sozinho, como já fazia
com almoxarifado, SESMT e bobinas. Colunas lidas por sinônimo: Unidade (ou
Estab), Item, Descrição, UM, Depósito, Referência, Lote, Quantidade — em
qualquer ordem. Script: `sql/fase28-catalogo-exp-em-lote.sql`.

⚠️ **Catálogo EXP e Controle EXP são tabelas diferentes, e a confusão entre as
duas é fácil de fazer — eu fiz.** A primeira versão desta aba substituía
`exp_controle_itens`, porque "estoque exp" soa como os itens guardados na
expedição. O pedido era `catalogo_exp_itens`.

| | O que é | Substituir é |
|---|---|---|
| `catalogo_exp_itens` | A **lista de referência** do sistema, que ajuda a preencher item, referência e lote | **Certo.** A planilha do sistema é a verdade, e mesclar deixaria lote de item que já saiu |
| `exp_controle_itens` | O **registro de movimentação**: o que está guardado e o que já foi retirado | **Errado.** É append-only de propósito; guarda quem retirou o quê, mais a marca de etiqueta emitida |

A função `substituir_exp_controle()` do `fase26` foi **derrubada** pelo
`fase27`: nunca foi chamada, e função destrutiva que sobra no banco é pior que
código morto — na próxima leitura ela parece parte do desenho, e alguém a
chama. O `fase26` fica no histórico do repositório se algum dia a substituição
em lote do Controle EXP fizer sentido, mas que seja decisão tomada de novo.

**De quebra, fechou o A2 neste caminho.** A importação do catálogo pela aba
Catálogo do Controle EXP sempre foi duas chamadas do navegador
(`delete` e depois `insert`): caindo a rede no meio, a unidade ficava **sem
catálogo nenhum**. As duas telas — a aba de lote e a importação por unidade —
agora passam pela mesma função transacional. Uma regra de substituição, um
lugar.

- A mensagem de sucesso diz **quantas linhas o catálogo tinha antes**.
  Substituir 4.000 linhas por 12 é quase sempre planilha colada pela metade, e
  o número na frente da pessoa é o que faz ela reparar antes de fechar a tela.
- A permissão é `pode_atualizar_estoque(uni)`, conferida para **todas** as
  unidades antes do primeiro `delete` (Passo 1, mesmo desenho de
  `substituir_estoque`).
- ⚠️ A coluna `deposito` do catálogo é o código de depósito **do Datasul** que
  vem na planilha (DEP, EXP…), e **não** o depósito do portal (`alm`/`sesmt`,
  seção 15). Mesmo nome, coisas diferentes.
- ⚠️ A importação por unidade ainda usa `confirm()`, que o projeto evita
  (seção 7): marcado "impedir que esta página crie novos diálogos", o clique
  não faz nada e nenhuma mensagem aparece. Fica como pendência — a aba de lote
  já usa a confirmação na própria tela.

---

## 16. Tema claro e escuro (10/09/2026)

O Victor: *"Coloque um botão na tela de navegação, no canto superior, para
alternar entre modo claro e modo escuro. Implemente o modo escuro entre todas
as telas."*

Botão no canto direito do cabeçalho, ao lado do avatar. O ícone mostra **para
onde vai**, não onde está: 🌙 no claro (clique para escurecer), ☀️ no escuro.
Mostrar o estado atual é a fonte clássica de confusão nesse botão.

### O trabalho não foi o botão, foi centralizar as cores

O portal tinha **9 variáveis no `:root` e 166 cores fixas espalhadas** — 87 no
`styles.css` e 79 em HTML/JS. Um tema escuro em cima disso deixaria caixa
branca acesa e texto ilegível em metade das telas. Então primeiro as cores
viraram **tokens**, e o tema escuro é só redefinir os mesmos nomes:

```
:root { --panel: #ffffff; ... }
:root[data-tema="escuro"] { --panel: #172230; ... }
```

29 tokens. Os nomes dizem o **papel**, não a cor (`--ok-fundo`, não
`--verde-claro`): no escuro o "verde claro" deixa de ser claro, e o nome
viraria mentira. Regra para telas novas: **use os tokens.** Cor fixa aparece
como mancha clara no tema escuro, que é o próprio sinal de que passou reto.

### Os quatro tokens que não são óbvios

| Token | Para quê |
|---|---|
| `--blue` | o azul como **fundo** (cabeçalho, botão primário, menu ativo). No escuro fica **escuro** (`#1f5fa8`), para o texto branco em cima continuar legível |
| `--blue-texto` | o azul como **texto/borda**. No escuro **clareia** (`#7db8f5`), senão desaparece no fundo escuro |
| `--sobre-acento` | texto que fica sobre qualquer cor de destaque (azul, dourado, verde de ação). **Branco nos dois temas** — é token, e não `#fff` cru, para a varredura de cores não confundir com esquecimento |
| `--ok-acao` / `--aviso-acao` | fundo de **botão** de ação, com texto branco. Os tons `-borda` são claros e não servem: era o que deixava "OK, bate tudo" em 3,0:1 **mesmo no tema claro** |

⚠️ **`--blue` e `--blue-texto` existem porque um token não faz os dois papéis.**
Antes de separar, o menu ativo ficava com texto escuro sobre azul no tema
escuro (2,49:1) — em todas as nove telas.

### ⚠️ Impressão é sempre clara, e isso precisou de um bloco próprio

A Consulta de Itens e o Estoque de Aço imprimem a **própria página**
(`window.print()`, não uma aba nova), e as regras de `@media print` usam
`var(--ink)` e `var(--muted)`. No tema escuro `--ink` é quase branco: a folha
sairia com **texto branco em papel branco** — ilegível, e só se descobriria na
impressora.

Por isso existe um `@media print` que reescreve **todos os 29 tokens** para
valores claros, inclusive com o tema escuro ligado. Vale para os dois que são
usados hoje e para qualquer regra de impressão que apareça amanhã. Os fundos de
estado viram branco: no papel quem separa a informação é o texto e a borda, não
a mancha de cor, que sai cinza na impressora preto e branco e só suja a folha.

As folhas geradas em **aba nova** (etiqueta da Trading, ficha do Controle EXP)
não dependem disso — são outro documento, sem o `data-tema` — e continuam com
as cores próprias em milímetros. Nenhuma delas foi tocada.

### Detalhes que evitam defeito

- **O tema é aplicado por um script no `<head>`**, antes de a tela ser pintada.
  Nos scripts do fim do `body` cada carregamento daria um **flash branco** antes
  de escurecer — o defeito clássico de tema escuro.
- **Sem preferência salva, segue o sistema** (`prefers-color-scheme`): quem já
  usa o computador no escuro abre o portal no escuro, sem descobrir o botão.
  A escolha explícita fica no `localStorage` e vence o sistema.
- **`color-scheme: dark`** no tema escuro: é o que faz o navegador desenhar
  barra de rolagem, menu de `select` e calendário no escuro. Sem isso, `input` e
  `select` aparecem brancos por conta própria.
- **O logo é PNG com fundo claro embutido** e apareceria como retângulo branco.
  Leva um `filter: brightness(.92)` — só ele, não as fotos de item da ficha
  técnica, que precisam ser vistas como são.
- **Cores de sinalização não seguem o tema**, de propósito: as cores de veículo
  (amarelo, rosa, verde, azul) e o amarelo do pallet pendente identificam coisa
  física, e mudariam de significado se mudassem de tom.

### Como isto foi conferido

Um auditor de contraste rodado **dentro da página**, nas 9 telas, nos 9 modais
e no login, nos dois temas: para cada elemento com texto, compõe o fundo real
(subindo a árvore, misturando transparência e média de gradiente) e calcula o
contraste WCAG. Resultado final: **zero texto abaixo de 4,5:1 e zero mancha
clara**, nos dois temas.

O auditor pegou seis defeitos que passariam numa conferência a olho:

1. `background: white` (palavra-chave) — o primeiro regex só via hex.
2. `#fff` trocado por `--panel` **também onde era `color:`** — texto escuro
   sobre azul, nas nove telas.
3. Regras acrescentadas **depois** do primeiro `@media print` no arquivo, que a
   primeira passada pulou inteiras (o crachá do depósito acendia).
4. Os dois botões grandes da validação de bobina, em 2,8:1 e 2,2:1.
5. `background:white` e `color:var(--blue)` **inline** no `index.html`.
6. O verde do "Sincronizado", que usava tom de borda em texto (3,23:1).


### A logo saiu do base64 e ficou transparente (10/09/2026)

O Victor mandou as duas versões (colorida e branca) e pediu: *"Tem como manter
a logo com o fundo transparente? Sem ser nesse quadrado branco. Além disso
alinhe ela no centro da aba de navegação. Na tela de login, também deixe ela
sem esse quadrado branco e com fundo transparente. Coloque também o botão de
alternar modo claro/escuro na tela de login."*

**O quadrado branco era do ARQUIVO, não do CSS.** O PNG embutido era 205×66
RGBA e **100% opaco** — o branco estava na imagem. Tirar o `.logo-card` não
resolveria nada: apareceria o retângulo do próprio arquivo. Foram gerados dois
arquivos de verdade:

| Arquivo | Como foi feito | Onde entra |
|---|---|---|
| `logo.png` | fundo removido por **preenchimento a partir da borda** | sidebar, tema claro |
| `logo-branca.png` | o colorido virou branco, o branco virou vazio | os dois heros (azuis) e a sidebar no tema escuro |

- **Preenchimento a partir da borda, e não "todo branco vira transparente":**
  as letras ISOESTE são **brancas dentro do oval azul** e virariam buracos. Só
  sai o branco ligado ao lado de fora.
- **As beiradas foram suavizadas contra branco.** Cortar seco deixaria um halo
  claro em volta, visível justamente no tema escuro. Nesses pixels o alfa é
  estimado por `1 - min(r,g,b)/255` e a cor é desmultiplicada do branco — a
  conta inversa da composição original.
- **Duas imagens, e não um filtro CSS.** `filter: brightness(0) invert(1)`
  clareia tudo e funde o oval azul do ISOESTE com as letras brancas: vira uma
  bolha ilegível (conferido no navegador). Logo monocromática precisa das
  letras **recortadas**.
- **Qual aparece depende do FUNDO, não do tema:** os heros do login e da conta
  pendente são gradiente azul nos dois temas, então ali vale sempre a branca
  (`logo-sempre-branca`); a sidebar é `var(--panel)`, que muda, então a logo
  troca junto (`logo-tema-claro` / `logo-tema-escuro`).
- ⚠️ **As três regras da troca por tema TÊM de vir depois de `.logo`** no
  `styles.css`, e não junto do resto do tema escuro no topo. `.logo { display:
  block }` e `.logo-tema-escuro { display: none }` têm a **mesma
  especificidade** (uma classe cada), e nesse empate vale a última do arquivo:
  com o bloco no topo, as **duas** logos da sidebar apareciam ao mesmo tempo no
  tema claro. Pego comparando `getComputedStyle` nos dois temas.
- A regra que estava ali antes mirava `.logo-topo` e `.logo-login`, **classes
  que não existem no HTML** — erro meu do commit do tema, e a razão de o
  quadrado branco continuar aparecendo no escuro.

**O botão de tema também está na tela de login** (`#temaToggleLogin`). Os dois
botões chamam o mesmo alternador e `aplicarTema()` acerta o ícone dos dois:
quem escurece no login já entra no portal com o botão certo.

### ENTER confirma em todo campo de senha (10/09/2026)

O Victor: *"Em todos os campos onde pode inserir a senha, incluindo a tela de
login, não está confirmando ao apertar ENTER, somente ao clicar no botão."*

Já funcionava em dois (`contagemPinInput`, `expGateSenhaInput`) e faltava em
três: **login** (usuário, senha e, no cadastro, o nome completo), **PIN de
edição** e a **linha de senhas da aba Configurações**.

- O Enter **clica no botão** em vez de repetir a lógica. Duplicar a chamada
  daria dois caminhos para a mesma validação e a mesma mensagem de erro — e um
  deles ficaria para trás na próxima mudança.
- Na aba Configurações o Enter salva **aquela linha**: são seis campos por
  unidade e um Salvar por linha, então o clique tem de sair do `Salvar` do
  `<tr>` onde o Enter foi digitado, não de um botão genérico — senão gravaria a
  unidade errada.
- Os `<select>` de unidade e cargo ficam de fora: ali o Enter é do próprio menu
  do navegador.

### Controle EXP → Entrada: escolher o que imprimir (10/09/2026)

O Victor: *"Na tela 'controle EXP acessórios', aba entrada, coloque caixas de
seleção para poder escolher os materiais para imprimir. Coloque também uma
opção para imprimir tudo."*

Caixa de seleção por linha, mais a caixa do cabeçalho que marca **todos os que
estão na busca**. O botão diz o que vai sair: `🖨️ Imprimir tudo (N)` sem nada
marcado, `🖨️ Imprimir marcados (N)` com seleção.

- **`expCtrlSelecionadas` é um `Set` de ids**, não um atributo no DOM: a tabela
  é redesenhada inteira a cada tecla da busca, e o que foi marcado antes de
  filtrar tem de continuar marcado depois. Mesmo motivo de `etiquetasTrading`
  na etiqueta da Trading.
- **A seleção é um recorte DENTRO da busca, não em vez dela.** Item marcado que
  a busca escondeu não sai na folha — senão a folha traria item que a pessoa
  não está vendo na tela. Filtrar e desfiltrar devolve o que estava marcado.
- **Nada marcado = imprimir tudo**, de propósito: era assim antes de a caixa
  existir, e quem só quer a folha do dia não precisa marcar nada. É essa a
  "opção para imprimir tudo" pedida, junto com a caixa do cabeçalho.
- **Trocar de setor ou de unidade limpa a seleção** (`renderExpControle` poda
  os ids que não estão mais na tela): marcar no Depósito Benchmark e voltar pro
  Controle EXP imprimiria item do outro depósito. **A busca não poda nada.**
- **A caixa do cabeçalho fica indeterminada** na seleção parcial. Vazia, com
  itens marcados na lista, o próximo clique pareceria "marcar tudo" quando na
  verdade limpa.
- **A folha diz que é um recorte** (`— N item(ns) escolhido(s) na tela`, ao lado
  da busca no subtítulo). Ela vai colada no pallet: folha parcial sem dizer que
  é parcial passa por lista completa na conferência.
- **Imprimir continua sendo o ato de emitir a etiqueta**, e agora marca só os
  itens que realmente saíram no papel. Depois de imprimir, a seleção é limpa —
  deixá-la marcada convidaria a reimprimir o mesmo pallet no clique seguinte.
- Exportar usa o mesmo recorte: é a mesma listagem, só salva em vez de
  impressa. Se um dia a etiqueta passar a sair do Excel, a regra de marcação
  tem de mudar junto (já valia antes).

**Dois defeitos antigos apareceram neste caminho e foram corrigidos:**

1. **`msg` não existia no handler do Imprimir.** Ele escrevia
   `msg.textContent = ...` sem declarar `msg`, e não há `msg` global neste
   projeto: **toda** impressão que marcasse etiqueta estourava `ReferenceError`
   na hora de escrever o resultado. A etiqueta era gravada (o ✓ aparecia
   depois do render), mas a mensagem — inclusive a de **falha** ao marcar —
   nunca chegava à tela. O `#expEtiquetaMsg` existe no HTML para isso e não era
   lido em lugar nenhum.
2. **O ordenador estava ligado a TODO `thead th` do documento.** Clique no
   cabeçalho de qualquer outra tabela do portal caía nele: `th.dataset.key`
   vinha `undefined`, as flechas da Consulta de Itens eram apagadas e
   `th.querySelector('.arrow')` era `null` — `TypeError`. Ficou inofensivo
   enquanto ninguém clicava nesses cabeçalhos; a caixa "marcar todos" torna
   esse clique rotina. Agora é `#dataTable thead th`.

---

## Filtro de Localização passou a filtrar ao digitar (10/09/2026)

O Robson, na contagem, digitando "CANT" no filtro avançado de Localização:
*"quando eu escrever CANT aparecer todos"* — depois *"faça para as outras
localizações também"* e *"deixe bem inteligente"*.

O casamento por trecho já existia (`applyFilterAndSort()`, `.includes()`
sobre a localização em minúsculas) — "CANT" já batia com "CANT A-01" e
"CANT B-03" ao mesmo tempo, sem precisar de tratamento por letra/grupo. O que
faltava era **reagir à digitação**: o campo só valia depois de clicar em
"Aplicar filtros", então a lista continuava mostrando o filtro anterior
enquanto a pessoa digitava — parecia que "não aparecia tudo".

`#filterLocalizacao` ganhou um listener de `input` (mesmo padrão do
`#searchBox`, que já era assim) que atualiza `filtros.localizacao` e
reaplica a cada tecla — nenhuma lista de padrões por prefixo, então vale
igual para "CANT", uma letra de corredor, um código de pallet ou qualquer
outro texto que a planilha tiver. O botão "Aplicar filtros" continua
funcionando (ainda é ele que aplica UM, Padrão e as caixas de status), só
deixou de ser obrigatório para a Localização.

## Depósito Benchmark vira saldo simples (10/09/2026)

Até aqui, "Depósito Benchmark" era o **mesmo modelo do Controle EXP
Acessórios**: mesma tabela (`exp_controle_itens`), mesmo fluxo de
Entrada/Saída-Conferência com pedido, etiqueta e status — filtrado pela
coluna `setor` (ver `sql/fase18-deposito-benchmark.sql`). O Robson, vendo a
tela de "Atualizar estoques em lote" (que já tem Almoxarifado, SESMT,
Catálogo EXP e Aço) com uma planilha de saldo do Benchmark pronta pra
colar: *"deposito benchmark quero usar por aqui, quero que mude a estrutura
igual como é do almoxarifado"*.

Perguntado se a aba antiga (Entrada/Saída/Catálogo do Benchmark, em
Programação) deveria sair ou conviver com a nova, a resposta foi **tirar a
antiga** — não tinha nenhum pedido registrado nela.

**Agora Benchmark é o terceiro depósito**, no mesmo modelo do SESMT
(09/09/2026): item + localização + quantidade, substituído inteiro ao colar
planilha nova, mesma tela de Consulta de Itens.

- `DEPOSITOS.benchmark` em `js/estoque.js`, ao lado de `alm`/`sesmt`.
- `PAGINAS.expbenchmark` (`js/navegacao.js`) passou a apontar pro elemento
  `estoqueContent` (era `expAcessoriosContent`) — o **id da página continua
  `expbenchmark`** de propósito, pra não mexer nas listas de `PERFIS`.
  `mostrarPagina()` ganhou `PAGINA_PARA_DEPOSITO` (`estoque`→`alm`,
  `sesmt`→`sesmt`, `expbenchmark`→`benchmark`) e `expbenchmark` **saiu** do
  bloco que trocava `setorExpAtual` — não é mais a mesma tela do Controle
  EXP Acessórios.
- Aba **Benchmark** nova em "Atualizar estoques em lote" (`index.html` +
  `js/configuracoes.js`): mesmas colunas do Almoxarifado/SESMT (Unidade,
  Item, Descrição, UM, Localização, Quantidade), substitui por
  `(unidade, deposito='benchmark')`.
- `sql/fase29-benchmark-deposito.sql` troca a restrição de `deposito` em
  `estoque`/`contagem_fisica`/`atribuicoes_corredor` (criada no fase23, só
  aceitava `'alm'`/`'sesmt'`) pra aceitar `'benchmark'` também. Coluna,
  índice e chave primária já existiam desde o fase23 — não precisou de mais
  nada estrutural.

**O código antigo (`setorExpAtual === 'benchmark'`) fica no histórico** em
`js/programacao.js`, comentado como obsoleto: nada no menu grava mais
`'benchmark'` ali, então esse caminho nunca mais roda sozinho. Mesmo
princípio já registrado sobre o `sql/fase26-exp-em-lote.sql` do Victor:
função/caminho que sobra é pior que código morto só se alguém ainda o
chamar sem querer — aqui ninguém mais chama. Remover de vez é decisão pra
tomar separada, se confirmar que não faz falta nenhuma.

**A senha por unidade saiu do Benchmark** (achada só ao mesclar com o "Tour
guiado" logo abaixo, que trouxe pra dentro deste arquivo o trecho de
`js/navegacao.js` com o "gate" de senha — antes vivia numa parte do arquivo
que eu ainda não tinha lido nesta sessão). Entrar em "Controle EXP
Acessórios" **ou** "Depósito Benchmark" pedia a mesma senha por unidade
(`abrirGateExp`, `sql/fase9-senha-exp.sql`) antes de abrir a tela — fazia
sentido proteger o registro de pedido/etiqueta do modelo antigo, mas o
Almoxarifado e o SESMT nunca pediram senha nenhuma para o mesmo tipo de
tela. Perguntado, o Robson confirmou tirar a senha do Benchmark:

- O clique no menu ("🏭 Depósito Benchmark") não abre mais `abrirGateExp` —
  vai direto para `mostrarPagina('expbenchmark')`, igual a `estoque`/`sesmt`.
- Trocar de unidade pelo seletor do topo estando no Benchmark também não
  reabre o gate — antes, o `if` que decidia isso incluía `'expbenchmark'`
  ao lado de `'expacessorios'`; sem tirar dali, trocar de unidade pelo
  seletor pediria senha mesmo depois de entrar sem ela, uma inconsistência
  dentro da própria tela.
- `Controle EXP Acessórios` continua pedindo a senha normalmente — só o
  Benchmark saiu do gate.
- A permissão de verdade continua sendo o RLS por unidade/perfil
  (`pode_atualizar_estoque`), igual ao Almoxarifado/SESMT — a senha nunca
  foi a proteção real, só um atrito a mais que deixou de fazer sentido
  quando a tela virou saldo simples.

Conferido no navegador (mocks de `sb.from`/`sb.rpc`, clique real no item do
menu — não chamada direta a `mostrarPagina`): o menu mostra "🏭 Depósito
Benchmark" pros perfis certos (Estoque ALM e Admin, não Consultor — igual
ao SESMT); clicar nele abre a tela direto, sem o modal de senha, com crachá
"🏭 Depósito Benchmark" e `depositoAtual = 'benchmark'`; clicar em Controle
EXP Acessórios ainda abre o modal de senha, pedindo a unidade certa; trocar
de unidade pelo seletor do topo estando no Benchmark também não reabre o
modal; Controle EXP Acessórios continua intacto (`setorExpAtual` fica
`'exp'`, tela própria); colar uma planilha na aba Benchmark do lote monta
blocos com `deposito: 'benchmark'`, e Almoxarifado/SESMT continuam com o
depósito certo (sem regressão). Zero erro de console.

### Referência e Lote, só no Benchmark (10/09/2026)

O Robson, com a planilha real na mão: *"benchmark é um pouco diferente tem
referencia e lote"*. O desenho acima tratou o Benchmark como saldo idêntico
ao Almoxarifado/SESMT (item, descrição, UM, localização, quantidade) — a
planilha real tem duas colunas a mais.

- `estoque` ganhou `referencia` e `lote`, **nullable** — mesmo princípio do
  `deposito`: quem não usa (Almoxarifado, SESMT) fica em branco, sem mudar
  nada pra quem não pediu.
- `prepararLote()` reconhece as duas colunas nas **três** abas (Almoxarifado,
  SESMT, Benchmark), não só na do Benchmark — coluna que a planilha não tem
  simplesmente não aparece no mapa, então não muda nada pra quem não a usa.
- **As colunas Referência e Lote só aparecem na tabela quando
  `depositoAtual === 'benchmark'`** (`mostraColunasBenchmark()`) — mesmo
  padrão do Estoque Seguro/Etiqueta da Trading: mostrar `—` em toda linha do
  Almoxarifado não ajudaria ninguém.

⚠️ **Bug achado ao mexer na função de novo, antes de qualquer um colar a
planilha de verdade**: `substituir_estoque()` tem uma validação própria de
depósito, separada da restrição da coluna —
`if dep not in ('alm', 'sesmt') then raise exception`. O `fase29` corrigiu a
restrição da COLUNA (`estoque_deposito_valido`), mas essa validação de
dentro da função é outro lugar, com a própria lista — ficou pra trás. Sem o
`fase30`, colar planilha no Benchmark falharia com "Depósito desconhecido:
benchmark. Use alm ou sesmt.", mesmo com a restrição da coluna já certa.
`sql/fase30-benchmark-referencia-lote.sql` corrige as duas coisas juntas
(as colunas novas e a validação).

Conferido no navegador: `prepararLote()` com a planilha real (Item,
Descrição, UM, Localização, Referência, Lote, Quantidade) monta os itens com
`referencia`/`lote` certos, inclusive linha com Lote vazio (`null`, não
string vazia); a tabela mostra as duas colunas com `depositoAtual =
'benchmark'` e as esconde com `'alm'`. Zero erro de console.

## 17. Tour guiado do primeiro acesso (10/09/2026)

O Victor: *"Primeiro login fazer um mini tutorial ou um 'tour' pelo portal.
Como tem em alguns jogos onde um pop up foca num menu especifico com uma breve
explicação e ao clicar em próximo foca em outro, etc. Mas coloque também uma
opção para 'pular tutorial' pra quem quiser."*

Vive em **`js/tour.js`**, carregado por último (precisa de `PERFIS`, `PAGINAS`,
`rotuloDoPerfil()` e `escapeHtml()`), e é aberto por `iniciarTourSePrimeiraVez()`
em `js/auth.js`, **depois** de `montarMenu()` — os passos apontam para itens do
menu que antes disso não existem no DOM.

- ⚠️ **Não há lista fixa de passos.** Ela é montada a partir do menu que aquela
  pessoa **realmente tem** (`PERFIS[perfilAtual].paginas`, já filtrado por
  `podeVerAnaliseCache`), lendo rótulo e ícone de `PAGINAS`. Uma lista escrita à
  mão explicaria tela que a pessoa não vê — um consultor receberia a explicação
  da Análise de Compras e ficaria procurando o menu. Hoje o **consultor** vê 14
  passos (a Consulta de Itens rende 7 deles, ver abaixo) e o `estoque_alm`, 19
  ou 20 -- a Análise de Compras tem uma trava por pessoa, além do perfil.
  em `TOUR_EXPLICACAO`; sem frase, o passo usa o rótulo e não quebra nada.
- **O escuro em volta é um `box-shadow` de 9999px no `#tourFoco`**, e não quatro
  divs em volta do alvo: um retângulo com
  `box-shadow: 0 0 0 9999px rgba(0,0,0,.62)` pinta a tela inteira menos ele
  mesmo, então o recorte acompanha o alvo sozinho — só posição e tamanho mudam
  em JS.
  ⚠️ No passo **sem alvo** (a boas-vindas), o retângulo encolhe para nada **no
  centro da tela**, e não jogado para `-9999px`: de lá a sombra de 9999px acaba
  justo na borda e **a tela não escurece nada**. Foi o primeiro jeito, e o
  navegador mostrou.
- **Passo cujo alvo não está na tela é pulado ao andar**, não desenhado no
  vazio: é o que cobre o perfil sem aquele botão e o celular, onde parte do
  cabeçalho não aparece. Elemento escondido tem retângulo de tamanho zero — daí
  a checagem de `width > 0 && height > 0`, não `if (el)`.
- **No celular o tour abre o menu** (que começa fechado) e **devolve como
  estava** ao terminar: metade dos passos aponta para itens do menu, e sair do
  tutorial não pode deixar a tela diferente de como a pessoa a encontrou.
- **Clicar no escuro em volta não fecha.** São até quinze passos, e perder tudo
  num clique ao lado da caixa seria pior que um botão a mais. Fecha pelo Esc,
  pelo **Pular tutorial** e pelo **Concluir**; as setas ← → também andam.
- **"Pular tutorial" fica à esquerda e discreto**: é uma saída, não a ação
  principal — quem quer sair acha, e quem está seguindo não clica nele por
  engano no lugar do Próximo.
- **O botão 🎓 no cabeçalho reabre o tour** quando a pessoa quiser. Sem ele, o
  tutorial existiria uma vez na vida e não haveria como conferir uma mudança
  nele sem limpar o `localStorage`.
- ⚠️ **A marca de "já viu" é por pessoa e por NAVEGADOR**
  (`localStorage['portal_tour_visto:<email>']`). Uma coluna em
  `usuarios_permitidos` seguiria a pessoa entre computadores, mas pediria mais
  um script de SQL para rodar no painel; o custo de errar aqui é ver o tour uma
  segunda vez num computador novo, com o "pular" à mão. Se incomodar, a coluna
  é a correção certa.
- O tour **não vai para o papel** (`#tourFundo { display: none !important; }` no
  `@media print`) — o recorte escuro cobriria a folha inteira.

## Item já retirado não entra mais na impressão do Controle EXP (10/09/2026)

O Robson, vendo um item com status "Saiu p/ carregamento": *"itens que ja
carregou bloqueie para impressao"*.

Reimprimir a etiqueta de um item que já saiu fisicamente da expedição não
faz sentido — o material não está mais lá para colar nada nele, e a folha
só confundiria quem conferisse a pilha depois. `linhasImprimiveisExpControle()`
(`js/programacao.js`) é `linhasFiltradasExpControle()` (o mesmo filtro de
busca de sempre) **menos** as linhas com `status === 'retirado'`, e passou a
ser a fonte única para tudo que decide o que vai pra impressora:

- **`linhasParaImprimirExpControle()`** (o que sai no Imprimir/Exportar) usa
  ela em vez da lista sem filtro — item retirado nunca sai, esteja marcado
  ou não, mesmo que tenha ficado marcado de antes (a seleção é limpa disso
  também, ver abaixo).
- **`atualizarSelecaoExpControle()`** (o texto do botão "Imprimir tudo (N)" /
  "Imprimir marcados (N)" e o estado do "marcar todos" do cabeçalho) conta
  só sobre ela — o número já sai certo, sem incluir o que não vai imprimir.
- **"Marcar todos" do cabeçalho** só marca os imprimíveis — item retirado
  nunca entra na seleção por essa via.
- **A caixa de cada linha retirada vem `disabled`**, com o título "Já saiu
  para carregamento — não imprime de novo" — em vez de deixar marcar e não
  imprimir depois (o que pareceria bug), a tela já impede na hora.
- **Confirmar a saída de um item já marcado tira ele da seleção** (o mesmo
  trecho que já limpava a seleção ao trocar de unidade/setor, em
  `renderExpControle()`, ganhou mais um motivo) — sem isso, o item ficaria
  "preso" selecionado sem nunca poder imprimir, e sujaria a contagem do
  cabeçalho pra sempre.

Conferido no navegador: item retirado nasce com a caixa desabilitada e
some do "Imprimir tudo (N)"; "marcar todos" não o inclui; forçando o id
dele na seleção mesmo assim (simulando estado antigo), a impressão o
filtra fora igual. Zero erro de console.

### Item retirado some da própria lista da aba Entrada (10/09/2026)

Na mesma conversa, o Robson foi direto ao ponto: *"os itenms marcado como
saida deixe só nessa aba"* — a aba sendo "Saída / Conferência" — e depois
*"só quero na aba entrada o que realmente tem la no físico"*.

`renderExpControle()` (a lista da aba Entrada — o `expCtrlBody`, que o
ajuste acima já tinha ensinado a não IMPRIMIR retirado) passou a usar
`linhasImprimiveisExpControle()` como fonte da própria lista, não só do
que vai pra impressora — item que já saiu não aparece mais ali nem
apagado nem acinzentado, simplesmente não está na lista, porque não está
mais no físico da expedição.

**Nada se perde**: quem já saiu tem histórico completo na aba Saída/
Conferência (`renderHistoricoRetiradas()`) — pedido, item, descrição,
quantidade, localização, quem retirou, quando, e um ↺ pra desfazer. A
mudança só tira da aba Entrada o que não precisa mais ser conferido ali.
De quebra, **Exportar (Excel/CSV/HTML) também parou de trazer retirado**
— usa `linhasParaImprimirExpControle()` por baixo, então a planilha
exportada da Entrada passou a refletir só o que está fisicamente lá,
igual à tela.

Conferido no navegador: com um item retirado e um na expedição, a lista
da Entrada mostra só o segundo (contador "1 pedido na expedição" e botão
"Imprimir tudo (1)" batendo), e o item retirado continua aparecendo no
Histórico de Retiradas com quem retirou. Zero erro de console.

## 18. Consultor só consulta, e o tour detalha a Consulta (10/09/2026)

Três pedidos do Victor na mesma mensagem.

### 1. Consultor perdeu o Depósito SESMT e a Requisição ALM

*"Consultor apenas consulta de itens, restringir deposito SESMT e requisição
ALM."* `PERFIS.consultor` passou de `['estoque', 'sesmt', 'requisicao']` para
`['estoque']`.

⚠️ **Isso reverte uma decisão anterior**, e as duas estão registradas de
propósito: a Requisição ALM era aberta a todo perfil porque "qualquer pessoa
aprovada pode pedir material" (seção 8). Não é o caso mais.

⚠️ **O menu não é a tranca.** `sql/fase31-consultor-so-consulta.sql` é a
metade que importa — sem ele, um consultor com o inspetor aberto continua
criando requisição e lendo o EPI:

| O que estava aberto | Por quê | O que o fase31 faz |
|---|---|---|
| criar requisição | `"Criar propria requisicao"` (fase6) exige só `esta_aprovado()` | refaz a política com `pode_pedir_material()` |
| ler o estoque de EPI | a leitura de `estoque` (fase1c) não olha `deposito`, coluna que só nasceu na fase23 | `deposito = 'alm' or meu_perfil() <> 'consultor'` |
| ler a contagem do EPI | idem em `contagem_fisica` | a mesma condição |

- **`pode_pedir_material()`, e não `meu_perfil() <> 'consultor'` espalhado**:
  no dia em que outro perfil entrar, a regra de "quem pede material" muda num
  lugar só. Mesmo padrão de `pode_atualizar_estoque()` e
  `pode_ver_analise_compras()`.
- **Só o INSERT da requisição precisa de trava.** As políticas de update e
  delete são do autor (`criado_por = auth.uid()`): quem não cria não tem o que
  editar. E a **leitura** fica como está — um consultor sem requisição não vê
  nada por ela, e se alguma foi criada antes desta fase, esconder do próprio
  autor o que ele escreveu seria pior que deixar visível.
- **As políticas de leitura são SUBSTITUÍDAS, não somadas.** Política
  permissiva se soma (OR): criar uma restrita ao lado da antiga não restringe
  nada. Mesma lição do comentário do fase11.
- **A condição é `deposito = 'alm'`, não `deposito <> 'sesmt'`.** Desde o
  `fase29` existe um terceiro depósito (`benchmark`). Escrita como está, o
  consultor lê só o almoxarifado, e qualquer depósito que nasça amanhã já
  entra fechado para ele — o lado certo de errar. `<> 'sesmt'` teria deixado o
  Benchmark aberto sem ninguém notar.
- **A leitura entre UNIDADES continua aberta.** O recorte novo é por
  **depósito**, não por unidade — é o que mantém o botão ⇄ funcionando
  (decisão de 03/09/2026, seção 5).
- `atribuicoes_corredor` ficou de fora de propósito: é nome de pessoa e letra
  de corredor, não saldo nem item, e a tela que a usa é o modo contagem, onde
  o consultor só entra com a senha da unidade.
- Independe do fase11 (ainda pendente): ele mexe na **escrita** de
  `contagem_fisica`, o fase31 só na leitura. Qualquer ordem serve.

### 2. O tour explica a tela de Consulta, não só o nome dela

*"Melhorar tutorial para mostrar um pouco melhor a tela de consultas e
detalhar como funciona, como por exemplo: explicar como funciona a
visualização da foto ou mostrar quanto tem em cada unidade."*

`PASSOS_CONSULTA` (`js/tour.js`) são **7 passos dentro da tela**, encaixados
logo depois do item "Consulta de Itens" do menu: a busca (com os formatos
`corredor A-B` e `CANT A-G`), os Filtros, o **👁** (foto e ficha, incluindo o
que o olho apagado quer dizer), o **⇄** (quanto tem em cada unidade, e o
botão de compartilhar de dentro), o **💡** (equivalente de mesma medida e
material), o Exportar PDF e o **📋** da contagem.

É a única tela que todo perfil tem, e a única do consultor — explicar só o
nome dela no menu não ensinava nada.

- **`pagina: 'estoque'` no passo** faz o tour abrir a tela antes de desenhar.
  Sem isso, quem clicasse no 🎓 estando no Controle EXP veria todos estes
  pulados. Só troca quando ainda não está na tela: `mostrarPagina()` recarrega
  os dados, e chamar a cada passo faria sete consultas ao banco para andar
  pelos sete passos.
  Isso ficou mais importante depois do Depósito Benchmark virar saldo simples:
  ele reusa o MESMO `estoqueContent` e o mesmo `#dataTable` (como o SESMT), então
  os seletores destes passos casariam com a tabela do Benchmark se o tour não
  trocasse de página. `mostrarPagina('estoque')` também devolve `depositoAtual`
  para `'alm'` — a explicação é do almoxarifado, e é o almoxarifado que fica na
  frente. Conferido abrindo o 🎓 a partir do Benchmark.
- ⚠️ **Três alvos são botões da PRIMEIRA LINHA da tabela** e não existem com
  a lista vazia (unidade sem dados, busca sem resultado). São pulados sozinhos
  — e é por isso que a explicação de cada um não fala do item que estiver na
  frente. O **💡** vai além: só existe para item com quantidade **zero**,
  então some quando não há nenhum, o que está certo — não há o que explicar.
- Conferido no navegador nos três cenários: com item zerado (14 passos, todos
  com alvo), sem item zerado (o 💡 sai), e com a tabela vazia (os três de
  linha saem, 11 passos andados).

⚠️ **O tour saía sem esses três passos no primeiro login, e por corrida de
tempo.** O Victor: *"o tutorial do consultor ainda ta incompleto"*.
`montarMenu()` abre a Consulta de Itens, que dispara `loadData()` — uma ida ao
Supabase que **ninguém espera**. O tour abria dois quadros de animação depois,
com a tabela ainda vazia, e os passos do 👁, do ⇄ e do 💡 eram pulados: faltava
justamente o que o pedido original queria explicar ("como funciona a
visualização da foto", "quanto tem em cada unidade"). Meus testes não pegaram
porque eu populava a tabela à mão **antes** de abrir o tour.

Duas correções, e as duas são necessárias:

1. **`iniciarTourSePrimeiraVez()` espera a tabela**, e não a primeira pintura:
   procura `#dataTable tbody tr` a cada 250 ms, no máximo ~3 s. Não é
   `await loadData()` — a carga pode falhar e a unidade pode não ter item
   nenhum, e nos dois casos o tour tem de abrir. 3 s e não 6: a carga normal
   chega em menos de 1 s, e a espera só estoura sem dados — aí a tela parada
   pareceria portal travado.
2. **`alvoAlternativo`**: os três passos apontam a tabela inteira (`#dataTable`)
   quando não há linha. As unidades **101 e 105 não têm dado nenhum** hoje, e sem
   isso a pessoa dali nunca receberia essas explicações — nem depois dos 3 s.

E se a linha chegar **depois** de o tour abrir, os três passos passam a
funcionar de todo jeito: `tourAlvoUtil()` é consultado na hora de avançar, não
uma vez na montagem.

⚠️ Ao testar isto no navegador, lembre que **aba de fundo estrangula
`setTimeout`** (Chrome joga para ~1 s): a espera de 3 s virou 24 s no teste e
pareceu que o tour não abria. Teste com a aba na frente.

### 3. Admin não ganha o tour sozinho

*"Admin não precisa de tutorial, pq só eu e o Robson somos admin e ambos
sabemos como funciona."* `iniciarTourSePrimeiraVez()` sai na hora para
`perfilAtual === 'admin'`.

O botão **🎓** continua abrindo para eles, e não é cortesia: é por ele que se
confere uma mudança no tour sem ter de limpar o `localStorage` — foi como
estes 7 passos novos foram testados.


## Data da última atualização, embaixo de cada aba do lote (10/09/2026)

O Robson: *"coloque a data de atualização de cada aba dessa, pode ser embaixo
em um tamanho pequeno"* — as cinco abas de "Atualizar estoques em lote"
(Almoxarifado, SESMT, Benchmark, Catálogo EXP, Aço).

`carregarDatasLote()` (`js/configuracoes.js`) faz **uma consulta rasa por
fonte** — só a coluna `atualizado_em`, ordenada e cortada em 1 linha — e
escreve o resultado num `<span class="lote-aba-data">` logo abaixo do botão
de cada aba:

- **Almoxarifado/SESMT/Benchmark** são a MESMA tabela (`estoque`), recortada
  por `deposito` — a mesma coluna que separa os três em toda essa aba desde
  o SESMT (09/09) e o Benchmark (10/09).
- **Catálogo EXP** lê `catalogo_exp_itens`, **Aço** lê `bobinas_aco` — cada
  uma sem recorte de depósito, porque essas duas tabelas são só uma coisa
  cada.
- **É a data mais recente entre TODAS as unidades**, não só a que está
  selecionada no topo: esta seção não é presa a uma unidade — a planilha
  colada pode trazer várias de uma vez —, então "atualizado" aqui quer dizer
  "a última vez que alguém colou uma planilha nesta aba, em qualquer
  unidade".
- **Chamada de novo assim que uma substituição termina** (fim de
  `aplicarLote()`), e não só ao abrir a página — a aba que acabou de gravar
  mostra a hora nova na hora, sem precisar recarregar.
- Tabela sem nenhuma linha (ou erro de leitura) mostra "Nunca atualizado" ou
  "—", nunca fica em branco sem dizer nada.

Conferido no navegador com um mock por tabela (incluindo uma sem linha
nenhuma, pra testar "Nunca atualizado"): as cinco datas saem certas, cada
uma da fonte certa.

## Sugestões de melhoria: o canal do consultor (10/09/2026)

O Robson: *"quero que crie um botão para que os consultores coloquem
sugestões de melhorias, aí essa sugestão é enviada para o meu usuário e o do
Victor"*.

⚠️ **"Para o meu USUÁRIO", e não "para o meu e-mail"** — foi isso que decidiu
o desenho. As outras telas que "mandam" alguma coisa (Requisição ALM,
Solicitação de compra) usam `mailto`, que depende de a pessoa clicar em
enviar no Outlook e some sem avisar se ela fechar a janela. Ali o custo é
baixo: tem alguém esperando o material e que vai cobrar. Aqui é o contrário —
**ninguém está esperando uma sugestão**, então uma que se perde nunca é
cobrada por ninguém. Gravada em `sugestoes_melhoria`
(`sql/fase32-sugestoes-melhoria.sql`), ela chega inteira aos dois, dentro do
portal, e continua lá depois de lida.

- **Quem manda**: o 💡 no cabeçalho aparece só para `perfilAtual ===
  'consultor'` — é quem tem menos tela (desde a seção 18, só a Consulta de
  Itens) e nenhum outro canal aqui dentro. ALM e aço falam com o Robson
  direto; ele e o Victor são justamente quem RECEBE. Widening é uma linha em
  `montarMenu()`, se um dia fizer sentido.
- **Quem lê**: `eh_super_admin()` no RLS já era exatamente o Robson (nos dois
  logins dele) e o Victor — não precisou de lista nova pra manter em
  sincronia. A seção "Sugestões de melhoria" em Configurações some inteira
  para os outros admins; e some por cortesia, porque o `select` deles volta
  vazio de qualquer jeito.
- **Vai com nome, unidade e perfil junto.** Sugestão anônima vira caixa de
  reclamação sem resposta possível: sem saber quem é, não dá nem para
  perguntar "como assim?" nem para avisar que foi feito.
- **Marcar como lida é `update`, e não `delete`** — não existe política de
  delete nesta tabela de propósito. Apagar seria a forma silenciosa de a
  pessoa nunca saber que foi ignorada; lida fica cinza e continua na lista.
  O `update` pede recibo (`.select('id')`): sem ele, um update barrado pelo
  RLS volta com `error null` e zero linha, e a tela diria "lida" com o F5
  desmentindo (item A1 da `AUDITORIA.md`).

Conferido no navegador nos dois lados: como consultor, o 💡 aparece, o envio
vazio é recusado, e o que vai pro banco leva mensagem, nome, e-mail, unidade
e perfil; como super admin, a lista mostra as duas (1 não lida, com botão; 1
lida, cinza, com "✓ lida por Victor"), o "marcar como lida" manda o patch
certo, e a seção some tanto para admin comum quanto o 💡 some para quem não
é consultor.

## 19. Aba Configurações: filtros e contagem de consultores (10/09/2026)

O Victor: *"Na aba configuração, mostre também quantos consultores tem. Uma
correção para essa tela: os filtros de usuario, status, perfil de acesso e
unidade não funcionam. Se possivel, filtrar por padrão por perfil de acesso."*

⚠️ **Os filtros não estavam quebrados: não existiam.** A tela tinha só os
títulos das colunas (Usuário · Status · Perfil de acesso · Unidade). Eles
pareciam clicáveis porque o ordenador da Consulta de Itens estava ligado a
**todo** `thead th` do documento — clicar ali zerava `sortKey`, apagava as
flechas da outra tabela e estourava em `.arrow` nulo, sem fazer nada de visível.
Isso foi recortado para `#dataTable thead th` em 10/09/2026 (seção 13), e o que
restou foi um cabeçalho que não faz nada. Agora há filtro de verdade.

- **Quatro filtros na barra**: busca por **nome e e-mail** (quem administra
  lembra de um ou do outro, raramente dos dois), Status, Perfil de acesso e
  Unidade. Filtram **ao digitar**, sem botão de aplicar — mesmo padrão do
  `#searchBox` e do `#filterLocalizacao`, que só passou a filtrar ao digitar em
  10/09/2026 justamente porque esperar o clique parecia que não funcionava.
  Nada vai ao banco: `usuariosCarregados` já está em memória.
- **Os selects são montados de `PERFIS` e `UNIDADES`** (`montarFiltrosCfg()`), e
  não de uma lista escrita no HTML: um perfil ou uma unidade nova entraria no
  cadastro e no menu mas ficaria fora do filtro, e o sintoma seria "a pessoa
  existe e o filtro não acha".
- **"Sem unidade definida" é uma opção de verdade**, não enfeite: cadastro sem
  unidade não conta nada (falha fechado, seção 5), então é exatamente a lista
  que o administrador precisa achar para arrumar.
- **Card novo: Consultores.** Junto com Total, Aguardando aprovação e
  Administradores.
- ⚠️ **Os cards contam TODO mundo, não o que o filtro deixou na tela.** Eles
  respondem "quantas contas existem", que é a pergunta de quem administra.
  Quantos o filtro deixou vai na linha `#cfgContagem` ao lado
  (`Mostrando 3 de 6`) — sem ela, filtrar e ver 2 linhas com o card dizendo 40
  parece dado errado.
- ⚠️ **A lista vazia tem duas causas, e a mensagem distingue as duas**:
  "Nenhum usuário bate com os filtros" e "Nenhum usuário cadastrado ainda".
  Culpar o filtro pela causa errada faz a pessoa mexer nos filtros atrás de
  gente que nunca foi carregada. Falha de leitura tem mensagem própria, no
  `#cfgMsg`.

### A ordem: pendente primeiro, depois por perfil

`ordenarUsuariosCfg()`, três regras nesta ordem:

1. **Pendente primeiro.** É o item de ação da tela — quem não foi aprovado não
   entra em nada, e essa fila é o que trava a pessoa do outro lado. Já era assim
   (`order('aprovado')` na consulta) e continua sendo.
2. **Depois por perfil de acesso**, na ordem de `PERFIS` (do menos para o mais
   privilegiado). É o "filtrar por padrão por perfil" do pedido: agrupa quem faz
   a mesma coisa, que é como se lê uma lista de acesso — *"quem são meus
   consultores?"*, não *"quem começa com A?"*. **Não** é o filtro pré-preenchido
   com um perfil: isso esconderia gente na abertura da tela, e numa tela de
   acesso não ver alguém é o pior tipo de omissão.
3. Nome, para a ordem não dançar entre duas cargas com o mesmo perfil.

Perfil desconhecido (linha antiga, ou valor que saiu de `PERFIS`) vai para o
**fim** em vez de sumir — sumir da lista é o pior lugar para um acesso ficar.

## Aviso chamativo de novo cadastro, só pra Robson e Victor (10/09/2026)

O Robson: *"sempre que tiver um novo cadastro eu e o Victor recebe uma
notificação chamativa nessa tela"*.

**Broadcast, e não `postgres_changes` em `usuarios_permitidos`** — mesmo
padrão de `dispararAlertaBobina()` (`js/ocr.js`, já existia): não há servidor
neste projeto, e broadcast não exige ligar o Realtime na tabela (sem `alter
publication`, sem mexer em replica identity — ver o histórico do fase23 sobre
como isso pode dar errado). O preço é o mesmo de lá: **só quem está com o
portal aberto NA HORA recebe o aviso ao vivo.**

- `dispararAlertaCadastro()` (`js/auth.js`) manda o broadcast **logo após o
  INSERT de verdade** em `usuarios_permitidos`, dentro de `verificarAprovacao()`.
  ⚠️ Isso exigiu conferir `error` explicitamente — `.insert()` do PostgREST
  **não lança exceção** para chave duplicada, só devolve `error` preenchido; o
  bloco já tinha um `try/catch`, mas o `catch` ali só pegaria falha de rede.
  Sem checar `error`, o aviso dispararia toda vez que **qualquer pessoa já
  cadastrada** abrisse o portal, não só em cadastro novo.
- `iniciarAlertaCadastro()` (`js/configuracoes.js`) escuta o canal e só mostra
  o banner (`#alertaCadastroBanner`) para `ehSuperAdminAtual()` — é "eu e o
  Victor", não todo perfil `admin` (o card "Administradores" mostra 3 hoje).
  Ao mostrar, já chama `carregarUsuarios()` sozinho — a pessoa nova aparece na
  lista sem precisar lembrar de clicar em "Recarregar lista".
- **O card "Aguardando aprovação" pulsa** (`.stat-card-pendente-ativo`,
  `renderUsuarios()`) enquanto a fila não estiver vazia — cobre quem chega na
  tela depois do aviso ao vivo ter passado (o banner já fechou, ou a pessoa
  nem estava com o portal aberto no momento do cadastro). O pulso é de
  **escala**, não de brilho: um `box-shadow` chamativo pediria uma cor
  translúcida fixa, que ficaria errada trocando de tema claro/escuro (mesmo
  cuidado do trabalho de tema do Victor, 10/09/2026).

Conferido no navegador com `sb.channel` trocado por um mock local (capaz de
guardar os `.on()` registrados e disparar `.send()` na mão, sem depender de
rede de verdade): o banner aparece certo (nome, e-mail, unidade) só quando
`emailUsuarioAtual` é super admin, fica escondido para um consultor, e o
botão "Ver / dispensar" fecha. O card pulsa com `usuariosCarregados` tendo
pendente e para de pulsar quando esvazia. Zero erro de console.

## 20. Aba Conferir do Controle EXP: sistema × físico (10/09/2026)

O Victor: *"Precisamos colocar uma aba 'Conferir' no Controle EXP Acessórios. A
ideia é que o app faça um confronto do que existe no sistema e o que tem no
fisico, faça uma comparação e retorne indicadores. Quais tem diferença, quanto
é, se ta no sistema ou nao, etc."*

| | O que é |
|---|---|
| **Sistema** | `catalogo_exp_itens` desta unidade — a planilha do Datasul, colada na aba Catálogo. É a coluna `quantidade` dela |
| **Físico** | `exp_controle_itens` com status `na_expedicao`. Item já **retirado** não conta: ele saiu no caminhão, e contá-lo diria que o material está lá |

Cinco indicadores: itens confrontados, com diferença, só no sistema, só no
físico, conferem. A tabela mostra os dois saldos, a **diferença com sinal**
(`+` é sobra no físico, `−` é falta — sem o sinal a pessoa lê "3" e não sabe
para que lado), a situação e onde o item está guardado.

⚠️ **Cuidado com o nome.** Já existe a sub-aba **"Saída / Conferência"**, que é
outra coisa: ali se registra a retirada item por item. Esta confronta as duas
pontas e não escreve nada.

### As três decisões que fazem a conta estar certa

- ⚠️ **Por item, somando os dois lados.** O mesmo código aparece em várias
  linhas das duas pontas (o sistema separa por lote e depósito, o físico por
  endereço e pedido), então comparar linha a linha acusaria diferença onde só há
  material espalhado. Mesma decisão da Análise de Compras, e pelo mesmo motivo.
- ⚠️ **A chave passa por `normalizaCodigoItem()`.** As duas pontas são planilhas
  **coladas à mão, de origens diferentes**, e o projeto já perdeu uma tarde com
  o item `996613I` gravado minúsculo numa e maiúsculo na outra (seção 14). Numa
  tela de conferência isso não seria um número errado — seria uma **divergência
  inventada**, e alguém indo procurar material que está no lugar. Testado
  exatamente com esse caso.
- ⚠️ **`noCatalogo`/`noFisico` olham a PRESENÇA da linha, não a quantidade.**
  Item cadastrado no sistema com saldo zero é diferente de item que o sistema
  não conhece, e a tela precisa dizer qual dos dois é.

### O pré-requisito: as duas cargas passaram a ser paginadas

Sem isto a tela **mentiria em silêncio**, e é a razão de a paginação ter entrado
no mesmo commit. O PostgREST devolve no máximo **1.000 linhas** e não avisa que
cortou (seção 9). O catálogo de uma unidade cheia passa disso — a mensagem da
substituição em lote já falava em 4.000 linhas — e `exp_controle_itens` é
append-only de propósito. Com um dos lados cortado, o que falta vira "não existe
no sistema" e a tela acusaria **centenas de divergências falsas**.

`buscarTudoPaginado(fazerConsulta)` vive em `js/estoque.js` (carrega antes) e
busca de mil em mil. Quem chama monta os filtros e a ordenação — precisa de
`.order()` estável, senão a página 2 repete ou pula linha da 1. Isto fecha, para
estas duas tabelas, o item aberto de paginação do CLAUDE.md.

### Por que o filtro nasce em "só divergências", e o teto de 300 linhas

O catálogo é o depósito **inteiro**, não só o que está na expedição: abrir
mostrando tudo enterraria a divergência no meio do que está certo. E a lista tem
teto de **300 linhas desenhadas**, com o total dito na tela
(`Mostrando 300 de N — use a busca para estreitar`) — "Tudo" numa unidade cheia
travaria a aba, e o corte nunca é silencioso.

**A ordem é a do risco**, não a alfabética: **só no físico** primeiro (material
guardado que o sistema não conhece é o que se perde no inventário — ninguém
procura o que não está na lista), depois **diferença** da maior para a menor em
módulo, depois **só no sistema**, e o que **confere** por último, porque não há
o que fazer com ele.

**O formulário de registro não aparece nesta aba** (como na aba Catálogo):
registrar movimentação a partir de uma tela de conferência seria mexer no que se
está medindo. E **Recarregar busca as duas pontas juntas** — a conferência só
vale se os dois lados forem do mesmo momento.

### A caixa de sugestões entrou no tour, e o botão passou a ser de todos

O Victor: *"O Robson colocou uma função de 'caixa de sugestões'. Dê uma
analisada e acrescente isso no tutorial de todos os cargos."*

O passo entra na **cauda comum** do tour (não em `PASSOS_CONSULTA`, que é só da
tela de Consulta de Itens), então vale para os quatro perfis. O texto diz que a
sugestão **fica gravada**, e isso não é detalhe: as outras telas que "mandam"
algo usam `mailto` e dependem de a pessoa clicar em enviar no Outlook — ali
alguém está esperando o material e vai cobrar, mas uma sugestão perdida não é
cobrada por ninguém. Saber que ela chega inteira é o que faz a pessoa escrever.

⚠️ **Isto mudou quem vê o botão, e a mudança é do mesmo dia que a decisão
anterior.** O Robson pediu o botão **só para consultor** (*"para que os
consultores coloquem sugestões"* — é quem tem menos tela e nenhum outro canal
dentro do portal). Um passo de tutorial apontando um botão que a pessoa não tem
é pior que não ter o passo: ela procura e não acha. Então o botão passou a
aparecer para **todo** perfil. **Quem recebe não mudou** — continua
`eh_super_admin()` no RLS (Robson e Victor), e a lista só eles leem. Para voltar
ao desenho original é uma linha em `montarMenu()`, marcada no comentário.

Passos por perfil depois desta mudança: consultor **15**, estoque_aco **9**,
estoque_alm **21**, admin **23** (o admin não recebe o tour sozinho, só pelo
🎓).

## Observação e exclusão por item, na aba Conferir (10/09/2026)

O Robson, apontando pro fim da tabela: *"preciso de uma coluna de
observação"* — e, na sequência: *"e um botao se excluir, tem itens que não
são do meu estoque dai limpo"*, esclarecido depois: *"excluo o item que não
preciso contar no inventário, tem itens que são do pátio aí é outra
equipe"*.

**"Excluir" aqui NÃO apaga `catalogo_exp_itens` nem `exp_controle_itens`.**
O pedido é parar de **conferir** o item nesta tela, não apagar o registro de
outra equipe — o pátio continua sendo problema de quem cuida do pátio, só
deixa de aparecer nesta conferência. Mesmo padrão do "não repor" da Análise
de Compras: uma marca **reversível** (↺ restaura), guardada numa tabela
própria — `sql/fase33-conferir-exp-observacao.sql` cria
`conferir_exp_notas` (chave `unidade` + `codigo_item` **normalizado** por
`normalizaCodigoItem()`, igual à chave que já monta a linha da tela).

⚠️ **Não é a mesma tabela de `analise_item_notas`** (fase20) — são assuntos
diferentes: lá a observação é sobre *"o que fazer pra comprar este item"*
(já solicitei, não repor); aqui é sobre a **divergência sistema × físico**
("já avisei o PCP", "é item de outra equipe"). Reaproveitar misturaria os
dois na mesma linha.

- **`carregarConferirExpNotas()`** busca as notas desta unidade ao entrar na
  aba (`trocarAbaExpAcessorios('conferir')`), e de novo no "Recarregar" —
  a tela já mostra rápido com o que tinha antes, redesenha quando a busca
  nova chega.
- **Item excluído sai dos cards e do filtro normal** — `renderConferirExp()`
  separa `todas` (sem excluído) de `excluidos` **antes** de contar "Itens
  confrontados"/"Com diferença"/etc.: excluído não é mais problema desta
  conferência, não devia inflar nem esconder número nenhum dela.
- **Botão "🚫 Ver excluídos (N)"**, mesmo padrão do "Ver não repor" da
  Análise de Compras: troca a lista inteira para só os excluídos (ignorando
  o filtro de situação, que não faz sentido ali), com a observação e quem/
  quando excluiu no lugar do campo editável, e o ↺ Restaurar no lugar do 🗑️.
- **Falha ao carregar não trava a aba** (`console.warn`, tabela some sozinha
  se o fase33 ainda não rodou) — mesmo princípio de
  `limparObservacoesResolvidas()` em `js/analise.js`.

Conferido no navegador (mock de `sb.from`): os 4 itens de teste aparecem
todos; excluir um item some da lista normal e ele aparece em "Ver excluídos
(1)", com a observação e o ↺; restaurar devolve à lista normal; a
observação digitada e salva sobrevive a um redesenho da tela
(`renderConferirExp()` de novo, simulando reabrir a aba); o card "Itens
confrontados" cai de 4 para 3 ao excluir. Zero erro de console.

## Trava: código fora do Catálogo EXP não deixa preencher o resto (10/09/2026)

O Robson, vendo o item `135556i` na aba Conferir como "Só no físico", sem
descrição nenhuma: *"escrevi o codigo errado, quero que coloque uma trava se
eu digitar o codigo que nao estiver no catalago nao deixar preencher"*.

Sem trava, um código digitado errado no formulário manual (Entrada) virava
uma linha fantasma em `exp_controle_itens` — ninguém apaga isso na mão, e é
exatamente o tipo de divergência que a aba Conferir foi feita pra achar. A
raiz: o `blur` do campo Item já mostrava "⚠ Descrição não encontrada", mas
só como aviso — nada impedia continuar preenchendo e salvando.

`itemExisteNoCatalogoExp(codigo)` confere contra `catalogoExpItens` (o
Catálogo EXP **desta unidade**, já em memória) — não contra a busca em
cascata de `buscarDescricoesItens()` (que também olha `itens_requisicao` e
`estoque`): o pedido foi especificamente sobre o Catálogo EXP, que é a
referência de verdade deste domínio.

- **Formulário completo**: `travarFormularioManual(bloquear)` desliga
  Quantidade, Localização, "+ Referência/Lote/Nº da OP" e o botão Registrar
  no `blur` do campo Item, sempre que o código não bate com o catálogo — a
  pessoa literalmente não consegue preencher o resto até corrigir o código
  (ou apagar o campo, que limpa a trava sem exigir nada).
- **Passo-a-passo**: `salvarPassoAtual()` já confirma o item no PRIMEIRO
  passo — sem a trava ali, a pessoa preencheria os outros seis passos antes
  de descobrir na revisão final que o item nem existe no catálogo.
- **`gravarMovimentacaoManual()` confere de novo, na gravação** — defesa em
  profundidade: é o ponto por onde os dois formulários passam antes de
  chamar `exp_controle_itens.insert()`, então nenhum caminho futuro escapa
  da trava só por não ter passado pelo `blur` ou pelo passo do wizard.
- Vale nos dois setores (Controle EXP Acessórios e Depósito Benchmark): o
  Catálogo EXP é **um só, compartilhado pelos dois** (decisão já registrada
  no fase18), então a mesma verificação serve pras duas telas sem
  duplicar nada.

Conferido no navegador: código errado (`135556i`) trava Quantidade,
Localização, "+ Referência..." e Registrar, com a mensagem explicando o
porquê; código certo (`140488`, do catálogo de teste) destrava tudo e
preenche a descrição normalmente; `gravarMovimentacaoManual()` chamada
direto com o código errado devolve "NÃO SALVOU" sem gravar nada; o wizard
recusa avançar do passo do Item com o mesmo código errado. Zero erro de
console.

## Ordenação por coluna na aba Entrada (11/09/2026)

O Robson, olhando o cabeçalho da tabela da aba Entrada: *"Quero colocar
filtros nas colunas também"*, e no exemplo: *"ex localização de A-Z por
codigo de itens"*.

Mesmo padrão de `#dataTable` (Consulta de Itens, `js/estoque.js`): cabeçalho
com `data-key` + `<span class="arrow">`, clique alterna asc/desc e troca de
coluna zera a seta das outras. A tabela ganhou `id="expCtrlTable"` e estado
próprio — `sortKeyExp`/`sortDirExp` — **de propósito separado** do
`sortKey`/`sortDir` do `#dataTable`: o Victor já tinha achado e corrigido um
bug em que o ordenador de uma tabela pegava clique de "qualquer OUTRA
tabela do portal" por estar ligado a `thead th` solto, sem escopo — aqui o
seletor do clique já nasce escopado (`#expCtrlTable thead th[data-key]`),
então o mesmo defeito não se repete.

- `valorColunaExp(l, key)` extrai o valor comparável de cada coluna
  (Localização, Item, Descrição, UM, Qtd, Nº Pedido, Nº OP, Lote,
  Referência, Status, Entrada em, Saída em) — Qtd usa o número já
  convertido (`parseQtd`), as duas datas usam `Date.getTime()`, o resto
  compara como texto (`toLowerCase()`).
- `ordenarPorColunaExp()` roda dentro de `linhasFiltradasExpControle()`,
  depois do filtro de busca — assim a ordenação vale também pra imprimir e
  exportar, que reaproveitam a mesma função, sem precisar duplicar a lógica
  em cada lugar que monta a lista.
- Coluna "Etiqueta" e "Ação" ficam de fora (não têm um valor único e
  comparável que faça sentido ordenar).

Conferido no navegador (mock de `progExpControle`/`catalogoExpItens`):
clicar em "Localização" ordena A-Z (`EXP A-01, EXP A-02, EXP A-02, EXP
B-01, EXP C-01`) e clicar de novo inverte; "Item" ordena por código
(`135556I, ITEM1, ITEM1, ITEM1, ITEM2`); "Qtd" ordena numericamente (não
como texto: `1, 2, 4, 5, 6`); "Entrada em" ordena por data e a inversão
bate exatamente o oposto da ordem ascendente; clicar num cabeçalho de
`#dataTable` (Consulta de Itens) não mexe em `sortKeyExp`, e vice-versa.
Zero erro de console.

## Observação com largura automática + "Onde está" clicável, aba Conferir (11/09/2026)

Duas continuações do mesmo card de Observação/Exclusão. O Robson, sobre o
campo de Observação, pequeno demais pro que ele escreve: *"AQUI CONFORME A
ESCRITA ALONGAR ESSA ABA E TAMBEM SALVAR AUTOMATIVO A OBSERVAÇÃO QUE EU
ESCREVER"*. E sobre a coluna "Onde está", que só lista as localizações sem
dizer o pedido de cada uma: *"AQUI AO CLICAR APARECER TODAS AS
LOCALIZAÇOES E OS PEDIDOS REFERENTES"*.

**Largura automática**: reaproveita — não duplica — `larguraObservacao()`,
`medirLarguraTexto()` e `ajustarLarguraObservacao()`, já usadas pelo mesmo
campo na Análise de Compras (`js/analise.js`). São genéricas (recebem o
`input`/texto direto, não amarradas à classe `.analise-obs-input`), e como
todo `.js` do portal é script clássico carregado em sequência no
`index.html`, uma função definida num arquivo carregado depois
(`analise.js`) pode ser chamada por código de um arquivo carregado antes
(`programacao.js`) — desde que a chamada aconteça em tempo de execução, não
no carregamento do script. A observação já nasce com a largura certa (pelo
texto salvo) e cresce/encolhe a cada tecla digitada, e o `Enter` também
salva (mesmo atalho da Análise de Compras), sem precisar clicar fora do
campo.

**"Onde está" clicável**: a célula virou um link discreto
(`.onde-esta-cell`) quando o item tem alguma localização física. Precisou
mudar `montarConferirExp()`: `ondeEsta` deixou de guardar só um `Set` de
localizações e passou a guardar, por localização, o(s) número(s) de pedido
que estão lá (`Map<localização, Set<pedido>>`) — o dado já existia em
`linhasDoSetorAtual()` (`numero_pedido`), só não estava sendo carregado
pra esta tela. O clique abre um modal simples (mesmo padrão
`.modal-overlay`/`.modal-box` já usado em `js/estoque.js` — fecha no ✕ ou
clicando fora) com uma tabelinha Localização × Nº Pedido. Recalcula
`montarConferirExp()` na hora do clique em vez de guardar estado à parte —
sempre mostra o que está na tela agora, sem risco de desatualizar.

Conferido no navegador: campo de Observação nasce em 170px e cresce pra
382px ao digitar um texto longo; salvar no blur grava a observação
completa; clicar em "Onde está" de um item com 2 localizações (`EXP A-01`,
`EXP A-02`) abre o modal mostrando `EXP A-01 → PED100` e `EXP A-02 →
PED101, PED102` corretamente agrupados; fechar pelo ✕ e reabrir funciona;
clicar fora do modal (no fundo escurecido) também fecha. Excluir/restaurar
item continuou funcionando normalmente depois da mudança em
`montarConferirExp()`. Zero erro de console.

## Excluir linha na Consulta de Itens (11/09/2026)

O Robson, na tela principal de Consulta de Itens: *"COLOQUE BOTAO DE
APAGAR ITEM, TEM ALGUNS QUE DOU BAIXA OU TRANSFIRO PARA OUTRO DEPOSITO,
DAI O BOTAO DE EXCLUIR ME AJUDA QUE DAI NAO PRECISO FICAR TIRANDO
RELATORIO VARIAS VEZES"*.

Diferente do "excluir" da aba Conferir (Controle EXP) — lá o item some da
tela mas continua existindo de verdade em outro lugar (pátio, outra
equipe), por isso é reversível e vive numa tabela de notas à parte. Aqui é
o oposto: depois de uma baixa ou transferência pra outro depósito, a linha
de `estoque` já não representa nada real nesta unidade — apagar a linha
**é** a ação certa, não uma "marca". Sem o botão, a única forma de a linha
sumir era subir a planilha inteira de novo (a tal "tirar relatório várias
vezes").

- Botão 🗑️ na coluna Ações de `#dataTable`, só aparece pra quem já pode
  editar o estoque desta unidade (`podeVerEstoqueMinimo()` — o mesmo
  cache do RPC `pode_atualizar_estoque`, reaproveitado de
  `salvarEstoqueMinimo()`/`limparTodasAsContagens()`, não um novo).
- `confirm()` do navegador antes de apagar (mesmo padrão de
  `limparTodasAsContagens()`), avisando que não tem volta.
- Apaga só a LINHA (`id`), não o item inteiro: um código com saldo em
  duas localizações continua com a outra linha intacta.
- `.delete(...).select('id')` de propósito — sem isso, um delete que o
  RLS barra volta sem erro e a linha reaparece no próximo F5, com a
  pessoa achando que já tinha excluído (mesmo cuidado de
  `gravarEtiquetaEmLote()`/`salvarEstoqueMinimo()`).
- Nenhuma policy nova no Supabase: a policy "Escrita admin ou gerente da
  unidade" (`for all`, `sql/fase1c-rls.sql`) já cobre DELETE, não só
  INSERT/UPDATE.

Conferido no navegador (mock de `sb.from('estoque').delete()`): botão some
quando `podeVerEstoqueMinimo()` é falso; "Cancelar" no `confirm()` não
chama o banco e a linha continua; confirmar remove a linha certa da
tabela, atualiza o card de itens encontrados e não mexe na outra linha;
simulei o RLS recusando (delete sem erro, mas sem linha apagada) e o
alerta correto apareceu, com a linha permanecendo na tela. Zero erro de
console.


## 21. Notificação de cadastro pendente, no canto da tela (11/09/2026)

O Victor: *"o Robson implementou uma notificação que avisa quando alguém se
cadastra e fica pendente de aprovação, mas ela só aparece na tela de
configurações, o que não ajuda muito pois é meio redundante ali. Modifique esse
comportamento (...) tipo um popup no canto inferior direito em tempo real, que
aparece em qualquer tela, mas somente para admin."*

O aviso do Robson (10/09) era um **banner dentro da aba Configurações**. Quem
já estava ali não precisava dele — o card "Aguardando aprovação" e a própria
lista diziam a mesma coisa — e quem estava em qualquer outra tela não recebia
nada. A notificação mudou de lugar: `js/notificacoes.js`, empilhada no canto
inferior direito, por cima de qualquer tela.

- **O empilhador é genérico** (`mostrarNotificacao({...})`), de propósito: a
  próxima notificação do portal entra por ele em vez de nascer outro canto com
  outro estilo.
- ⚠️ **Não some sozinha, e isso é decisão.** "Fulano está esperando aprovação"
  é **tarefa**, não recado: sumir em 5 segundos enquanto a pessoa olha o outro
  monitor é exatamente como uma aprovação fica esquecida por dois dias. Sai no
  ✕ ou no botão de ação.
- **Teto de 4 cartões**, a mais antiga sai primeiro, e a mais nova entra em
  cima. **Duplicata não empilha**: a chave é o e-mail, então o mesmo cadastro
  chegando pelo aviso ao vivo e pela conferência de entrada vira um cartão só.
- **`pointer-events: none` na caixa, `auto` em cada cartão.** A caixa cobre o
  canto inteiro mesmo vazia; sem isso ela engoliria o clique de quem tenta usar
  o que está embaixo.
- **`z-index` acima do menu, abaixo dos modais.** Um modal aberto é uma decisão
  em andamento, e um aviso por cima dele roubaria o clique.
- Fora da impressão, e as cores saem dos tokens — acompanha claro e escuro sem
  uma segunda regra (seção 16).

### ⚠️ O buraco do broadcast, e o que o tapa

O aviso ao vivo é **broadcast** (`sb.channel('alertas-cadastro')`), decisão do
Robson que continua valendo: broadcast **não exige ligar o Realtime na tabela**
— sem `ALTER PUBLICATION`, sem mexer em replica identity (ver o histórico do
fase23 sobre como isso dá errado). Quem dispara é `dispararAlertaCadastro()` em
`js/auth.js`, logo depois do INSERT de verdade.

**O preço é não alcançar quem está offline.** Se nenhum admin estiver com o
portal aberto no instante do cadastro, aquele evento se perde para sempre — e a
fila ficaria parada sem ninguém saber, que é justamente o que a notificação
deveria resolver. Por isso `iniciarAvisoCadastro()` faz **duas** coisas:

1. **Conta quem já está esperando** (`select ... { count: 'exact', head: true }`
   — só o número, nenhuma linha trafega) e mostra um resumo: *"3 cadastros
   aguardando aprovação"*. É isto que faz a notificação funcionar para quem
   chegou depois.
2. **Assina o broadcast** para o que vier daqui para a frente.

Falha na contagem vira `console.warn`, não mensagem na tela: é aviso de
cortesia, não uma tela que a pessoa pediu, e o card em Configurações continua
contando de qualquer jeito.

### ⚠️ Passou de super admin para admin

O aviso do Robson era só para **super admin** (*"eu e o Victor"*). O pedido
agora diz **"somente para admin"**, e é o que está no código
(`perfilAtual === 'admin'`). Faz sentido: **é o admin quem aprova** (seção 5) —
notificar quem não pode aprovar não resolve nada, e não notificar quem pode
deixa a fila parada. Vale confirmar com o Robson, porque muda o alcance do que
ele pediu.

O recorte é conferido **na hora de notificar**, não só na hora de assinar: o
perfil pode mudar no meio da sessão (um super admin tirando o admin de alguém),
e quem deixou de ser admin não pode continuar recebendo nome e e-mail de quem
se cadastrou. Quem não é admin **nem chega a consultar o banco**.

### O card que pulsa continua em Configurações

E não é duplicação: ele é o **estado** da fila — "ainda tem alguém esperando?" —
e a notificação é o **evento**. Os dois respondem perguntas diferentes, e o card
é o que sobra depois de a notificação ser dispensada.

## 22. As senhas de tela saíram (11/09/2026)

O Victor: *"Retirar todo sistema de senhas das telas. Manter as restrições por
cargos e manter a senha de login, mas senhas de acesso a telas e contagens,
retirar."*

Eram **três**, e nenhuma delas era a proteção real — o projeto já tinha escrito
isso duas vezes (ao tirar a senha das bobinas na Fase 2b, e ao tirar o gate do
Depósito Benchmark em 10/09: *"a senha nunca foi a proteção real, só um atrito
a mais"*).

| Senha | O que ela guardava | O que guarda agora |
|---|---|---|
| **Contagem** (`senha_contagem`) | o botão 📋 da Consulta de Itens | `estoque_alm` da própria unidade, ou admin — o mesmo que o RLS de `contagem_fisica` já exigia |
| **PIN de edição** (`pin_edicao`) | o painel "Atualizar dados" | admin ou gerente desta unidade (`atualizarBotaoEditar()`), **e** `pode_atualizar_estoque(uni)` dentro do banco |
| **Controle EXP** (`senha_exp`) | a entrada na tela | `PERFIS` (só `estoque_alm` e `admin` veem a página) e o RLS de `exp_controle_itens` |

### ⚠️ A contagem precisou de uma trava NOVA, e sem ela isto seria um defeito

As outras duas já tinham trava de cargo por baixo — tirar a senha não abriu
nada. **A contagem não tinha nenhuma:** o botão 📋 aparecia para qualquer conta
aprovada, e a senha era a única coisa entre ela e o modo contagem.

Tirar a senha e não pôr nada teria sido pior que deixar como estava: a pessoa
entraria no modo contagem, digitaria a contagem inteira e **cada campo voltaria
vermelho com "⚠ não salvou"** — o banco recusando uma linha de cada vez, porque
o RLS de `contagem_fisica` sempre exigiu `estoque_alm` daquela unidade ou admin.

`podeContarNestaUnidade()` (`js/estoque.js`) põe na tela exatamente a regra que
o banco já aplicava, e `atualizarBotaoContagem()` é chamada depois do login e a
cada troca de unidade — **`estoque_alm` só conta a própria unidade**, então
trocar a unidade no cabeçalho pode tirar o direito, e o botão acompanha (e
desliga o modo contagem, senão a coluna ficaria aberta sem o botão que a fecha).
Cadastro sem unidade não conta nada: falha fechado, mesma regra da seção 5.

### O que mais mudou junto

- **O painel de edição passou a preencher a caixa de texto ao ABRIR.** Era o
  acerto do PIN que fazia isso. Sem o ajuste, o painel abriria com a caixa
  **vazia** e "Salvar no banco de dados" substituiria o estoque da unidade por
  nada — o PIN estava, sem querer, no meio de um caminho destrutivo.
- **O Controle EXP abre direto pelo menu.** O gate também escolhia a unidade
  antes de entrar; isso não se perdeu — o seletor do cabeçalho faz exatamente
  isso, como em todas as outras telas. E trocar a unidade estando lá deixou de
  ser um caso especial (existia só para não "pular" a senha).
- **A aba Configurações perdeu as três colunas de senha.** Não há mais o que
  cadastrar ali, e um campo que não faz nada é pior que campo nenhum.

### O que NÃO mudou

- **A senha de login.** É a única que sobrou, e é a que importa.
- **As colunas e as funções continuam no banco**, sem ninguém ler nem escrever
  nelas: `config_unidade.senha_contagem`/`senha_exp`/`pin_edicao` e as funções
  `senha_contagem_confere()`/`pin_edicao_confere()`/`senha_exp_confere()`.
  Nenhum script SQL foi escrito de propósito — derrubar coluna é irreversível, e
  esta mudança é de tela. Se um dia for para limpar de vez, que seja decisão
  tomada à parte, com as senhas já anotadas em outro lugar.

Conferido no navegador: o botão 📋 não aparece para `consultor` nem para
`estoque_aco`, aparece para `estoque_alm` na própria unidade, **some** quando
ele troca para outra, some se o cadastro não tem unidade, e aparece para admin
em qualquer unidade; clicar entra no modo contagem sem pedir nada; o clique no
menu abre o Controle EXP direto e trocar de unidade lá não reabre modal nenhum;
o painel de edição abre sem PIN, com a caixa já preenchida. Zero erro de
console, e nenhum dos três modais existe mais no DOM.

## A caixa de sugestões abre um chat no Teams (11/09/2026)

O Victor: *"Na 'caixa de sugestões', ao clicar, abrir um chat no Teams com os
usuarios Victor.dobner@kingspanisoeste.com.br e
robson.alves@kingspanisoeste.com.br"*.

O 💡 abre `https://teams.microsoft.com/l/chat/0/0?users=...&message=...` numa aba
nova — o app do Teams assume se estiver instalado, senão cai no Teams web, e nos
dois casos o portal continua aberto atrás. **A mensagem já nasce identificada**
(quem está falando e de qual unidade): sem isso quem recebe vê um texto solto e
não sabe de onde veio — o mesmo motivo de a sugestão gravada levar nome, unidade
e perfil junto.

⚠️ **Isto substitui o caminho que o Robson desenhou**, e vale entender por que
não é um retrocesso. Ele escolheu gravar em `sugestoes_melhoria` em vez de
`mailto` porque *"ninguém está esperando uma sugestão, então uma que se perde
nunca é cobrada por ninguém"* — e um `mailto` some se a pessoa fechar o Outlook
sem enviar. **Uma conversa do Teams não some**: fica no histórico dos dois
lados. A sugestão continua tendo onde ficar; só deixou de depender de alguém
lembrar de abrir uma lista dentro do portal.

- **O modal e `enviarSugestao()` continuam no código**, sem serem chamados pelo
  botão. O que já foi mandado por ali continua legível na aba Configurações, e
  voltar atrás é trocar uma linha. A tabela `sugestoes_melhoria` não recebe
  linha nova.
- ⚠️ **O e-mail do Robson aqui é `robson.alves@`, que foi o dado do pedido.** Nos
  commits dele neste repositório o endereço é `r.alves1@kingspanisoeste.com.br`.
  Se o chat não abrir com ele, é o primeiro lugar para olhar.