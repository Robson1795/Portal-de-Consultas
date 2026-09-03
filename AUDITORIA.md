# Auditoria do Portal — 02/09/2026

Leitura completa do `index.html` (2.084 linhas) e do diagnóstico de RLS do Supabase
(`pg_policies`, mesmo dia). Cada item traz o local no código e o cenário concreto de falha —
nada aqui é suposição de estilo.

**Contexto que atenua tudo:** o portal ainda não está em uso. Nenhum item abaixo causou dano
até agora, e todos são bem mais baratos de corrigir hoje do que depois.

Numeração por severidade. `L###` = linha do `index.html`.

> ⚠️ **Escopo e validade.** Esta auditoria foi feita sobre o `index.html` de 2.084 linhas
> (commit `bb31bad`). Em 03/09/2026 entrou o **módulo de validação por OCR** (~380 linhas,
> ver `CLAUDE.md` seção 9), que **não está coberto aqui** — e os números de linha abaixo
> saíram de lugar. Para localizar um trecho, busque pelo nome da função em vez da linha.
> Os achados em si continuam valendo: nenhum deles foi corrigido ainda.

---

## 🔴 Crítico

### C1. Os dados de estoque estão no HTML público, sem precisar de login

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

### C2. Qualquer conta logada pode substituir o estoque das três unidades

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

### C3. A aprovação de conta pode ser burlável — pendente de confirmação

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

### A1. A contagem pode parecer salva sem ter sido salva

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

### A3. `seedInitialData` grava sem `unidade` — e pode entrar em laço

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

### A4. "Limpar tudo" não checa quem está clicando

`L1421` `limparTodasAsContagens()` apaga a contagem inteira da unidade, para todos. A única
proteção é o `confirm()` do navegador. Não há verificação de admin nem de gerente.

Hoje, com a escrita aberta, qualquer conta consegue. Depois da correção de RLS, qualquer conta
**aprovada** consegue — o que ainda é amplo demais para uma ação irreversível no meio de um
inventário.

**Correção:** restringir a admin ou gerente da unidade, no código e no RLS.

---

## 🟡 Médio

### M1. Quatro senhas em texto claro no código público

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

### M3. Metade do arquivo são cinco linhas

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

### M4. O log de acessos é visível para todos

`acessos` tem leitura `using (true)`: qualquer conta consulta quem entrou no portal e quando.
Sem motivo. Corrigido na Parte 3 do script de permissões.

---

## 🟢 Baixo

- **B1.** `L1449` `corredorDoItem()` é código morto — definida e nunca chamada. Se algum dia
  for usada, tem defeito: faz `find` só por `item`, e o mesmo item existe em vários endereços,
  então devolveria o corredor errado.
- **B2.** `L1848` `.forEach(el => {})` — laço vazio, resíduo de edição.
- **B3.** `L1104` `salvarEmbalagem()` usa `.update()`. Se a linha não existir, afeta zero
  registros, não dá erro e a tela mostra "Salvo!". O caminho de `L1142` já contorna com
  `upsert`; o outro não.
- **B4.** `sql/bobinas-aco.sql` cria `bobinas_aco` com colunas que o código não usa mais
  (`codigo, largura, espessura, peso, saldo_sistema` em vez de
  `item, descricao, est, dep, localizacao, lote, um, qtd_liquida`). Inofensivo em banco
  existente, quebraria um banco novo.
- **B5.** Existe a tabela `contagem_bobinas_ocr`, sem documentação e sem uso aparente no
  `index.html`. Confirmar para que serve.

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

## Ordem sugerida de correção

| # | Item | Por quê primeiro |
|---|---|---|
| 1 | **C1** — remover `SEED_DATA` | Expõe dado sem login. É deleção, não tem risco |
| 2 | **C2** — rodar `sql/corrige-permissoes.sql` | Fecha a escrita aberta no estoque |
| 3 | **C3** — conferir `WITH CHECK` | Uma consulta. Pode ser nada, pode ser grave |
| 4 | **A1** — checar `error` em todas as chamadas | Maior impacto prático no dia da contagem |
| 5 | **A3** — remover a carga inicial | Sai junto com C1 |
| 6 | **A2** — transação no delete+insert | Precisa de função no Postgres |
| 7 | **A4, M1–M4** | Junto com a divisão em módulos |
| 8 | **B1–B5** | Faxina, sem pressa |

Os itens 1, 4 e 5 são mudanças no `index.html` e caberiam num único Pull Request pequeno, antes
da divisão em módulos.
