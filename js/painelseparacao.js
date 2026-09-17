// Portal de Estoque Kingspan Isoeste -- Painel de Separação
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.
//
// Esta e a tela do AUXILIAR, nao a do lider. O Robson trouxe (17/09/2026) um
// protótipo de "Tela de Monitoramento e Separação de Pedidos" feita pra rodar
// num monitor grande ou tablet no almoxarifado, com o auxiliar operando de pé:
// fonte grande, alto contraste, botao grande, sem poluicao visual. "minha
// ideia é fazer a programação desse modelo".
//
// Entra como TERCEIRA ABA da Programação de Separação (Robson, 17/09/2026:
// "coloque o painel dentro da aba progrmação de separaçao"), ao lado de
// Carregamento e Separação -- nasceu como item proprio no menu lateral e
// mudou de lugar no mesmo dia. A aba Separação continua sendo a visao de
// quem coordena (filtros, busca, marcar pedido inteiro, saldo); esta e a de
// quem esta separando agora. As tres leem `progPedidos`/`progItens`, entao
// nao ha dado duplicado nem risco de uma mostrar uma coisa e a outra outra.
//
// Os dados vem de `carregarProgramacao()` (js/programacao.js), que ja carrega
// pedidos, itens e o saldo/endereco do almoxarifado.

// Quem separa no almoxarifado, da tabela `separadores` (fase 60), por unidade.
// Nasceu como lista fixa no codigo, apostando que mudaria de ano em ano -- o
// Robson corrigiu no mesmo dia ("AQUI QUERO PODER OS NOMES"): e rotatividade
// de almoxarifado, e ele nao vai pedir mudanca de codigo a cada pessoa que
// entra ou sai. Enquanto o SQL da fase 60 nao roda, cai nos nomes originais,
// pra tela nao abrir com o pop-up vazio.
const PAINEL_NOMES_PADRAO = ['JOEL', 'NILSON', 'ANGEL', 'ANGELO', 'MAIKO'];
let painelNomes = [...PAINEL_NOMES_PADRAO];

async function carregarSeparadores() {
  const { data, error } = await sb.from('separadores')
    .select('nome, ativo')
    .eq('unidade', unidadeAtual)
    .eq('ativo', true)
    .order('nome', { ascending: true });
  if (error) {
    console.warn('Não foi possível carregar os separadores (fase 60 rodou?):', error.message);
    return;
  }
  // Lista vazia de propósito (todo mundo inativado) é uma escolha, não erro --
  // mas nunca deixa cair no padrão do código depois que a tabela existe.
  painelNomes = (data || []).map(r => r.nome);
}

// RAL Classic -> HEX, pra mostrar a cor do material como quadrado no card.
// O auxiliar reconhece a cor de relance em vez de ler "RAL9003" no meio da
// descricao. ATENCAO: e referencia de TELA, aproximada -- a cor oficial pra
// bater com a peca fisica e sempre a tabela RAL fisica do fabricante.
const RAL_CORES = {
  '1000': { hex: '#CCC58F', nome: 'Bege verde' },
  '1001': { hex: '#D6C08A', nome: 'Bege' },
  '1013': { hex: '#EAE6CA', nome: 'Branco pérola' },
  '1014': { hex: '#E1CC9F', nome: 'Marfim' },
  '1015': { hex: '#E6D2B5', nome: 'Marfim claro' },
  '1018': { hex: '#F0D722', nome: 'Amarelo zinco' },
  '1021': { hex: '#F9A800', nome: 'Amarelo colza' },
  '1023': { hex: '#F7B500', nome: 'Amarelo trânsito' },
  '2004': { hex: '#E75B12', nome: 'Laranja puro' },
  '2009': { hex: '#E15501', nome: 'Laranja trânsito' },
  '2011': { hex: '#E67511', nome: 'Laranja profundo' },
  '3000': { hex: '#AF2B1E', nome: 'Vermelho fogo' },
  '3003': { hex: '#9B111E', nome: 'Vermelho rubi' },
  '3005': { hex: '#5E2129', nome: 'Vermelho vinho' },
  '3009': { hex: '#642424', nome: 'Vermelho óxido' },
  '3011': { hex: '#781F19', nome: 'Vermelho marrom' },
  '3020': { hex: '#C1121C', nome: 'Vermelho trânsito' },
  '5002': { hex: '#20214F', nome: 'Azul ultramar' },
  '5005': { hex: '#1E2460', nome: 'Azul sinal' },
  '5010': { hex: '#0E294B', nome: 'Azul genciana' },
  '5015': { hex: '#2271B3', nome: 'Azul celeste' },
  '6002': { hex: '#2D5B32', nome: 'Verde folha' },
  '6005': { hex: '#0F4336', nome: 'Verde musgo' },
  '6011': { hex: '#587246', nome: 'Verde reseda' },
  '6020': { hex: '#354733', nome: 'Verde cromo' },
  '6029': { hex: '#10673A', nome: 'Verde menta' },
  '7000': { hex: '#78858B', nome: 'Cinza esquilo' },
  '7001': { hex: '#8A9597', nome: 'Cinza prata' },
  '7011': { hex: '#434B4D', nome: 'Cinza ferro' },
  '7015': { hex: '#434750', nome: 'Cinza ardósia' },
  '7016': { hex: '#293133', nome: 'Cinza antracite' },
  '7021': { hex: '#23282B', nome: 'Cinza negro' },
  '7024': { hex: '#474A51', nome: 'Cinza grafite' },
  '7035': { hex: '#D7D7D7', nome: 'Cinza claro' },
  '7038': { hex: '#B5B8B1', nome: 'Cinza ágata' },
  '7039': { hex: '#6C6960', nome: 'Cinza quartzo' },
  '7040': { hex: '#9DA1AA', nome: 'Cinza janela' },
  '7042': { hex: '#8F9695', nome: 'Cinza trânsito A' },
  '7043': { hex: '#4E5451', nome: 'Cinza trânsito B' },
  '8004': { hex: '#8D5924', nome: 'Marrom cobre' },
  '8014': { hex: '#43302B', nome: 'Marrom sépia' },
  '8017': { hex: '#442F29', nome: 'Marrom chocolate' },
  '8023': { hex: '#A05A2C', nome: 'Marrom laranja' },
  '9001': { hex: '#FDF4E3', nome: 'Branco creme' },
  '9002': { hex: '#E7EBDA', nome: 'Branco cinza' },
  '9003': { hex: '#F4F4F4', nome: 'Branco sinal' },
  '9004': { hex: '#282828', nome: 'Preto sinal' },
  '9005': { hex: '#0A0A0A', nome: 'Preto ébano' },
  '9006': { hex: '#A5A5A5', nome: 'Alumínio branco' },
  '9007': { hex: '#8F8F8F', nome: 'Alumínio cinza' },
  '9010': { hex: '#FFFFFF', nome: 'Branco puro' },
  '9011': { hex: '#1C1C1C', nome: 'Preto grafite' },
  '9016': { hex: '#F6F6F6', nome: 'Branco trânsito' }
};

// "...RAL9003 0,43MM" -> {codigo:'9003', hex:'#F4F4F4', nome:'Branco sinal'}.
// Codigo que nao esta no catalogo volta com hex null: o quadrado sai hachurado
// em vez de colorido, porque mostrar cor ERRADA e pior que nao mostrar cor.
function ralDaDescricao(descricao) {
  const m = String(descricao || '').match(/RAL\s*-?\s*(\d{3,4})/i);
  if (!m) return null;
  const cor = RAL_CORES[m[1]];
  return { codigo: m[1], hex: cor ? cor.hex : null, nome: cor ? cor.nome : 'cor não catalogada' };
}

let painelPedidoId = null;   // pedido aberto na coluna da direita
let painelPopup = null;      // { tipo, itemId, pedidoId, nomes: {separou, conferiu} }

// ---- Leitura do estado do item ---------------------------------------------
// `status_separacao` continua sendo a fonte de verdade do portal inteiro (aba
// Separação, EXP, docas, gatilho no banco). Aqui ele e traduzido pras duas
// confirmacoes que o auxiliar enxerga.
function painelSeparado(item) {
  return ['separado', 'reportado', 'falta_reporte'].includes(item.status_separacao);
}

function painelOpReportada(item) {
  return item.op_reportada === true || item.status_separacao === 'reportado';
}

// O numero de OS/OP repetido em varias linhas do pedido e a OS dele (o "kit"
// padrao). Numero que aparece uma vez so e OP de item fabricado sob medida --
// e sao esses que exigem a segunda confirmacao, o reporte no Datasul.
function painelOsDoPedido(itens) {
  const contagem = new Map();
  itens.forEach(i => {
    const n = String(i.numero_os_op || '').trim();
    if (!n) return;
    contagem.set(n, (contagem.get(n) || 0) + 1);
  });
  let osNumero = null;
  let maior = 1; // precisa repetir pra ser OS: numero unico e OP
  contagem.forEach((qtd, n) => { if (qtd > maior) { maior = qtd; osNumero = n; } });
  return osNumero;
}

function painelItemTemOp(item, osDoPedido) {
  const n = String(item.numero_os_op || '').trim();
  return !!n && n !== osDoPedido;
}

function painelItemCompleto(item, osDoPedido) {
  if (!painelSeparado(item)) return false;
  return painelItemTemOp(item, osDoPedido) ? painelOpReportada(item) : true;
}

// ---- Urgência do carregamento ----------------------------------------------
// Quanto falta pro caminhão. Sem hora marcada, so a data manda -- e pedido sem
// data nenhuma vai pro fim, igual a aba Separação (compararPorUrgencia).
function painelMomentoCarga(pedido) {
  if (!pedido || !pedido.data_carregamento) return null;
  const hora = pedido.horario_carregamento || '23:59';
  const t = Date.parse(`${pedido.data_carregamento}T${hora}:00`);
  return Number.isFinite(t) ? t : null;
}

function painelUrgencia(pedido) {
  const momento = painelMomentoCarga(pedido);
  if (momento == null) return { classe: 'painel-urg-sem', rotulo: 'Sem carregamento marcado' };
  const faltaMin = Math.round((momento - Date.now()) / 60000);
  const quando = `${dataCurta(pedido.data_carregamento)} ${horaCurta(pedido.horario_carregamento)}`;
  if (faltaMin < 0) return { classe: 'painel-urg-atrasado', rotulo: `${quando} · ATRASADO` };
  const horas = Math.floor(faltaMin / 60);
  const min = faltaMin % 60;
  const falta = horas ? `${horas}h${String(min).padStart(2, '0')}` : `${min}min`;
  const classe = faltaMin <= 120 ? 'painel-urg-urgente'
    : faltaMin <= 480 ? 'painel-urg-atencao'
    : 'painel-urg-tranquilo';
  return { classe, rotulo: `${quando} · faltam ${falta}` };
}

// ---- Dados da tela ----------------------------------------------------------
// Pedido entra na fila enquanto tiver item pra separar.
function painelFila() {
  const porPedido = new Map();
  progItens.forEach(item => {
    if (!porPedido.has(item.pedido_id)) porPedido.set(item.pedido_id, []);
    porPedido.get(item.pedido_id).push(item);
  });

  const fila = [];
  porPedido.forEach((itens, pedidoId) => {
    const pedido = progPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const osDoPedido = painelOsDoPedido(itens);
    const completos = itens.filter(i => painelItemCompleto(i, osDoPedido)).length;
    fila.push({ pedido, itens, osDoPedido, completos, total: itens.length });
  });

  fila.sort((a, b) => compararPorUrgencia(a.pedido, b.pedido));
  return fila;
}

// ---- Render -----------------------------------------------------------------
function renderPainelSeparacao() {
  const colFila = document.getElementById('painelFila');
  if (!colFila) return;

  const fila = painelFila();
  const pendentes = fila.filter(f => f.completos < f.total);

  // Contador no proprio botao da aba: da pra ver que tem pedido esperando
  // sem precisar entrar.
  document.getElementById('painelContaPendentes').textContent = pendentes.length ? ` (${pendentes.length})` : '';

  if (!fila.length) {
    colFila.innerHTML = '<div class="empty-msg">Nenhum pedido para separar. Importe as planilhas na Programação de Separação.</div>';
    document.getElementById('painelAtual').innerHTML =
      '<div class="empty-msg">Nada selecionado.</div>';
    return;
  }

  // Sem pedido escolhido (ou o escolhido acabou), abre o mais urgente que
  // ainda tem item pendente -- e o proximo que o auxiliar deve separar.
  const aindaNaFila = fila.some(f => f.pedido.id === painelPedidoId);
  if (!aindaNaFila) painelPedidoId = (pendentes[0] || fila[0]).pedido.id;

  const primeiroPendenteId = pendentes.length ? pendentes[0].pedido.id : null;

  colFila.innerHTML = fila.map(f => {
    const urg = painelUrgencia(f.pedido);
    const pronto = f.completos >= f.total;
    const agora = f.pedido.id === primeiroPendenteId;
    return `
      <button class="painel-card-pedido${f.pedido.id === painelPedidoId ? ' painel-card-ativo' : ''}${pronto ? ' painel-card-pronto' : ''}"
              data-pedido-id="${escapeHtml(f.pedido.id)}">
        ${agora ? '<span class="painel-separar-agora">SEPARAR AGORA</span>' : ''}
        <div class="painel-card-numero">${escapeHtml(f.pedido.numero_pedido)}</div>
        ${f.osDoPedido ? `<span class="painel-doc painel-doc-os">OS ${escapeHtml(f.osDoPedido)}</span>` : ''}
        <div class="painel-card-cliente">${escapeHtml(f.pedido.cliente || '—')}</div>
        <div class="painel-selo ${urg.classe}">${escapeHtml(urg.rotulo)}</div>
        <div class="painel-card-progresso">${f.completos} de ${f.total} itens</div>
      </button>`;
  }).join('');

  renderPainelAtual(fila.find(f => f.pedido.id === painelPedidoId));
}

function renderPainelAtual(bloco) {
  const alvo = document.getElementById('painelAtual');
  if (!bloco) { alvo.innerHTML = '<div class="empty-msg">Nada selecionado.</div>'; return; }

  const { pedido, itens, osDoPedido } = bloco;
  const urg = painelUrgencia(pedido);
  const completos = itens.filter(i => painelItemCompleto(i, osDoPedido)).length;
  const tudoPronto = completos >= itens.length;

  // Ordem de coleta: pelo endereco do almoxarifado, pra nao ziguezaguear entre
  // as ruas. Item sem endereco cadastrado vai pro fim -- vai ter que procurar.
  const ordenados = [...itens].sort((a, b) => {
    const la = progLocalMap.get(String(a.codigo_item)) || '';
    const lb = progLocalMap.get(String(b.codigo_item)) || '';
    if (!la && !lb) return (a.seq || 0) - (b.seq || 0);
    if (!la) return 1;
    if (!lb) return -1;
    return la.localeCompare(lb, 'pt-BR');
  });

  alvo.innerHTML = `
    <div class="painel-atual-topo">
      <div>
        <div class="painel-atual-numero">${escapeHtml(pedido.numero_pedido)}</div>
        <div class="painel-atual-cliente">${escapeHtml(pedido.cliente || '—')}</div>
      </div>
      <div class="painel-selo ${urg.classe}">${escapeHtml(urg.rotulo)}</div>
    </div>
    <div class="painel-atual-progresso">${completos} de ${itens.length} itens concluídos</div>
    <div class="painel-itens">
      ${ordenados.map(item => painelCardItem(item, osDoPedido)).join('')}
    </div>
    <button class="btn painel-concluir" id="painelConcluirBtn" data-pedido-id="${escapeHtml(pedido.id)}"
            ${tudoPronto ? '' : 'disabled'}>
      ${tudoPronto ? 'CONCLUIR PEDIDO' : `Faltam ${itens.length - completos} item(ns)`}
    </button>`;
}

function painelCardItem(item, osDoPedido) {
  const temOp = painelItemTemOp(item, osDoPedido);
  const separado = painelSeparado(item);
  const reportada = painelOpReportada(item);
  const completo = painelItemCompleto(item, osDoPedido);
  const ral = ralDaDescricao(item.descricao);
  const endereco = progLocalMap.get(String(item.codigo_item));
  const urgente = /urgente/i.test(String(item.observacao || ''));
  const saldo = progEstoqueMap.get(String(item.codigo_item));

  const quadradoRal = ral ? `
    <div class="painel-ral">
      <span class="painel-ral-cor${ral.hex ? '' : ' painel-ral-sem'}"
            ${ral.hex ? `style="background:${escapeHtml(ral.hex)};"` : ''}></span>
      <span class="painel-ral-nome">RAL ${escapeHtml(ral.codigo)} · ${escapeHtml(ral.nome)}</span>
    </div>` : '';

  return `
    <div class="painel-item${completo ? ' painel-item-ok' : ''}">
      <div class="painel-item-topo">
        <span class="painel-item-codigo">${escapeHtml(item.codigo_item || '—')}</span>
        ${temOp ? `<span class="painel-doc painel-doc-op">OP ${escapeHtml(item.numero_os_op)}</span>` : ''}
        <span class="painel-item-qtd">${escapeHtml(formatarQtdPainel(item.quantidade))} ${escapeHtml(item.unidade_medida || '')}</span>
        ${endereco ? `<span class="painel-endereco">📍 ${escapeHtml(endereco)}</span>` : '<span class="painel-endereco painel-endereco-sem">📍 sem endereço</span>'}
        ${saldo != null ? `<span class="painel-saldo">ALM: ${escapeHtml(saldo.toLocaleString('pt-BR'))}</span>` : ''}
      </div>
      <div class="painel-item-desc">${escapeHtml(item.descricao || '—')}</div>
      ${quadradoRal}
      ${item.observacao ? `<div class="painel-item-obs${urgente ? ' painel-item-urgente' : ''}">${urgente ? '⚠️ ' : ''}${escapeHtml(item.observacao)}</div>` : ''}
      <div class="painel-item-acoes">
        ${separado
          ? `<span class="painel-feito">✓ SEPARADO${item.separado_por_nome ? ' — ' + escapeHtml(item.separado_por_nome) : ''}${item.conferido_por_nome ? ' · Conferido: ' + escapeHtml(item.conferido_por_nome) : ''}</span>`
          : `<button class="btn painel-btn-separado" data-id="${escapeHtml(item.id)}">SEPARADO</button>`}
        ${temOp
          ? (reportada
              ? '<span class="painel-feito">✓ OP REPORTADA</span>'
              : `<button class="btn painel-btn-op" data-id="${escapeHtml(item.id)}">OP REPORTADA</button>`)
          : ''}
      </div>
    </div>`;
}

// Quantidade da planilha vem com virgula decimal as vezes; aqui so evita
// mostrar "37.85000000001" na tela do auxiliar.
function formatarQtdPainel(valor) {
  const n = parseQtd(valor);
  if (!Number.isFinite(n)) return String(valor == null ? '—' : valor);
  return Number.isInteger(n) ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

// ---- Pop-up de confirmação ---------------------------------------------------
// Clicar NAO marca: abre confirmacao. A tela roda em monitor/tablet grande com
// botao grande lado a lado -- um toque sem querer nao pode mudar o estado do
// pedido. E o de SEPARADO ainda pergunta QUEM fez, porque o tablet fica numa
// bancada com uma conta so enquanto varias pessoas se revezam.
function painelAbrirPopup(tipo, itemId) {
  const item = progItens.find(i => String(i.id) === String(itemId));
  if (!item) return;
  const bloco = painelFila().find(f => f.pedido.id === item.pedido_id);
  const temOp = bloco ? painelItemTemOp(item, bloco.osDoPedido) : false;
  painelPopup = { tipo, itemId: item.id, temOp, separou: null, conferiu: null };
  renderPainelPopup();
}

function renderPainelPopup() {
  const overlay = document.getElementById('painelPopup');
  if (!painelPopup) { overlay.style.display = 'none'; overlay.innerHTML = ''; return; }

  const item = progItens.find(i => String(i.id) === String(painelPopup.itemId));
  if (!item) { painelPopup = null; overlay.style.display = 'none'; return; }

  overlay.style.display = 'flex';

  if (painelPopup.tipo === 'op') {
    overlay.innerHTML = `
      <div class="painel-popup-caixa">
        <div class="painel-popup-titulo">Confirma que a OP nº ${escapeHtml(item.numero_os_op || '')} já foi reportada no Datasul?</div>
        <div class="painel-popup-sub">${escapeHtml(item.codigo_item || '')} — ${escapeHtml(item.descricao || '')}</div>
        <div class="painel-popup-acoes">
          <button class="btn" id="painelPopupCancelar">Cancelar</button>
          <button class="btn btn-primary" id="painelPopupConfirmar">Confirmar</button>
        </div>
      </div>`;
    return;
  }

  // SEPARADO: item de CDB (com OP) pede dois nomes, porque a propria equipe do
  // CDB separa e confere cada peca na hora. Item sem OP pede so quem separou --
  // a conferencia desses e a do pedido inteiro, no fim, na bancada.
  const listaNomes = (campo) => painelNomes.map(nome => `
    <button class="btn painel-nome${painelPopup[campo] === nome ? ' painel-nome-ativo' : ''}"
            data-campo="${campo}" data-nome="${escapeHtml(nome)}">${escapeHtml(nome)}</button>`).join('');

  const faltaNome = !painelPopup.separou || (painelPopup.temOp && !painelPopup.conferiu);

  overlay.innerHTML = `
    <div class="painel-popup-caixa">
      <div class="painel-popup-titulo">Confirma que separou o item ${escapeHtml(item.codigo_item || '')}?</div>
      <div class="painel-popup-sub">${escapeHtml(item.descricao || '')}</div>
      <div class="painel-popup-campo">
        <div class="painel-popup-rotulo">Quem separou este item?</div>
        <div class="painel-nomes">${listaNomes('separou')}</div>
      </div>
      ${painelPopup.temOp ? `
      <div class="painel-popup-campo">
        <div class="painel-popup-rotulo">Quem conferiu este item?</div>
        <div class="painel-nomes">${listaNomes('conferiu')}</div>
      </div>` : ''}
      <div class="painel-popup-acoes">
        <button class="btn" id="painelPopupCancelar">Cancelar</button>
        <button class="btn btn-primary" id="painelPopupConfirmar" ${faltaNome ? 'disabled' : ''}>Confirmar</button>
      </div>
    </div>`;
}

// ---- Cadastro de quem separa -------------------------------------------------
// Robson, 17/09/2026, no pop-up de Concluir Pedido: "AQUI QUERO PODER OS
// NOMES". Cadastro fica aqui, colado no lugar onde os nomes aparecem, e nao em
// Configurações: quem mexe nessa lista e o lider do almoxarifado, na hora que
// alguem entra ou sai da equipe -- nao o admin do portal, noutra tela.
//
// Tirar um nome INATIVA (ativo = false), nao apaga: item ja separado guarda o
// nome em `separado_por_nome`, e apagar a pessoa do cadastro nao pode reescrever
// a historia de quem separou o que.
function painelAbrirPopupNomes() {
  painelPopup = { tipo: 'nomes', erro: null };
  renderPainelPopupNomes();
}

function renderPainelPopupNomes() {
  const overlay = document.getElementById('painelPopup');
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="painel-popup-caixa">
      <div class="painel-popup-titulo">Quem separa na unidade ${escapeHtml(unidadeAtual)}</div>
      <div class="painel-popup-sub">Os nomes aqui são os que aparecem ao marcar item e ao concluir pedido.</div>
      ${painelPopup.erro ? `<div class="status-msg status-err" style="margin-bottom:10px;">${escapeHtml(painelPopup.erro)}</div>` : ''}
      <div class="painel-nomes painel-nomes-cadastro">
        ${painelNomes.length
          ? painelNomes.map(nome => `
            <span class="painel-nome-chip">
              ${escapeHtml(nome)}
              <button class="painel-nome-remover" data-nome="${escapeHtml(nome)}" title="Tirar da lista">✕</button>
            </span>`).join('')
          : '<span class="painel-popup-sub">Nenhum nome cadastrado.</span>'}
      </div>
      <div class="painel-popup-campo" style="margin-top:14px;">
        <div class="painel-popup-rotulo">Adicionar nome</div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="painelNomeNovo" placeholder="Ex.: MARCOS" style="flex:1;" maxlength="40">
          <button class="btn btn-primary" id="painelNomeAdicionar">Adicionar</button>
        </div>
      </div>
      <div class="painel-popup-acoes">
        <button class="btn" id="painelPopupCancelar">Fechar</button>
      </div>
    </div>`;
}

async function painelAdicionarNome() {
  const campo = document.getElementById('painelNomeNovo');
  const nome = campo.value.trim().toUpperCase();
  if (!nome) return;
  // Reativa em vez de inserir de novo: a chave e (unidade, nome), entao quem
  // ja saiu e voltou tem linha na tabela com ativo = false.
  const { error } = await sb.from('separadores')
    .upsert({ unidade: unidadeAtual, nome, ativo: true, criado_por: nomeUsuarioAtual },
            { onConflict: 'unidade,nome' });
  if (error) {
    painelPopup.erro = /separadores/.test(error.message)
      ? 'Falta rodar sql/fase60-separadores.sql no Supabase.'
      : error.message;
    renderPainelPopupNomes();
    return;
  }
  painelPopup.erro = null;
  await carregarSeparadores();
  renderPainelPopupNomes();
}

async function painelRemoverNome(nome) {
  const { error } = await sb.from('separadores')
    .update({ ativo: false })
    .eq('unidade', unidadeAtual)
    .eq('nome', nome);
  if (error) { painelPopup.erro = error.message; renderPainelPopupNomes(); return; }
  painelPopup.erro = null;
  await carregarSeparadores();
  renderPainelPopupNomes();
}

function painelAbrirPopupConcluir(pedidoId) {
  painelPopup = { tipo: 'concluir', pedidoId, separador: null, conferente: null };
  renderPainelPopupConcluir();
}

function renderPainelPopupConcluir() {
  const overlay = document.getElementById('painelPopup');
  const pedido = progPedidos.find(p => String(p.id) === String(painelPopup.pedidoId));
  if (!pedido) { painelPopup = null; overlay.style.display = 'none'; return; }
  overlay.style.display = 'flex';

  const lista = (campo) => painelNomes.map(nome => `
    <button class="btn painel-nome painel-nome-${campo}${painelPopup[campo] === nome ? ' painel-nome-ativo' : ''}"
            data-campo="${campo}" data-nome="${escapeHtml(nome)}">${escapeHtml(nome)}</button>`).join('');

  const falta = !painelPopup.separador || !painelPopup.conferente;
  overlay.innerHTML = `
    <div class="painel-popup-caixa">
      <div class="painel-popup-titulo">Concluir o pedido ${escapeHtml(pedido.numero_pedido)}?</div>
      <div class="painel-popup-campo">
        <div class="painel-popup-rotulo">Separador do pedido</div>
        <div class="painel-nomes">${lista('separador')}</div>
      </div>
      <div class="painel-popup-campo">
        <div class="painel-popup-rotulo">Conferente do pedido</div>
        <div class="painel-nomes">${lista('conferente')}</div>
      </div>
      <div class="painel-popup-acoes">
        <button class="btn" id="painelPopupCancelar">Cancelar</button>
        <button class="btn btn-primary" id="painelPopupConfirmar" ${falta ? 'disabled' : ''}>Confirmar Conclusão</button>
      </div>
    </div>`;
}

// ---- Gravação ---------------------------------------------------------------
async function painelGravarSeparado() {
  const item = progItens.find(i => String(i.id) === String(painelPopup.itemId));
  if (!item) return;
  const msg = document.getElementById('painelMsg');
  const temOp = painelPopup.temOp;
  // Item com OP que ainda nao teve a OP reportada fica em 'falta_reporte':
  // separado fisicamente, reporte pendente. Sem OP, 'separado' e o fim.
  const novoStatus = temOp ? (painelOpReportada(item) ? 'reportado' : 'falta_reporte') : 'separado';

  const { error } = await sb.from('pedido_itens').update({
    status_separacao: novoStatus,
    separado_por: userIdAtual,
    separado_em: new Date().toISOString(),
    separado_por_nome: painelPopup.separou,
    conferido_por_nome: temOp ? painelPopup.conferiu : null
  }).eq('id', item.id);

  if (error) { painelFalha(error); return; }

  item.status_separacao = novoStatus;
  item.separado_por_nome = painelPopup.separou;
  if (temOp) item.conferido_por_nome = painelPopup.conferiu;
  await registrarLogProgramacao(item.pedido_id, 'item_separado',
    { item_id: item.id, status: novoStatus, separou: painelPopup.separou, conferiu: painelPopup.conferiu || null });
  msg.textContent = `${item.codigo_item} separado por ${painelPopup.separou}.`;
  msg.className = 'status-msg status-ok';
}

async function painelGravarOpReportada() {
  const item = progItens.find(i => String(i.id) === String(painelPopup.itemId));
  if (!item) return;
  const msg = document.getElementById('painelMsg');
  // Se a peca ja saiu fisicamente, os dois viraram 'reportado'. Se a producao
  // reportou antes de separarem, so a coluna booleana guarda isso -- o enum
  // nao tem esse estado, e mudar o sentido dele quebraria o resto do portal.
  const patch = painelSeparado(item)
    ? { status_separacao: 'reportado', op_reportada: true }
    : { op_reportada: true };

  const { error } = await sb.from('pedido_itens').update(patch).eq('id', item.id);
  if (error) { painelFalha(error); return; }

  Object.assign(item, patch);
  await registrarLogProgramacao(item.pedido_id, 'item_separado',
    { item_id: item.id, op_reportada: true });
  msg.textContent = `OP ${item.numero_os_op} marcada como reportada.`;
  msg.className = 'status-msg status-ok';
}

async function painelGravarConclusao() {
  const pedido = progPedidos.find(p => String(p.id) === String(painelPopup.pedidoId));
  if (!pedido) return;
  const msg = document.getElementById('painelMsg');

  const { error } = await sb.from('pedidos').update({
    separador_nome: painelPopup.separador,
    conferente_nome: painelPopup.conferente,
    concluido_em: new Date().toISOString()
  }).eq('id', pedido.id);

  if (error) { painelFalha(error); return; }

  pedido.separador_nome = painelPopup.separador;
  pedido.conferente_nome = painelPopup.conferente;
  await registrarLogProgramacao(pedido.id, 'pedido_concluido',
    { separador: painelPopup.separador, conferente: painelPopup.conferente });
  msg.textContent = `Pedido ${pedido.numero_pedido} concluído — ${painelPopup.separador} / ${painelPopup.conferente}.`;
  msg.className = 'status-msg status-ok';
  painelPedidoId = null; // deixa a tela escolher o proximo mais urgente
}

function painelFalha(error) {
  const msg = document.getElementById('painelMsg');
  msg.textContent = /separado_por_nome|conferido_por_nome|op_reportada|separador_nome|concluido_em/.test(error.message)
    ? 'NÃO SALVOU: falta rodar sql/fase59-painel-separacao-assinaturas.sql no Supabase.'
    : 'NÃO SALVOU: ' + error.message;
  msg.className = 'status-msg status-err';
  console.error('Falha no Painel de Separação:', error.message);
}

// ---- Eventos ----------------------------------------------------------------
document.getElementById('painelFila').addEventListener('click', (e) => {
  const card = e.target.closest('[data-pedido-id]');
  if (!card) return;
  painelPedidoId = card.dataset.pedidoId;
  // O id vem do dataset como texto; a lista guarda o tipo original do banco.
  const achado = progPedidos.find(p => String(p.id) === String(painelPedidoId));
  if (achado) painelPedidoId = achado.id;
  renderPainelSeparacao();
});

document.getElementById('painelAtual').addEventListener('click', (e) => {
  const separado = e.target.closest('.painel-btn-separado');
  if (separado) { painelAbrirPopup('separado', separado.dataset.id); return; }
  const op = e.target.closest('.painel-btn-op');
  if (op) { painelAbrirPopup('op', op.dataset.id); return; }
  const concluir = e.target.closest('#painelConcluirBtn');
  if (concluir && !concluir.disabled) painelAbrirPopupConcluir(concluir.dataset.pedidoId);
});

document.getElementById('painelNomesBtn').addEventListener('click', painelAbrirPopupNomes);

document.getElementById('painelPopup').addEventListener('click', async (e) => {
  if (e.target.id === 'painelPopup') { painelPopup = null; renderPainelPopup(); return; }

  if (painelPopup && painelPopup.tipo === 'nomes') {
    const remover = e.target.closest('.painel-nome-remover');
    if (remover) { await painelRemoverNome(remover.dataset.nome); return; }
    if (e.target.id === 'painelNomeAdicionar') { await painelAdicionarNome(); return; }
    if (e.target.id === 'painelPopupCancelar') { painelPopup = null; renderPainelPopup(); }
    return;
  }

  const nome = e.target.closest('.painel-nome');
  if (nome) {
    painelPopup[nome.dataset.campo] = nome.dataset.nome;
    if (painelPopup.tipo === 'concluir') renderPainelPopupConcluir();
    else renderPainelPopup();
    return;
  }

  if (e.target.id === 'painelPopupCancelar') { painelPopup = null; renderPainelPopup(); return; }

  if (e.target.id === 'painelPopupConfirmar') {
    e.target.disabled = true;
    const tipo = painelPopup.tipo;
    if (tipo === 'separado') await painelGravarSeparado();
    else if (tipo === 'op') await painelGravarOpReportada();
    else if (tipo === 'concluir') await painelGravarConclusao();
    painelPopup = null;
    renderPainelPopup();
    await carregarProgramacao();
  }
});
