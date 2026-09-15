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
  renderDevolucao();
}

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
      String(i.nf_devolucao || '').toLowerCase().includes(busca) ||
      String(i.cliente || '').toLowerCase().includes(busca) ||
      String(i.cod_produto || '').toLowerCase().includes(busca) ||
      String(i.descricao_produto || '').toLowerCase().includes(busca));
  }
  if (filtro) linhas = linhas.filter(i => statusDevolucao(i).chave === filtro);
  return linhas;
}

function renderDevolucao() {
  const linhas = linhasFiltradasDevolucao();
  const corpo = document.getElementById('devolucaoBody');
  const vazio = document.getElementById('devolucaoVazio');
  document.getElementById('devolucaoTabela').style.display = linhas.length ? 'table' : 'none';
  vazio.style.display = linhas.length ? 'none' : 'block';

  if (!linhas.length) {
    vazio.textContent = devolucaoItens.length
      ? 'Nenhuma devolução bate com o filtro.'
      : 'Nenhuma devolução importada ainda. Use "Importar planilha".';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = linhas.map(item => {
    const st = statusDevolucao(item);
    const div = divergenciaDevolucao(item);
    return `
    <tr>
      <td class="item">${escapeHtml(item.id_devolucao)}</td>
      <td class="loc">${escapeHtml(item.nf_devolucao || '—')}</td>
      <td>${escapeHtml(item.cliente || '—')}</td>
      <td class="item">${escapeHtml(item.cod_produto)}${item.descricao_produto ? `<div class="cad-desc">${escapeHtml(item.descricao_produto)}</div>` : ''}</td>
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
  if (!campoFisico && !campoObs) return;

  const id = (campoFisico || campoObs).dataset.id;
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
  } else {
    await gravarConferenciaDevolucao(id, { observacoes: campoObs.value.trim() || null });
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
  id_devolucao:      ['id devolucao', 'id_devolucao', 'id', 'codigo devolucao', 'cod devolucao', 'numero devolucao', 'n devolucao', 'nº devolucao'],
  nf_original:       ['nf original', 'nota original', 'nf origem', 'nota fiscal original'],
  nf_devolucao:      ['nf devolucao', 'nf_devolucao', 'nota devolucao', 'nf dev', 'numero nf devolucao', 'nota fiscal devolucao'],
  data_emissao:      ['data emissao', 'data_emissao', 'emissao', 'data'],
  cliente:           ['cliente', 'nome cliente', 'razao social'],
  cod_produto:       ['cod produto', 'codigo produto', 'item', 'codigo', 'cod item', 'codigo item', 'produto', 'sku'],
  descricao_produto: ['descricao produto', 'descricao', 'desc', 'descricao do produto', 'nome produto', 'nome do produto'],
  qtd_nf:            ['qtd nf', 'quantidade nf', 'qtd_nf', 'qtd', 'qtde', 'quantidade']
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
  if (mapa.id_devolucao === undefined) {
    return { erro: 'Não encontrei a coluna do ID da devolução. Cabeçalho lido: ' + cabecalho.join(' · ') };
  }

  const conhecidas = new Set(Object.keys(UNIDADES));
  const porUnidade = new Map();
  const desconhecidas = new Map();
  let semChave = 0;

  linhas.slice(1).forEach(c => {
    const pega = (campo) => (mapa[campo] !== undefined ? (c[mapa[campo]] || '') : '');
    const uni = pega('unidade').trim();
    const idDevolucao = pega('id_devolucao').trim();
    const produto = pega('cod_produto').trim();
    if (!uni || !idDevolucao || !produto) { semChave++; return; }
    if (!conhecidas.has(uni)) {
      desconhecidas.set(uni, (desconhecidas.get(uni) || 0) + 1);
      return;
    }
    if (!porUnidade.has(uni)) porUnidade.set(uni, []);
    const qtdTexto = pega('qtd_nf').trim();
    porUnidade.get(uni).push({
      id_devolucao: idDevolucao,
      nf_original: pega('nf_original').trim() || null,
      nf_devolucao: pega('nf_devolucao').trim() || null,
      data_emissao: parseDataDevolucao(pega('data_emissao')),
      cliente: pega('cliente').trim() || null,
      cod_produto: produto,
      descricao_produto: pega('descricao_produto').trim() || null,
      qtd_nf: qtdTexto ? parseQtd(qtdTexto) : null
    });
  });

  if (semChave) {
    avisos.push(semChave + ' linha(s) ignorada(s) por faltar unidade, ID da devolução ou produto.');
  }
  for (const [uni, n] of desconhecidas) {
    avisos.push(n + ' linha(s) ignorada(s) da unidade "' + uni + '", que não existe no portal.');
  }
  if (!porUnidade.size) {
    return { erro: 'Nenhuma linha aproveitável: confira se a coluna da unidade tem os códigos '
                 + '(101, 105, 106...) e se ID da devolução e produto estão preenchidos.' };
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
    + 'Devolução já existente (mesmo ID + produto) é atualizada, não duplicada. '
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
