// Portal de Estoque Kingspan Isoeste — consulta e contagem do estoque geral
// Extraido do index.html na Fase 2a (03/09/2026), sem alteracao de conteudo.
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.


let currentData = [];
let modoContagemAtivo = false;
let nomeUsuarioAtual = '';
let fichaImageMap = new Map();
let fichaBoxMap = new Map();
let sortKey = null;
let sortDir = 1;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function parseQtd(v) {
  if (typeof v !== 'string') return v;
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
}

// Como o mesmo código de item pode aparecer em mais de um endereço, a contagem
// física é guardada por combinação de item + localização, não só pelo item.
function chaveContagem(item, localizacao) {
  return item + '::' + localizacao;
}

function formatarDiferenca(fisico, sistema) {
  const diff = parseQtd(fisico) - parseQtd(sistema);
  if (diff === 0) return `<span class="diff-badge diff-ok">✓ OK</span>`;
  const sinal = diff > 0 ? '+' : '';
  const classe = diff > 0 ? 'diff-mais' : 'diff-menos';
  return `<span class="diff-badge ${classe}">${sinal}${diff.toLocaleString('pt-BR')}</span>`;
}

function render(rows, intervalo) {
  const tbody = document.getElementById('tableBody');
  const emptyMsg = document.getElementById('emptyMsg');
  document.getElementById('loadingMsg').style.display = 'none';

  // O card e a paginacao mostram o total FILTRADO, nao o da unidade toda.
  const total = rows.length;
  document.getElementById('stat-count').textContent = total.toLocaleString('pt-BR');

  if (total === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    renderPaginacao(0);
    return;
  }
  emptyMsg.style.display = 'none';

  // Ao imprimir, sai tudo; na tela, so a pagina atual.
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (pagina > paginas) pagina = paginas;
  rows = imprimindoTudo ? rows : rows.slice((pagina - 1) * porPagina, pagina * porPagina);
  renderPaginacao(total);

  let letraAnterior = null;
  tbody.innerHTML = rows.map((r, i) => {
    let quebra = '';
    if (intervalo) {
      const letraAtual = extrairLetraGrupo(r.localizacao, intervalo.tipo);
      if (i > 0 && letraAtual && letraAtual !== letraAnterior) quebra = ' class="quebra-pagina"';
      letraAnterior = letraAtual;
    }
    return `
    <tr${quebra}>
      <td class="item">${escapeHtml(r.item)}</td>
      <td>${escapeHtml(r.descricao)}</td>
      <td>${escapeHtml(r.um)}</td>
      <td class="loc"><span class="loc-chip">${escapeHtml(r.localizacao)}</span></td>
      <td class="col-padrao" style="text-align:center;">${fichaBoxMap.has(r.item) ? `<button class="padrao-btn" data-item="${escapeHtml(r.item)}" data-qtd="${escapeHtml(r.quantidade)}" title="Ver padrão de caixas esperado">📦</button>` : ''}</td>
      <td class="num">${escapeHtml(r.quantidade)}</td>
      <td class="col-acoes" style="display:${modoContagemAtivo ? 'none' : 'table-cell'};">
        ${fichaImageMap.has(r.item)
          ? `<button class="acao-btn ficha-btn" data-item="${escapeHtml(r.item)}" title="Ver foto e ficha técnica">👁</button>${fichaImageMap.get(r.item) ? `<img class="print-only-thumb" src="${escapeHtml(fichaImageMap.get(r.item))}" alt="">` : ''}`
          : ''}
        <button class="acao-btn compare-btn" data-item="${escapeHtml(r.item)}" title="Comparar entre unidades">⇄</button>
      </td>
      <td class="col-contagem" style="display:${modoContagemAtivo ? 'table-cell' : 'none'};">
        <input type="text" inputmode="decimal" class="contagem-input" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}"
               value="${contagemMap[chaveContagem(r.item, r.localizacao)] ? escapeHtml(contagemMap[chaveContagem(r.item, r.localizacao)]) : ''}"
               placeholder="—">
        <div class="contagem-rodape">
          <span class="diff-slot" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}">${contagemMap[chaveContagem(r.item, r.localizacao)] ? formatarDiferenca(contagemMap[chaveContagem(r.item, r.localizacao)], r.quantidade) : ''}</span>
          <button class="contagem-clear-btn" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}" type="button" style="display:${contagemMap[chaveContagem(r.item, r.localizacao)] ? 'inline-block' : 'none'};">Limpar</button>
        </div>
        <div class="caixas-slot" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}">${contagemMap[chaveContagem(r.item, r.localizacao)] ? formatarCaixas(contagemMap[chaveContagem(r.item, r.localizacao)], r.item) : ''}</div>
      </td>
    </tr>
  `;
  }).join('');
}

// Monta a barra de paginacao. Mostra no maximo sete botoes, com reticencias
// no meio -- com 53 paginas, listar todas seria pior que nao ter barra.
function renderPaginacao(total) {
  const barra = document.getElementById('paginacao');
  if (total === 0 || imprimindoTudo) { barra.style.display = 'none'; return; }
  barra.style.display = 'flex';

  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(pagina * porPagina, total);
  document.getElementById('pgInfo').textContent =
    `Mostrando ${de} a ${ate} de ${total.toLocaleString('pt-BR')} itens`;

  const numeros = [];
  if (paginas <= 7) {
    for (let p = 1; p <= paginas; p++) numeros.push(p);
  } else if (pagina <= 4) {
    numeros.push(1, 2, 3, 4, 5, '…', paginas);
  } else if (pagina >= paginas - 3) {
    numeros.push(1, '…', paginas - 4, paginas - 3, paginas - 2, paginas - 1, paginas);
  } else {
    numeros.push(1, '…', pagina - 1, pagina, pagina + 1, '…', paginas);
  }

  document.getElementById('pgBotoes').innerHTML =
    `<button class="pg-btn" data-pg="ant" ${pagina === 1 ? 'disabled' : ''}>‹ Anterior</button>` +
    numeros.map(p => p === '…'
      ? `<span class="pg-elipse">…</span>`
      : `<button class="pg-btn ${p === pagina ? 'ativo' : ''}" data-pg="${p}">${p}</button>`).join('') +
    `<button class="pg-btn" data-pg="prox" ${pagina === paginas ? 'disabled' : ''}>Próxima ›</button>`;
}

document.getElementById('pgBotoes').addEventListener('click', (e) => {
  const btn = e.target.closest('.pg-btn');
  if (!btn || btn.disabled) return;
  const v = btn.dataset.pg;
  if (v === 'ant') pagina--;
  else if (v === 'prox') pagina++;
  else pagina = parseInt(v, 10);
  applyFilterAndSort();
  document.querySelector('.scroll-area').scrollTop = 0;
});

document.getElementById('pgPorPagina').addEventListener('change', (e) => {
  porPagina = parseInt(e.target.value, 10);
  pagina = 1;
  applyFilterAndSort();
});

let filtros = { localizacao: '', um: '', padrao: '', zerado: false, comFoto: false, divergente: false };

// Paginacao (Fase 3). `imprimindoTudo` existe porque a impressao precisa sair
// com TODAS as linhas filtradas, nao so a pagina na tela.
let pagina = 1;
let porPagina = 10;
let imprimindoTudo = false;

function tentarIntervaloCorredor(q) {
  // Formato 1: "corredor a", "corredor a-b", "corredor a até b" -> locais tipo A-01-01-01
  let m = q.match(/^corredor\s*([a-z])(?:\s*(?:-|até|ate)\s*([a-z]))?$/i);
  if (m) {
    const de = m[1].toUpperCase();
    const ate = m[2] ? m[2].toUpperCase() : de;
    const [inicio, fim] = de <= ate ? [de, ate] : [ate, de];
    return { tipo: 'corredor', inicio, fim };
  }
  // Formato 2: "cant a", "cant a-g", "cant a até g" -> locais tipo CANT A, CANT B...
  m = q.match(/^cant\s*([a-z])(?:\s*(?:-|até|ate)\s*([a-z]))?$/i);
  if (m) {
    const de = m[1].toUpperCase();
    const ate = m[2] ? m[2].toUpperCase() : de;
    const [inicio, fim] = de <= ate ? [de, ate] : [ate, de];
    return { tipo: 'cant', inicio, fim };
  }
  return null;
}

function extrairLetraGrupo(localizacao, tipo) {
  const loc = String(localizacao).trim().toUpperCase();
  if (tipo === 'cant') {
    const m = loc.match(/^CANT\s+([A-Z])\b/);
    return m ? m[1] : null;
  }
  // padrão "corredor": letra única seguida de traço (ex: A-01-...)
  const m = loc.match(/^([A-Z])-/);
  return m ? m[1] : null;
}

function applyFilterAndSort() {
  const qOriginal = document.getElementById('searchBox').value.trim();
  const q = qOriginal.toLowerCase();
  let rows = currentData;

  const intervalo = tentarIntervaloCorredor(qOriginal);
  if (intervalo) {
    rows = rows.filter(r => {
      const letra = extrairLetraGrupo(r.localizacao, intervalo.tipo);
      if (!letra) return false;
      return letra >= intervalo.inicio && letra <= intervalo.fim;
    });
  } else if (q) {
    rows = rows.filter(r =>
      String(r.item).toLowerCase().includes(q) ||
      String(r.descricao).toLowerCase().includes(q) ||
      String(r.localizacao).toLowerCase().includes(q) ||
      String(r.um).toLowerCase().includes(q)
    );
  }
  if (filtros.localizacao) {
    const alvo = filtros.localizacao.toLowerCase();
    rows = rows.filter(r => String(r.localizacao).toLowerCase().includes(alvo));
  }
  if (filtros.um) rows = rows.filter(r => r.um === filtros.um);
  if (filtros.padrao === 'com') rows = rows.filter(r => fichaBoxMap.has(r.item));
  if (filtros.padrao === 'sem') rows = rows.filter(r => !fichaBoxMap.has(r.item));
  if (filtros.zerado) rows = rows.filter(r => parseQtd(r.quantidade) === 0);
  if (filtros.comFoto) rows = rows.filter(r => fichaImageMap.has(r.item));
  if (filtros.divergente) {
    rows = rows.filter(r => {
      const fisico = contagemMap[chaveContagem(r.item, r.localizacao)];
      if (fisico === undefined || fisico === '') return false;
      return parseQtd(fisico) !== parseQtd(r.quantidade);
    });
  }

  if (sortKey) {
    const keyMap = { item: 'item', desc: 'descricao', um: 'um', loc: 'localizacao', qtd: 'quantidade' };
    const realKey = keyMap[sortKey];
    rows = [...rows].sort((a, b) => {
      let va = a[realKey], vb = b[realKey];
      if (sortKey === 'qtd') { va = parseQtd(va); vb = parseQtd(vb); }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });
  } else if (intervalo) {
    // Sem ordenação manual escolhida: agrupa por localização, pra impressão sair separada por corredor
    rows = [...rows].sort((a, b) => String(a.localizacao).localeCompare(String(b.localizacao)));
  }
  render(rows, intervalo);
}

function popularFiltrosDropdown() {
  const locInput = document.getElementById('filterLocalizacao');
  const locDatalist = document.getElementById('localizacoesDatalist');
  const umSelect = document.getElementById('filterUm');
  const locsUnicas = [...new Set(currentData.map(r => r.localizacao).filter(Boolean))].sort();
  const umsUnicas = [...new Set(currentData.map(r => r.um).filter(Boolean))].sort();

  locDatalist.innerHTML = locsUnicas.map(l => `<option value="${escapeHtml(l)}">`).join('');
  locInput.value = filtros.localizacao;
  umSelect.innerHTML = '<option value="">Todas</option>' +
    umsUnicas.map(u => `<option value="${escapeHtml(u)}" ${filtros.um === u ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('');
}

function atualizarBadgeFiltros() {
  const ativos = [filtros.localizacao, filtros.um, filtros.padrao, filtros.zerado, filtros.comFoto, filtros.divergente].filter(Boolean).length;
  const badge = document.getElementById('filterCount');
  if (ativos > 0) {
    badge.textContent = ativos;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// "há 2 minutos", "há 3 horas", "há 5 dias" — o subtitulo do card de data.
function tempoRelativo(iso) {
  const seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!isFinite(seg) || seg < 0) return '';
  if (seg < 60) return 'agora mesmo';
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} minuto${min > 1 ? 's' : ''}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} hora${h > 1 ? 's' : ''}`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

function updateStats() {
  // stat-count e preenchido em render(), com o total FILTRADO.
  let latest = null;
  let latestPor = null;
  for (const r of currentData) {
    if (r.atualizado_em && (!latest || r.atualizado_em > latest)) {
      latest = r.atualizado_em;
      latestPor = r.atualizado_por;
    }
  }
  document.getElementById('stat-updated').textContent = latest
    ? new Date(latest).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '-';
  document.getElementById('stat-updated-nota').textContent = latest ? tempoRelativo(latest) : '\u00a0';
  document.getElementById('stat-updated-by').textContent = latestPor || '-';
}

async function loadFichaImageMap() {
  try {
    const { data, error } = await sb.from('fichas_tecnicas').select('item, imagem_url, qtd_caixa_master, qtd_caixa_fracionada');
    if (error) throw error;
    fichaImageMap = new Map((data || []).map(r => [r.item, r.imagem_url]));
    fichaBoxMap = new Map((data || [])
      .filter(r => r.qtd_caixa_master)
      .map(r => [r.item, { master: r.qtd_caixa_master, fracionada: r.qtd_caixa_fracionada }]));
  } catch (e) {
    console.warn('Não foi possível carregar a lista de fichas técnicas:', e.message);
    fichaImageMap = new Map();
    fichaBoxMap = new Map();
  }
}

// Calcula quantas caixas master fechadas, caixas fracionadas fechadas, e peças soltas
// cabem num total de peças, com base no tamanho de cada tipo de caixa.
function calcularCaixas(totalPecas, info) {
  if (!info || !info.master) return null;
  let restante = Math.round(parseQtd(String(totalPecas)));
  const caixasMaster = Math.floor(restante / info.master);
  restante -= caixasMaster * info.master;
  let caixasFracionadas = 0;
  if (info.fracionada) {
    caixasFracionadas = Math.floor(restante / info.fracionada);
    restante -= caixasFracionadas * info.fracionada;
  }
  return { caixasMaster, caixasFracionadas, pecasSoltas: restante };
}

function formatarCaixas(totalPecas, itemCode) {
  const info = fichaBoxMap.get(itemCode);
  const resultado = calcularCaixas(totalPecas, info);
  if (!resultado) return '';
  const partes = [];
  if (resultado.caixasMaster > 0) partes.push(`${resultado.caixasMaster} cx master`);
  if (resultado.caixasFracionadas > 0) partes.push(`${resultado.caixasFracionadas} cx fracionada`);
  if (resultado.pecasSoltas > 0) partes.push(`${resultado.pecasSoltas} pçs soltas`);
  return partes.length ? `= ${partes.join(' + ')}` : '';
}

// As oito unidades. Nao existem 102 nem 108.
// `cidade` vazia sai como "Unidade 103", sem inventar nome de cidade --
// preencher quando as cidades das novas unidades forem confirmadas.
const UNIDADES = {
  '101': { cidade: 'Anápolis',               uf: 'GO' },
  '103': { cidade: 'Várzea Grande',          uf: ''   },
  '104': { cidade: 'Vitória de Santo Antão', uf: ''   },
  '105': { cidade: 'Cambuí',                 uf: 'MG' },
  '106': { cidade: 'Araquari',               uf: 'SC' },
  '107': { cidade: 'Loja',                   uf: ''   },
  '109': { cidade: '',                       uf: ''   },  // a confirmar
  '110': { cidade: 'Leme',                   uf: ''   }
};

// Tres formatos, conforme o que se sabe da unidade:
//   "Unidade 106 — Araquari (SC)"   cidade e UF
//   "Unidade 110 — Leme"            cidade sem UF confirmada
//   "Unidade 109"                   nem cidade
// Nunca sai "Unidade 107 — Loja ()".
function rotuloUnidade(cod) {
  const u = UNIDADES[cod];
  if (!u || !u.cidade) return 'Unidade ' + cod;
  return u.uf ? `Unidade ${cod} — ${u.cidade} (${u.uf})` : `Unidade ${cod} — ${u.cidade}`;
}
let unidadeAtual = '106';

function atualizarSubtituloUnidade() {
  // O subtitulo saiu do layout na Fase 2b; a unidade agora fica no cabecalho.
  // Mantido tolerante a ausencia para nao quebrar quem ainda o tenha.
  if (!document.getElementById('unitSubtitle')) return;
  const u = UNIDADES[unidadeAtual];
  document.getElementById('unitSubtitle').textContent =
    `Unidade ${unidadeAtual}, em ${u.cidade} (${u.uf}). Consulta de itens, quantidades e localizações do almoxarifado.`;
}

async function loadData() {
  const { data, error } = await sb.from('estoque').select('*').eq('unidade', unidadeAtual).order('id', { ascending: true });
  if (error) {
    document.getElementById('loadingMsg').textContent = 'Erro ao carregar dados: ' + error.message;
    return;
  }
  // A carga inicial por SEED_DATA foi removida (AUDITORIA.md, itens C1 e A3):
  // eram 539 itens de estoque escritos no arquivo que o Vercel entrega sem
  // exigir login, e o mecanismo gravava sem a coluna `unidade`, podendo
  // ressuscitar dados congelados por cima do estoque real. Carga inicial e
  // tarefa de script SQL, rodado uma vez no Supabase.
  currentData = data || [];
  await loadFichaImageMap();
  updateStats();
  applyFilterAndSort();
}


function parsePastedTsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const records = [];
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 5) continue;
    const [item, desc, um, loc, qtd] = cols;
    if (item.toLowerCase() === 'item' && desc.toLowerCase().startsWith('descri')) continue;
    records.push({ item: item.trim(), descricao: desc.trim(), um: um.trim(), localizacao: loc.trim(), quantidade: qtd.trim() });
  }
  return records;
}

// ---- Modal de Ficha Técnica ----
const fichaModal = document.getElementById('fichaModal');
const fichaModalBox = document.getElementById('fichaModalBox');

function closeFichaModal() {
  fichaModal.classList.remove('open');
}

function podeEditarEmbalagem() {
  return isAdminAtual || emailUsuarioAtual === 'j.lisboa@kingspanisoeste.com.br';
}

function campoEmbalagem(data, itemCode) {
  if (!podeEditarEmbalagem()) {
    return data.qtd_caixa_master
      ? `<div class="modal-label">Embalagem</div><div class="modal-text">Caixa master: ${escapeHtml(data.qtd_caixa_master)} pçs${data.qtd_caixa_fracionada ? ` · Caixa fracionada: ${escapeHtml(data.qtd_caixa_fracionada)} pçs` : ''}</div>`
      : '';
  }
  return `
    <div class="modal-label">Embalagem (editável)</div>
    <div style="display:flex; gap:8px; margin-top:4px;">
      <div style="flex:1;">
        <label style="font-size:11px; color:var(--muted);">Caixa master (pçs)</label>
        <input type="text" inputmode="numeric" class="embalagem-input" data-item="${escapeHtml(itemCode)}" data-campo="qtd_caixa_master"
               value="${data.qtd_caixa_master || ''}" placeholder="Ex: 2000"
               style="width:100%; padding:7px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
      </div>
      <div style="flex:1;">
        <label style="font-size:11px; color:var(--muted);">Caixa fracionada (pçs)</label>
        <input type="text" inputmode="numeric" class="embalagem-input" data-item="${escapeHtml(itemCode)}" data-campo="qtd_caixa_fracionada"
               value="${data.qtd_caixa_fracionada || ''}" placeholder="Ex: 200"
               style="width:100%; padding:7px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
      </div>
    </div>
    <div class="status-msg" id="embalagemMsg" style="margin-top:4px;"></div>
  `;
}

async function salvarEmbalagem(input) {
  const itemCode = input.dataset.item;
  const campo = input.dataset.campo;
  const valor = input.value.trim() === '' ? null : input.value.trim();
  const msg = document.getElementById('embalagemMsg');
  try {
    const { error } = await sb.from('fichas_tecnicas')
      .update({ [campo]: valor })
      .eq('item', itemCode);
    if (error) throw error;
    if (msg) { msg.textContent = 'Salvo!'; msg.className = 'status-msg status-ok'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000); }
    if (fichaBoxMap.has(itemCode) || valor) {
      const atual = fichaBoxMap.get(itemCode) || { master: null, fracionada: null };
      if (campo === 'qtd_caixa_master') atual.master = valor ? parseFloat(valor) : null;
      if (campo === 'qtd_caixa_fracionada') atual.fracionada = valor ? parseFloat(valor) : null;
      fichaBoxMap.set(itemCode, atual);
    }
  } catch (err) {
    if (msg) { msg.textContent = 'Erro: ' + err.message; msg.className = 'status-msg status-err'; }
  }
}

async function openFichaModal(itemCode) {
  fichaModalBox.innerHTML = `
    <button class="modal-close" id="fichaCloseBtn">✕</button>
    <div class="modal-empty">Carregando...</div>
  `;
  fichaModal.classList.add('open');
  document.getElementById('fichaCloseBtn').addEventListener('click', closeFichaModal);

  const { data, error } = await sb.from('fichas_tecnicas').select('*').eq('item', itemCode).maybeSingle();

  if (error || !data) {
    fichaModalBox.innerHTML = `
      <button class="modal-close" id="fichaCloseBtn2">✕</button>
      <h3>Item ${escapeHtml(itemCode)}</h3>
      <div class="modal-empty">Ainda não há imagem ou ficha técnica cadastrada para este item.</div>
      ${podeEditarEmbalagem() ? campoEmbalagem({}, itemCode) : ''}
    `;
    document.getElementById('fichaCloseBtn2').addEventListener('click', closeFichaModal);
    if (podeEditarEmbalagem()) {
      fichaModalBox.querySelectorAll('.embalagem-input').forEach(inp => {
        inp.addEventListener('change', async () => {
          // Ainda não existe linha na ficha pra esse item - cria uma antes de salvar
          await sb.from('fichas_tecnicas').upsert({ item: itemCode }, { onConflict: 'item' });
          await salvarEmbalagem(inp);
        });
      });
    }
    return;
  }

  fichaModalBox.innerHTML = `
    <button class="modal-close" id="fichaCloseBtn3">✕</button>
    ${data.imagem_url ? `<img src="${escapeHtml(data.imagem_url)}" alt="${escapeHtml(data.descricao || itemCode)}">` : ''}
    <h3>${escapeHtml(data.descricao || itemCode)}</h3>
    <div class="modal-item-code">Código: ${escapeHtml(itemCode)}</div>
    ${data.uso ? `<div class="modal-label">Uso recomendado</div><div class="modal-text">${escapeHtml(data.uso)}</div>` : ''}
    ${campoEmbalagem(data, itemCode)}
  `;
  document.getElementById('fichaCloseBtn3').addEventListener('click', closeFichaModal);
  fichaModalBox.querySelectorAll('.embalagem-input').forEach(inp => {
    inp.addEventListener('change', () => salvarEmbalagem(inp));
  });
}

document.getElementById('tableBody').addEventListener('click', (e) => {
  const fichaBtn = e.target.closest('.ficha-btn');
  if (fichaBtn) { openFichaModal(fichaBtn.dataset.item); return; }
  const compareBtn = e.target.closest('.compare-btn');
  if (compareBtn) { openCompareModal(compareBtn.dataset.item); return; }
  const padraoBtn = e.target.closest('.padrao-btn');
  if (padraoBtn) { mostrarPadraoCaixas(padraoBtn); return; }
});

const padraoModal = document.getElementById('padraoModal');
function mostrarPadraoCaixas(btn) {
  const texto = formatarCaixas(btn.dataset.qtd, btn.dataset.item) || 'Sem padrão de caixa suficiente pra calcular.';
  const info = fichaBoxMap.get(btn.dataset.item);
  document.getElementById('padraoCodigo').textContent = 'Item ' + btn.dataset.item;
  document.getElementById('padraoTexto').textContent = texto.replace(/^= /, '');
  document.getElementById('padraoReferencia').textContent = info
    ? `Caixa master: ${info.master} pçs${info.fracionada ? ` · Caixa fracionada: ${info.fracionada} pçs` : ''}`
    : '';
  padraoModal.classList.add('open');
}
document.getElementById('padraoCloseBtn').addEventListener('click', () => padraoModal.classList.remove('open'));
padraoModal.addEventListener('click', (e) => { if (e.target === padraoModal) padraoModal.classList.remove('open'); });

// O cliente do Supabase NÃO lança exceção quando dá erro: ele devolve
// { error }. Por isso a tela so pode ser atualizada DEPOIS de conferir o
// error. Antes desta correção o campo ficava verde com a divergência
// calculada mesmo quando a gravação havia falhado, e a pessoa seguia para o
// próximo endereço achando que tinha salvado. AUDITORIA.md, item A1.
async function salvarContagemItem(input) {
  const itemCode = input.dataset.item;
  const loc = input.dataset.loc;
  const chave = chaveContagem(itemCode, loc);
  const valor = input.value.trim();
  const celula = input.closest('td');
  const diffSlot = celula.querySelector('.diff-slot');
  const clearBtn = celula.querySelector('.contagem-clear-btn');
  const caixasSlot = celula.querySelector('.caixas-slot');
  input.classList.remove('contagem-salvo', 'contagem-divergente');
  input.style.borderColor = '';
  input.style.background = '';
  input.title = '';

  if (valor === '') {
    const { error } = await sb.from('contagem_fisica')
      .delete().eq('item', itemCode).eq('unidade', unidadeAtual).eq('localizacao', loc);
    if (error) return marcarFalhaContagem(input, diffSlot, error.message);
    if (diffSlot) diffSlot.innerHTML = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (caixasSlot) caixasSlot.innerHTML = '';
    delete contagemMap[chave];
    return;
  }

  const { error } = await sb.from('contagem_fisica').upsert({
    item: itemCode, unidade: unidadeAtual, localizacao: loc, quantidade_fisica: valor,
    contado_por: nomeUsuarioAtual,
    contado_em: new Date().toISOString()
  }, { onConflict: 'item,unidade,localizacao' });
  if (error) return marcarFalhaContagem(input, diffSlot, error.message);

  contagemMap[chave] = valor;
  if (clearBtn) clearBtn.style.display = 'inline-block';
  if (caixasSlot) caixasSlot.innerHTML = formatarCaixas(valor, itemCode);
  // Compara com a quantidade do sistema (dessa linha específica) e mostra o resultado da conta
  const linha = currentData.find(r => r.item === itemCode && r.localizacao === loc);
  if (linha) {
    if (diffSlot) diffSlot.innerHTML = formatarDiferenca(valor, linha.quantidade);
    input.classList.add(parseQtd(valor) === parseQtd(linha.quantidade) ? 'contagem-salvo' : 'contagem-divergente');
  } else {
    input.classList.add('contagem-salvo');
  }
}

// Deixa visível para quem está contando que a gravação NÃO foi feita.
function marcarFalhaContagem(input, diffSlot, mensagem) {
  input.classList.remove('contagem-salvo', 'contagem-divergente');
  input.style.borderColor = '#c62828';
  input.style.background = '#ffebee';
  input.title = 'NÃO SALVOU: ' + mensagem;
  if (diffSlot) diffSlot.innerHTML = '<span class="diff-badge diff-menos">\u26a0 não salvou</span>';
  console.error('Falha ao gravar contagem:', mensagem);
}

async function limparContagemItem(itemCode, loc) {
  const input = document.querySelector(`.contagem-input[data-item="${CSS.escape(itemCode)}"][data-loc="${CSS.escape(loc)}"]`);
  if (!input) return;
  const celula = input.closest('td');
  const diffSlot = celula.querySelector('.diff-slot');
  const clearBtn = celula.querySelector('.contagem-clear-btn');
  const { error } = await sb.from('contagem_fisica')
    .delete().eq('item', itemCode).eq('unidade', unidadeAtual).eq('localizacao', loc);
  if (error) return marcarFalhaContagem(input, diffSlot, error.message);
  input.value = '';
  input.classList.remove('contagem-salvo', 'contagem-divergente');
  input.style.borderColor = '';
  input.style.background = '';
  input.title = '';
  if (diffSlot) diffSlot.innerHTML = '';
  if (clearBtn) clearBtn.style.display = 'none';
  delete contagemMap[chaveContagem(itemCode, loc)];
}

document.getElementById('tableBody').addEventListener('change', (e) => {
  if (e.target.classList.contains('contagem-input')) salvarContagemItem(e.target);
});
document.getElementById('tableBody').addEventListener('keydown', (e) => {
  if (e.target.classList.contains('contagem-input') && e.key === 'Enter') e.target.blur();
});
document.getElementById('tableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.contagem-clear-btn');
  if (btn) limparContagemItem(btn.dataset.item, btn.dataset.loc);
});

fichaModal.addEventListener('click', (e) => {
  if (e.target === fichaModal) closeFichaModal();
});

// ---- Modal de Comparação entre Unidades ----
const compareModal = document.getElementById('compareModal');
const compareModalBox = document.getElementById('compareModalBox');

function closeCompareModal() {
  compareModal.classList.remove('open');
}

async function openCompareModal(itemCode) {
  compareModalBox.innerHTML = `
    <button class="modal-close" id="compareCloseBtn">✕</button>
    <div class="modal-empty">Carregando...</div>
  `;
  compareModal.classList.add('open');
  document.getElementById('compareCloseBtn').addEventListener('click', closeCompareModal);

  const { data, error } = await sb.from('estoque').select('*').eq('item', itemCode);

  // Agrupa por unidade, somando a quantidade de TODOS os endereços daquela unidade
  const porUnidade = {};
  (data || []).forEach(r => {
    if (!porUnidade[r.unidade]) {
      porUnidade[r.unidade] = { totalQtd: 0, locais: [], descricao: r.descricao };
    }
    porUnidade[r.unidade].totalQtd += parseQtd(r.quantidade);
    if (r.localizacao) porUnidade[r.unidade].locais.push(r.localizacao);
  });

  // Ordena as unidades da maior quantidade total para a menor (quem não tem o item fica por último)
  const codigosOrdenados = Object.keys(UNIDADES).sort((a, b) => {
    const qa = porUnidade[a] ? porUnidade[a].totalQtd : -1;
    const qb = porUnidade[b] ? porUnidade[b].totalQtd : -1;
    return qb - qa;
  });

  const maiorQtd = Math.max(...codigosOrdenados.map(c => porUnidade[c] ? porUnidade[c].totalQtd : -1));

  const linhas = codigosOrdenados.map(cod => {
    const u = UNIDADES[cod];
    const r = porUnidade[cod];
    const ehAtual = cod === unidadeAtual;
    const ehMaior = r && r.totalQtd === maiorQtd && maiorQtd > -1;
    let estilo = '';
    if (ehMaior) estilo = 'background:#fff8e6;';
    else if (ehAtual) estilo = 'background:var(--row-alt);';

    if (r) {
      const localTexto = r.locais.length > 1
        ? `${r.locais.length} locais`
        : (r.locais[0] || '-');
      return `
        <tr style="${estilo}">
          <td style="padding:9px 10px; font-weight:600;">${ehMaior ? '🏆 ' : ''}${escapeHtml(cod)} · ${escapeHtml(u.cidade)}</td>
          <td style="padding:9px 10px; text-align:right; font-weight:700; color:var(--blue-dark); white-space:nowrap;">${escapeHtml(r.totalQtd.toLocaleString('pt-BR'))}</td>
          <td style="padding:9px 10px; color:var(--muted); white-space:nowrap;" title="${escapeHtml(r.locais.join(', '))}">${escapeHtml(localTexto)}</td>
        </tr>`;
    }
    return `
      <tr style="${estilo}">
        <td style="padding:9px 10px; font-weight:600;">${escapeHtml(cod)} · ${escapeHtml(u.cidade)}</td>
        <td style="padding:9px 10px; text-align:right; color:var(--muted);" colspan="2">Não encontrado nessa unidade</td>
      </tr>`;
  }).join('');

  const totalGeral = codigosOrdenados.reduce((soma, cod) => soma + (porUnidade[cod] ? porUnidade[cod].totalQtd : 0), 0);

  const nomeItem = data && data[0] ? data[0].descricao : '';

  compareModalBox.innerHTML = `
    <button class="modal-close" id="compareCloseBtn2">✕</button>
    <h3 style="padding-right:24px;">${escapeHtml(nomeItem || itemCode)}</h3>
    <div class="modal-item-code">Código: ${escapeHtml(itemCode)}</div>
    <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; table-layout:fixed;">
      <thead>
        <tr style="border-bottom:2px solid var(--border);">
          <th style="width:42%; text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Unidade</th>
          <th style="width:28%; text-align:right; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Quantidade</th>
          <th style="width:30%; text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Localização</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--border);">
          <td style="padding:10px; font-weight:700;">Total geral</td>
          <td style="padding:10px; text-align:right; font-weight:700; color:var(--ink);">${escapeHtml(totalGeral.toLocaleString('pt-BR'))}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;
  document.getElementById('compareCloseBtn2').addEventListener('click', closeCompareModal);
}

compareModal.addEventListener('click', (e) => {
  if (e.target === compareModal) closeCompareModal();
});

// ---- Modo Contagem (planilha de inventário com senha própria) ----
const contagemModal = document.getElementById('contagemModal');
const contagemPinInput = document.getElementById('contagemPinInput');
const contagemPinMsg = document.getElementById('contagemPinMsg');

let contagemMap = {};

async function carregarContagens() {
  const { data, error } = await sb.from('contagem_fisica').select('*').eq('unidade', unidadeAtual);
  contagemMap = {};
  if (error) {
    // Sem isto, falha de leitura fica indistinguível de "ninguém contou ainda",
    // e a pessoa pode recontar por cima do trabalho de outra.
    console.error('Falha ao carregar as contagens:', error.message);
    alert('Não foi possível carregar as contagens já registradas: ' + error.message
      + ' \u2014 os campos podem aparecer em branco mesmo com contagem feita. Recarregue a página antes de contar.');
    return;
  }
  (data || []).forEach(r => { contagemMap[chaveContagem(r.item, r.localizacao)] = r.quantidade_fisica; });
}

let canalContagem = null;

function atualizarLinhaNaTela(itemCode, loc, valor) {
  const input = document.querySelector(`.contagem-input[data-item="${CSS.escape(itemCode)}"][data-loc="${CSS.escape(loc)}"]`);
  if (!input) return; // item/endereço não está na tela (filtro/busca ativa) - não precisa atualizar
  // Não sobrescreve enquanto a própria pessoa está digitando naquele campo
  if (document.activeElement === input) return;
  const chave = chaveContagem(itemCode, loc);
  input.value = valor || '';
  if (valor) contagemMap[chave] = valor; else delete contagemMap[chave];
  const celula = input.closest('td');
  const diffSlot = celula.querySelector('.diff-slot');
  const clearBtn = celula.querySelector('.contagem-clear-btn');
  const caixasSlot = celula.querySelector('.caixas-slot');
  const linha = currentData.find(r => r.item === itemCode && r.localizacao === loc);
  input.classList.remove('contagem-salvo', 'contagem-divergente');
  if (clearBtn) clearBtn.style.display = valor ? 'inline-block' : 'none';
  if (caixasSlot) caixasSlot.innerHTML = valor ? formatarCaixas(valor, itemCode) : '';
  if (linha && diffSlot) {
    diffSlot.innerHTML = valor ? formatarDiferenca(valor, linha.quantidade) : '';
    if (valor) input.classList.add(parseQtd(valor) === parseQtd(linha.quantidade) ? 'contagem-salvo' : 'contagem-divergente');
  }
}

function iniciarTempoReal() {
  if (canalContagem) sb.removeChannel(canalContagem);
  canalContagem = sb.channel('contagem-' + unidadeAtual)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contagem_fisica', filter: `unidade=eq.${unidadeAtual}` },
      (payload) => {
        const row = (payload.eventType === 'DELETE') ? payload.old : payload.new;
        if (row && row.item && row.localizacao) {
          const valor = payload.eventType === 'DELETE' ? '' : row.quantidade_fisica;
          atualizarLinhaNaTela(row.item, row.localizacao, valor);
        }
        // Se a tela de "Quem já contou" estiver aberta, atualiza ela também sozinha
        if (quemContouModal.classList.contains('open')) renderizarQuemContou();
      })
    .subscribe();
}

function pararTempoReal() {
  if (canalContagem) {
    sb.removeChannel(canalContagem);
    canalContagem = null;
  }
}

async function limparTodasAsContagens() {
  const confirmado = confirm(`Isso vai apagar TODAS as quantidades de estoque físico digitadas na Unidade ${unidadeAtual}, pra todo mundo. Essa ação não pode ser desfeita. Confirma?`);
  if (!confirmado) return;
  const { error } = await sb.from('contagem_fisica').delete().eq('unidade', unidadeAtual);
  if (error) {
    // Não limpa a tela se o banco recusou: senão parece que apagou e não apagou.
    alert('Erro ao limpar as contagens: ' + error.message + ' \u2014 nada foi apagado.');
    return;
  }
  contagemMap = {};
  document.querySelectorAll('.contagem-input').forEach(input => {
    input.value = '';
    input.classList.remove('contagem-salvo', 'contagem-divergente');
    input.style.borderColor = '';
    input.style.background = '';
    input.title = '';
    const diffSlot = input.parentElement.querySelector('.diff-slot');
    const clearBtn = input.parentElement.querySelector('.contagem-clear-btn');
    if (diffSlot) diffSlot.innerHTML = '';
    if (clearBtn) clearBtn.style.display = 'none';
  });
}

document.getElementById('limparContagemBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  limparTodasAsContagens();
});

// ---- Quem já contou (com detalhe por corredor, atualiza sozinho em tempo real) ----
const quemContouModal = document.getElementById('quemContouModal');
const quemContouBox = document.getElementById('quemContouBox');

function corredorDoItem(itemCode) {
  const linha = currentData.find(r => r.item === itemCode);
  if (!linha) return '?';
  return extrairLetraGrupo(linha.localizacao, 'corredor') || extrairLetraGrupo(linha.localizacao, 'cant') || 'Outros';
}

async function renderizarQuemContou() {
  const resumoContainer = document.getElementById('resumoContagemContainer');
  const { data, error } = await sb.from('contagem_fisica').select('item, localizacao, contado_por, contado_em').eq('unidade', unidadeAtual);

  if (error || !data || data.length === 0) {
    resumoContainer.innerHTML = `<div class="modal-empty">Ninguém registrou contagem ainda nesta unidade.</div>`;
    return;
  }

  // Agrupa por pessoa, e dentro de cada pessoa, por corredor
  const porPessoa = {};
  data.forEach(r => {
    const nome = r.contado_por || 'Sem nome';
    const corredor = extrairLetraGrupo(r.localizacao, 'corredor') || extrairLetraGrupo(r.localizacao, 'cant') || 'Outros';
    if (!porPessoa[nome]) porPessoa[nome] = { total: 0, ultima: null, corredores: {} };
    porPessoa[nome].total += 1;
    porPessoa[nome].corredores[corredor] = (porPessoa[nome].corredores[corredor] || 0) + 1;
    if (!porPessoa[nome].ultima || r.contado_em > porPessoa[nome].ultima) porPessoa[nome].ultima = r.contado_em;
  });

  const pessoas = Object.keys(porPessoa).sort((a, b) => porPessoa[b].total - porPessoa[a].total);
  const totalGeral = data.length;

  const linhas = pessoas.map(nome => {
    const p = porPessoa[nome];
    const horario = p.ultima ? new Date(p.ultima).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
    const corredoresTexto = Object.keys(p.corredores).sort()
      .map(c => `Corredor ${c}: ${p.corredores[c]}`).join(' · ');
    return `
      <tr>
        <td style="padding:9px 10px; vertical-align:top;">
          <div style="font-weight:600;">${escapeHtml(nome)}</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${escapeHtml(corredoresTexto)}</div>
        </td>
        <td style="padding:9px 10px; text-align:right; font-weight:700; color:var(--blue-dark); vertical-align:top;">${p.total}</td>
        <td style="padding:9px 10px; color:var(--muted); font-size:12px; white-space:nowrap; vertical-align:top;">${horario}</td>
      </tr>`;
  }).join('');

  resumoContainer.innerHTML = `
    <div class="modal-item-code" style="margin-top:0;">${totalGeral} item(ns) contado(s), por ${pessoas.length} pessoa(s) · atualiza sozinho</div>
    <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px;">
      <thead>
        <tr style="border-bottom:2px solid var(--border);">
          <th style="text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Pessoa / corredores</th>
          <th style="text-align:right; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Itens</th>
          <th style="text-align:left; padding:6px 10px; color:var(--muted); font-size:11px; text-transform:uppercase;">Última</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
}

function corredoresUnicos() {
  const corredorSet = new Set();
  const cantSet = new Set();
  currentData.forEach(r => {
    const loc = String(r.localizacao).trim().toUpperCase();
    const mCorredor = loc.match(/^([A-Z])-/);
    if (mCorredor) corredorSet.add(mCorredor[1]);
    const mCant = loc.match(/^CANT\s+([A-Z])\b/);
    if (mCant) cantSet.add(mCant[1]);
  });
  const grupos = [];
  [...corredorSet].sort().forEach(letra => grupos.push({ chave: letra, label: `Corredor ${letra}` }));
  [...cantSet].sort().forEach(letra => grupos.push({ chave: `CANT ${letra}`, label: `CANT ${letra}` }));
  return grupos;
}

async function renderizarAtribuicoes() {
  const container = document.getElementById('atribuicoesContainer');
  const grupos = corredoresUnicos();
  if (grupos.length === 0) {
    container.innerHTML = `<div style="font-size:12.5px; color:var(--muted);">Nenhum corredor identificado nesta unidade.</div>`;
    return;
  }
  const { data } = await sb.from('atribuicoes_corredor').select('*').eq('unidade', unidadeAtual);
  const atual = {};
  (data || []).forEach(r => { atual[r.corredor] = r.pessoa; });

  container.innerHTML = grupos.map(g => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span style="font-weight:700; color:var(--blue-dark); width:88px; flex-shrink:0; font-size:13px;">${escapeHtml(g.label)}</span>
      <input type="text" class="atribuicao-input" data-corredor="${escapeHtml(g.chave)}"
             value="${atual[g.chave] ? escapeHtml(atual[g.chave]) : ''}" placeholder="Nome da pessoa"
             style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
    </div>
  `).join('');
}

async function salvarAtribuicao(input) {
  const corredor = input.dataset.corredor;
  const pessoa = input.value.trim();
  try {
    await sb.from('atribuicoes_corredor').upsert(
      { unidade: unidadeAtual, corredor, pessoa: pessoa || null, atualizado_em: new Date().toISOString() },
      { onConflict: 'unidade,corredor' }
    );
  } catch (err) {
    console.warn('Erro ao salvar atribuição:', err.message);
  }
}

document.getElementById('quemContouBtn').addEventListener('click', async () => {
  quemContouBox.innerHTML = `
    <button class="modal-close" id="quemContouCloseBtn">✕</button>
    <h3 style="margin-top:0;">Contagem — Unidade ${escapeHtml(unidadeAtual)}</h3>

    <div class="modal-label">Responsável por corredor</div>
    <div id="atribuicoesContainer" style="margin-bottom:16px;"><div class="modal-empty">Carregando...</div></div>

    <div class="modal-label">Quem já contou</div>
    <div id="resumoContagemContainer"><div class="modal-empty">Carregando...</div></div>
  `;
  document.getElementById('quemContouCloseBtn').addEventListener('click', () => quemContouModal.classList.remove('open'));
  quemContouModal.classList.add('open');
  await renderizarAtribuicoes();
  await renderizarQuemContou();
  iniciarTempoRealAtribuicoes();
});

quemContouBox.addEventListener('change', (e) => {
  if (e.target.classList.contains('atribuicao-input')) salvarAtribuicao(e.target);
});
quemContouBox.addEventListener('keydown', (e) => {
  if (e.target.classList.contains('atribuicao-input') && e.key === 'Enter') e.target.blur();
});

let canalAtribuicoes = null;
function iniciarTempoRealAtribuicoes() {
  if (canalAtribuicoes) sb.removeChannel(canalAtribuicoes);
  canalAtribuicoes = sb.channel('atribuicoes-' + unidadeAtual)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'atribuicoes_corredor', filter: `unidade=eq.${unidadeAtual}` },
      (payload) => {
        const row = payload.new;
        if (!row) return;
        const input = document.querySelector(`.atribuicao-input[data-corredor="${CSS.escape(row.corredor)}"]`);
        if (input && document.activeElement !== input) input.value = row.pessoa || '';
      })
    .subscribe();
}

quemContouModal.addEventListener('click', (e) => {
  if (e.target === quemContouModal) quemContouModal.classList.remove('open');
});

function unidadeDesbloqueada(cod) {
  return sessionStorage.getItem('contagem_ok_' + cod) === '1';
}
function marcarUnidadeDesbloqueada(cod) {
  sessionStorage.setItem('contagem_ok_' + cod, '1');
}

async function ativarModoContagem() {
  modoContagemAtivo = true;
  marcarUnidadeDesbloqueada(unidadeAtual);
  await carregarContagens();
  document.querySelectorAll('.col-contagem').forEach(el => el.style.display = 'table-cell');
  document.querySelectorAll('.col-acoes').forEach(el => el.style.display = 'none');
  contagemModal.classList.remove('open');
  contagemBtn.classList.add('active-toggle');
  document.getElementById('quemContouBtn').style.display = 'inline-block';
  applyFilterAndSort();
  iniciarTempoReal();
}

function desativarModoContagem() {
  modoContagemAtivo = false;
  document.querySelectorAll('.col-contagem').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.col-acoes').forEach(el => el.style.display = '');
  contagemBtn.classList.remove('active-toggle');
  document.getElementById('quemContouBtn').style.display = 'none';
  applyFilterAndSort();
  pararTempoReal();
}

const contagemBtn = document.getElementById('contagemBtn');
contagemBtn.addEventListener('click', () => {
  if (modoContagemAtivo) {
    desativarModoContagem();
  } else if (unidadeDesbloqueada(unidadeAtual)) {
    // Já digitou a senha certa dessa unidade nesta mesma sessão do navegador - não pede de novo
    ativarModoContagem();
  } else {
    contagemPinInput.value = '';
    contagemPinMsg.textContent = '';
    const u = UNIDADES[unidadeAtual];
    document.getElementById('contagemHint').textContent =
      `Digite a senha da Unidade ${unidadeAtual} (${u.cidade}) para liberar a coluna de contagem física.`;
    contagemModal.classList.add('open');
  }
});

document.getElementById('contagemPinSubmit').addEventListener('click', () => {
  if (contagemPinInput.value === PINS_CONTAGEM[unidadeAtual]) {
    ativarModoContagem();
  } else {
    contagemPinMsg.textContent = 'Senha incorreta.';
  }
});

contagemPinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('contagemPinSubmit').click();
});

document.getElementById('contagemCloseBtn').addEventListener('click', () => {
  contagemModal.classList.remove('open');
});

contagemModal.addEventListener('click', (e) => {
  if (e.target === contagemModal) contagemModal.classList.remove('open');
});

document.getElementById('searchBox').addEventListener('input', () => { pagina = 1; applyFilterAndSort(); });
document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('searchBox').value = '';
  filtros = { localizacao: '', um: '', padrao: '', zerado: false, comFoto: false, divergente: false };
  pagina = 1;
  const sel = document.getElementById('filterPadrao'); if (sel) sel.value = '';
  document.getElementById('filterZerado').checked = false;
  document.getElementById('filterComFoto').checked = false;
  document.getElementById('filterDivergente').checked = false;
  atualizarBadgeFiltros();
  applyFilterAndSort();
});
// A impressao precisa sair com TODAS as linhas filtradas. Sem isto sairia
// apenas a pagina visivel -- e a quebra de pagina por corredor perderia sentido.
document.getElementById('printBtn').addEventListener('click', () => {
  imprimindoTudo = true;
  applyFilterAndSort();
  window.print();
  imprimindoTudo = false;
  applyFilterAndSort();
});

// ---- Painel de Filtros ----
// Na Fase 3 o modal de filtros virou painel embutido, aberto pelo botao Filtros.
const painelFiltros = document.getElementById('filtrosAvancados');
document.getElementById('filterBtn').addEventListener('click', () => {
  const abrindo = !painelFiltros.classList.contains('aberto');
  if (abrindo) {
    popularFiltrosDropdown();
    document.getElementById('filterPadrao').value = filtros.padrao;
    document.getElementById('filterZerado').checked = filtros.zerado;
    document.getElementById('filterComFoto').checked = filtros.comFoto;
    document.getElementById('filterDivergente').checked = filtros.divergente;
  }
  painelFiltros.classList.toggle('aberto', abrindo);
});

document.getElementById('filterApplyBtn').addEventListener('click', () => {
  filtros.localizacao = document.getElementById('filterLocalizacao').value;
  filtros.um = document.getElementById('filterUm').value;
  filtros.padrao = document.getElementById('filterPadrao').value;
  filtros.zerado = document.getElementById('filterZerado').checked;
  filtros.comFoto = document.getElementById('filterComFoto').checked;
  filtros.divergente = document.getElementById('filterDivergente').checked;
  pagina = 1;
  atualizarBadgeFiltros();
  applyFilterAndSort();
  painelFiltros.classList.remove('aberto');
});

document.getElementById('filterClearAllBtn').addEventListener('click', () => {
  filtros = { localizacao: '', um: '', padrao: '', zerado: false, comFoto: false, divergente: false };
  pagina = 1;
  document.getElementById('filterLocalizacao').value = '';
  document.getElementById('filterUm').value = '';
  document.getElementById('filterPadrao').value = '';
  document.getElementById('filterZerado').checked = false;
  document.getElementById('filterComFoto').checked = false;
  document.getElementById('filterDivergente').checked = false;
  atualizarBadgeFiltros();
  applyFilterAndSort();
});

document.querySelectorAll('thead th').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (sortKey === key) { sortDir *= -1; } else { sortKey = key; sortDir = 1; }
    document.querySelectorAll('thead th .arrow').forEach(a => a.textContent = '');
    th.querySelector('.arrow').textContent = sortDir === 1 ? '▲' : '▼';
    applyFilterAndSort();
  });
});

const editPanel = document.getElementById('editPanel');
const pinGateArea = document.getElementById('pinGateArea');
const editFormArea = document.getElementById('editFormArea');
const pinInput = document.getElementById('pinInput');
const pinMsg = document.getElementById('pinMsg');
const pasteArea = document.getElementById('pasteArea');
const saveMsg = document.getElementById('saveMsg');

document.getElementById('toggleEditBtn').addEventListener('click', () => {
  editPanel.classList.toggle('open');
});

document.getElementById('pinSubmitBtn').addEventListener('click', () => {
  if (pinInput.value === EDIT_PIN) {
    pinGateArea.style.display = 'none';
    editFormArea.style.display = 'block';
    pasteArea.value = currentData.map(r => [r.item, r.descricao, r.um, r.localizacao, r.quantidade].join('\t')).join('\n');
  } else {
    pinMsg.textContent = 'PIN incorreto.';
  }
});

document.getElementById('cancelEditBtn').addEventListener('click', () => {
  editPanel.classList.remove('open');
});

document.getElementById('saveDataBtn').addEventListener('click', async () => {
  const records = parsePastedTsv(pasteArea.value).map(r => ({ ...r, unidade: unidadeAtual, atualizado_por: nomeUsuarioAtual }));
  if (records.length === 0) {
    saveMsg.textContent = 'Nenhum item válido encontrado no texto colado.';
    saveMsg.className = 'status-msg status-err';
    return;
  }
  saveMsg.textContent = 'Salvando no banco de dados...';
  saveMsg.className = 'status-msg';
  try {
    // Apaga só os itens DESSA unidade e insere a nova lista (abordagem simples e previsível)
    const { error: delError } = await sb.from('estoque').delete().eq('unidade', unidadeAtual);
    if (delError) throw delError;
    const { error: insError } = await sb.from('estoque').insert(records);
    if (insError) throw insError;
    saveMsg.textContent = `Atualizado! ${records.length} itens da Unidade ${unidadeAtual} publicados para todos que abrirem o link.`;
    saveMsg.className = 'status-msg status-ok';
    await loadData();
  } catch (e) {
    saveMsg.textContent = 'Erro ao salvar: ' + e.message;
    saveMsg.className = 'status-msg status-err';
  }
});

// Chamada pelo seletor de unidade do cabecalho (js/navegacao.js). Antes era
// um listener nos botoes de unidade, que sairam do layout na Fase 2b.
async function trocarUnidade(cod) {
  if (!UNIDADES[cod] || cod === unidadeAtual) return;
  const estavaContando = modoContagemAtivo;
  unidadeAtual = cod;
  atualizarSubtituloUnidade();
  document.getElementById('searchBox').value = '';
  sortKey = null;
  filtros = { localizacao: '', um: '', zerado: false, comFoto: false, divergente: false };
  atualizarBadgeFiltros();
  if (modoContagemAtivo) desativarModoContagem();
  await loadData();
  await atualizarBotaoEditar();
  // Se a contagem estava ativa e a unidade ja foi desbloqueada nesta sessao,
  // mantem ativa sem pedir a senha de novo.
  if (estavaContando && unidadeDesbloqueada(unidadeAtual)) {
    await ativarModoContagem();
  }
}

