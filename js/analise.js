// Portal de Estoque Kingspan Isoeste — Análise de Compras
//
// O Robson cola todo dia a planilha dos pedidos que estão entrando pra
// separação. Esta tela soma quanto cada item é pedido no total (coluna
// Qt. Pedida -- decisão dele em 09/09/2026, Qt. Atendida NÃO entra na
// conta), compara com o saldo do almoxarifado da unidade e diz o que
// falta comprar: "a ideia é eu não deixar faltar material em estoque, e
// que eu consiga me antecipar com as solicitações de compra".
//
// ⚠️ Escrita e leitura são limitadas pela unidade no RLS
// (sql/fase19-analise-compras.sql). O filtro por unidade também é feito
// AQUI, no cliente -- o RLS deixa o admin ver todas as unidades de
// propósito, e sem este filtro a conta misturaria unidades diferentes.

let analiseDemanda = [];        // analise_demanda -- uma linha por linha da planilha colada
let analiseSaldoMap = new Map(); // codigo_item -> saldo somado no almoxarifado da unidade
let analisePendentes = [];      // prévia da planilha colada, antes de gravar
let analiseSoFalta = false;     // filtro "só o que falta comprar"
// Anotações por item (analise_item_notas): "não preciso repor" e a
// observação livre ("já solicitei compra", "pedido 1234"...). Sobrevivem à
// troca da planilha -- por isso não moram na analise_demanda.
let analiseNotas = new Map();   // codigo_item -> { ignorado, observacao }
let analiseVerIgnorados = false; // mostrando a lista dos ignorados em vez da normal
// codigo_item -> [{ unidade, quantidade }] das OUTRAS unidades que têm o
// item -- pra pedir transferência em vez de comprar.
let analiseOutrasUnidades = new Map();
// E-mail do Compras da unidade aberta, lido por funcao `security definer`
// (config_unidade guarda senhas na mesma linha e so admin le a tabela
// direto). Vazio = botao de solicitacao desabilitado: adivinhar endereco
// mandaria a solicitacao pro lugar errado sem ninguem saber.
let emailComprasUnidade = '';

// {item, descricao, quantidade}[] do estoque desta unidade -- pra sugerir
// item equivalente (mesma medida, mesmo material) no lugar de comprar um
// item difícil de achar fornecedor. Ver sugerirSubstitutos().
let analiseEstoqueLista = [];

// Acesso restrito (sql/fase21-analise-acesso-restrito.sql): admin, quem
// está na lista analise_compras_acesso, ou o responsável (gerentes_unidade)
// desta unidade especifica -- NÃO é sobre qual unidade (isso é minha_unidade(),
// que já filtra tudo há muito tempo e não muda aqui), é sobre "posso ver esta
// aba, pra começo de conversa". Ver js/navegacao.js (montarMenu) pra onde isso
// esconde/mostra o item do menu.
let podeVerAnaliseCache = false;

async function atualizarPermissaoAnalise() {
  if (!unidadeAtual) { podeVerAnaliseCache = false; return; }
  const { data, error } = await sb.rpc('pode_ver_analise_compras', { uni: unidadeAtual });
  podeVerAnaliseCache = !error && data === true;
}

// normalizaCodigoItem() mora em js/estoque.js (carregado antes deste
// arquivo) -- é usada tanto aqui quanto por sugerirSubstitutos(), então
// virou utilitário compartilhado em vez de duplicada. Bug que motivou:
// Robson relatou em 2026-09-09 que o item 996613I tinha 43 no almoxarifado
// (conferido no TOTVS), mas a análise mostrava saldo 0 e mandava comprar --
// o código do estoque estava gravado como "996613i" (minúsculo) e o da
// planilha de pedidos como "996613I" (maiúsculo).

function analiseNotaDoItem(codigoItem) {
  return analiseNotas.get(normalizaCodigoItem(codigoItem))
      || { ignorado: false, observacao: '', solicitado_em: null, solicitado_por: '' };
}

function analiseItemIgnorado(codigoItem) {
  return analiseNotaDoItem(codigoItem).ignorado === true;
}

// Ordem das colunas da planilha que o Robson cola (a mesma do relatório que
// ele já usa): EMISSÃO, PEDIDO, NOME ABREV, SEQ ETAPA, ITEM ESTOQUE,
// DESCRIÇÃO, UM, QT. PEDIDA, QT. ATENDIDA, DATA EMBARQUE, OS.
const ANALISE_COLUNAS = ['Emissão', 'Pedido', 'Nome abrev.', 'Seq. etapa', 'Item',
                         'Descrição', 'UM', 'Qt. pedida', 'Qt. atendida', 'Data embarque', 'OS'];

// Cabeçalho reconhecido pra pular a primeira linha quando ela vem junto na
// cópia -- confere pelo miolo ("item" na coluna 5), não pelo texto exato,
// porque o título muda de acordo com o relatório que gerou a planilha.
function analiseEhCabecalho(cols) {
  const item = String(cols[4] || '').toLowerCase();
  const qtd = String(cols[7] || '').toLowerCase();
  return item.includes('item') || qtd.includes('qt');
}

function parseAnaliseTexto(texto) {
  return texto.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => l.split('\t').map(c => c.trim()))
    .filter(cols => !analiseEhCabecalho(cols))
    .filter(cols => cols[4]) // sem código de item a linha não serve pra análise nenhuma
    .map(cols => ({
      emissao: cols[0] || null,
      numero_pedido: cols[1] || null,
      nome_abreviado: cols[2] || null,
      seq_etapa: cols[3] || null,
      codigo_item: cols[4],
      descricao: cols[5] || null,
      um: cols[6] || null,
      qt_pedido: cols[7] ? parseQtd(cols[7]) : null,
      qt_atendida: cols[8] ? parseQtd(cols[8]) : null,
      data_embarque: cols[9] || null,
      os: cols[10] || null
    }));
}

// ---- Carga --------------------------------------------------------------
async function carregarAnalise() {
  const msg = document.getElementById('analiseMsg');
  msg.textContent = '';
  msg.className = 'status-msg';

  if (!unidadeAtual) {
    msg.textContent = 'Sua conta ainda não tem unidade definida. Peça ao administrador.';
    msg.className = 'status-msg status-err';
    return;
  }

  const [demanda, estoque, notas, emailCompras] = await Promise.all([
    sb.from('analise_demanda').select('*').eq('unidade', unidadeAtual),
    // Sempre o almoxarifado: a análise compara a carteira de PEDIDOS com o
    // estoque de produção. EPI não atende pedido de cliente, e um código que
    // exista nos dois depósitos inflaria o saldo e esconderia uma falta.
    sb.from('estoque').select('item, descricao, quantidade').eq('unidade', unidadeAtual).eq('deposito', 'alm'),
    sb.from('analise_item_notas')
      .select('codigo_item, ignorado, observacao, solicitado_em, solicitado_por')
      .eq('unidade', unidadeAtual),
    sb.rpc('email_compras_da_unidade', { uni: unidadeAtual })
  ]);

  if (demanda.error) {
    msg.textContent = 'Não foi possível carregar a análise: ' + demanda.error.message
      + ' — se a mensagem falar em tabela inexistente, sql/fase19-analise-compras.sql'
      + ' ainda não foi rodado no Supabase.';
    msg.className = 'status-msg status-err';
    console.error('Falha ao carregar análise de compras:', demanda.error.message);
  }
  analiseDemanda = demanda.error ? [] : (demanda.data || []);

  // O mesmo item aparece em VÁRIAS linhas do estoque (uma por localização) --
  // somar é obrigatório, senão o saldo sairia só o do primeiro endereço e a
  // tela mandaria comprar o que já tem. Chave normalizada (maiúsculo, sem
  // espaço): ver normalizaCodigoItem().
  analiseSaldoMap = new Map();
  (estoque.error ? [] : (estoque.data || [])).forEach(r => {
    const chave = normalizaCodigoItem(r.item);
    const atual = analiseSaldoMap.get(chave) || 0;
    analiseSaldoMap.set(chave, atual + parseQtd(r.quantidade));
  });

  // Guardada à parte (não só o saldo) pra poder sugerir item equivalente no
  // lugar de comprar um item difícil de achar fornecedor -- ver
  // sugerirSubstitutos(). Só itens com saldo (item zerado não serve de
  // sugestão).
  analiseEstoqueLista = (estoque.error ? [] : (estoque.data || []))
    .filter(r => parseQtd(r.quantidade) > 0);

  // Se a fase20 ainda não rodou, o mapa fica vazio e a tela funciona igual --
  // só sem esconder nada e sem observação (mesmo tratamento do resto do projeto).
  if (notas.error) console.warn('Não foi possível carregar as anotações dos itens:', notas.error.message);
  // Chave normalizada, igual a busca em analiseNotaDoItem(): sem isso, item
  // cujo codigo esteja gravado com espaco ou em minuscula nunca casaria -- a
  // observacao desapareceria da tela, o "nao repor" voltaria a aparecer e a
  // marca de solicitacao sumiria, tudo sem erro nenhum. Ver normalizaCodigoItem().
  analiseNotas = new Map((notas.error ? [] : (notas.data || []))
    .map(r => [normalizaCodigoItem(r.codigo_item), {
      ignorado: r.ignorado === true,
      observacao: r.observacao || '',
      solicitado_em: r.solicitado_em || null,
      solicitado_por: r.solicitado_por || ''
    }]));

  // Falha aqui NAO e silenciosa: sem o e-mail, o botao de solicitacao fica
  // desabilitado, e a pessoa precisa saber se e porque ninguem cadastrou ou
  // porque a leitura falhou -- as duas se pareceriam na tela.
  emailComprasUnidade = '';
  if (emailCompras.error) {
    console.warn('Nao foi possivel ler o e-mail do Compras:', emailCompras.error.message);
    msg.textContent = 'Atenção: não foi possível ler o e-mail do Compras ('
      + emailCompras.error.message + '). O botão de solicitação fica desabilitado.'
      + ' Se a mensagem falar em função inexistente, sql/fase22-solicitacao-compra.sql'
      + ' ainda não foi rodado no Supabase.';
    msg.className = 'status-msg status-err';
  } else {
    emailComprasUnidade = String(emailCompras.data || '').trim();
  }

  await limparObservacoesResolvidas();
  await carregarSaldoOutrasUnidades();
  renderAnalise();
}

// A observação ("já solicitei compra", "RESSUPRIMENTO"...) sobrevive à
// troca da planilha de propósito -- mora em analise_item_notas, separada da
// analise_demanda (ver o SQL). Mas o Robson: "quero que deixe salvo as
// observações mesmo que eu atualize a planilha, só sair quando o item
// estiver em estoque" -- ela deve DESAPARECER sozinha quando o saldo
// finalmente cobrir o pedido de novo, senão ficaria uma anotação velha
// grudada num item que já foi resolvido, pra sempre.
//
// Roda a cada carga (fresh saldo + fresh demanda), depois de agruparAnalise()
// já poder calcular `comprar` -- não mexe em "não repor" (`ignorado`), que é
// característica do item e não do estoque estar baixo ou não.
//
// Uma chamada só (upsert em lote) em vez de uma por item: pode resolver
// dezenas de itens de uma vez (reposição grande chegando), e isso é limpeza
// de fundo, não uma ação que a pessoa pediu -- não faz sentido nem esperar
// uma rodada de chamadas nem mostrar erro de rede pra ela por causa disso.
async function limparObservacoesResolvidas() {
  const resolvidos = agruparAnalise().filter(l =>
    l.comprar <= 0 && analiseNotaDoItem(l.codigo_item).observacao);
  if (!resolvidos.length) return;

  const agora = new Date().toISOString();
  const linhas = resolvidos.map(item => ({
    unidade: unidadeAtual,
    codigo_item: item.codigo_item,
    ignorado: analiseNotaDoItem(item.codigo_item).ignorado,
    observacao: null,
    atualizado_por: nomeUsuarioAtual,
    atualizado_em: agora
  }));

  const { data, error } = await sb.from('analise_item_notas')
    .upsert(linhas, { onConflict: 'unidade,codigo_item' })
    .select('codigo_item');

  if (error) {
    console.warn('Não foi possível limpar observações de itens já resolvidos:', error.message);
    return;
  }

  const limpos = new Set((data || []).map(r => r.codigo_item));
  resolvidos.forEach(item => {
    if (!limpos.has(item.codigo_item)) return;
    const atual = analiseNotaDoItem(item.codigo_item);
    analiseNotas.set(item.codigo_item, { ignorado: atual.ignorado, observacao: '' });
  });
}

// Pros itens em falta, procura saldo nas OUTRAS unidades: o Robson pediu pra
// ver de onde dá pra pedir transferência antes de abrir solicitação de
// compra -- comprar o que a empresa já tem em outro galpão é dinheiro jogado
// fora. A leitura de `estoque` no RLS não é limitada por unidade (só exige
// conta aprovada, ver fase1c-rls.sql), então a consulta enxerga as outras.
//
// Só busca pros itens EM FALTA: pra quem já tem saldo, de onde mais existe é
// informação que ninguém vai usar -- e a consulta ficaria grande à toa.
async function carregarSaldoOutrasUnidades() {
  analiseOutrasUnidades = new Map();
  const emFalta = agruparAnalise().filter(l => l.comprar > 0).map(l => l.codigo_item);
  if (!emFalta.length) return;

  // Item que termina em "I" tem um código PRÓPRIO no estoque da Trading (ver
  // codigoTradingDoItem, js/estoque.js) -- sem tratar à parte, a busca acima
  // (que casa o código exato) nunca acharia a Trading pra esses itens, mesmo
  // com saldo lá. Mapa código-da-trading -> código original, pra devolver o
  // resultado já com o código que o resto da tela reconhece.
  const codigoOriginalPorCodigoTrading = new Map();
  emFalta.forEach(codigo => {
    const codTrading = codigoTradingDoItem(codigo);
    if (codTrading) codigoOriginalPorCodigoTrading.set(codTrading, codigo);
  });

  const juntarResultado = (itemBruto, unidade, qtd) => {
    if (qtd <= 0) return; // unidade zerada não serve pra transferência
    const item = normalizaCodigoItem(itemBruto); // ver normalizaCodigoItem: mesmo bug do saldo valia aqui
    if (!analiseOutrasUnidades.has(item)) analiseOutrasUnidades.set(item, []);
    const lista = analiseOutrasUnidades.get(item);
    // Mesmo item pode estar em vários endereços da mesma unidade -- soma,
    // senão a tela ofereceria transferir só o que tem no primeiro endereço.
    const jaTem = lista.find(u => u.unidade === unidade);
    if (jaTem) jaTem.quantidade += qtd;
    else lista.push({ unidade, quantidade: qtd });
  };

  // `.in()` do Postgres é sensível a maiúscula/minúscula (diferente do
  // `Map.get()` do JS, que já normalizamos acima) -- sem incluir as duas
  // variantes na busca, um item gravado em minúsculo em OUTRA unidade nunca
  // apareceria aqui, mesmo com saldo lá. Em blocos menores (50 códigos, 100
  // variantes) porque cada código agora entra duas vezes na lista: o `in`
  // do PostgREST viaja na URL, e o mesmo estouro que blocos de 100 evitam
  // pra uma variante por código valeria em dobro pra duas.
  const BLOCO = 50;
  for (let de = 0; de < emFalta.length; de += BLOCO) {
    const pedaco = emFalta.slice(de, de + BLOCO);
    const variantes = [...new Set(pedaco.flatMap(c => [c, c.toLowerCase()]))];
    const { data, error } = await sb.from('estoque')
      .select('item, unidade, quantidade')
      .in('item', variantes)
      .neq('unidade', unidadeAtual);

    if (error) {
      console.warn('Não foi possível checar o saldo das outras unidades:', error.message);
      return;
    }
    (data || []).forEach(r => juntarResultado(r.item, r.unidade, parseQtd(r.quantidade)));
  }

  const codigosTrading = [...codigoOriginalPorCodigoTrading.keys()];
  for (let de = 0; de < codigosTrading.length; de += BLOCO) {
    const pedaco = codigosTrading.slice(de, de + BLOCO);
    const variantes = [...new Set(pedaco.flatMap(c => [c, c.toLowerCase()]))];
    const { data, error } = await sb.from('estoque')
      .select('item, quantidade')
      .in('item', variantes)
      .eq('unidade', UNIDADE_TRADING);

    if (error) {
      console.warn('Não foi possível checar o saldo da Trading:', error.message);
      continue;
    }
    (data || []).forEach(r => juntarResultado(
      codigoOriginalPorCodigoTrading.get(normalizaCodigoItem(r.item)), UNIDADE_TRADING, parseQtd(r.quantidade)));
  }

  analiseOutrasUnidades.forEach(lista => lista.sort((a, b) => b.quantidade - a.quantidade));
}

// ---- O cálculo ----------------------------------------------------------
// Uma linha por ITEM, somando o que todos os pedidos juntos precisam dele.
// É esse total que responde "não vou ter pra atender todos" -- item a item,
// pedido a pedido, cada um caberia; junto é que falta.
function agruparAnalise() {
  const porItem = new Map();

  analiseDemanda.forEach(l => {
    const chave = normalizaCodigoItem(l.codigo_item);
    if (!chave) return;
    if (!porItem.has(chave)) {
      porItem.set(chave, {
        codigo_item: chave,
        descricao: l.descricao || '',
        um: l.um || '',
        pedido: 0,
        pedidos: new Set(),
        primeiroEmbarque: null
      });
    }
    const item = porItem.get(chave);
    item.pedido += parseQtd(l.qt_pedido) || 0;
    if (l.numero_pedido) item.pedidos.add(l.numero_pedido);
    if (!item.descricao && l.descricao) item.descricao = l.descricao;
    if (!item.um && l.um) item.um = l.um;

    const data = dataEmbarqueParaOrdenar(l.data_embarque);
    if (data && (!item.primeiroEmbarque || data < item.primeiroEmbarque)) {
      item.primeiroEmbarque = data;
      item.primeiroEmbarqueTexto = l.data_embarque;
    }
  });

  return [...porItem.values()].map(item => {
    const saldo = analiseSaldoMap.get(item.codigo_item) || 0;
    const sobra = saldo - item.pedido;
    return {
      ...item,
      qtdPedidos: item.pedidos.size,
      saldo,
      sobra,
      comprar: sobra < 0 ? Math.abs(sobra) : 0
    };
  }).sort((a, b) => {
    // Falta primeiro, e dentro das faltas, o embarque mais próximo na frente:
    // é a ordem em que o material precisa chegar, não a ordem alfabética.
    if ((a.comprar > 0) !== (b.comprar > 0)) return a.comprar > 0 ? -1 : 1;
    if (a.comprar > 0 && b.comprar > 0) {
      if (a.primeiroEmbarque && b.primeiroEmbarque && +a.primeiroEmbarque !== +b.primeiroEmbarque) {
        return a.primeiroEmbarque - b.primeiroEmbarque;
      }
      if (a.primeiroEmbarque && !b.primeiroEmbarque) return -1;
      if (!a.primeiroEmbarque && b.primeiroEmbarque) return 1;
      return b.comprar - a.comprar;
    }
    return String(a.codigo_item).localeCompare(String(b.codigo_item));
  });
}

// A planilha traz a data em DD/MM/AAAA (formato brasileiro). new Date() com
// essa string é ambíguo entre navegadores -- por isso monta a data por
// partes, igual ao parseDataHoraBR() do Controle EXP. Formato desconhecido
// devolve null: o item continua na lista, só sem prioridade por data.
function dataEmbarqueParaOrdenar(texto) {
  const limpo = String(texto || '').trim();
  if (!limpo) return null;
  const br = limpo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    return new Date(ano, Number(br[2]) - 1, Number(br[1]));
  }
  const iso = limpo.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

function linhasFiltradasAnalise() {
  const busca = document.getElementById('analiseBusca').value.trim().toLowerCase();
  // Ou a lista normal (sem os ignorados), ou só os ignorados -- nunca as
  // duas juntas: misturar faria a pessoa mandar pra Compras um item que ela
  // mesma marcou como "não repor".
  let linhas = agruparAnalise().filter(l => analiseItemIgnorado(l.codigo_item) === analiseVerIgnorados);
  if (analiseSoFalta) linhas = linhas.filter(l => l.comprar > 0);
  if (busca) {
    linhas = linhas.filter(l =>
      String(l.codigo_item).toLowerCase().includes(busca) ||
      String(l.descricao).toLowerCase().includes(busca));
  }
  return linhas;
}

function numeroBR(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

// Largura do campo de Observação: o Robson pediu "maleável" -- cresce
// conforme o texto, com um teto pra não esticar a tabela inteira quando um
// item tiver uma observação enorme. A tabela já rola pro lado (.scroll-area),
// então uma coluna mais larga não quebra o layout, só empurra o resto.
const ANALISE_OBS_LARGURA_MIN = 170;
const ANALISE_OBS_LARGURA_MAX = 420;

// Estimativa por caractere pra já nascer no tamanho certo, antes mesmo de o
// campo entrar no DOM (ajustarLarguraObservacao, mais abaixo, refina depois
// com a largura real do texto renderizado).
function larguraObservacao(texto) {
  const estimativa = String(texto || '').length * 7 + 24;
  return Math.min(ANALISE_OBS_LARGURA_MAX, Math.max(ANALISE_OBS_LARGURA_MIN, estimativa));
}

// Elemento invisível reaproveitado pra medir o texto -- criar um novo a
// cada chamada seria desperdício, e um só compartilhado é suficiente
// porque a medição é síncrona (mede e já lê o resultado, sem sobrepor
// chamadas).
let _medidorObservacao = null;
function medirLarguraTexto(texto, input) {
  if (!_medidorObservacao) {
    _medidorObservacao = document.createElement('span');
    _medidorObservacao.style.position = 'absolute';
    _medidorObservacao.style.left = '-9999px';
    _medidorObservacao.style.whiteSpace = 'pre';
    document.body.appendChild(_medidorObservacao);
  }
  // Copia a fonte de verdade do próprio campo (tamanho, peso, família) --
  // sem isso a medição usaria a fonte padrão do navegador, que pode ser
  // mais larga ou mais estreita que a da tela e sair errado.
  _medidorObservacao.style.font = getComputedStyle(input).font;
  _medidorObservacao.textContent = texto || '';
  return _medidorObservacao.offsetWidth;
}

// Ajusta pela largura REAL do texto (medida com a mesma fonte do campo) --
// `scrollWidth` de um `<input>` não é confiável pra isso em todo navegador
// (não reflete texto que passa da largura visível, diferente de uma div).
// Chamada ao digitar, e uma vez logo depois de desenhar a tabela (a
// estimativa por caractere de larguraObservacao() já deixa perto, isto só
// afina pro tamanho exato).
function ajustarLarguraObservacao(input) {
  const largura = medirLarguraTexto(input.value, input) + 24; // + padding do campo
  input.style.width = Math.min(ANALISE_OBS_LARGURA_MAX, Math.max(ANALISE_OBS_LARGURA_MIN, largura)) + 'px';
}

// Botão da coluna Substituto -- só aparece pra quem está zerado no
// almoxarifado (saldo <= 0) e ainda em falta: com algum saldo, o item
// resolve sozinho ou por transferência, sugerir troca aí só complicaria.
// sugerirSubstitutos() mora em js/estoque.js (compartilhada com a Consulta
// de Itens -- ver lá o porquê).
function substitutoHtml(linha) {
  if (linha.saldo > 0 || linha.comprar <= 0) return '<span style="color:var(--muted);">—</span>';

  const sugestoes = sugerirSubstitutos(linha.codigo_item, linha.descricao, analiseEstoqueLista);
  if (!sugestoes.length) return '<span style="color:var(--muted);">—</span>';

  return `<button class="acao-btn analise-substituto" data-item="${escapeHtml(linha.codigo_item)}"
                  title="${sugestoes.length} substituto(s) possível(is) já em estoque -- clique para ver">💡</button>`;
}

// Reaproveita o modal já existente (compareModal/compareModalBox, de
// js/estoque.js) em vez de montar um terceiro modal do zero -- muda só o
// conteúdo de dentro.
function abrirSugestoesSubstituto(codigoItem) {
  const linha = agruparAnalise().find(l => l.codigo_item === codigoItem);
  if (!linha) return;
  const sugestoes = sugerirSubstitutos(codigoItem, linha.descricao, analiseEstoqueLista);

  compareModalBox.innerHTML = `
    <button class="modal-close" id="compareCloseBtn2">✕</button>
    <h3 style="padding-right:24px;">${escapeHtml(linha.descricao || codigoItem)}</h3>
    <div class="modal-item-code">Código: ${escapeHtml(codigoItem)} — sem saldo no almoxarifado</div>
    <div class="modal-text" style="margin:8px 0 4px;">
      Itens já em estoque com a mesma medida e pelo menos uma palavra em comum
      (ex.: material) -- confira se algum serve no lugar de comprar o original.
    </div>
    <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:13px; table-layout:fixed;">
      <thead>
        <tr style="border-bottom:2px solid var(--border);">
          <th style="width:20%; text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Item</th>
          <th style="width:50%; text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Descrição</th>
          <th style="width:15%; text-align:right; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Saldo</th>
          <th style="width:15%; text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Em comum</th>
        </tr>
      </thead>
      <tbody>
        ${sugestoes.map(s => `
          <tr>
            <td style="padding:9px 10px; font-weight:600;">${escapeHtml(s.item)}</td>
            <td style="padding:9px 10px;">${escapeHtml(s.descricao)}</td>
            <td style="padding:9px 10px; text-align:right; font-weight:700; color:var(--blue-dark);">${numeroBR(s.quantidade)}</td>
            <td style="padding:9px 10px; color:#166534;">${escapeHtml(s.comuns.join(', '))}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
  document.getElementById('compareCloseBtn2').addEventListener('click', closeCompareModal);
  compareModal.classList.add('open');
}

// Onde mais a empresa tem este item, pra pedir transferência em vez de
// comprar. Verde quando alguma unidade sozinha já cobre a falta inteira --
// é o caso em que dá pra resolver com um pedido de transferência só.
//
// A célula inteira é um botão: abre o MESMO modal de comparação entre
// unidades da Consulta de Itens (openCompareModal, js/estoque.js), com o
// saldo unidade por unidade e a localização. O resumo aqui responde "dá pra
// transferir?"; o modal responde "de onde exatamente, e quanto tem lá".
function transferenciaHtml(linha) {
  // Mesmo botão, mesmo ícone da Consulta de Itens (.compare-btn) -- o
  // Robson pediu pra tirar o resumo em texto ("103: 18.337 · 105: 2.049
  // +3") e deixar só a flecha, igual ao ALM: mais limpo, e quem já usa a
  // outra tela reconhece o ícone na hora.
  const outras = analiseOutrasUnidades.get(linha.codigo_item) || [];
  const titulo = linha.comprar <= 0
    ? 'Comparar entre unidades'
    : (outras.length
        ? 'Comparar entre unidades — tem saldo em ' + outras.map(u => rotuloUnidade(u.unidade)).join(', ')
        : 'Comparar entre unidades — nenhuma outra unidade tem saldo deste item');

  return `<button class="acao-btn analise-comparar" data-item="${escapeHtml(linha.codigo_item)}"
                  title="${escapeHtml(titulo)}">⇄</button>`;
}

// Lista, dentro do modal de comparação entre unidades, os pedidos que
// precisam deste item -- é o que o Robson vai printar e mandar pro
// responsável do almoxarifado de onde ele está pedindo a transferência
// ("pra quais pedidos preciso, ai a ideia é eu enviar um print pro
// responsável"). Ordenada pelo embarque mais próximo, mesmo critério da
// análise: é o que chega primeiro que precisa do material primeiro.
function pedidosDoItemHtml(codigoItem) {
  const linhas = analiseDemanda.filter(l => l.codigo_item === codigoItem);
  if (!linhas.length) return '';

  const ordenadas = [...linhas].sort((a, b) => {
    const da = dataEmbarqueParaOrdenar(a.data_embarque);
    const db = dataEmbarqueParaOrdenar(b.data_embarque);
    if (da && db) return da - db;
    if (da) return -1;
    if (db) return 1;
    return 0;
  });

  return `
    <div style="margin-top:16px; padding-top:12px; border-top:2px solid var(--border);">
      <div style="font-size:11px; text-transform:uppercase; color:var(--muted); font-weight:700; margin-bottom:6px;">
        Pedidos que precisam deste item
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);">
            <th style="text-align:left; padding:4px 6px; color:var(--muted); font-size:11px; text-transform:uppercase;">Pedido</th>
            <th style="text-align:left; padding:4px 6px; color:var(--muted); font-size:11px; text-transform:uppercase;">Cliente</th>
            <th style="text-align:right; padding:4px 6px; color:var(--muted); font-size:11px; text-transform:uppercase;">Qtd. pedida</th>
            <th style="text-align:left; padding:4px 6px; color:var(--muted); font-size:11px; text-transform:uppercase;">Embarque</th>
          </tr>
        </thead>
        <tbody>
          ${ordenadas.map(l => `
            <tr>
              <td style="padding:4px 6px; font-weight:600;">${escapeHtml(l.numero_pedido || '—')}</td>
              <td style="padding:4px 6px;">${escapeHtml(l.nome_abreviado || '—')}</td>
              <td style="padding:4px 6px; text-align:right;">${numeroBR(l.qt_pedido)}</td>
              <td style="padding:4px 6px;">${escapeHtml(l.data_embarque || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ---- Tela ---------------------------------------------------------------
// ---- Solicitacao de compra por item ---------------------------------------
//
// Mesmo desenho da Requisicao ALM (secao 8 do CLAUDE.md): o `mailto` abre o
// e-mail no Outlook da propria pessoa, ja preenchido. Nao existe servidor
// neste projeto, e o caminho tem uma vantagem real -- a solicitacao sai do
// e-mail de quem pediu, entao o Compras responde direto pra ela.

// O botao, ou a marca de que o e-mail ja foi aberto pra este item.
function solicitacaoHtml(item) {
  const nota = analiseNotaDoItem(item.codigo_item);

  if (nota.solicitado_em) {
    const quando = formatarDataHoraBR(nota.solicitado_em);
    const quem = nota.solicitado_por ? ' por ' + nota.solicitado_por : '';
    // "E-mail aberto" e nao "solicitado": o portal entrega o rascunho ao
    // Outlook e NAO tem como saber se a pessoa clicou em enviar. Escrever
    // "solicitado" aqui viraria decisao de compra baseada em algo que o
    // sistema nao sabe.
    return `<button class="acao-btn analise-solicitar" data-item="${escapeHtml(item.codigo_item)}"
              style="color:#166534;"
              title="E-mail de compra aberto em ${escapeHtml(quando)}${escapeHtml(quem)} — o portal não confirma o envio. Clique para abrir de novo.">✅</button>`
         + `<button class="acao-btn analise-limpar-solicitacao" data-item="${escapeHtml(item.codigo_item)}"
              title="Tirar a marca de solicitado (clique errado, ou o e-mail não foi enviado)">↺</button>`;
  }

  if (!emailComprasUnidade) {
    return `<button class="acao-btn" disabled style="opacity:0.4;"
              title="Sem e-mail do Compras cadastrado para esta unidade — peça ao administrador (aba Configurações).">🛒</button>`;
  }

  // Item que nao falta nao tem o que solicitar: o e-mail sairia com
  // "QUANTIDADE A COMPRAR: 0", que e um pedido sem pedido. Quem quiser
  // comprar por outro motivo (estoque minimo, reposicao programada) usa a
  // Requisicao ALM, que e a tela de pedir sem partir de falta.
  if (!(item.comprar > 0)) {
    return `<button class="acao-btn" disabled style="opacity:0.4;"
              title="O saldo cobre os pedidos: não há falta para solicitar. Para comprar por outro motivo, use a Requisição ALM.">🛒</button>`;
  }

  return `<button class="acao-btn analise-solicitar" data-item="${escapeHtml(item.codigo_item)}"
            title="Abrir o e-mail de solicitação de compra deste item, já preenchido">🛒</button>`;
}

// Os pedidos que precisam do item, em texto puro pro corpo do e-mail. E o que
// responde a primeira pergunta do comprador -- "pra quando?" -- sem ele ter de
// pedir a planilha de volta.
function pedidosDoItemTexto(codigoItem, um) {
  const linhas = analiseDemanda
    .filter(l => String(l.codigo_item || '').trim() === codigoItem)
    .map(l => ({
      pedido: l.numero_pedido || '?',
      cliente: l.nome_abreviado || '',
      qtd: parseQtd(l.qt_pedido) || 0,
      embarque: l.data_embarque || '',
      ordem: dataEmbarqueParaOrdenar(l.data_embarque)
    }))
    .sort((a, b) => {
      if (a.ordem && b.ordem) return a.ordem - b.ordem;
      if (a.ordem) return -1;
      if (b.ordem) return 1;
      return 0;
    });

  const unidadeMedida = um ? ' ' + um : '';
  return linhas.map(p => `  Pedido ${p.pedido}`
    + (p.cliente ? ` (${p.cliente})` : '')
    + ` - ${numeroBR(p.qtd)}${unidadeMedida}`
    + (p.embarque ? ` - embarque ${p.embarque}` : ' - sem data de embarque'));
}

function montarCorpoEmailCompra(item, maxPedidos) {
  const nota = analiseNotaDoItem(item.codigo_item);
  const outras = analiseOutrasUnidades.get(item.codigo_item) || [];

  const pedidos = pedidosDoItemTexto(item.codigo_item, item.um);
  // Corpo longo sai truncado no `mailto`, e o cliente corta onde der -- no
  // meio de uma linha, sem dizer que cortou. Entao o corte e nosso: quem
  // chama passa quantos pedidos cabem (ver corpoEmailCompraQueCabe), e a
  // lista termina com "e mais N pedido(s)", que e informacao em vez de
  // silencio.
  const pedidosMostrados = pedidos.slice(0, maxPedidos === undefined ? 12 : maxPedidos);
  const pedidosCortados = pedidos.length - pedidosMostrados.length;

  return [
    `SOLICITACAO DE COMPRA - ${rotuloUnidade(unidadeAtual)}`,
    '',
    `Item ........... ${item.codigo_item}`,
    `Descricao ...... ${item.descricao || '(sem descricao)'}`,
    `UM ............. ${item.um || '-'}`,
    '',
    `QUANTIDADE A COMPRAR: ${numeroBR(item.comprar)}`,
    '',
    'Como chegamos nesse numero:',
    `  Pedidos em carteira pedem .. ${numeroBR(item.pedido)}`,
    `  Saldo no almoxarifado ...... ${numeroBR(item.saldo)}`,
    `  Falta ...................... ${numeroBR(item.comprar)}`,
    '',
    `Pedidos que dependem deste item (${pedidos.length}):`,
    ...pedidosMostrados,
    ...(pedidosCortados > 0 ? [`  ... e mais ${pedidosCortados} pedido(s) - lista completa no portal`] : []),
    '',
    `Primeiro embarque: ${item.primeiroEmbarqueTexto || 'sem data'}`,
    '',
    // Vai no e-mail de proposito: o comprador precisa saber que existe saldo
    // em outra fabrica ANTES de comprar. Comprar o que a empresa ja tem em
    // outro galpao e dinheiro jogado fora, e foi por isso que a coluna
    // "Outras unidades" existe na tela.
    ...(outras.length
      ? ['ATENCAO - este item tem saldo em outra(s) unidade(s):',
         ...outras.map(u => `  Unidade ${u.unidade}: ${numeroBR(u.quantidade)}`),
         'Vale avaliar transferencia antes de comprar.',
         '']
      : ['Nenhuma outra unidade tem saldo deste item.', '']),
    ...(nota.observacao ? ['OBSERVACAO DO ALMOXARIFADO', nota.observacao, ''] : []),
    '--',
    `Solicitado por ${nomeUsuarioAtual || '(sem nome)'} pela Analise de Compras do Portal de Estoque.`,
    'Os numeros acima sao da planilha de pedidos carregada no portal na data deste e-mail.'
  ].join('\n');
}

// Monta o `mailto` mais completo que ainda cabe no limite pratico de ~1900
// caracteres, tirando pedidos da lista um a um. Devolve tambem se sobrou algo
// de fora, pra tela poder avisar -- e o caso em que o Compras precisa abrir o
// portal pra ver a carteira inteira.
function corpoEmailCompraQueCabe(item, destinatario, assunto) {
  const total = pedidosDoItemTexto(item.codigo_item, item.um).length;
  const monta = (n) => 'mailto:' + encodeURIComponent(destinatario.replace(/;/g, ','))
    + '?subject=' + encodeURIComponent(assunto)
    + '&body=' + encodeURIComponent(montarCorpoEmailCompra(item, n));

  for (let n = total; n >= 0; n--) {
    const href = monta(n);
    // Um pedido so ja estourando o limite significa que o resto do corpo e
    // que e grande (descricao e observacao longas). Manda assim mesmo, com o
    // aviso: cortar o "como chegamos nesse numero" seria pior.
    if (href.length <= 1900 || n === 0) return { href, mostrados: n, total, cabe: href.length <= 1900 };
  }
  return { href: monta(0), mostrados: 0, total, cabe: false };
}

async function solicitarCompraItem(codigoItem) {
  const msg = document.getElementById('analiseMsg');
  const item = agruparAnalise().find(l => l.codigo_item === codigoItem);
  if (!item) {
    msg.textContent = 'Item não está mais na análise. Clique em Atualizar.';
    msg.className = 'status-msg status-err';
    return;
  }
  if (!emailComprasUnidade) {
    msg.textContent = 'Sem e-mail do Compras cadastrado para a unidade '
      + unidadeAtual + '. Cadastre na aba Configurações.';
    msg.className = 'status-msg status-err';
    return;
  }
  if (!(item.comprar > 0)) {
    msg.textContent = 'O item ' + codigoItem + ' não está em falta: o saldo cobre os pedidos.'
      + ' Nada a solicitar.';
    msg.className = 'status-msg';
    return;
  }

  const nota = analiseNotaDoItem(codigoItem);
  // Marca ANTES de abrir o e-mail, e por um motivo tecnico alem do desenho da
  // Requisicao ALM: `window.location.href` pode cancelar requisicao pendente,
  // entao gravar depois de navegar perderia a marca as vezes -- do jeito que
  // e dificil de reproduzir e facil de nao notar.
  //
  // So marca na primeira vez. Reabrir o e-mail nao reescreve a data: e ela
  // que responde "desde quando este item esta pedido?", igual a data da
  // primeira emissao da etiqueta no Controle EXP.
  let marcou = true;
  if (!nota.solicitado_em) {
    marcou = await gravarNotaItem(codigoItem, {
      solicitado_em: new Date().toISOString(),
      solicitado_por: nomeUsuarioAtual
    }, msg);
  }

  const assunto = `Solicitacao de compra - ${item.codigo_item} - ${rotuloUnidade(unidadeAtual)}`;
  const email = corpoEmailCompraQueCabe(item, emailComprasUnidade, assunto);
  const href = email.href;

  if (!marcou) {
    // gravarNotaItem() ja escreveu o motivo em msg. Abrir o e-mail de todo
    // jeito: mandar a solicitacao e o objetivo, a marca e conveniencia -- e a
    // pessoa precisa saber que o item vai aparecer como nao solicitado.
    msg.textContent += ' O e-mail vai abrir mesmo assim, mas o item continuará aparecendo como não solicitado.';
  } else if (!email.cabe) {
    msg.textContent = 'Abrindo o e-mail. ATENÇÃO: ele ficou grande e pode sair cortado pelo'
      + ' Outlook — confira antes de enviar.';
    msg.className = 'status-msg status-err';
  } else if (email.mostrados < email.total) {
    msg.textContent = 'Abrindo o e-mail do item ' + codigoItem + '. São ' + email.total
      + ' pedidos e couberam ' + email.mostrados + ' na lista — o e-mail diz quantos ficaram de fora,'
      + ' e a carteira completa está aqui no portal.';
    msg.className = 'status-msg status-ok';
  } else {
    msg.textContent = 'Abrindo o e-mail de compra do item ' + codigoItem
      + ' — confira e clique em enviar. O portal não sabe se você enviou.';
    msg.className = 'status-msg status-ok';
  }

  renderAnalise();
  window.location.href = href;
}

async function limparSolicitacaoItem(codigoItem) {
  const msg = document.getElementById('analiseMsg');
  const ok = await gravarNotaItem(codigoItem, { solicitado_em: null, solicitado_por: null }, msg);
  if (!ok) return;
  renderAnalise();
  msg.textContent = 'Marca de solicitação removida do item ' + codigoItem + '.';
  msg.className = 'status-msg status-ok';
}

function renderAnalise() {
  const corpo = document.getElementById('analiseBody');
  const vazio = document.getElementById('analiseVazio');
  const linhas = linhasFiltradasAnalise();
  const todas = agruparAnalise();
  const ativos = todas.filter(l => !analiseItemIgnorado(l.codigo_item));
  const faltando = ativos.filter(l => l.comprar > 0);
  const qtdIgnorados = todas.length - ativos.length;

  // Os ignorados não contam em "sem saldo pra atender tudo": ninguém vai
  // comprar eles, então contá-los inflaria o número que ela usa pra saber o
  // tamanho do problema do dia.
  document.getElementById('analiseResumo').innerHTML = analiseDemanda.length
    ? `<b>${numeroBR(ativos.length)}</b> item(ns) na análise · `
      + `<b style="color:${faltando.length ? '#991b1b' : '#166534'};">${numeroBR(faltando.length)}</b> sem saldo pra atender tudo · `
      + `${numeroBR(analiseDemanda.length)} linha(s) de pedido`
      + (qtdIgnorados ? ` · <b>${numeroBR(qtdIgnorados)}</b> marcado(s) como "não repor"` : '')
    : '';

  const btnIgnorados = document.getElementById('analiseVerIgnoradosBtn');
  btnIgnorados.style.display = (qtdIgnorados || analiseVerIgnorados) ? 'inline-block' : 'none';
  btnIgnorados.className = analiseVerIgnorados ? 'btn btn-primary' : 'btn';
  btnIgnorados.textContent = analiseVerIgnorados
    ? '← Voltar pra análise'
    : `🚫 Ver "não repor" (${numeroBR(qtdIgnorados)})`;

  vazio.style.display = linhas.length ? 'none' : 'block';
  if (!linhas.length) {
    vazio.textContent = analiseVerIgnorados
      ? 'Nenhum item marcado como "não repor".'
      : (analiseDemanda.length
          ? 'Nenhum item bate com a busca / filtro.'
          : 'Nenhuma planilha de pedidos colada ainda. Use "Colar planilha de pedidos" acima.');
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = linhas.map(l => {
    const falta = l.comprar > 0;
    return `
    <tr${falta && !analiseVerIgnorados ? ' style="background:#fef2f2;"' : ''}${analiseVerIgnorados ? ' style="opacity:0.65;"' : ''}>
      <td class="item">${escapeHtml(l.codigo_item)}</td>
      <td>${escapeHtml(l.descricao || '—')}</td>
      <td class="loc">${escapeHtml(l.um || '—')}</td>
      <td class="num">${numeroBR(l.pedido)}</td>
      <td class="num">${numeroBR(l.saldo)}</td>
      <td class="num" style="font-weight:700; color:${falta ? '#991b1b' : '#166534'};">
        ${falta ? '−' + numeroBR(l.comprar) : '+' + numeroBR(l.sobra)}</td>
      <td class="num" style="font-weight:800; color:#991b1b;">${falta ? numeroBR(l.comprar) : '—'}</td>
      <td class="loc">${transferenciaHtml(l)}</td>
      <td class="loc">${substitutoHtml(l)}</td>
      <td class="loc" title="${escapeHtml([...l.pedidos].join(', '))}">${numeroBR(l.qtdPedidos)}</td>
      <td class="loc">${escapeHtml(l.primeiroEmbarqueTexto || '—')}</td>
      <td><input type="text" class="analise-obs-input" data-item="${escapeHtml(l.codigo_item)}"
             value="${escapeHtml(analiseNotaDoItem(l.codigo_item).observacao)}"
             placeholder="ex.: já solicitei compra"
             style="width:${escapeHtml(String(larguraObservacao(analiseNotaDoItem(l.codigo_item).observacao)))}px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;"></td>
      <td class="col-acoes">
        ${analiseVerIgnorados
          ? `<button class="acao-btn analise-restaurar" data-item="${escapeHtml(l.codigo_item)}" title="Voltar este item pra análise">↺</button>`
          : solicitacaoHtml(l)
            + `<button class="acao-btn analise-ignorar" data-item="${escapeHtml(l.codigo_item)}" title="Não preciso repor este item — some da análise, inclusive nas próximas planilhas">🚫</button>`}
      </td>
    </tr>`;
  }).join('');

  // Refina a largura estimada por caractere com a largura real do texto já
  // renderizado (fonte de verdade é o próprio navegador, não uma conta por
  // caractere) -- só depois de estar no DOM é que scrollWidth existe.
  document.querySelectorAll('.analise-obs-input').forEach(ajustarLarguraObservacao);
}

document.getElementById('analiseBusca').addEventListener('input', renderAnalise);

document.getElementById('analiseSoFaltaBtn').addEventListener('click', () => {
  analiseSoFalta = !analiseSoFalta;
  const btn = document.getElementById('analiseSoFaltaBtn');
  btn.className = analiseSoFalta ? 'btn btn-primary' : 'btn';
  btn.textContent = analiseSoFalta ? '✓ Só o que falta comprar' : 'Só o que falta comprar';
  renderAnalise();
});

document.getElementById('analiseAtualizarBtn').addEventListener('click', carregarAnalise);

document.getElementById('analiseVerIgnoradosBtn').addEventListener('click', () => {
  analiseVerIgnorados = !analiseVerIgnorados;
  renderAnalise();
});

// Marcar/desmarcar "não preciso repor". Sem confirmação de propósito: é um
// item só e é reversível ali mesmo, no botão "Ver não repor" -- pedir
// confirmação a cada clique numa limpeza de lista seria só atrito.
document.getElementById('analiseBody').addEventListener('click', async (e) => {
  // Reaproveita o modal de comparação entre unidades da Consulta de Itens em
  // vez de desenhar outro aqui: é a mesma pergunta ("onde mais tem este
  // item?") e o Robson já conhece essa tela.
  const btnComparar = e.target.closest('.analise-comparar');
  if (btnComparar) { openCompareModal(btnComparar.dataset.item, pedidosDoItemHtml(btnComparar.dataset.item)); return; }

  const btnSubstituto = e.target.closest('.analise-substituto');
  if (btnSubstituto) { abrirSugestoesSubstituto(btnSubstituto.dataset.item); return; }

  const btnSolicitar = e.target.closest('.analise-solicitar');
  if (btnSolicitar) {
    btnSolicitar.disabled = true;
    await solicitarCompraItem(btnSolicitar.dataset.item);
    return;   // renderAnalise() ja redesenhou o botao; nao reabilita o antigo
  }
  const btnLimpar = e.target.closest('.analise-limpar-solicitacao');
  if (btnLimpar) {
    btnLimpar.disabled = true;
    await limparSolicitacaoItem(btnLimpar.dataset.item);
    return;
  }

  const btnIgnorar = e.target.closest('.analise-ignorar');
  if (btnIgnorar) { await marcarItemAnalise(btnIgnorar, btnIgnorar.dataset.item, true); return; }
  const btnRestaurar = e.target.closest('.analise-restaurar');
  if (btnRestaurar) await marcarItemAnalise(btnRestaurar, btnRestaurar.dataset.item, false);
});

async function marcarItemAnalise(botao, codigoItem, ignorar) {
  const msg = document.getElementById('analiseMsg');
  botao.disabled = true;
  const ok = await gravarNotaItem(codigoItem, { ignorado: ignorar }, msg);
  botao.disabled = false;
  if (!ok) return;

  msg.textContent = ignorar
    ? `Item ${codigoItem} marcado como "não repor" — não aparece mais na análise, nem nas próximas planilhas.`
    : `Item ${codigoItem} voltou pra análise.`;
  msg.className = 'status-msg status-ok';
  renderAnalise();
}

// Observação livre por item ("já solicitei compra", "pedido 1234"...) --
// salva ao sair do campo, mesmo padrão da Localização do Controle EXP.
document.getElementById('analiseBody').addEventListener('focusout', async (e) => {
  const input = e.target.closest('.analise-obs-input');
  if (!input) return;

  const codigoItem = input.dataset.item;
  const novo = input.value.trim();
  if (novo === analiseNotaDoItem(codigoItem).observacao) return; // nada mudou

  const msg = document.getElementById('analiseMsg');
  input.disabled = true;
  const ok = await gravarNotaItem(codigoItem, { observacao: novo || null }, msg);
  input.disabled = false;
  if (!ok) {
    input.value = analiseNotaDoItem(codigoItem).observacao;
    return;
  }

  input.style.borderColor = 'var(--blue)';
  setTimeout(() => { input.style.borderColor = ''; }, 1200);
  msg.textContent = `Observação do item ${codigoItem} salva.`;
  msg.className = 'status-msg status-ok';
});

document.getElementById('analiseBody').addEventListener('keydown', (e) => {
  if (e.target.classList.contains('analise-obs-input') && e.key === 'Enter') e.target.blur();
});

// Cresce o campo em tempo real -- o Robson: "dependendo do tamanho do
// texto aumenta o tamanho dessa coluna, tem itens que escrevo e não cabe
// tudo".
document.getElementById('analiseBody').addEventListener('input', (e) => {
  if (e.target.classList.contains('analise-obs-input')) ajustarLarguraObservacao(e.target);
});

// Grava (ou atualiza) a anotação do item e só então mexe no mapa em memória.
// upsert com onConflict porque a linha pode já existir por causa do outro
// campo -- marcar "não repor" num item que já tinha observação não pode
// apagar a observação, e vice-versa.
async function gravarNotaItem(codigoItem, mudanca, msgEl) {
  // Grava SO os campos que mudaram, e nao a linha inteira remontada a partir
  // do mapa em memoria. Duas razoes:
  //
  // - o `upsert` do PostgREST só sobrescreve as colunas que vão no payload,
  //   então o que não foi pedido conserva o valor do banco;
  // - remontar a linha inteira fazia dois estragos silenciosos: se a leitura
  //   das notas tivesse falhado (o mapa fica vazio, e a falha só vai pro
  //   console), gravar uma observação reescrevia `ignorado: false` e
  //   DESMARCAVA um "não repor" que existia no banco; e digitar na observação
  //   e clicar direto no 🚫 fazia a segunda gravação reescrever a observação
  //   antiga, apagando o texto recém-digitado.
  const campos = {};
  ['ignorado', 'observacao', 'solicitado_em', 'solicitado_por'].forEach(c => {
    if (mudanca[c] !== undefined) campos[c] = mudanca[c];
  });

  // .select() de propósito: sem ele, um upsert barrado pelo RLS volta com
  // error null e nada gravado -- a tela diria "salvo" e o F5 desmentiria.
  const { data, error } = await sb.from('analise_item_notas')
    .upsert({
      unidade: unidadeAtual,
      codigo_item: codigoItem,
      ...campos,
      atualizado_por: nomeUsuarioAtual,
      atualizado_em: new Date().toISOString()
    }, { onConflict: 'unidade,codigo_item' })
    .select('codigo_item');

  if (error) {
    msgEl.textContent = 'NÃO GRAVOU: ' + error.message
      + ' — se a mensagem falar em tabela inexistente, sql/fase20-analise-notas-item.sql'
      + ' ainda não foi rodado no Supabase; se falar em coluna inexistente,'
      + ' é o sql/fase22-solicitacao-compra.sql.';
    msgEl.className = 'status-msg status-err';
    console.error('Falha ao gravar anotação do item:', error.message);
    return false;
  }
  if (!data || !data.length) {
    msgEl.textContent = 'NÃO GRAVOU: o banco não aceitou a alteração (permissão da unidade?). Nada foi salvo.';
    msgEl.className = 'status-msg status-err';
    return false;
  }

  const atual = analiseNotaDoItem(codigoItem);
  analiseNotas.set(codigoItem, {
    ignorado: campos.ignorado !== undefined ? campos.ignorado === true : atual.ignorado,
    observacao: campos.observacao !== undefined ? (campos.observacao || '') : atual.observacao,
    solicitado_em: campos.solicitado_em !== undefined ? campos.solicitado_em : atual.solicitado_em,
    solicitado_por: campos.solicitado_por !== undefined ? (campos.solicitado_por || '') : atual.solicitado_por
  });
  return true;
}

// ---- Colar a planilha ---------------------------------------------------
document.getElementById('analiseColarToggleBtn').addEventListener('click', () => {
  const area = document.getElementById('analiseColarArea');
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('analiseConferirBtn').addEventListener('click', () => {
  const texto = document.getElementById('analiseTexto').value;
  const msg = document.getElementById('analiseColarMsg');
  const previa = document.getElementById('analisePrevia');

  analisePendentes = parseAnaliseTexto(texto);
  if (!analisePendentes.length) {
    msg.textContent = 'Cole ao menos uma linha com o código do item (coluna 5 da planilha).';
    msg.className = 'status-msg status-err';
    previa.innerHTML = '';
    return;
  }

  const semQtd = analisePendentes.filter(l => !l.qt_pedido).length;
  const itensUnicos = new Set(analisePendentes.map(l => l.codigo_item)).size;
  msg.textContent = `${analisePendentes.length} linha(s), ${itensUnicos} item(ns) diferente(s).`
    + (semQtd ? ` ⚠ ${semQtd} sem Qt. pedida — essas não somam nada na análise.` : '');
  msg.className = semQtd ? 'status-msg status-err' : 'status-msg status-ok';

  // Prévia só das 10 primeiras: é conferência de formato (as colunas caíram
  // no lugar certo?), não revisão linha a linha -- a planilha tem centenas.
  previa.innerHTML = `
    <table>
      <thead><tr>${ANALISE_COLUNAS.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
      <tbody>
        ${analisePendentes.slice(0, 10).map(l => `
          <tr>
            <td class="loc">${escapeHtml(l.emissao || '—')}</td>
            <td class="loc">${escapeHtml(l.numero_pedido || '—')}</td>
            <td>${escapeHtml(l.nome_abreviado || '—')}</td>
            <td class="loc">${escapeHtml(l.seq_etapa || '—')}</td>
            <td class="item">${escapeHtml(l.codigo_item)}</td>
            <td>${escapeHtml(l.descricao || '—')}</td>
            <td class="loc">${escapeHtml(l.um || '—')}</td>
            <td class="num">${l.qt_pedido != null ? numeroBR(l.qt_pedido) : '—'}</td>
            <td class="num">${l.qt_atendida != null ? numeroBR(l.qt_atendida) : '—'}</td>
            <td class="loc">${escapeHtml(l.data_embarque || '—')}</td>
            <td class="loc">${escapeHtml(l.os || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${analisePendentes.length > 10 ? `<div class="modal-text" style="padding:8px 0 0;">…e mais ${analisePendentes.length - 10} linha(s).</div>` : ''}
    <div class="cfg-barra" style="padding:10px 0 0;">
      <button class="btn btn-primary" id="analiseGravarBtn">Substituir análise por estas ${analisePendentes.length} linha(s)</button>
    </div>`;
  document.getElementById('analiseGravarBtn').addEventListener('click', gravarAnalise);
});

async function gravarAnalise() {
  const msg = document.getElementById('analiseColarMsg');
  const btn = document.getElementById('analiseGravarBtn');
  if (!analisePendentes.length) {
    msg.textContent = 'A prévia expirou. Clique em Conferir de novo.';
    msg.className = 'status-msg status-err';
    return;
  }
  if (btn) btn.disabled = true;
  msg.textContent = 'Gravando...';
  msg.className = 'status-msg';

  // Uma chamada, uma transação -- apaga a análise anterior da unidade e
  // regrava. Se falhar no meio, o Postgres desfaz e a análise de ontem
  // continua no lugar (mesmo motivo de substituir_estoque, AUDITORIA.md A2).
  const { error } = await sb.rpc('substituir_analise_demanda', {
    payload: { unidade: unidadeAtual, importado_por: nomeUsuarioAtual, linhas: analisePendentes }
  });
  if (btn) btn.disabled = false;

  if (error) {
    msg.textContent = 'NÃO GRAVOU: ' + error.message
      + ' — nada foi alterado, a análise anterior continua no lugar.'
      + ' Se a mensagem falar em função inexistente, sql/fase19-analise-compras.sql'
      + ' ainda não foi rodado no Supabase.';
    msg.className = 'status-msg status-err';
    console.error('Falha ao gravar análise de compras:', error.message);
    return;
  }

  msg.textContent = `Análise atualizada com ${analisePendentes.length} linha(s).`;
  msg.className = 'status-msg status-ok';
  document.getElementById('analiseTexto').value = '';
  document.getElementById('analisePrevia').innerHTML = '';
  analisePendentes = [];
  await carregarAnalise();
}

// ---- Exportar (pra mandar pra Compras) ----------------------------------
const ANALISE_EXPORT_CABECALHO = ['Item', 'Descrição', 'UM', 'Qtd. pedida (total)',
                                  'Saldo almoxarifado', 'Sobra/Falta', 'Comprar',
                                  'Outras unidades', 'Substituto sugerido', 'Qtd. pedidos', 'Pedidos',
                                  '1º embarque', 'Observação'];

function linhasExportacaoAnalise() {
  return linhasFiltradasAnalise().map(l => [
    l.codigo_item, l.descricao || '', l.um || '',
    l.pedido, l.saldo, l.sobra, l.comprar,
    // Texto puro no arquivo (sem HTML): a lista vai pro Compras por e-mail
    // ou impressa, e "101: 519 · 105: 200" já diz de onde dá pra transferir.
    (analiseOutrasUnidades.get(l.codigo_item) || [])
      .map(u => `${u.unidade}: ${numeroBR(u.quantidade)}`).join(' · '),
    // Só calcula pra quem entra no botão 💡 (zerado e ainda em falta) --
    // pros demais a sugestão não faz sentido (ver substitutoHtml()).
    (l.saldo <= 0 && l.comprar > 0)
      ? sugerirSubstitutos(l.codigo_item, l.descricao, analiseEstoqueLista)
          .map(s => `${s.item} - ${s.descricao} (${numeroBR(s.quantidade)} disponível)`).join(' · ')
      : '',
    l.qtdPedidos, [...l.pedidos].join(', '), l.primeiroEmbarqueTexto || '',
    analiseNotaDoItem(l.codigo_item).observacao || ''
  ]);
}

document.getElementById('analiseExportarBtn').addEventListener('click', async () => {
  const linhas = linhasExportacaoAnalise();
  if (!linhas.length) {
    alert('Nada pra exportar com o filtro atual.');
    return;
  }
  const nomeBase = `analise-compras-${unidadeAtual}-${new Date().toISOString().slice(0, 10)}`;
  const formato = document.getElementById('analiseExportarFormato').value;

  if (formato === 'csv') {
    // ; como separador (não vírgula) porque o número brasileiro usa vírgula
    // decimal -- Excel PT-BR abre certo direto com ;.
    const csv = [ANALISE_EXPORT_CABECALHO, ...linhas]
      .map(linha => linha.map(v => `"${String(v != null ? v : '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    baixarArquivo(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), nomeBase + '.csv');
    return;
  }

  const botao = document.getElementById('analiseExportarBtn');
  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Preparando...';
  try {
    await carregarBiblioteca('o Exportar Excel', CDN_XLSX, () => typeof XLSX !== 'undefined');
    const planilha = XLSX.utils.aoa_to_sheet([ANALISE_EXPORT_CABECALHO, ...linhas]);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Análise de Compras');
    XLSX.writeFile(livro, nomeBase + '.xlsx');
  } catch (err) {
    alert(err.message);
    console.error('Falha ao exportar a análise em Excel:', err.message);
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
});
