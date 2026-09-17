// Portal de Estoque Kingspan Isoeste — Devolução (15/09/2026)
//
// O Robson pediu originalmente uma planilha Excel (Base_Sistema + Conferência
// Física, PROCV/XLOOKUP) pra não perder o controle de mercadoria que volta
// dos clientes e expor divergência entre o que foi faturado na NF de
// devolução e o que chegou de verdade no físico. Perguntado se virava aba no
// portal: *"sobre ABA DEVOLUÇAO"* -- confirmado que sim, e que a importação
// precisa aceitar TODAS as unidades juntas: *"quero alimentar aqui de todas
// as unidade, conforme faço do exp e do alm"* (mesmo padrão de Configurações
// > Atualizar estoques em lote).
//
// UMA TABELA SÓ, NÃO DUAS PLANILHAS LIGADAS POR PROCV
//
// No Excel fazia sentido separar as duas abas porque uma busca da outra com
// fórmula. No portal isso vira complicação à toa: não existem "duas abas
// olhando a mesma linha" -- é a MESMA linha, só que com dois grupos de coluna
// preenchidos em momentos diferentes (a NF quando a devolução chega, o físico
// quando alguém confere). Uma tabela só (`devolucao_itens`), com a
// divergência calculada na hora de exibir -- não precisa nem gravar.
//
// POR QUE MESCLA, E NÃO SUBSTITUI (como o Almoxarifado faz)
//
// Devolução é histórico que só cresce -- reimportar o relatório do ERP e uma
// devolução antiga não aparecer mais não pode apagá-la (mesma lição do
// fase47, Análise de Compras: "não quero que desapareça"). E reimportar não
// pode apagar a conferência física já feita. Ver sql/fase52-devolucao.sql e
// a função `mesclar_devolucao`.

let devolucaoItens = [];

async function carregarDevolucao() {
  const msg = document.getElementById('devolucaoMsg');
  if (!unidadeAtual) { devolucaoItens = []; renderDevolucao(); return; }

  const { data, error } = await sb.from('devolucao_itens')
    .select('*').eq('unidade', unidadeAtual)
    .order('data_emissao', { ascending: false });

  if (error) {
    msg.textContent = 'Não foi possível carregar: ' + error.message
      + (/does not exist|relation|column|function/i.test(error.message) ? ' — rode sql/fase52-devolucao.sql no Supabase.' : '');
    msg.className = 'status-msg status-err';
    devolucaoItens = [];
  } else {
    devolucaoItens = data || [];
  }
  // Troca de unidade/recarga zera a seleção -- imprimir com itens de outra
  // unidade marcados por engano seria a folha errada saindo na impressora.
  devolucaoSelecionados.clear();
  renderDevolucao();
}

// ---- Sub-abas: Conferência x Registrar manual ------------------------------
let devolucaoAbaAtual = 'conferencia';

function trocarAbaDevolucao(aba) {
  devolucaoAbaAtual = aba;
  document.querySelectorAll('#devolucaoAbas [data-devolucao-aba]').forEach(b => {
    b.className = b.dataset.devolucaoAba === aba ? 'btn btn-primary' : 'btn';
  });
  document.getElementById('devolucaoConferencia').style.display = aba === 'conferencia' ? 'block' : 'none';
  document.getElementById('devolucaoRegistrar').style.display = aba === 'registrar' ? 'block' : 'none';
}

document.getElementById('devolucaoAbas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-devolucao-aba]');
  if (b) trocarAbaDevolucao(b.dataset.devolucaoAba);
});

// ---- Divergência e status, calculados na hora (não gravados) --------------
function statusDevolucao(item) {
  if (item.qtd_fisico === null || item.qtd_fisico === undefined) {
    return { chave: 'pendente', rotulo: 'Pendente', classe: 'st-pendente' };
  }
  const divergencia = Number(item.qtd_fisico) - Number(item.qtd_nf || 0);
  if (divergencia === 0) return { chave: 'ok', rotulo: 'OK', classe: 'st-ativo' };
  if (divergencia < 0) return { chave: 'falta', rotulo: 'Falta no físico', classe: 'st-atrasado' };
  return { chave: 'sobra', rotulo: 'Sobra no físico', classe: 'st-atencao' };
}

function divergenciaDevolucao(item) {
  if (item.qtd_fisico === null || item.qtd_fisico === undefined) return null;
  return Number(item.qtd_fisico) - Number(item.qtd_nf || 0);
}

function linhasFiltradasDevolucao() {
  const busca = document.getElementById('devolucaoBusca').value.trim().toLowerCase();
  const filtro = document.getElementById('devolucaoFiltroStatus').value;

  let linhas = devolucaoItens;
  if (busca) {
    linhas = linhas.filter(i =>
      String(i.id_devolucao || '').toLowerCase().includes(busca) ||
      String(i.numero_pedido || '').toLowerCase().includes(busca) ||
      String(i.nf_devolucao || '').toLowerCase().includes(busca) ||
      String(i.cliente || '').toLowerCase().includes(busca) ||
      String(i.cod_produto || '').toLowerCase().includes(busca) ||
      String(i.descricao_produto || '').toLowerCase().includes(busca));
  }
  if (filtro) linhas = linhas.filter(i => statusDevolucao(i).chave === filtro);
  return linhas;
}

let devolucaoSelecionados = new Set();

// Mesmo padrão do botão de etiquetas da Trading/Itens Débito Direto: o
// rótulo diz quantas folhas vão sair ANTES de sair, e qualquer mudança na
// marcação cancela uma confirmação de "mais de 10 folhas" pendente.
let devolucaoConfirmarImpressao = false;
function atualizarBotaoEtiquetasDevolucao() {
  const btn = document.getElementById('devolucaoEtiquetasBtn');
  if (!btn) return;
  devolucaoConfirmarImpressao = false;
  btn.textContent = `🖨️ Etiquetas (${devolucaoSelecionados.size})`;
  btn.disabled = devolucaoSelecionados.size === 0;
}

function renderDevolucao() {
  const linhas = linhasFiltradasDevolucao();
  const corpo = document.getElementById('devolucaoBody');
  const vazio = document.getElementById('devolucaoVazio');
  document.getElementById('devolucaoTabela').style.display = linhas.length ? 'table' : 'none';
  vazio.style.display = linhas.length ? 'none' : 'block';
  atualizarBotaoEtiquetasDevolucao();

  if (!linhas.length) {
    vazio.textContent = devolucaoItens.length
      ? 'Nenhuma devolução bate com o filtro.'
      : 'Nenhuma devolução importada ainda. Use "Importar planilha" ou "Registrar manual".';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = linhas.map(item => {
    const st = statusDevolucao(item);
    const div = divergenciaDevolucao(item);
    return `
    <tr>
      <td><input type="checkbox" class="devolucao-check" data-id="${escapeHtml(item.id)}" ${devolucaoSelecionados.has(String(item.id)) ? 'checked' : ''}></td>
      <td class="item">${escapeHtml(item.id_devolucao || '—')}</td>
      <td class="loc">${escapeHtml(item.numero_pedido || '—')}</td>
      <td class="loc">${escapeHtml(item.nf_devolucao || '—')}</td>
      <td>${escapeHtml(item.cliente || '—')}</td>
      <td class="item">${escapeHtml(item.cod_produto || '—')}${item.descricao_produto ? `<div class="cad-desc">${escapeHtml(item.descricao_produto)}</div>` : ''}</td>
      <td class="loc">${escapeHtml(item.um || '—')}</td>
      <td class="loc">${escapeHtml(item.deposito || '—')}</td>
      <td class="loc">${escapeHtml(item.referencia || '—')}</td>
      <td class="loc">${escapeHtml(item.lote || '—')}</td>
      <td class="loc">
        <input type="text" class="devolucao-local" data-id="${escapeHtml(item.id)}"
               value="${escapeHtml(item.localizacao || '')}" placeholder="—" style="width:110px;">
      </td>
      <td class="num">${escapeHtml(item.qtd_nf != null ? item.qtd_nf : '—')}</td>
      <td class="num">
        <input type="text" inputmode="decimal" class="devolucao-fisico" data-id="${escapeHtml(item.id)}"
               value="${item.qtd_fisico != null ? escapeHtml(item.qtd_fisico) : ''}"
               placeholder="Contar" style="width:80px; text-align:right;">
      </td>
      <td class="num">${div === null ? '—' : div.toLocaleString('pt-BR')}</td>
      <td><span class="cfg-status ${st.classe}">${st.rotulo}</span></td>
      <td>
        <input type="text" class="devolucao-obs" data-id="${escapeHtml(item.id)}"
               value="${escapeHtml(item.observacoes || '')}" placeholder="—" style="width:140px;">
      </td>
      <td class="cad-desc">${item.conferido_por ? escapeHtml(item.conferido_por) + ' — ' + escapeHtml(formatarDataHoraBR(item.conferido_em)) : '—'}</td>
    </tr>`;
  }).join('');
}

document.getElementById('devolucaoBusca').addEventListener('input', renderDevolucao);
document.getElementById('devolucaoFiltroStatus').addEventListener('change', renderDevolucao);

document.getElementById('devolucaoBody').addEventListener('change', (e) => {
  const check = e.target.closest('.devolucao-check');
  if (!check) return;
  if (check.checked) devolucaoSelecionados.add(check.dataset.id);
  else devolucaoSelecionados.delete(check.dataset.id);
  atualizarBotaoEtiquetasDevolucao();
  const todos = document.getElementById('devolucaoTodos');
  const filtradas = linhasFiltradasDevolucao();
  todos.checked = filtradas.length > 0 && filtradas.every(i => devolucaoSelecionados.has(String(i.id)));
});

document.querySelector('#devolucaoTabela thead').addEventListener('change', (e) => {
  if (e.target.id !== 'devolucaoTodos') return;
  const filtradas = linhasFiltradasDevolucao();
  if (e.target.checked) filtradas.forEach(i => devolucaoSelecionados.add(String(i.id)));
  else filtradas.forEach(i => devolucaoSelecionados.delete(String(i.id)));
  renderDevolucao();
});

// ---- Conferência física: gravação por célula, ao sair do campo ------------
//
// Sem botão "Salvar" próprio -- o operador confere item após item, tab/clique
// pro próximo campo já grava o anterior. `conferido_por`/`conferido_em` só
// são carimbados quando Qtd Físico está preenchida: campo em branco não é
// "conferido com zero", é "ainda não conferido" (ver statusDevolucao acima).
async function gravarConferenciaDevolucao(id, campos) {
  const msg = document.getElementById('devolucaoMsg');
  const { error } = await sb.from('devolucao_itens').update(campos).eq('id', id);
  if (error) {
    msg.textContent = 'NÃO SALVOU: ' + error.message;
    msg.className = 'status-msg status-err';
    return false;
  }
  const item = devolucaoItens.find(i => String(i.id) === String(id));
  if (item) Object.assign(item, campos);
  return true;
}

document.getElementById('devolucaoBody').addEventListener('change', async (e) => {
  const campoFisico = e.target.closest('.devolucao-fisico');
  const campoObs = e.target.closest('.devolucao-obs');
  const campoLocal = e.target.closest('.devolucao-local');
  if (!campoFisico && !campoObs && !campoLocal) return;

  const id = (campoFisico || campoObs || campoLocal).dataset.id;
  const item = devolucaoItens.find(i => String(i.id) === String(id));
  if (!item) return;

  if (campoFisico) {
    const texto = campoFisico.value.trim();
    const qtd_fisico = texto === '' ? null : parseQtd(texto);
    const ok = await gravarConferenciaDevolucao(id, {
      qtd_fisico,
      conferido_por: qtd_fisico === null ? null : nomeUsuarioAtual,
      conferido_em: qtd_fisico === null ? null : new Date().toISOString()
    });
    if (ok) renderDevolucao();
  } else if (campoObs) {
    await gravarConferenciaDevolucao(id, { observacoes: campoObs.value.trim() || null });
  } else {
    // Localização em maiúscula -- mesmo padrão do Controle EXP (12/09/2026):
    // endereço digitado de jeito diferente por pessoas diferentes vira duas
    // "localizações" na busca/agrupamento.
    await gravarConferenciaDevolucao(id, { localizacao: campoLocal.value.trim().toUpperCase() || null });
  }
});

// ===========================================================================
// Importação -- multi-unidade numa colagem só, mesmo padrão de Configurações
// > Atualizar estoques em lote (ALM/Catálogo EXP): lê a coluna Unidade/Estab
// e separa sozinho. Reconhecimento de coluna PRÓPRIO desta tela (não reusa
// LOTE_SINONIMOS de js/configuracoes.js) -- são campos diferentes (ID
// Devolução, NF, Data Emissão, Cliente não existem lá), e cada tela de
// importação deste portal já cuida do próprio dicionário (mesmo desenho de
// programacao.js pras planilhas A/B).
// ===========================================================================

const DEVOLUCAO_SINONIMOS = {
  unidade:           ['unidade', 'estab', 'estabelecimento', 'est', 'filial', 'cod estab', 'codigo estab'],
  // "id_devolucao" continua o nome do campo por baixo -- só o RÓTULO na
  // tela virou "Nº Protocolo" (Robson, 16/09/2026). Os sinônimos aceitam
  // "protocolo" também, pra planilha que já usa esse nome bater direto.
  id_devolucao:      ['id devolucao', 'id_devolucao', 'id', 'codigo devolucao', 'cod devolucao',
                       'numero devolucao', 'n devolucao', 'nº devolucao', 'protocolo', 'numero protocolo',
                       'nº protocolo', 'n protocolo'],
  numero_pedido:     ['numero pedido', 'nº pedido', 'n pedido', 'no pedido', 'pedido', 'num pedido'],
  nf_original:       ['nf original', 'nota original', 'nf origem', 'nota fiscal original'],
  nf_devolucao:      ['nf devolucao', 'nf_devolucao', 'nota devolucao', 'nf dev', 'numero nf devolucao', 'nota fiscal devolucao'],
  data_emissao:      ['data emissao', 'data_emissao', 'emissao', 'data'],
  cliente:           ['cliente', 'nome cliente', 'nome do cliente', 'razao social'],
  cod_produto:       ['cod produto', 'codigo produto', 'item', 'codigo', 'cod item', 'codigo item', 'produto', 'sku'],
  descricao_produto: ['descricao produto', 'descricao', 'desc', 'descricao do produto', 'nome produto', 'nome do produto'],
  um:                ['um', 'un', 'unid', 'u m', 'unidade de medida', 'unid medida'],
  deposito:          ['deposito', 'dep', 'depósito', 'armazem', 'armazém', 'cod deposito'],
  referencia:        ['referencia', 'ref', 'referência'],
  lote:              ['lote', 'lote item', 'n lote', 'nº lote', 'numero lote', 'no lote'],
  localizacao:       ['localizacao', 'local', 'endereco', 'end', 'localizacao item', 'posicao'],
  qtd_nf:            ['qtd nf', 'quantidade nf', 'qtd_nf', 'qtd', 'qtde', 'quantidade', 'qt liquida', 'qtd liquida']
};

// Própria desta tela -- NÃO reusa pareceCabecalho() de js/configuracoes.js,
// que checa contra LOTE_SINONIMOS (item/descricao genéricos). Um cabeçalho
// "Cod Produto"/"Descrição Produto" (compostos) não bate com aqueles
// sinônimos soltos, e reusar aquela função rejeitaria uma planilha válida.
function pareceCabecalhoDevolucao(celulas) {
  const nomes = celulas.map(normalizaCabecalho);
  return nomes.some(n => DEVOLUCAO_SINONIMOS.cod_produto.includes(n))
      || nomes.some(n => DEVOLUCAO_SINONIMOS.descricao_produto.includes(n))
      || nomes.some(n => DEVOLUCAO_SINONIMOS.id_devolucao.includes(n));
}

function mapearColunasDevolucao(cabecalho) {
  const nomes = cabecalho.map(normalizaCabecalho);
  const mapa = {};
  const usados = new Set();
  for (const campo of Object.keys(DEVOLUCAO_SINONIMOS)) {
    let achou = -1;
    for (const aceito of DEVOLUCAO_SINONIMOS[campo]) {
      const i = nomes.findIndex((n, idx) => n === aceito && !usados.has(idx));
      if (i !== -1) { achou = i; break; }
    }
    if (achou !== -1) { mapa[campo] = achou; usados.add(achou); }
  }
  return mapa;
}

// "15/09/2026" -> "2026-09-15". Aceita '-' também. Data inválida ou vazia
// vira null -- não trava a importação por uma célula mal preenchida.
function parseDataDevolucao(texto) {
  const t = String(texto || '').trim();
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  let [, d, mes, a] = m;
  if (a.length === 2) a = '20' + a;
  return `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

let devolucaoImportPreparado = null;

const devolucaoImportModal = document.getElementById('devolucaoImportModal');
document.getElementById('devolucaoImportarBtn').addEventListener('click', () => {
  devolucaoImportModal.classList.add('open');
  document.getElementById('devolucaoImportTexto').value = '';
  document.getElementById('devolucaoImportPrevia').innerHTML = '';
  document.getElementById('devolucaoImportMsg').textContent = '';
  devolucaoImportPreparado = null;
});
document.getElementById('devolucaoImportCloseBtn').addEventListener('click', () => devolucaoImportModal.classList.remove('open'));
devolucaoImportModal.addEventListener('click', (e) => {
  if (e.target === devolucaoImportModal) devolucaoImportModal.classList.remove('open');
});

function prepararImportacaoDevolucao(texto) {
  const avisos = [];
  const { linhas } = celulasDaPlanilha(texto);
  if (!linhas.length) return { erro: 'Nada foi encontrado no texto colado.' };
  if (!pareceCabecalhoDevolucao(linhas[0])) {
    return { erro: 'Esta planilha precisa de cabeçalho: é nele que eu encontro a coluna da '
                 + 'unidade. Cole incluindo a primeira linha, com os nomes das colunas.' };
  }

  const cabecalho = linhas[0];
  const mapa = mapearColunasDevolucao(cabecalho);
  if (mapa.cod_produto === undefined) {
    return { erro: 'Não encontrei a coluna do produto. Cabeçalho lido: ' + cabecalho.join(' · ') };
  }
  if (mapa.unidade === undefined) {
    return { erro: 'Não encontrei a coluna da unidade. Ela pode se chamar Unidade, Estab, '
                 + 'Estabelecimento, Est ou Filial. Cabeçalho lido: ' + cabecalho.join(' · ') };
  }
  // Nº do Protocolo NÃO é exigido aqui -- a planilha que vem do sistema
  // (Estab, Item, Descrição, UM, Depósito, Referência, Lote, Quantidade)
  // não tem protocolo nenhum, é uma foto do que está parado no depósito
  // DEV agora. A chave de mesclagem é (unidade, item, referência, lote),
  // ver sql/fase54.

  const conhecidas = new Set(Object.keys(UNIDADES));
  const porUnidade = new Map();
  const desconhecidas = new Map();
  let semChave = 0;

  linhas.slice(1).forEach(c => {
    const pega = (campo) => (mapa[campo] !== undefined ? (c[mapa[campo]] || '') : '');
    const uni = pega('unidade').trim();
    const produto = pega('cod_produto').trim();
    if (!uni || !produto) { semChave++; return; }
    if (!conhecidas.has(uni)) {
      desconhecidas.set(uni, (desconhecidas.get(uni) || 0) + 1);
      return;
    }
    if (!porUnidade.has(uni)) porUnidade.set(uni, []);
    const qtdTexto = pega('qtd_nf').trim();
    porUnidade.get(uni).push({
      id_devolucao: pega('id_devolucao').trim() || null,
      numero_pedido: pega('numero_pedido').trim() || null,
      nf_original: pega('nf_original').trim() || null,
      nf_devolucao: pega('nf_devolucao').trim() || null,
      data_emissao: parseDataDevolucao(pega('data_emissao')),
      cliente: pega('cliente').trim() || null,
      cod_produto: produto,
      descricao_produto: pega('descricao_produto').trim() || null,
      um: pega('um').trim() || null,
      deposito: pega('deposito').trim() || null,
      referencia: pega('referencia').trim() || null,
      lote: pega('lote').trim() || null,
      localizacao: pega('localizacao').trim().toUpperCase() || null,
      qtd_nf: qtdTexto ? parseQtd(qtdTexto) : null
    });
  });

  if (semChave) {
    avisos.push(semChave + ' linha(s) ignorada(s) por faltar unidade ou produto.');
  }
  for (const [uni, n] of desconhecidas) {
    avisos.push(n + ' linha(s) ignorada(s) da unidade "' + uni + '", que não existe no portal.');
  }
  if (!porUnidade.size) {
    return { erro: 'Nenhuma linha aproveitável: confira se a coluna da unidade tem os códigos '
                 + '(101, 105, 106...) e se o produto está preenchido.' };
  }

  const blocos = [...porUnidade.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([unidade, itens]) => ({ unidade, itens }));

  return { blocos, avisos, mapa, cabecalho };
}

function renderPreviaDevolucao(pronto) {
  const alvo = document.getElementById('devolucaoImportPrevia');
  const avisosHtml = (pronto.avisos && pronto.avisos.length)
    ? '<div class="cfg-nota" style="margin:0 0 10px; color:var(--aviso-texto);">'
      + pronto.avisos.map(a => '⚠️ ' + escapeHtml(a)).join('<br>') + '</div>'
    : '';

  const partes = Object.keys(pronto.mapa).map(campo =>
    '<b>' + escapeHtml(campo) + '</b> ← ' + escapeHtml(pronto.cabecalho[pronto.mapa[campo]]));
  const mapaHtml = '<div class="cfg-email" style="margin-bottom:10px;">Colunas reconhecidas: '
                  + partes.join(' · ') + '</div>';

  const total = pronto.blocos.reduce((s, b) => s + b.itens.length, 0);
  const corpoHtml =
    '<table class="cfg-tabela" style="margin-bottom:10px;"><thead><tr>'
    + '<th>Unidade</th><th>Itens que entram</th></tr></thead><tbody>'
    + pronto.blocos.map(b =>
        '<tr><td><b>' + escapeHtml(rotuloUnidade(b.unidade)) + '</b></td><td>'
        + b.itens.length.toLocaleString('pt-BR') + '</td></tr>').join('')
    + '</tbody></table>'
    + '<div style="font-size:13px; color:var(--muted); margin-bottom:10px;">'
    + pronto.blocos.length + ' unidade(s), ' + total.toLocaleString('pt-BR') + ' item(ns) no total. '
    + 'Devolução já existente (mesmo Item + Referência + Lote) é atualizada, não duplicada. '
    + 'Conferência física já feita <b>não é apagada</b> por uma reimportação.</div>';

  alvo.innerHTML = avisosHtml + mapaHtml + corpoHtml
    + '<button class="btn btn-primary" id="devolucaoImportAplicarBtn">Mesclar agora</button>';
}

document.getElementById('devolucaoImportConfirmBtn').addEventListener('click', () => {
  const msg = document.getElementById('devolucaoImportMsg');
  const texto = document.getElementById('devolucaoImportTexto').value;
  if (!texto.trim()) {
    msg.textContent = 'Cole a planilha primeiro.';
    msg.className = 'status-msg status-err';
    return;
  }
  const pronto = prepararImportacaoDevolucao(texto);
  if (pronto.erro) {
    msg.textContent = pronto.erro;
    msg.className = 'status-msg status-err';
    document.getElementById('devolucaoImportPrevia').innerHTML = '';
    devolucaoImportPreparado = null;
    return;
  }
  devolucaoImportPreparado = pronto;
  msg.textContent = '';
  renderPreviaDevolucao(pronto);
});

document.getElementById('devolucaoImportPrevia').addEventListener('click', async (e) => {
  if (!e.target.closest('#devolucaoImportAplicarBtn')) return;
  if (!devolucaoImportPreparado) return;

  const msg = document.getElementById('devolucaoImportMsg');
  const botao = e.target.closest('#devolucaoImportAplicarBtn');
  botao.disabled = true;
  msg.textContent = 'Mesclando...';
  msg.className = 'status-msg';

  const { data, error } = await sb.rpc('mesclar_devolucao', {
    blocos: devolucaoImportPreparado.blocos,
    importado_por: nomeUsuarioAtual
  });

  botao.disabled = false;

  if (error) {
    msg.textContent = 'Não foi possível mesclar: ' + error.message
      + (/does not exist|relation|column|function/i.test(error.message) ? ' — rode sql/fase52-devolucao.sql no Supabase.' : '');
    msg.className = 'status-msg status-err';
    return;
  }

  msg.textContent = (data && data.linhas ? data.linhas : 0) + ' linha(s) mesclada(s) em '
    + (data && data.unidades ? data.unidades.length : 0) + ' unidade(s).';
  msg.className = 'status-msg status-ok';
  devolucaoImportPreparado = null;
  document.getElementById('devolucaoImportPrevia').innerHTML = '';
  document.getElementById('devolucaoImportTexto').value = '';
  await carregarDevolucao();
});

// ===========================================================================
// Registrar manual -- "quero fazer igual ao do exp acessórios, quando chegar
// devolução eu alimento mesmo que nao tenha dado entrada no sistema" (mesmo
// texto/comportamento do formulário "Digite um item de cada vez" do Controle
// EXP). Depois, o Robson especificou os campos exatos: *"NUMERO DO
// PROTOCOLO + N° Pedido, NOME DO CLIENTE, Item, Descricao, UM, Deposito,
// Referencia, Lote, Quantidade todas pode ser opcional para
// preenchumento"* -- mesmo conjunto de colunas do Catálogo EXP (Unidade,
// Item, Descrição, UM, Depósito, Referência, Lote, Quantidade), e TUDO
// opcional -- sem "*" travando o botão Registrar.
//
// ⚠️ "Tudo opcional" tem um limite físico: a chave de mesclagem da tabela
// é (unidade, cod_produto, referencia, lote) -- ver sql/fase54 (a
// planilha que vem do sistema não tem protocolo nenhum, só esses quatro).
// Sem referência e/ou lote preenchidos, o registro ainda salva (vira uma
// linha solta), só que não mescla com nada no futuro (Postgres nunca
// considera NULL = NULL pra unicidade) -- e não tem problema: é uma
// devolução registrada com o que se sabia na hora, completável depois.
//
// ⚠️ Grava `qtd_nf` E `qtd_fisico` com o MESMO número digitado (quando
// veio), já CONFERIDO na hora -- é o próprio Robson, vendo o material
// físico, quem está registrando; não faz sentido a linha nascer "pendente
// de conferência" de algo que ele acabou de conferir com os próprios
// olhos. Sem quantidade nenhuma digitada, fica mesmo pendente -- não dá
// pra confirmar contagem que não foi feita. Se depois a planilha do
// sistema trouxer o mesmo (unidade, item, referência, lote) com uma
// quantidade diferente, mesclar_devolucao() (fase52/54) atualiza só os
// campos da NF/planilha -- a divergência aparece sozinha.
document.getElementById('devolucaoManualRegistrarBtn').addEventListener('click', async () => {
  const msg = document.getElementById('devolucaoManualMsg');
  const campoId = document.getElementById('devolucaoManualId');
  const campoPedido = document.getElementById('devolucaoManualPedido');
  const campoCliente = document.getElementById('devolucaoManualCliente');
  const campoProduto = document.getElementById('devolucaoManualProduto');
  const campoDescricao = document.getElementById('devolucaoManualDescricao');
  const campoUm = document.getElementById('devolucaoManualUm');
  const campoDeposito = document.getElementById('devolucaoManualDeposito');
  const campoReferencia = document.getElementById('devolucaoManualReferencia');
  const campoLote = document.getElementById('devolucaoManualLote');
  const campoQtd = document.getElementById('devolucaoManualQtd');
  const btn = document.getElementById('devolucaoManualRegistrarBtn');

  const idDevolucao = campoId.value.trim() || null;
  const pedido = campoPedido.value.trim() || null;
  const produto = campoProduto.value.trim() || null;
  const qtdTexto = campoQtd.value.trim();

  if (!idDevolucao && !pedido && !produto && !qtdTexto) {
    msg.textContent = 'Preencha ao menos um campo.';
    msg.className = 'status-msg status-err';
    return;
  }
  if (!unidadeAtual) {
    msg.textContent = 'Selecione uma unidade antes de registrar.';
    msg.className = 'status-msg status-err';
    return;
  }

  const qtd = qtdTexto ? parseQtd(qtdTexto) : null;
  const agora = new Date().toISOString();

  btn.disabled = true;
  const { error } = await sb.from('devolucao_itens').upsert({
    unidade: unidadeAtual, id_devolucao: idDevolucao, numero_pedido: pedido,
    cliente: campoCliente.value.trim() || null,
    cod_produto: produto,
    descricao_produto: campoDescricao.value.trim() || null,
    um: campoUm.value.trim() || null,
    deposito: campoDeposito.value.trim() || null,
    referencia: campoReferencia.value.trim() || null,
    lote: campoLote.value.trim() || null,
    qtd_nf: qtd, qtd_fisico: qtd,
    conferido_por: qtd === null ? null : nomeUsuarioAtual,
    conferido_em: qtd === null ? null : agora,
    importado_por: nomeUsuarioAtual, importado_em: agora
  }, { onConflict: 'unidade,cod_produto,referencia,lote' });
  btn.disabled = false;

  if (error) {
    msg.textContent = 'NÃO SALVOU: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  // Nº Protocolo, Nº Pedido e Cliente continuam preenchidos pro próximo
  // item -- mesmo comportamento do Controle EXP: quem confere uma
  // devolução inteira digita vários produtos seguidos, um por um, sem
  // redigitar o que se repete entre eles.
  campoProduto.value = '';
  campoDescricao.value = '';
  campoUm.value = '';
  campoDeposito.value = '';
  campoReferencia.value = '';
  campoLote.value = '';
  campoQtd.value = '';
  campoProduto.focus();
  msg.textContent = qtd === null ? 'Item registrado (sem quantidade, fica pendente de conferência).' : 'Item registrado e já conferido.';
  msg.className = 'status-msg status-ok';
  await carregarDevolucao();
});

document.getElementById('devolucaoManualId').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('devolucaoManualPedido').focus();
});
[
  'devolucaoManualPedido', 'devolucaoManualCliente', 'devolucaoManualProduto', 'devolucaoManualDescricao',
  'devolucaoManualUm', 'devolucaoManualDeposito', 'devolucaoManualReferencia', 'devolucaoManualLote', 'devolucaoManualQtd'
].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('devolucaoManualRegistrarBtn').click();
  });
});

// ===========================================================================
// Impressão -- "pode colocar botao de imprimir também", mesmo desenho da
// etiqueta da Trading/Itens Débito Direto: uma etiqueta por folha, A4
// paisagem, texto grande, sem depender de rede. Marca "DEVOLUÇÃO" no lugar
// de "TRADING"/"ITEM DÉBITO DIRETO", e leva o Nº da devolução (pequeno) além
// do produto e da localização.
//
// Robson, 17/09/2026: "preciso para tirar etiqueta das devoluçoes, preciso
// colocar numero da NF, codigo do produto, descrição do produto e a
// metragem" -- código e descrição já existiam; faltavam a NF (nf_devolucao,
// mesma coluna da tabela) e a metragem (qtd_nf + um -- é o que a NF diz que
// tem, disponível na hora de etiquetar, antes até da conferência física
// preencher qtd_fisico).
// ===========================================================================

function montarHtmlEtiquetasDevolucao(linhas) {
  const impressoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const quem = nomeUsuarioAtual || emailUsuarioAtual || '—';
  const etiquetas = linhas.map(item => {
    const metragem = item.qtd_nf != null && item.qtd_nf !== ''
      ? `${numeroBR(item.qtd_nf)}${item.um ? ' ' + escapeHtml(item.um) : ''}` : '';
    return `
    <section class="etiqueta">
      <div class="etq-topo">
        <span class="etq-marca">DEVOLUÇÃO</span>
        <span class="etq-unidade">${escapeHtml(rotuloUnidade(unidadeAtual))}</span>
      </div>
      <div class="etq-item">${escapeHtml(item.cod_produto || '—')}</div>
      <div class="etq-desc">${escapeHtml(item.descricao_produto || '')}${item.cliente ? ' · ' + escapeHtml(item.cliente) : ''}</div>
      ${metragem ? `<div class="etq-metragem">${metragem}</div>` : ''}
      <div class="etq-qtd">${item.nf_devolucao ? 'NF ' + escapeHtml(item.nf_devolucao) + ' · ' : ''}${item.id_devolucao ? 'Protocolo ' + escapeHtml(item.id_devolucao) + ' · ' : ''}${item.numero_pedido ? 'Pedido ' + escapeHtml(item.numero_pedido) : ''}</div>
      <div class="etq-local">${escapeHtml(item.localizacao || '—')}</div>
      <div class="etq-rodape">Impresso por ${escapeHtml(quem)} — ${escapeHtml(impressoEm)}</div>
    </section>`;
  }).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Devolução — ${new Date().toLocaleDateString('pt-BR')}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  :root { color-scheme: light; }
  body { font-family: Arial, sans-serif; margin: 0; background: #fff; color: #000; }
  .etiqueta {
    box-sizing: border-box; padding: 5mm 6mm; text-align: center;
    page-break-after: always; break-after: page;
  }
  .etiqueta:last-child { page-break-after: auto; break-after: auto; }
  .etq-topo {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 0.8mm solid #000; padding-bottom: 2mm; margin-bottom: 4mm;
  }
  .etq-marca { font-size: 12mm; font-weight: 900; letter-spacing: 0.08em; }
  .etq-unidade { font-size: 4mm; color: #333; }
  .etq-item { font-size: 22mm; font-weight: 900; line-height: 1.1; overflow-wrap: anywhere; }
  .etq-desc { font-size: 9mm; font-weight: 700; line-height: 1.15; margin-top: 3mm; }
  .etq-metragem { font-size: 15mm; font-weight: 900; margin-top: 3mm; }
  .etq-qtd { font-size: 8mm; font-weight: 700; margin-top: 3mm; color: #333; }
  .etq-local {
    font-size: 40mm; font-weight: 900; line-height: 1.05; letter-spacing: 0.02em;
    margin-top: 4mm; padding: 3mm 0; border-top: 0.8mm solid #000;
    border-bottom: 0.8mm solid #000; overflow-wrap: anywhere;
  }
  .etq-rodape { font-size: 3.5mm; color: #333; margin-top: 3mm; }
</style></head><body>
${etiquetas}
${'<script>window.onload = () => window.print();<' + '/script>'}
</body></html>`;
}

async function imprimirEtiquetasDevolucao(linhas) {
  if (!linhas.length) return;
  // Aba aberta ANTES do `await` -- ativação transitória do clique (mesma
  // regra da Trading/Itens Débito Direto/reserva de aço).
  const aba = window.open('', '_blank');
  if (!aba) { alert('O navegador bloqueou a nova aba. Libere pop-ups pra este site e tente de novo.'); return; }
  aba.document.write(montarHtmlEtiquetasDevolucao(linhas));
  aba.document.close();
}

document.getElementById('devolucaoEtiquetasBtn').addEventListener('click', () => {
  const linhas = devolucaoItens.filter(i => devolucaoSelecionados.has(String(i.id)));
  if (!linhas.length) return;

  if (linhas.length > LIMITE_FOLHAS_IMPRESSAO && !devolucaoConfirmarImpressao) {
    devolucaoConfirmarImpressao = true;
    const botao = document.getElementById('devolucaoEtiquetasBtn');
    botao.textContent = `Imprimir ${linhas.length} folhas mesmo assim?`;
    return;
  }
  devolucaoConfirmarImpressao = false;
  imprimirEtiquetasDevolucao(linhas);
});
