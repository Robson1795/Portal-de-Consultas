// Portal de Estoque Kingspan Isoeste — modulo Bobinas de Aco
// Extraido do index.html na Fase 2a (03/09/2026), sem alteracao de conteudo.
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.

// ========================================================================
// BOBINAS DE AÇO
// ========================================================================
const SENHA_AUDITORIA = "aço2026"; // [⚠️ CONFIGURAÇÃO] troque aqui quando quiser mudar a senha

let bobinasData = [];
let bobinasContagemMap = {};
let bobinasDesbloqueado = sessionStorage.getItem('bobinas_ok') === '1';
let canalBobinas = null;

function parseNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
}

document.getElementById('abrirBobinasLink').addEventListener('click', async (e) => {
  e.preventDefault();
  if (bobinasDesbloqueado) {
    await abrirTelaBobinas();
  } else {
    document.getElementById('bobinasPinInput').value = '';
    document.getElementById('bobinasPinMsg').textContent = '';
    document.getElementById('bobinasPinModal').classList.add('open');
  }
});

document.getElementById('bobinasPinCloseBtn').addEventListener('click', () => {
  document.getElementById('bobinasPinModal').classList.remove('open');
});
document.getElementById('bobinasPinModal').addEventListener('click', (e) => {
  if (e.target.id === 'bobinasPinModal') e.currentTarget.classList.remove('open');
});
document.getElementById('bobinasPinSubmitBtn').addEventListener('click', async () => {
  const val = document.getElementById('bobinasPinInput').value;
  if (val === SENHA_AUDITORIA) {
    bobinasDesbloqueado = true;
    sessionStorage.setItem('bobinas_ok', '1');
    document.getElementById('bobinasPinModal').classList.remove('open');
    await abrirTelaBobinas();
  } else {
    document.getElementById('bobinasPinMsg').textContent = 'Senha incorreta.';
  }
});
document.getElementById('bobinasPinInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('bobinasPinSubmitBtn').click();
});

document.getElementById('voltarEstoqueLink').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('bobinasContent').style.display = 'none';
  document.getElementById('estoqueContent').style.display = 'block';
  document.querySelector('.hero .subtitle').parentElement.querySelectorAll('#unitButtons, #abrirBobinasLink').forEach(el => {});
  document.getElementById('unitButtons').style.display = 'flex';
  pararTempoRealBobinas();
});

async function podeEditarBobinas() {
  if (isAdminAtual) return true;
  const { data } = await sb.from('editores_bobinas').select('email').eq('email', emailUsuarioAtual).maybeSingle();
  return !!data;
}

async function abrirTelaBobinas() {
  document.getElementById('estoqueContent').style.display = 'none';
  document.getElementById('unitButtons').style.display = 'none';
  document.getElementById('bobinasContent').style.display = 'block';
  document.getElementById('bobinasEditToggleRow').style.display = (await podeEditarBobinas()) ? 'flex' : 'none';
  await carregarBobinasContagem();
  await loadBobinas();
  iniciarTempoRealBobinas();
}

async function loadBobinas() {
  const { data, error } = await sb.from('bobinas_aco').select('*').order('id', { ascending: true });
  if (error) {
    document.getElementById('bobinasLoadingMsg').textContent = 'Erro ao carregar: ' + error.message;
    return;
  }
  bobinasData = data || [];
  renderBobinas();
}

// Como o mesmo código de bobina aparece em vários endereços/lotes,
// a contagem é guardada por item + localização + lote.
function chaveBobina(item, localizacao, lote) {
  return `${item}||${localizacao || ''}||${lote || ''}`;
}

async function carregarBobinasContagem() {
  const { data } = await sb.from('contagem_bobinas').select('*');
  bobinasContagemMap = {};
  (data || []).forEach(r => { bobinasContagemMap[chaveBobina(r.item, r.localizacao, r.lote)] = r.saldo_fisico; });
}

function calcularDivergenciaBobina(sistema, fisico) {
  if (fisico === null || fisico === undefined || fisico === '') {
    return { classe: '', texto: '', ajustado: sistema, temValor: false };
  }
  const s = parseNum(sistema);
  const f = parseNum(fisico);
  const diff = f - s;
  if (diff === 0) return { classe: 'diff-ok', texto: '✅ OK', ajustado: f, temValor: true };
  if (diff > 0) return { classe: 'diff-mais', texto: `+${diff}`, ajustado: f, temValor: true };
  return { classe: 'diff-menos', texto: `${diff}`, ajustado: f, temValor: true };
}

function renderBobinas() {
  const tbody = document.getElementById('bobinasTableBody');
  const emptyMsg = document.getElementById('bobinasEmptyMsg');
  document.getElementById('bobinasLoadingMsg').style.display = 'none';

  const q = document.getElementById('bobinasSearchBox').value.trim().toLowerCase();
  let rows = bobinasData;
  if (q) {
    rows = rows.filter(r =>
      String(r.item).toLowerCase().includes(q) ||
      String(r.descricao || '').toLowerCase().includes(q) ||
      String(r.dep || '').toLowerCase().includes(q) ||
      String(r.localizacao || '').toLowerCase().includes(q) ||
      String(r.lote || '').toLowerCase().includes(q)
    );
  }

  if (rows.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    atualizarCardsBobinas();
    return;
  }
  emptyMsg.style.display = 'none';

  tbody.innerHTML = rows.map(r => {
    const chave = chaveBobina(r.item, r.localizacao, r.lote);
    const fisico = bobinasContagemMap[chave];
    const d = calcularDivergenciaBobina(r.qtd_liquida, fisico);
    const corLinha = d.temValor ? (d.classe === 'diff-ok' ? 'background:#f0fbf4;' : 'background:#fffbeb;') : '';
    return `
      <tr style="${corLinha}" data-chave="${escapeHtml(chave)}">
        <td class="item">${escapeHtml(r.item)}</td>
        <td>${escapeHtml(r.descricao || '')}</td>
        <td>${escapeHtml(r.est || '')}</td>
        <td>${escapeHtml(r.dep || '')}</td>
        <td class="loc">${escapeHtml(r.localizacao || '')}</td>
        <td>${escapeHtml(r.lote || '')}</td>
        <td>${escapeHtml(r.um || '')}</td>
        <td class="num">${escapeHtml(String(r.qtd_liquida))}</td>
        <td>
          <input type="text" inputmode="decimal" class="contagem-input bobina-input"
                 data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao || '')}" data-lote="${escapeHtml(r.lote || '')}"
                 value="${fisico !== undefined && fisico !== null ? escapeHtml(String(fisico)) : ''}" placeholder="—">
          <button class="contagem-clear-btn bobina-clear-btn"
                  data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao || '')}" data-lote="${escapeHtml(r.lote || '')}"
                  type="button" style="display:${d.temValor ? 'inline-block' : 'none'};">Limpar</button>
        </td>
        <td><span class="diff-badge ${d.classe}">${d.texto}</span></td>
        <td class="num">${d.temValor ? escapeHtml(String(d.ajustado)) : '-'}</td>
      </tr>`;
  }).join('');

  atualizarCardsBobinas();
}

function atualizarCardsBobinas() {
  const total = bobinasData.length;
  let comValor = 0, divergentes = 0, ok = 0;
  bobinasData.forEach(r => {
    const fisico = bobinasContagemMap[chaveBobina(r.item, r.localizacao, r.lote)];
    if (fisico === undefined || fisico === null || fisico === '') return;
    comValor++;
    if (parseNum(fisico) === parseNum(r.qtd_liquida)) ok++; else divergentes++;
  });
  document.getElementById('bob-total').textContent = `${comValor}/${total}`;
  document.getElementById('bob-divergentes').textContent = divergentes;
  document.getElementById('bob-ok').textContent = ok;

  // Quem atualizou a planilha do sistema por ultimo, e quando. Mesma logica
  // de updateStats() no estoque: vale a linha com atualizado_em mais recente.
  // Usa bobinasData (tudo), nao as linhas filtradas pela busca.
  let ultimaEm = null, ultimaPor = null;
  bobinasData.forEach(r => {
    if (r.atualizado_em && (!ultimaEm || r.atualizado_em > ultimaEm)) {
      ultimaEm = r.atualizado_em;
      ultimaPor = r.atualizado_por;
    }
  });
  if (!ultimaPor && bobinasData.length) {
    // Se a coluna atualizado_em vier vazia (sem default no banco), ainda
    // mostra quem atualizou, pegando de qualquer linha que tenha o nome.
    const comNome = bobinasData.find(r => r.atualizado_por);
    if (comNome) ultimaPor = comNome.atualizado_por;
  }
  document.getElementById('bob-atualizado-por').textContent = ultimaPor || '-';
  document.getElementById('bob-atualizado-em').textContent = ultimaEm
    ? new Date(ultimaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '-';
}

async function salvarContagemBobina(input) {
  const item = input.dataset.item;
  const loc = input.dataset.loc || '';
  const lote = input.dataset.lote || '';
  const chave = chaveBobina(item, loc, lote);
  const valor = input.value.trim();
  const linha = input.closest('tr');
  const badge = linha.querySelector('.diff-badge');
  const ajustadoTd = linha.querySelectorAll('td')[10];
  const clearBtn = linha.querySelector('.bobina-clear-btn');
  const bobina = bobinasData.find(r => r.item === item && (r.localizacao || '') === loc && (r.lote || '') === lote);

  if (valor === '') {
    delete bobinasContagemMap[chave];
    await sb.from('contagem_bobinas').delete().eq('item', item).eq('localizacao', loc).eq('lote', lote);
  } else {
    bobinasContagemMap[chave] = valor;
    await sb.from('contagem_bobinas').upsert({
      item, localizacao: loc, lote, saldo_fisico: parseNum(valor),
      contado_por: nomeUsuarioAtual, contado_em: new Date().toISOString()
    }, { onConflict: 'item,localizacao,lote' });
  }
  const d = calcularDivergenciaBobina(bobina ? bobina.qtd_liquida : 0, valor === '' ? null : valor);
  badge.className = 'diff-badge ' + d.classe;
  badge.textContent = d.texto;
  if (ajustadoTd) ajustadoTd.textContent = d.temValor ? d.ajustado : '-';
  clearBtn.style.display = d.temValor ? 'inline-block' : 'none';
  // Pinta a linha automaticamente: verde se bateu, amarelo se divergiu
  linha.style.background = d.temValor ? (d.classe === 'diff-ok' ? '#f0fbf4' : '#fffbeb') : '';
  atualizarCardsBobinas();
}

document.getElementById('bobinasTableBody').addEventListener('change', (e) => {
  if (e.target.classList.contains('bobina-input')) salvarContagemBobina(e.target);
});
document.getElementById('bobinasTableBody').addEventListener('keydown', (e) => {
  if (e.target.classList.contains('bobina-input') && e.key === 'Enter') e.target.blur();
});
document.getElementById('bobinasTableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.bobina-clear-btn');
  if (!btn) return;
  const input = btn.closest('td').querySelector('.bobina-input');
  if (input) { input.value = ''; salvarContagemBobina(input); }
});

document.getElementById('bobinasSearchBox').addEventListener('input', renderBobinas);
document.getElementById('bobinasClearBtn').addEventListener('click', () => {
  document.getElementById('bobinasSearchBox').value = '';
  renderBobinas();
});
document.getElementById('bobinasPrintBtn').addEventListener('click', () => window.print());

function iniciarTempoRealBobinas() {
  if (canalBobinas) sb.removeChannel(canalBobinas);
  canalBobinas = sb.channel('bobinas-contagem')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contagem_bobinas' }, (payload) => {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (!row || !row.item) return;
      const chave = chaveBobina(row.item, row.localizacao, row.lote);
      const input = document.querySelector(`.bobina-input[data-item="${CSS.escape(row.item)}"][data-loc="${CSS.escape(row.localizacao || '')}"][data-lote="${CSS.escape(row.lote || '')}"]`);
      if (!input || document.activeElement === input) return;
      const valor = payload.eventType === 'DELETE' ? '' : row.saldo_fisico;
      input.value = valor === null || valor === undefined ? '' : valor;
      if (valor === '' || valor === null) delete bobinasContagemMap[chave]; else bobinasContagemMap[chave] = valor;
      const bobina = bobinasData.find(r => r.item === row.item && (r.localizacao || '') === (row.localizacao || '') && (r.lote || '') === (row.lote || ''));
      const linha = input.closest('tr');
      const badge = linha.querySelector('.diff-badge');
      const ajustadoTd = linha.querySelectorAll('td')[10];
      const clearBtn = linha.querySelector('.bobina-clear-btn');
      const d = calcularDivergenciaBobina(bobina ? bobina.qtd_liquida : 0, valor === '' ? null : valor);
      badge.className = 'diff-badge ' + d.classe;
      badge.textContent = d.texto;
      if (ajustadoTd) ajustadoTd.textContent = d.temValor ? d.ajustado : '-';
      clearBtn.style.display = d.temValor ? 'inline-block' : 'none';
      linha.style.background = d.temValor ? (d.classe === 'diff-ok' ? '#f0fbf4' : '#fffbeb') : '';
      atualizarCardsBobinas();
    })
    .subscribe();
}
function pararTempoRealBobinas() {
  if (canalBobinas) { sb.removeChannel(canalBobinas); canalBobinas = null; }
}

// ---- Admin: colar planilha de bobinas ----
document.getElementById('toggleBobinasEditBtn').addEventListener('click', () => {
  document.getElementById('bobinasEditPanel').classList.add('open');
});
document.getElementById('cancelBobinasEditBtn').addEventListener('click', () => {
  document.getElementById('bobinasEditPanel').classList.remove('open');
});
document.getElementById('saveBobinasBtn').addEventListener('click', async () => {
  const texto = document.getElementById('bobinasPasteArea').value;
  const msg = document.getElementById('saveBobinasMsg');
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const registros = [];
  for (const linha of linhas) {
    const cols = linha.split('\t');
    if (cols.length < 8) continue;
    const [item, descricao, est, dep, localizacao, lote, um, qtd] = cols;
    if (item.toLowerCase() === 'item') continue; // pula linha de cabeçalho, se vier colada junto
    registros.push({
      item: item.trim(), descricao: (descricao || '').trim(), est: (est || '').trim(), dep: (dep || '').trim(),
      localizacao: (localizacao || '').trim(), lote: (lote || '').trim(), um: (um || '').trim(),
      qtd_liquida: parseNum(qtd), atualizado_por: nomeUsuarioAtual
    });
  }
  if (registros.length === 0) {
    msg.textContent = 'Nenhuma linha válida encontrada.';
    msg.className = 'status-msg status-err';
    return;
  }
  msg.textContent = 'Salvando...';
  msg.className = 'status-msg';
  try {
    const { error: delErr } = await sb.from('bobinas_aco').delete().neq('id', 0);
    if (delErr) throw delErr;
    const { error: insErr } = await sb.from('bobinas_aco').insert(registros);
    if (insErr) throw insErr;
    msg.textContent = `Atualizado! ${registros.length} bobinas publicadas.`;
    msg.className = 'status-msg status-ok';
    document.getElementById('bobinasEditPanel').classList.remove('open');
    await loadBobinas();
  } catch (err) {
    msg.textContent = 'Erro ao salvar: ' + err.message;
    msg.className = 'status-msg status-err';
  }
});

