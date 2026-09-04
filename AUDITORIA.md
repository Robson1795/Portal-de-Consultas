# Auditoria do Portal — 02/09/2026

Leitura completa do `index.html` (2.084 linhas) e do diagnóstico de RLS do Supabase
(`pg_policies`, mesmo dia). Cada item traz o local no código e o cenário concreto de falha —
nada aqui é suposição de estilo.

**Contexto que atenua tudo:** o portal ainda não está em uso. Nenhum item abaixo causou dano
até agora, e todos são bem mais baratos de corrigir hoje do que depois.

Numeração por severidade. `L###` = linha do `index.html`.

> ⚠️ **Escopo e validade.** O corpo desta auditoria foi escrito sobre o `index.html` de 2.084
> linhas (commit `bb31bad`), antes da divisão em módulos. **Os números de linha `L###` não
> valem mais** — para localizar um trecho, busque pelo nome da função.
>
> **O módulo de validação por foto (OCR) foi auditado em 04/09/2026** e tem seção própria mais
> abaixo, com nove achados (O1–O9). Ele não estava coberto na primeira leitura.

## Situação em 04/09/2026

Revisão item por item, com o banco sondado pela API em 04/09/2026 — não é conferência de
memória. O que foi verificado de fora: as funções da Fase 1 respondem, `pode_atualizar_estoque`
existe, e `estoque`, `acessos`, `usuarios_permitidos`, `config_unidade` e `bobinas_aco` devolvem
**vazio sem login**.

| Item | Situação |
|---|---|
| C1 · dados de estoque no código público | ✅ corrigido em 04/09 |
| C2 · escrita aberta no `estoque` | ✅ corrigido pela Fase 1 |
| C3 · aprovação de conta burlável | ✅ fechado pelo gatilho `forca_cadastro_neutro` |
| A1 · contagem parecia salva sem estar | ✅ corrigido em 04/09 |
| A2 · `delete` + `insert` sem transação | 🔴 **aberto** — é o item mais grave que resta |
| A3 · `seedInitialData` | ✅ removido junto com C1 |
| A4 · "Limpar tudo" sem checar quem clica | ✅ corrigido em 04/09 (falta rodar o SQL) |
| M1 · senhas em texto claro no código | ✅ corrigido na Fase 7 |
| M2 · pessoas com nome fixo no código | 🟡 aberto |
| M3 · metade do arquivo em cinco linhas | 🟡 parcial — `SEED_DATA` saiu, os três logos ficaram |
| M4 · log de acessos visível para todos | ✅ corrigido pela Fase 1 |
| B1 · `corredorDoItem()` código morto | 🟢 aberto |
| B2 · `forEach` vazio | ✅ sumiu na divisão em módulos |
| B3 · `salvarEmbalagem()` com `update` | 🟢 aberto |
| B4 · `sql/bobinas-aco.sql` desatualizado | ✅ reescrito em 04/09 |
| B5 · `contagem_bobinas_ocr` sem documentação | ✅ respondido (ver O8) |

**Como confirmar as políticas no painel** (consulta de leitura, roda no SQL Editor):

```sql
select tablename, policyname, cmd, permissive
from pg_policies where schemaname = 'public'
order by tablename, cmd, policyname;
```

Nenhuma tabela deve ter política com `cmd = ALL` convivendo com uma restrita: no Postgres as
permissivas se somam, e a aberta anula a restrita.

---

## 🔴 Crítico

### C1. ✅ CORRIGIDO em 04/09/2026 — os dados de estoque estavam no código público

`SEED_DATA` e `seedInitialData()` foram removidos de `js/estoque.js`, que caiu de 115 KB para
53 KB. A carga inicial deixou de existir no código: é tarefa de script SQL, rodado uma vez.
Conferido que o item `141590` não aparece mais em nada que o servidor entrega.

O texto original do achado fica abaixo, como registro.

### C1 (original). Os dados de estoque estão no HTML público, sem precisar de login

`L764` — `const SEED_DATA = [...]` com **539 itens reais**: código, descrição, unidade de
medida, endereço no almoxarifado e quantidade.

```
{"item": "141590", "desc": "PAR. PB 12-14 2\" TCP3", "um": "Pç", "loc": "A-01-01-01", "qtd": "15925"}
```

São 63 KB numa única linha, dentro do arquivo que o Vercel entrega para **qualquer pessoa que
abra o endereço** — sem conta, sem senha, sem aprovação.

**Como se verifica:** `curl https://consulta-estoque-kingspan-araquari.vercel.app/` devolve o
arquivo inteiro. Foi assim que este repositório foi recuperado em 02/09 — o mesmo caminho que
salvou o código expõe o estoque.

Toda a discussão de RLS e de aprovação de conta é irrelevante para esses 539 itens: eles estão
fora do banco.

**Correção:** tirar `SEED_DATA` do código. Se a carga inicial ainda for necessária, ela vira um
`sql/carga-inicial.sql` rodado uma vez no Supabase. Como o `estoque` já tem dados reais, o mais
provável é que esse array seja só resíduo da primeira versão — nesse caso é remoção pura, e o
arquivo emagrece 31%.

### C2. ✅ CORRIGIDO pela Fase 1 — qualquer conta logada podia substituir o estoque

A política aberta `"Escrita para logados"` foi removida e a escrita passou a depender de
`pode_atualizar_estoque(unidade)` — admin, ou quem está em `gerentes_unidade` daquela unidade
(`sql/fase1c-rls.sql`). Sondado em 04/09/2026: a função existe e responde `false` para quem não
tem sessão, e a leitura anônima do `estoque` devolve vazio. A regra "gerente edita só a própria
unidade" voltou a valer.

O texto original do achado fica abaixo, como registro.

### C2 (original). Qualquer conta logada pode substituir o estoque das três unidades

Três camadas que deveriam proteger a edição, e nenhuma protege:

| Camada | Onde | Por que não protege |
|---|---|---|
| Botão de editar só aparece para admin/gerente | `L710` `atualizarBotaoEditar()` | É `style.display`. Qualquer um reexibe pelo inspetor do navegador |
| PIN de edição | `L570` `const EDIT_PIN = "2026"` | Está no código-fonte que todos baixam |
| RLS no banco | política `"Escrita para logados"` em `estoque` | `using (true)` — libera qualquer conta autenticada |

No Postgres as políticas **se somam** (OU, não E). A política correta
`"Escrita admin ou gerente da unidade"` existe, mas a aberta convive com ela e a anula.

**Cenário:** alguém cria conta no portal, abre o inspetor, reexibe o painel de edição, digita
`2026` (lido no código-fonte), cola qualquer texto e clica em salvar. `L1762` apaga o estoque
inteiro daquela unidade e insere o que foi colado. Não precisa nem estar aprovado.

**Efeito colateral:** a regra "gerente edita só a própria unidade", que está na documentação e
na tela, **não está valendo hoje**.

**Correção:** `sql/corrige-permissoes.sql`, Parte 2 — remove a política aberta. A correta passa
a valer sozinha, incluindo a restrição por unidade.

### C3. ✅ FECHADO pela Fase 1 — a aprovação de conta não é burlável

O gatilho `forca_cadastro_neutro` (`sql/fase1b-travas.sql`) recusa `perfil = 'admin'` e força
`aprovado = false` em todo cadastro, independente do que o navegador mande. O `WITH CHECK` que
faltava conferir deixou de ser a única defesa: mesmo que ele aceitasse `aprovado = true`, o
gatilho reescreve o valor antes de gravar.

O texto original do achado fica abaixo, como registro.

### C3 (original). A aprovação de conta pode ser burlável — pendente de confirmação

`L677` — no primeiro login o próprio usuário insere a linha dele em `usuarios_permitidos`.
O `UPDATE` é restrito ao admin (`"Admin aprova"`), então ninguém se aprova depois.

O risco está no `INSERT`. A política `"Inserir proprio cadastro"` tem `USING` nulo — o que vale
para `INSERT` é a cláusula `WITH CHECK`, e o diagnóstico não a trouxe.

**Se o `WITH CHECK` só verificar `auth.uid() = user_id`** sem travar a coluna `aprovado`, então
uma conta nova pode inserir a própria linha já com `aprovado = true`, chamando a API direto com
a chave anon do código. Isso derrubaria o sistema de aprovação inteiro.

**Como confirmar** (consulta de leitura):

```sql
select tablename, policyname, cmd, qual as usando, with_check as verificando
from pg_policies where schemaname = 'public' order by tablename, policyname;
```

Se confirmado, a correção é acrescentar `and aprovado = false` ao `WITH CHECK`.

---

## 🟠 Alto

### A1. ✅ CORRIGIDO em 04/09/2026 — a contagem podia parecer salva sem estar

Agora a tela só é atualizada depois de conferir o `error`. Quando a gravação falha, o campo fica
vermelho com o badge `⚠ não salvou` e a mensagem do banco no tooltip. Corrigido em
`salvarContagemItem`, `limparContagemItem`, `limparTodasAsContagens` e `carregarContagens`
(`js/estoque.js`), e em `salvarContagemBobina` e `carregarBobinasContagem` (`js/bobinas.js`).
`limparTodasAsContagens` não limpa mais a tela se o banco recusar.

O texto original do achado fica abaixo, como registro.

### A1 (original). A contagem pode parecer salva sem ter sido salva

O cliente do Supabase **não lança exceção** em erro — ele devolve `{ data, error }`. O código
tem 28 chamadas `await sb.from(...)` e várias estão dentro de `try/catch` sem checar `error`.
O `catch` nunca dispara, e o erro é engolido em silêncio.

O caso grave é `salvarContagemItem()`, `L1209`:

```js
try {
  await sb.from('contagem_fisica').upsert({ ... });   // se falhar, não lança
  contagemMap[chave] = valor;                         // marca como salvo
  if (diffSlot) diffSlot.innerHTML = formatarDiferenca(valor, linha.quantidade);
  input.classList.add(... 'contagem-salvo' ...);      // fica verde
} catch (err) {
  console.warn('Erro ao salvar contagem:', err.message);  // nunca executa
}
```

**Cenário:** a pessoa está no galpão, digita a contagem de um endereço, o campo fica verde com
a divergência calculada, e ela segue para o próximo. A gravação falhou (RLS, oscilação de rede,
sessão expirada) e ninguém soube. No fim do inventário faltam itens que "foram contados".

Num sistema de contagem de estoque, isso é pior que dar erro na cara do usuário.

Mesmo padrão em `L1203`, `L1243`, `L1425` (limpar contagens), `L665` (log de acesso),
`L1880` e `L1369` (que declaram `error` e nunca o consultam).

**Correção:** conferir `const { error } = await ...; if (error) throw error;` em todas — e, na
contagem, só pintar de verde depois de confirmar. Este é o item de maior impacto prático da
lista.

### A2. `delete` + `insert` sem transação: a unidade pode ficar vazia

`L1762-1765` (estoque) e `L2068-2070` (bobinas) seguem o mesmo padrão:

```js
const { error: delError } = await sb.from('estoque').delete().eq('unidade', unidadeAtual);
if (delError) throw delError;
const { error: insError } = await sb.from('estoque').insert(records);   // e se falhar aqui?
```

Não há transação. Se o `insert` falhar depois de o `delete` ter passado — payload grande,
queda de rede, dado inválido, chave duplicada — **a tabela fica vazia** e não há rollback. A
mensagem de erro aparece, mas o estoque já foi.

**Correção:** fazer os dois numa função `rpc` no Postgres (transação de verdade), ou no mínimo
avisar de forma inequívoca e manter o texto colado na tela para nova tentativa.

### A3. ✅ REMOVIDO em 04/09/2026 junto com o C1

`seedInitialData()` e `SEED_DATA` saíram do código. Restou no lugar um comentário em
`js/estoque.js` explicando por que a carga inicial é tarefa de script SQL, para ninguém
reintroduzir o mecanismo.

O texto original do achado fica abaixo, como registro.

### A3 (original). `seedInitialData` grava sem `unidade` — e pode entrar em laço

`L1040`:

```js
async function seedInitialData() {
  const rows = SEED_DATA.map(r => ({
    item: r.item, descricao: r.desc, um: r.um, localizacao: r.loc, quantidade: r.qtd
  }));                                    // <== não define `unidade`
  await sb.from('estoque').insert(rows);  // <== erro não verificado
}
```

Quem chama, `L1029`:

```js
if ((!data || data.length === 0) && unidadeAtual === '106') {
  await seedInitialData();
  return loadData();      // recursão
}
```

Duas consequências, ambas dependentes do valor padrão da coluna `unidade` no banco — que não
está em nenhum script de `sql/` e precisa ser conferido:

- **Se a coluna não tiver padrão `'106'`:** as 539 linhas entram com `unidade` nula, o
  `loadData()` seguinte filtra por `'106'`, não acha nada, e chama `seedInitialData()` outra
  vez. **Laço infinito inserindo 539 linhas por volta**, até o navegador travar ou o banco
  encher.
- **Se tiver padrão `'106'`:** não há laço, mas basta o estoque de Araquari ficar vazio um
  instante (ver A2) para que **539 itens congelados de agosto substituam o estoque real**, com
  quantidades erradas, e ninguém receba aviso.

**Correção:** remover o mecanismo junto com `SEED_DATA` (C1). Carga inicial é tarefa de script
SQL rodado uma vez, não de código que roda a cada abertura de página.

### A4. ✅ CORRIGIDO em 04/09/2026 — "Limpar tudo" não checava quem está clicando

`limparTodasAsContagens()` apaga a contagem inteira da unidade, para todos, e não dá para
desfazer. A única proteção era o `confirm()` do navegador.

Depois da Fase 1 a política de escrita em `contagem_fisica` ficou `for all`, e `for all` inclui
DELETE: qualquer conta aprovada com perfil `estoque_alm` da unidade podia zerar a contagem no
meio de um inventário.

**Corrigido em duas camadas:**

- **Tela** (`js/estoque.js`): `podeLimparContagem()` pergunta ao banco por
  `pode_atualizar_estoque(unidade)` antes de qualquer coisa, e falha fechado se a consulta der
  erro. O botão fica escondido para quem não pode — cortesia, não trava.
- **Banco** (`sql/fase8-limpar-contagem-restrito.sql`): a política `for all` é **removida** e
  reconstruída em três (insert, update, delete). Só o DELETE muda de dono, para admin ou gerente
  da unidade. Tinha de ser substituição: acrescentar uma política restritiva ao lado da
  permissiva não tiraria nada, porque as permissivas se somam — foi esse o furo do C2.

⚠️ **O SQL ainda precisa ser rodado no painel do Supabase.** Até então vale só a trava da tela,
que um inspetor de navegador contorna.

---

## 🟡 Médio

### M1. ✅ CORRIGIDO na Fase 7 — quatro senhas em texto claro no código público

`EDIT_PIN`, `PINS_CONTAGEM` e `SENHA_AUDITORIA` saíram do JavaScript. A senha de contagem e o
PIN de edição vivem em `config_unidade`, legível só para admin, e a conferência acontece dentro
do banco: o navegador chama `senha_contagem_confere(unidade, tentativa)` e recebe apenas `true`
ou `false`. A senha das bobinas deixou de existir — quem controla o acesso é o perfil.

Sondado em 04/09/2026: as duas funções respondem, e `config_unidade` devolve vazio sem login.

O texto original do achado fica abaixo, como registro.

### M1 (original). Quatro senhas em texto claro no código público

`L570` `EDIT_PIN = "2026"` · `L571` `PINS_CONTAGEM = {106: 'INV106', 101: 'INV101', 105: 'INV105'}`
· `L1799` `SENHA_AUDITORIA = "aço2026"`.

Qualquer pessoa lê com Ctrl+U no portal. Não são segurança — são trava contra clique acidental,
e está tudo bem que sejam isso, desde que ninguém confie nelas. O problema é que hoje o PIN de
edição é a única barreira visível para uma ação destrutiva (ver C2).

### M2. Pessoas com nome fixo no código

`L572` `ADMIN_EMAIL` e `L1069` `podeEditarEmbalagem()` com
`'j.lisboa@kingspanisoeste.com.br'` escrito à mão. O mesmo e-mail do Robson está fixo em cinco
políticas de RLS.

Quando alguém sair da empresa ou trocar de função, é preciso editar código, publicar e alterar
políticas de banco. Já existe o padrão certo no projeto: tabelas como `gerentes_unidade` e
`editores_bobinas`.

### M3. 🟡 PARCIAL — metade do arquivo eram cinco linhas

`SEED_DATA` (63 KB) saiu com o C1, e o arquivo único virou nove (Fase 2a). **Os três logos
idênticos continuam lá:** conferido em 04/09/2026, o `index.html` tem quatro imagens em base64,
sendo três com o mesmo md5 — 24 KB baixados sem necessidade a cada acesso, o que pesa no celular
dentro do galpão.

O texto original do achado fica abaixo, como registro.

### M3 (original). Metade do arquivo são cinco linhas

De 200.120 bytes, **106 KB estão em 5 linhas** (53% do arquivo):

| Linha | Tamanho | O que é |
|---|---|---|
| 764 | 63.103 | `SEED_DATA` (ver C1) |
| 295 | 12.278 | logo em base64 |
| 319 | 12.278 | **o mesmo logo, de novo** |
| 335 | 12.278 | **o mesmo logo, terceira vez** |
| 557 | 6.304 | outra imagem em base64 |

Os três logos são byte a byte idênticos (mesmo md5) — 24 KB baixados sem necessidade a cada
acesso, o que pesa em celular no galpão.

**Correção:** o logo vira um arquivo `logo.png` referenciado três vezes, ou uma constante única.

### M4. ✅ CORRIGIDO pela Fase 1 — o log de acessos era visível para todos

`acessos` tinha leitura `using (true)`. A Fase 1 trocou por
`for select using (eh_admin())` (`sql/fase1c-rls.sql`) — o portal só insere nessa tabela, nunca
lê. Sondado em 04/09/2026: devolve vazio sem login.

---

## 🟢 Baixo

- **B1.** `L1449` `corredorDoItem()` é código morto — definida e nunca chamada. Se algum dia
  for usada, tem defeito: faz `find` só por `item`, e o mesmo item existe em vários endereços,
  então devolveria o corredor errado.
- **B2.** ✅ O laço vazio `.forEach(el => {})` não existe mais — sumiu na divisão em módulos.
- **B3.** `L1104` `salvarEmbalagem()` usa `.update()`. Se a linha não existir, afeta zero
  registros, não dá erro e a tela mostra "Salvo!". O caminho de `L1142` já contorna com
  `upsert`; o outro não.
- **B4.** ✅ **CORRIGIDO em 04/09/2026, e era pior do que "desatualizado".** O script criava
  `bobinas_aco` com colunas que a produção não usa — mas o problema grave eram as **políticas**:
  ele recriava `using (true)` em `contagem_bobinas` e a política de e-mail fixo em `bobinas_aco`.
  Rodá-lo depois da Fase 1 **reabria** a escrita que a Fase 1 tinha fechado, e o
  `create table if not exists` fazia o script parecer inofensivo (as políticas não são
  condicionais: rodavam sempre). Reescrito para criar só estrutura, com as colunas conferidas
  contra a produção e um aviso remetendo o RLS à Fase 1.
- **B5.** ✅ **Respondido:** `contagem_bobinas_ocr` é a tabela do módulo de validação por foto
  (ver seção do OCR, item O8). Nenhum script a criava — ela nasceu à mão no painel. A estrutura
  agora está em `sql/bobinas-aco.sql`, Parte 3.

---

## 📸 Módulo de validação por foto (OCR) — auditado em 04/09/2026

Leitura completa de `js/ocr.js` (317 linhas), que nunca havia sido lido de ponta a ponta. É o
módulo mais novo e o menos exercitado: entrou em 03/09/2026, existindo primeiro só no deploy do
Vercel (ver `CLAUDE.md` seção 12).

Nove achados. Os dois primeiros são graves e, juntos, explicam por que o veredito automático não
podia ser confiável.

### O1. 🔴 O registro podia falhar em silêncio, dizendo "Registrado!" em verde

`salvarValidacaoBobina()` envolvia o `insert` em `contagem_bobinas_ocr` num `try/catch`. O
cliente do Supabase devolve `{ error }` e **não lança** — o `catch` nunca disparava. Recusa do
RLS, queda de rede ou coluna faltando apareciam como sucesso, e o modal fechava em um segundo.

É exatamente o item A1 desta auditoria, que já havia sido corrigido em `estoque.js` e
`bobinas.js` e passou batido neste arquivo.

**Corrigido:** confere `error`, mostra `NÃO SALVOU: <motivo>` e manda registrar no papel.

### O2. 🔴 A leitura do peso errava quase toda bobina real

`acharPesoEtiqueta()` usava `/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*KG/`. O `\d{1,3}` casa no
máximo três dígitos, então o regex escorregava para os **três últimos**:

| Etiqueta | Lido antes | Certo |
|---|---|---|
| `4820 KG` | **820** | 4820 |
| `12480 KG` | **480** | 12480 |
| `4820,50 KG` | **820,5** | 4820,5 |
| `1234.56 KG` | **23456** | 1234,56 |
| `4.820 KG` | 4820 ✅ | 4820 |

Só a etiqueta que imprimisse o ponto de milhar era lida certo. Bobina de aço pesa quatro ou cinco
dígitos: o veredito automático acusava **divergência em quase toda leitura bem-sucedida do
código** — e com um número plausível na tela, que é o pior jeito de errar.

Somava-se `parseNum()`, que apaga *todo* ponto antes de trocar a vírgula: `"1234.56"` virava
`123456`, cem vezes o peso.

**Corrigido:** `numeroDaEtiqueta()` decide milhar ou decimal pela posição do separador e pelo
tamanho do último grupo; `acharPesoEtiqueta()` passa a preferir o número que vem depois de
PESO/LÍQUIDO (antes, `LARGURA 1200 MM` podia roubar o lugar do peso) e tolera o OCR ler `O` como
`0` e `G` como `6`. Dez casos de etiqueta conferidos, incluindo `PES0 3150 K6`.

### O3. 🟠 O veredito comparava contra um lote escolhido a esmo

`bobinasData.find(r => r.item === codigo)`, em três lugares. A chave da bobina é
**item + localização + lote** — a mesma bobina existe em vários lotes no pátio, e é o que
`chaveBobina()` resolve no resto do módulo. O `find` devolvia a primeira linha, e o
"✅ TUDO OK" ou "⚠️ DIVERGENTE" saía sobre outra bobina.

**Corrigido pela metade:** com mais de um lote o veredito automático é suprimido, os lotes
aparecem listados (lote · localização · peso) e o registro grava `peso_sistema` **nulo** em vez
do número errado. Ficou pior de usar e certo, em vez de confortável e errado.

⚠️ **A correção completa exige campo de lote no modal e na tabela `contagem_bobinas_ocr`** — é
mudança de desenho, e não foi feita aqui.

### O4. 🟠 Peso em branco virava zero e era gravado como fato

`parseNum('')` devolve `0`. Confirmar sem digitar o peso gravava `peso_etiqueta = 0` como se
fosse leitura; "Salvar divergência" acusava diferença de 0 contra 4820.

**Corrigido:** campo vazio é `null`, confirmar OK sem peso é recusado com aviso, e "peso da
etiqueta não informado" passou a ser um motivo de alerta explícito.

### O5. 🟠 A foto — a prova da conferência — é descartada em silêncio

O upload vai para o bucket `fotos-bobinas`, que **não existe**: sondado em 04/09/2026, a API do
Storage responde `Bucket not found`. O código engolia a falha e gravava `foto_url` nulo. Todas as
fotos de etiqueta tiradas até hoje foram perdidas.

**Corrigido pela metade:** a tela avisa `A foto NÃO foi guardada: <motivo>` e o modal fica aberto
para a pessoa ler. **Falta criar o bucket** — Storage → New bucket → `fotos-bobinas`. Sem isso o
módulo funciona, mas sem prova.

### O6. 🟡 Confirmar OK sobre uma divergência era indistinguível de um acerto

Clicar "Confirmar OK" com peso divergente gravava `status = 'OK'`, sem alerta — igual a uma
conferência em que os números bateram. A decisão de quem estava lá desaparecia do registro.

**Corrigido:** grava `OK com ressalva`, com `alerta_sistema` e o motivo
`Confirmado pelo operador`. É um valor novo de `status`, além de `OK` e `Divergente`.

### O7. 🟡 Todo mundo é inscrito no canal de alertas, sempre

`sb.channel('alertas-bobinas').subscribe()` roda no carregamento da página, para qualquer perfil
e qualquer unidade: um consultor de Anápolis recebe o banner de divergência de uma bobina de
Araquari. O `payload` não carrega unidade, então não há como filtrar no recebimento.

**Não mexido:** alterar tempo real pede teste com duas sessões abertas, e o módulo nunca foi
exercitado com etiqueta real. Fica registrado.

### O8. 🟢 Nenhum script criava `contagem_bobinas_ocr`

A tabela nasceu à mão no painel. Num banco novo o módulo não teria onde gravar — e, por causa do
O1, a falha apareceria como "Registrado!". Estrutura agora em `sql/bobinas-aco.sql`, Parte 3,
com as colunas conferidas contra a produção. Isto também responde o B5.

### O9. 🟢 O Tesseract vem de CDN, e a mensagem não distingue os casos

`cdn.jsdelivr.net` no `index.html`. Se a rede da empresa bloquear o CDN, `Tesseract` fica
indefinido, o `ReferenceError` cai no `catch` e a tela diz "Erro na leitura. Digite os dados
manualmente." — comportamento certo, mas a informação de que o problema é a rede, e não a
etiqueta, se perde. Vale distinguir as duas mensagens.

---

## O que está bem feito

Para não passar a impressão de que está tudo errado — não está:

- **Proteção contra XSS consistente.** `escapeHtml()` (`L774`) é aplicada em todo dado que vai
  para o HTML, inclusive dentro de atributos. Em código que monta tela com template string, é
  o erro mais comum, e aqui não há.
- **`usuarios_permitidos` bem desenhada.** Cada um vê só o próprio status, só o admin vê a lista
  e só o admin aprova. Ninguém se auto-aprova pelo caminho normal (ver C3 para o INSERT).
- **A chave da contagem é `item + localização`** (`L787`), não só o item. É a decisão certa, e é
  o tipo de coisa que quase sempre aparece errada em sistema de inventário.
- **`CSS.escape()`** nos seletores (`L1232`, `L1377`) — cuidado que raramente se vê.
- **Tempo real com `filter: unidade=eq.X`** (`L1401`), em vez de trazer tudo e filtrar depois.
- **Comentários explicando o "por quê"**, não o "o quê" — `L785`, `L1379`, `L1761`.
- **Escrita de `bobinas_aco` e `fichas_tecnicas` corretamente restrita** no RLS.

O problema deste projeto não é falta de cuidado. É que ele cresceu por colagem, sem uma leitura
de cima a baixo — então sobraram políticas antigas em cima das novas, e resíduos como o
`SEED_DATA` e o mecanismo de carga inicial.

---

## O que falta, em ordem

| # | Item | Por quê nesta ordem |
|---|---|---|
| 1 | **Rodar `sql/fase8-limpar-contagem-restrito.sql`** | O A4 só está corrigido na tela até isso acontecer |
| 2 | **Criar o bucket `fotos-bobinas`** (O5) | Uma tela no painel do Supabase, e a prova da conferência para de ser perdida |
| 3 | **A2** — transação no `delete` + `insert` | O item mais grave que resta: a unidade pode ficar sem estoque, sem rollback. Pede função no Postgres |
| 4 | **O3 completo** — lote no modal e na tabela do OCR | Mudança de desenho: hoje o veredito é suprimido em vez de errado |
| 5 | **O7** — recortar o alerta de bobina por unidade | Pede teste com duas sessões |
| 6 | **M2** — tirar os e-mails fixos do código | `ADMIN_EMAIL` em `js/config.js` e `j.lisboa@...` em `js/estoque.js`. Já existe o padrão certo: tabelas como `gerentes_unidade` |
| 7 | **M3** — os três logos idênticos | 24 KB por acesso, sentido no celular do galpão |
| 8 | **B1, B3, O9** | Faxina, sem pressa |

Os itens 1 e 2 são de painel, não de código, e destravam o resto.
