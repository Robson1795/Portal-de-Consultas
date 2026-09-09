# CLAUDE.md — Portal de Estoque Kingspan Isoeste

Contexto do projeto para qualquer agente de IA ou pessoa que for mexer neste repositório.
Sempre em **português do Brasil**.

**Atualizado:** 09/09/2026 (Depósito Benchmark, Análise de Compras)
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
saber. Script: `sql/fase21-solicitacao-compra.sql`.

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
