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
// Item ja "trabalhado": tem foto, embalagem numerica, ou foi marcado como
// sem padrao de caixa. Decide a cor do botao de ficha na lista (pendente
// x normal) -- ver render() e a classe .ficha-btn.pendente no styles.css.
let fichaFeitoSet = new Set();
let sortKey = null;
let sortDir = 1;
// Ids das linhas marcadas pra sair etiqueta na Trading. Set (e não um
// atributo no DOM) porque a tabela é redesenhada inteira a cada filtro,
// ordenação e troca de página -- o que estava marcado na página 1 tem de
// continuar marcado quando a pessoa volta da página 3. Guarda o id como
// string: o data-id do HTML sempre volta string, e o r.id do banco é number.
let etiquetasTrading = new Set();
// O que o filtro deixou na tela (todas as páginas), preenchido por
// applyFilterAndSort(): é sobre isso que o "marcar todas" age.
let linhasFiltradasAtual = [];

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

// Estoque Seguro é do ITEM, não da prateleira -- um item guardado em 3
// localizações não vira 3 alertas nem compara o mínimo com o saldo de UM
// endereço só. Soma a quantidade do item nas 3 (dentro da unidade atual,
// que é tudo que `dados` já traz) e compara com o mínimo (que agora é
// mantido igual nas 3 linhas por salvarEstoqueMinimo()) uma única vez.
// Achado pelo Robson: item em mais de uma localização "embaralhava" o
// aviso de estoque baixo (09/09/2026).
function itensAbaixoDoEstoqueSeguro(dados) {
  const totalPorItem = new Map();
  const minimoPorItem = new Map();
  dados.forEach(r => {
    totalPorItem.set(r.item, (totalPorItem.get(r.item) || 0) + parseQtd(r.quantidade));
    if (r.estoque_minimo != null && !minimoPorItem.has(r.item)) {
      minimoPorItem.set(r.item, parseQtd(r.estoque_minimo));
    }
  });
  const itens = new Set();
  minimoPorItem.forEach((minimo, item) => {
    if (totalPorItem.get(item) < minimo) itens.add(item);
  });
  return itens;
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

  // Coluna e card do Estoque Mínimo são só do Robson -- ver
  // podeVerEstoqueMinimo(). Sincroniza o cabeçalho da coluna aqui (a
  // célula de cada linha já se ajusta sozinha no template abaixo).
  //
  // Na Trading essa MESMA coluna vira a de etiquetas: lá o Estoque Seguro
  // não é usado, e o que se faz na tela é imprimir a etiqueta de localização
  // item a item (Robson, 09/09/2026: "agora só para o estoque da trading,
  // pode colocar no lugar de estoque seguro um botão para impressão de cada
  // item por localização"). Coluna nova custaria mais uma coluna de rolagem
  // horizontal numa tabela que já avisa "arraste para o lado".
  //
  // Some inteira no modo Contagem (Robson, 10/09/2026: "na aba de contagem
  // retira a coluna de estoque seguro"): a tela de contagem já é a mais
  // apertada (some a coluna Ações e entra a de Estoque Físico) e o Estoque
  // Seguro não ajuda quem está conferindo saldo físico -- só disputa espaço
  // com o que importa ali.
  const cabecalhoEstmin = document.querySelector('.col-estmin');
  cabecalhoEstmin.style.display = mostraColunaEstmin() ? 'table-cell' : 'none';
  cabecalhoEstmin.innerHTML = ehTrading()
    ? `<label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;" title="Marcar todos os itens do filtro atual">
         <input type="checkbox" id="etqTodos" ${marcouTodasAsEtiquetas(rows) ? 'checked' : ''}> Etiqueta
       </label>`
    : 'Estoque Seguro';
  // Antes do return de "nenhum item": o botão da barra some ao trocar de
  // unidade mesmo quando o filtro não achou nada.
  atualizarBotaoEtiquetas();

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
      <td class="loc">
        <span class="loc-chip">${escapeHtml(r.localizacao)}</span>
        ${(() => {
          const chave = chaveContagem(r.item, r.localizacao);
          const localFisico = localizacaoFisicaMap[chave];
          const divergeLoc = localFisico && localFisico !== r.localizacao;
          const aviso = divergeLoc
            ? `<div class="loc-fisica-aviso" title="Contado em local diferente do cadastrado">📍 Físico: ${escapeHtml(localFisico)} — atualizar no sistema</div>`
            : '';
          const edicao = modoContagemAtivo
            ? `<div class="loc-fisica-edit">
                 <input type="text" class="loc-fisica-input" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}"
                        value="${localFisico ? escapeHtml(localFisico) : ''}" placeholder="Local real, se mudou">
                 <button class="loc-fisica-confirmar" data-item="${escapeHtml(r.item)}" data-loc="${escapeHtml(r.localizacao)}" type="button">Confirmar</button>
               </div>`
            : '';
          return aviso + edicao;
        })()}
      </td>
      <td class="col-padrao" style="text-align:center;">${fichaBoxMap.has(r.item)
        ? `<button class="padrao-btn" data-item="${escapeHtml(r.item)}" data-qtd="${escapeHtml(r.quantidade)}" title="Ver padrão de caixas esperado">📦</button>`
        : (podeEditarEmbalagem() ? `<button class="avulso-btn" data-item="${escapeHtml(r.item)}" title="Marcar como item avulso, sem padrão de caixa">AVULSO</button>` : '')}</td>
      <td class="num">${escapeHtml(r.quantidade)}</td>
      <td class="col-estmin" style="display:${mostraColunaEstmin() ? 'table-cell' : 'none'};">
        ${ehTrading()
          ? `<div style="display:flex; align-items:center; gap:6px;">
               <input type="checkbox" class="etq-check" data-id="${escapeHtml(r.id)}" ${etiquetasTrading.has(String(r.id)) ? 'checked' : ''}
                      title="Marcar para imprimir junto com os outros">
               <button class="acao-btn etq-btn" data-id="${escapeHtml(r.id)}" title="Imprimir a etiqueta deste item agora">🖨️</button>
             </div>`
          : `<input type="text" inputmode="decimal" class="estmin-input" data-id="${escapeHtml(r.id)}" data-item="${escapeHtml(r.item)}"
               value="${r.estoque_minimo != null ? escapeHtml(r.estoque_minimo) : ''}" placeholder="—"
               title="Vale pro item inteiro, somando todas as localizações desta unidade — não só esta prateleira"
               style="width:70px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px; text-align:right;">`}
      </td>
      <td class="col-acoes" style="display:${modoContagemAtivo ? 'none' : 'table-cell'};">
        <button class="acao-btn ficha-btn${fichaFeitoSet.has(r.item) ? '' : ' pendente'}" data-item="${escapeHtml(r.item)}"
                title="${fichaFeitoSet.has(r.item) ? 'Ver foto e ficha técnica' : 'Ainda não cadastrado — clique para preencher'}">👁</button>
        ${fichaImageMap.get(r.item) ? `<img class="print-only-thumb" src="${escapeHtml(fichaImageMap.get(r.item))}" alt="">` : ''}
        <button class="acao-btn compare-btn" data-item="${escapeHtml(r.item)}" title="Comparar entre unidades">⇄</button>
        ${parseQtd(r.quantidade) === 0
          ? `<button class="acao-btn substituto-btn" data-item="${escapeHtml(r.item)}" title="Sugestão de item equivalente já em estoque, mesma medida e material">💡</button>`
          : ''}
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

let filtros = { localizacao: '', um: '', padrao: '', zerado: false, comFoto: false, divergente: false, estoqueBaixo: false };

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
  // Tres estados agora, nao dois: numero definido / marcado avulso / nada
  // ainda. fichaBoxMap.has() sozinho nao decide "com" porque ele passou a
  // incluir tambem quem foi marcado como avulso.
  if (filtros.padrao === 'com') rows = rows.filter(r => { const i = fichaBoxMap.get(r.item); return !!(i && !i.semPadrao); });
  if (filtros.padrao === 'avulso') rows = rows.filter(r => { const i = fichaBoxMap.get(r.item); return !!(i && i.semPadrao); });
  if (filtros.padrao === 'pendente') rows = rows.filter(r => !fichaBoxMap.has(r.item));
  if (filtros.zerado) rows = rows.filter(r => parseQtd(r.quantidade) === 0);
  if (filtros.estoqueBaixo) { const baixos = itensAbaixoDoEstoqueSeguro(currentData); rows = rows.filter(r => baixos.has(r.item)); }
  if (filtros.comFoto) rows = rows.filter(r => fichaImageMap.has(r.item));
  if (filtros.divergente) {
    // Conta como divergencia tanto quantidade diferente quanto localizacao
    // fisica registrada diferente da cadastrada -- as duas sao "precisa
    // corrigir o sistema", so em campos diferentes.
    rows = rows.filter(r => {
      const chave = chaveContagem(r.item, r.localizacao);
      const fisico = contagemMap[chave];
      const divergeQtd = fisico !== undefined && fisico !== '' && parseQtd(fisico) !== parseQtd(r.quantidade);
      const localFisico = localizacaoFisicaMap[chave];
      const divergeLoc = !!localFisico && localFisico !== r.localizacao;
      return divergeQtd || divergeLoc;
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
  // Guardado porque "marcar todas as etiquetas" (Trading) age sobre o que o
  // filtro deixou na tela, e não só sobre a página visível -- render() recebe
  // a fatia da página, não dá pra reaproveitar de lá.
  linhasFiltradasAtual = rows;
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

  const cardBaixo = document.getElementById('statEstoqueBaixoCard');
  if (podeVerEstoqueMinimo()) {
    const baixo = itensAbaixoDoEstoqueSeguro(currentData);
    document.getElementById('stat-estoque-baixo').textContent = baixo.size.toLocaleString('pt-BR');
    cardBaixo.style.display = 'flex';
  } else {
    cardBaixo.style.display = 'none';
  }
}

// Aviso chamativo, só na carga da tela (loadData()) -- não em toda
// atualização de estoque mínimo/filtro, senão ficaria aparecendo/
// desaparecendo à toa a cada edição. "quando eu abrir o app" (Robson).
//
// Além de avisar, indica em quais outras unidades cada item tem saldo --
// pedido do Robson pra já saber de onde puxar reposição sem precisar
// abrir o comparativo item a item. A leitura de `estoque` não é
// restrita por unidade no RLS (só exige estar aprovado -- ver
// fase1c-rls.sql), então uma única consulta com `.in('item', ...)` já
// traz os dados de todas as unidades pros itens em aviso.
async function avisarEstoqueBaixoSeNecessario() {
  const aviso = document.getElementById('avisoEstoqueSeguro');
  if (!podeVerEstoqueMinimo()) { aviso.style.display = 'none'; return; }

  const itensBaixos = itensAbaixoDoEstoqueSeguro(currentData);
  // Uma linha representante por item (a primeira localização encontrada) --
  // o aviso só usa r.item daqui pra frente, então tanto faz qual localização.
  const baixo = [...itensBaixos].map(item => currentData.find(r => r.item === item));
  if (!baixo.length) { aviso.style.display = 'none'; return; }

  const exemplos = baixo.slice(0, 3);
  const resto = baixo.length > 3 ? baixo.length - 3 : 0;

  let outrasPorItem = {};
  try {
    const { data, error } = await sb.from('estoque')
      // Mesmo depósito nas outras unidades: repor EPI olhando o saldo do
      // almoxarifado (ou o contrário) mandaria procurar no armazém errado.
      .select('item, unidade, quantidade')
      .in('item', exemplos.map(r => r.item))
      .neq('unidade', unidadeAtual).eq('deposito', depositoAtual);
    if (error) throw error;
    (data || []).forEach(r => {
      const qtd = parseQtd(r.quantidade);
      if (qtd <= 0) return; // "tem no estoque" -- unidade zerada não ajuda a repor
      if (!outrasPorItem[r.item]) outrasPorItem[r.item] = [];
      outrasPorItem[r.item].push({ unidade: r.unidade, quantidade: qtd });
    });
  } catch (e) {
    console.warn('Não foi possível checar outras unidades para o aviso de estoque seguro:', e.message);
  }

  const linhas = exemplos.map(r => {
    const outras = (outrasPorItem[r.item] || []).sort((a, b) => b.quantidade - a.quantidade);
    const detalhe = outras.length
      ? `tem em ${escapeHtml(rotuloUnidade(outras[0].unidade))}: ${outras[0].quantidade.toLocaleString('pt-BR')}${outras.length > 1 ? ` (+${outras.length - 1} unidade${outras.length > 2 ? 's' : ''})` : ''}`
      : 'nenhuma outra unidade tem esse item';
    return `<button type="button" class="aviso-item-btn" data-item="${escapeHtml(r.item)}" title="Ver comparativo entre unidades">${escapeHtml(r.item)}</button> — ${detalhe}`;
  }).join('<br>');

  const restoTexto = resto ? `<br>e mais ${resto} item(ns) abaixo do estoque seguro nesta unidade.` : '';

  document.getElementById('avisoEstoqueSeguroTexto').innerHTML =
    `⚠️ ${baixo.length} item(ns) abaixo do estoque seguro nesta unidade:<br>${linhas}${restoTexto}`;
  aviso.style.display = 'flex';
}

document.getElementById('avisoEstoqueSeguroFechar').addEventListener('click', () => {
  document.getElementById('avisoEstoqueSeguro').style.display = 'none';
});
document.getElementById('avisoEstoqueSeguroTexto').addEventListener('click', (e) => {
  const btn = e.target.closest('.aviso-item-btn');
  if (btn) openCompareModal(btn.dataset.item);
});

async function loadFichaImageMap() {
  try {
    const { data, error } = await sb.from('fichas_tecnicas')
      .select('item, imagem_url, qtd_caixa_master, qtd_caixa_fracionada, sem_padrao_caixa');
    if (error) throw error;
    fichaImageMap = new Map((data || []).map(r => [r.item, r.imagem_url]));
    // Entra no mapa quem tem numero de caixa OU foi marcado como "sem padrao"
    // (o item existe, só que vem avulso). calcularCaixas() trata os dois:
    // com master numerico calcula; com semPadrao, devolve o marcador.
    fichaBoxMap = new Map((data || [])
      .filter(r => r.qtd_caixa_master || r.sem_padrao_caixa)
      .map(r => [r.item, {
        master: r.qtd_caixa_master || null,
        fracionada: r.qtd_caixa_fracionada || null,
        semPadrao: !!r.sem_padrao_caixa
      }]));
    // "Trabalhado" pra fins de cor do botao: tem foto, tem numero de caixa,
    // ou foi explicitamente marcado como sem padrao. Cadastro totalmente
    // vazio (linha existe mas nada preenchido) continua contando como
    // pendente -- é so um upsert de rascunho feito ao digitar o 1º campo.
    fichaFeitoSet = new Set((data || [])
      .filter(r => r.imagem_url || r.qtd_caixa_master || r.sem_padrao_caixa)
      .map(r => r.item));
  } catch (e) {
    console.warn('Não foi possível carregar a lista de fichas técnicas:', e.message);
    fichaImageMap = new Map();
    fichaBoxMap = new Map();
    fichaFeitoSet = new Set();
  }
}

// Calcula quantas caixas master fechadas, caixas fracionadas fechadas, e peças soltas
// cabem num total de peças, com base no tamanho de cada tipo de caixa.
//
// Item marcado como "sem padrão de caixa" (vem avulso) não tem `master`
// numérico pra dividir -- devolve um marcador próprio em vez de tentar
// calcular (número / null viraria NaN).
function calcularCaixas(totalPecas, info) {
  if (!info) return null;
  if (info.semPadrao) return { semPadrao: true };
  if (!info.master) return null;
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

// UM de exibição do item (Pç, Ct, M...), lida do estoque carregado. Rebite
// vendido em "Ct" (cento) mostrar "50 pçs" na tela confundia quem cadastra
// -- o numero da caixa e nessa unidade, nao em peca. 'pçs' é só o padrão
// quando o item não está em currentData (ficha aberta antes do estoque
// carregar, por exemplo).
function umDoItem(itemCode) {
  const linha = currentData.find(r => r.item === itemCode);
  return (linha && linha.um) ? linha.um : 'pçs';
}

function formatarCaixas(totalPecas, itemCode) {
  const info = fichaBoxMap.get(itemCode);
  const resultado = calcularCaixas(totalPecas, info);
  if (!resultado) return '';
  // Na coluna de contagem nao ha espaço pra frase; so o cálculo numérico
  // aparece ali. "Sem padrão" fica só no modal (mostrarPadraoCaixas).
  if (resultado.semPadrao) return '';
  const um = umDoItem(itemCode);
  const partes = [];
  if (resultado.caixasMaster > 0) partes.push(`${resultado.caixasMaster} cx master`);
  if (resultado.caixasFracionadas > 0) partes.push(`${resultado.caixasFracionadas} cx fracionada`);
  if (resultado.pecasSoltas > 0) partes.push(`${resultado.pecasSoltas} ${um} soltas`);
  return partes.length ? `= ${partes.join(' + ')}` : '';
}

// As nove unidades fabris. Nao existem 102 nem 108.
// `cidade` vazia sai como "Unidade 103", sem inventar nome de cidade --
// preencher quando as cidades das novas unidades forem confirmadas.
const UNIDADES = {
  '101':  { cidade: 'Anápolis',               uf: 'GO' },
  '103':  { cidade: 'Várzea Grande',          uf: ''   },
  '104':  { cidade: 'Vitória de Santo Antão', uf: ''   },
  '105':  { cidade: 'Cambuí',                 uf: 'MG' },
  '106':  { cidade: 'Araquari',               uf: 'SC' },
  '107':  { cidade: 'Loja',                   uf: ''   },
  '109':  { cidade: '',                       uf: ''   },  // a confirmar
  '110':  { cidade: 'Leme',                   uf: ''   },
  '1101': { cidade: 'Trading',                uf: ''   }
};

// DEPÓSITOS — em qual armazém da unidade o item está.
//
// Até 09/09/2026 o SESMT era uma unidade falsa (`unidade = 'SESMT'`, fora de
// UNIDADES, com o seletor do topo escondido): existia UM estoque de EPI para a
// empresa inteira, e não havia como saber de qual fábrica era cada luva.
// Não existe unidade SESMT — existe o depósito de EPI de cada unidade.
//
// Hoje unidade é unidade (101..1101) e o depósito é uma coluna à parte, igual
// ao `setor` de `exp_controle_itens` (sql/fase18) e pelo mesmo motivo: o
// formato do dado é idêntico e a tela é a mesma, então uma coluna resolve onde
// uma tabela nova duplicaria toda a lógica de contagem, filtro e impressão.
//
// ⚠️ TODA consulta a `estoque`, `contagem_fisica` e `atribuicoes_corredor` tem
// de recortar por depósito. A chave da contagem é
// (item, unidade, localizacao, deposito): sem o depósito na conta, contar o
// mesmo item no mesmo endereço do almoxarifado sobrescreveria a contagem do
// EPI, e "Limpar tudo" levaria os dois. Ver sql/fase23-sesmt-deposito.sql.
const DEPOSITOS = {
  alm:       { rotulo: 'Almoxarifado',       icone: '📦' },
  sesmt:     { rotulo: 'SESMT (EPI)',        icone: '⛑️' },
  // Antes era o setor 'benchmark' de exp_controle_itens (pedido/etiqueta,
  // mesmo modelo do Controle EXP) -- virou saldo simples igual ao
  // Almoxarifado/SESMT em 10/09/2026 (Robson: "quero que mude a estrutura
  // igual como é do almoxarifado"). Ver PAGINAS.expbenchmark em
  // js/navegacao.js.
  benchmark: { rotulo: 'Depósito Benchmark', icone: '🏭' }
};

// Depósito da tela aberta agora. Trocado por js/navegacao.js ao abrir
// "Consulta de Itens" (alm) ou "Depósito SESMT" (sesmt).
let depositoAtual = 'alm';

function rotuloDeposito(cod) {
  const d = DEPOSITOS[cod || depositoAtual];
  return d ? d.rotulo : (cod || depositoAtual);
}

const UNIDADE_TRADING = '1101';

// Item que termina em "I" tem um código PRÓPRIO dentro do estoque da
// Trading: o mesmo item, só que com "T" a mais no final (ex.: "131556I" no
// resto do sistema, "131556IT" só no estoque da Trading). O Robson (2026-
// 09-09): "Esses itens com i no final é da Trading, ele fica com IT na
// trading, então puxa o estoque deles pra eu ver se eles tem lá".
//
// Sem isso, comparar entre unidades (openCompareModal) ou checar saldo pra
// transferência (Análise de Compras) nunca achava a Trading pra esses
// itens -- o código simplesmente não batia, mesmo o material existindo lá.
function codigoTradingDoItem(codigoItem) {
  const cod = String(codigoItem || '').trim();
  return /i$/i.test(cod) ? cod + 'T' : null;
}

// Escapa os curingas do ilike (% e _) antes de usar um valor digitado/vindo
// de outra tabela como padrão de busca -- sem isso, um código de item que
// por acaso tivesse um "_" viraria um curinga de verdade em vez de texto
// literal.
function escapeIlike(texto) {
  return String(texto).replace(/[%_]/g, '\\$&');
}

// Normaliza o código do item pra comparar/indexar sem se importar com
// maiúscula/minúscula nem espaço a mais. Bug relatado pelo Robson em
// 2026-09-09: o mesmo item gravado como "996613I" numa planilha e
// "996613i" no estoque -- comparação de texto em JS/Postgres diferencia
// maiúscula de minúscula, então o item "sumia" mesmo existindo. Usado pela
// Análise de Compras (js/analise.js) e por sugerirSubstitutos() abaixo.
function normalizaCodigoItem(codigo) {
  return String(codigo || '').trim().toUpperCase();
}

// Sugestão de item EQUIVALENTE já em estoque, no lugar de comprar/procurar
// um item difícil de achar (fornecedor raro, ou simplesmente zerado no
// almoxarifado). O Robson (09/09/2026): um rebite inox não tinha em
// estoque, mas tinha outro rebite inox da MESMA medida -- só que um
// terceiro rebite, mesma medida mas não inox, não deveria ser sugerido.
// A regra: mesma MEDIDA (a parte numérica tipo "4,0 X 15MM") e pelo menos
// uma PALAVRA EM COMUM fora do tipo do item e da própria medida (aqui,
// "INOX"). Compartilhada entre a Consulta de Itens (aqui) e a Análise de
// Compras (js/analise.js, que passa currentData ou analiseEstoqueLista
// como `listaEstoque`) -- uma regra só, não duas quase iguais.
//
// Por que "palavra em comum" em vez de uma lista fixa de materiais
// (inox/alumínio/galvanizado...): a mesma lógica serve pra qualquer
// categoria de item sem o código ter que conhecer o vocabulário de cada
// uma -- "RAL9006" bate com "RAL9006", "316L" bate com "316L", etc.

// Casa "4,0 X 15MM", "4,0X15MM", "4 X 15 MM" etc -- vírgula ou ponto
// decimal, com ou sem espaço ao redor do X. Sempre maiúsculo antes de
// comparar (ver normalizaCodigoItem() pro mesmo motivo com código de item).
const MEDIDA_REGEX = /(\d+[.,]?\d*)\s*X\s*(\d+[.,]?\d*)\s*MM/;

function extrairMedida(descricao) {
  const m = String(descricao || '').toUpperCase().match(MEDIDA_REGEX);
  return m ? `${m[1].replace(',', '.')}X${m[2].replace(',', '.')}` : null;
}

// Palavras "qualificadoras" de uma descrição: tudo, exceto a medida (já
// extraída à parte) e a primeira palavra (o TIPO do item -- "REBITE",
// "PARAFUSO"... -- que é sempre igual dentro da mesma busca e não ajuda a
// diferenciar um substituto de outro).
function palavrasQualificadoras(descricao, medida) {
  let texto = String(descricao || '').toUpperCase();
  if (medida) texto = texto.replace(MEDIDA_REGEX, ' ');
  const palavras = texto.split(/[^A-Z0-9]+/).filter(p => p.length > 1);
  palavras.shift(); // tira a primeira (o tipo do item)
  return new Set(palavras);
}

// Varre `listaEstoque` ({item, descricao, quantidade}[]) atrás de itens com
// a MESMA medida da descrição alvo e pelo menos uma palavra qualificadora
// em comum -- ordenado por quantas palavras batem (mais em comum primeiro).
// `listaEstoque` já deve vir filtrada pra só quantidade > 0 (item zerado
// não serve de sugestão) -- quem chama decide a origem (currentData da
// própria unidade, ou outra lista).
function sugerirSubstitutos(codigoAlvo, descricaoAlvo, listaEstoque) {
  const medidaAlvo = extrairMedida(descricaoAlvo);
  if (!medidaAlvo) return [];
  const qualAlvo = palavrasQualificadoras(descricaoAlvo, medidaAlvo);

  return listaEstoque
    .filter(r => normalizaCodigoItem(r.item) !== normalizaCodigoItem(codigoAlvo))
    .map(r => {
      if (extrairMedida(r.descricao) !== medidaAlvo) return null;
      const qual = palavrasQualificadoras(r.descricao, medidaAlvo);
      const comuns = [...qualAlvo].filter(p => qual.has(p));
      if (!comuns.length) return null;
      return { item: r.item, descricao: r.descricao, quantidade: parseQtd(r.quantidade), comuns };
    })
    .filter(Boolean)
    .sort((a, b) => b.comuns.length - a.comuns.length);
}

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

document.getElementById('statEstoqueBaixoCard').addEventListener('click', () => {
  filtros.estoqueBaixo = !filtros.estoqueBaixo;
  document.getElementById('statEstoqueBaixoCard').classList.toggle('stat-card-ativo', filtros.estoqueBaixo);
  pagina = 1;
  applyFilterAndSort();
});

// Estoque Mínimo editável (só visível pra quem podeVerEstoqueMinimo()) --
// mesmo padrão de salvar-ao-sair já usado no Controle EXP Acessórios.
document.getElementById('tableBody').addEventListener('focusout', (e) => {
  const input = e.target.closest('.estmin-input');
  if (!input) return;
  salvarEstoqueMinimo(input.dataset.id, input.value, input);
});
document.getElementById('tableBody').addEventListener('keydown', (e) => {
  if (e.target.classList.contains('estmin-input') && e.key === 'Enter') e.target.blur();
});

async function loadData() {
  const { data, error } = await sb.from('estoque').select('*').eq('unidade', unidadeAtual).order('id', { ascending: true }).eq('deposito', depositoAtual);
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
  // Etiquetas marcadas são ids de linha desta unidade/depósito -- depois de
  // trocar, os ids de antes não querem dizer nada aqui (e imprimiriam item de
  // outro galpão).
  etiquetasTrading.clear();
  await Promise.all([loadFichaImageMap(), atualizarPermissaoEstoqueMinimo()]);
  updateStats();
  applyFilterAndSort();
  avisarEstoqueBaixoSeNecessario();
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
  // Reflete na lista o que mudou dentro do modal (cor do botão de ficha,
  // filtro de padrão de caixa) sem precisar recarregar a página inteira.
  applyFilterAndSort();
}

function podeEditarEmbalagem() {
  return isAdminAtual || emailUsuarioAtual === 'j.lisboa@kingspanisoeste.com.br';
}

// "e isso por unidade, cada responsavel pela sua unidade coloca o que
// quiser" (Robson) -- não é mais uma lista fixa de e-mail: reusa
// pode_atualizar_estoque(uni), a MESMA função que já decide quem pode
// carregar a planilha de estoque daquela unidade (RLS, sql/fase1a-
// colunas-e-funcoes.sql) -- admin sempre, e quem está cadastrado em
// `gerentes_unidade` para aquela unidade especificamente. Assim, cada
// unidade tem seu próprio responsável pelo Estoque Seguro, sem precisar
// mexer em código pra trocar quem vê o quê -- só a tabela gerentes_unidade.
//
// É assíncrona (chama o banco) -- por isso fica em cache
// (_podeVerEstoqueMinimoCache), atualizado em loadData() sempre que a
// unidade muda. O resto do código (render(), updateStats()) continua
// chamando podeVerEstoqueMinimo() de forma síncrona, só lendo o cache.
let _podeVerEstoqueMinimoCache = false;

async function atualizarPermissaoEstoqueMinimo() {
  if (!unidadeAtual) { _podeVerEstoqueMinimoCache = false; return; }
  const { data, error } = await sb.rpc('pode_atualizar_estoque', { uni: unidadeAtual });
  _podeVerEstoqueMinimoCache = !error && data === true;
}

function podeVerEstoqueMinimo() {
  return _podeVerEstoqueMinimoCache;
}

// A coluna do meio (Estoque Seguro na maioria das unidades, Etiqueta na
// Trading) não aparece durante a contagem física -- ver render() e o
// template da linha, os dois usam esta função pra decidir o mesmo jeito.
function mostraColunaEstmin() {
  return !modoContagemAtivo && (ehTrading() || podeVerEstoqueMinimo());
}

async function salvarEstoqueMinimo(id, valorBruto, input) {
  const novoValor = valorBruto.trim() ? parseQtd(valorBruto.trim()) : null;
  // String(): data-id no HTML sempre vem string, mas r.id pode ser number
  // (id serial) -- comparar direto com === nunca bateria.
  const item = currentData.find(r => String(r.id) === String(id));
  if (!item) return;
  if (novoValor === (item.estoque_minimo != null ? parseQtd(item.estoque_minimo) : null)) return;

  input.disabled = true;
  // Estoque Seguro é do ITEM, não da prateleira -- grava em TODAS as linhas
  // deste item nesta unidade E DEPÓSITO (não só a linha `id` que a pessoa
  // editou), senão cada localização guardava um número diferente e o aviso
  // de estoque baixo comparava a quantidade de UMA prateleira com o mínimo,
  // "embaralhando" o resultado quando o item tem mais de um endereço
  // (Robson, 09/09/2026). O filtro por `deposito` é o mesmo motivo do
  // resto do arquivo: sem ele, o mesmo código de item no ALM e no SESMT
  // (dois depósitos, mesma unidade) ficaria com um só Estoque Seguro pros
  // dois -- editar na Consulta de Itens vazaria pro Depósito SESMT.
  //
  // .select() de propósito: sem ele, um UPDATE que a política de RLS barra
  // (ou que não acha a linha por qualquer motivo) volta com error = null e
  // data vazio -- parece "salvo" (sem erro) mas não gravou nada. Só dá pra
  // pegar isso conferindo se alguma linha voltou.
  const { data, error } = await sb.from('estoque')
    .update({ estoque_minimo: novoValor })
    .eq('unidade', unidadeAtual).eq('item', item.item).eq('deposito', depositoAtual).select('id');
  input.disabled = false;

  if (error) {
    alert('Não foi possível salvar o estoque seguro: ' + error.message);
    input.value = item.estoque_minimo != null ? item.estoque_minimo : '';
    return;
  }
  if (!data || data.length === 0) {
    alert('Não foi possível salvar o estoque seguro: nenhuma linha foi atualizada (sem permissão para esta unidade?). Fale com o administrador.');
    input.value = item.estoque_minimo != null ? item.estoque_minimo : '';
    return;
  }
  currentData.forEach(r => { if (r.item === item.item) r.estoque_minimo = novoValor; });
  document.querySelectorAll('.estmin-input').forEach(inp => {
    if (inp !== input && inp.dataset.item === item.item) {
      inp.value = novoValor != null ? novoValor : '';
    }
  });
  input.style.borderColor = 'var(--blue)';
  setTimeout(() => { input.style.borderColor = ''; }, 1200);
  updateStats(); // o card de "Estoque baixo" pode ter mudado de numero
}

function campoEmbalagem(data, itemCode) {
  // A UM vem do estoque (Pç, Ct, M...), não da ficha. Rebite em "Ct" com o
  // rótulo fixo "pçs" fazia parecer que "50" era peça quando era cento --
  // confundia quem estava cadastrando embalagem.
  const um = escapeHtml(umDoItem(itemCode));
  if (!podeEditarEmbalagem()) {
    if (data.sem_padrao_caixa) {
      return `<div class="modal-label">Embalagem</div><div class="modal-text">Sem padrão de caixa — item avulso.</div>`;
    }
    return data.qtd_caixa_master
      ? `<div class="modal-label">Embalagem</div><div class="modal-text">Caixa master: ${escapeHtml(data.qtd_caixa_master)} ${um}${data.qtd_caixa_fracionada ? ` · Caixa fracionada: ${escapeHtml(data.qtd_caixa_fracionada)} ${um}` : ''}</div>`
      : '';
  }
  const semPadrao = !!data.sem_padrao_caixa;
  return `
    <div class="modal-label">Embalagem (editável)</div>
    <div style="display:flex; gap:8px; margin-top:4px;">
      <div style="flex:1;">
        <label style="font-size:11px; color:var(--muted);">Caixa master (${um})</label>
        <input type="text" inputmode="numeric" class="embalagem-input" data-item="${escapeHtml(itemCode)}" data-campo="qtd_caixa_master"
               value="${data.qtd_caixa_master || ''}" placeholder="Ex: 2000" ${semPadrao ? 'disabled' : ''}
               style="width:100%; padding:7px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
      </div>
      <div style="flex:1;">
        <label style="font-size:11px; color:var(--muted);">Caixa fracionada (${um})</label>
        <input type="text" inputmode="numeric" class="embalagem-input" data-item="${escapeHtml(itemCode)}" data-campo="qtd_caixa_fracionada"
               value="${data.qtd_caixa_fracionada || ''}" placeholder="Ex: 200" ${semPadrao ? 'disabled' : ''}
               style="width:100%; padding:7px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
      </div>
    </div>
    <label style="display:flex; align-items:center; gap:6px; margin-top:8px; font-size:12.5px; color:var(--muted); cursor:pointer;">
      <input type="checkbox" class="sem-padrao-check" data-item="${escapeHtml(itemCode)}" ${semPadrao ? 'checked' : ''}>
      Este item não tem padrão de caixa (vem avulso)
    </label>
    <div class="status-msg" id="embalagemMsg" style="margin-top:4px;"></div>
  `;
}

// Marca/desmarca "item avulso, sem padrão de caixa". Ao marcar, zera e
// desabilita os dois campos numéricos -- os dois formatos não convivem
// (calcularCaixas() trataria número + semPadrao juntos de forma ambígua).
async function salvarSemPadrao(checkbox) {
  const itemCode = checkbox.dataset.item;
  const marcado = checkbox.checked;
  const msg = document.getElementById('embalagemMsg');
  const inputs = fichaModalBox.querySelectorAll('.embalagem-input');
  try {
    const patch = { sem_padrao_caixa: marcado };
    if (marcado) { patch.qtd_caixa_master = null; patch.qtd_caixa_fracionada = null; }
    const { error } = await sb.from('fichas_tecnicas').update(patch).eq('item', itemCode);
    if (error) throw error;

    inputs.forEach(inp => { inp.disabled = marcado; if (marcado) inp.value = ''; });
    if (marcado) {
      fichaBoxMap.set(itemCode, { master: null, fracionada: null, semPadrao: true });
    } else {
      fichaBoxMap.delete(itemCode); // volta a "pendente" ate alguem preencher um numero
    }
    fichaFeitoSet.add(itemCode); // marcar (nos dois sentidos) já é uma decisão tomada
    if (msg) { msg.textContent = 'Salvo!'; msg.className = 'status-msg status-ok'; setTimeout(() => { if (msg) msg.textContent = ''; }, 2000); }
  } catch (err) {
    checkbox.checked = !marcado; // desfaz visualmente, já que não gravou
    if (msg) { msg.textContent = 'Erro: ' + err.message; msg.className = 'status-msg status-err'; }
  }
}

// Botão "AVULSO" direto na lista: marca sem_padrao_caixa sem abrir o modal.
// Pra quem está passando item por item marcando o que não tem caixa, abrir
// modal -> marcar -> fechar por item seria lento demais.
//
// Sem confirm() de propósito -- travaria esse fluxo rápido a cada clique.
// Engano se desfaz abrindo a ficha (👁) e desmarcando o checkbox de lá.
async function marcarAvulsoRapido(itemCode) {
  try {
    const { error } = await sb.from('fichas_tecnicas').upsert(
      { item: itemCode, sem_padrao_caixa: true, qtd_caixa_master: null, qtd_caixa_fracionada: null },
      { onConflict: 'item' }
    );
    if (error) throw error;
    fichaBoxMap.set(itemCode, { master: null, fracionada: null, semPadrao: true });
    fichaFeitoSet.add(itemCode);
    applyFilterAndSort();
  } catch (err) {
    alert(`Não foi possível marcar o item ${itemCode} como avulso: ${err.message}`);
  }
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
      const atual = fichaBoxMap.get(itemCode) || { master: null, fracionada: null, semPadrao: false };
      if (campo === 'qtd_caixa_master') atual.master = valor ? parseFloat(valor) : null;
      if (campo === 'qtd_caixa_fracionada') atual.fracionada = valor ? parseFloat(valor) : null;
      if (valor) atual.semPadrao = false; // preencheu numero -- os dois estados nao convivem
      if (atual.master || atual.semPadrao) fichaBoxMap.set(itemCode, atual);
      else fichaBoxMap.delete(itemCode);
    }
    if (valor) fichaFeitoSet.add(itemCode); // numero preenchido conta como "trabalhado"
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
        // Enter salva na hora, sem precisar clicar fora ou dar Tab.
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      });
      const chk = fichaModalBox.querySelector('.sem-padrao-check');
      if (chk) chk.addEventListener('change', async () => {
        await sb.from('fichas_tecnicas').upsert({ item: itemCode }, { onConflict: 'item' });
        await salvarSemPadrao(chk);
      });
    }
    return;
  }

  fichaModalBox.innerHTML = `
    <button class="modal-close" id="fichaCloseBtn3">✕</button>
    ${data.imagem_url
      ? `<img src="${escapeHtml(data.imagem_url)}" alt="${escapeHtml(data.descricao || itemCode)}">`
      : `<div class="modal-foto-pendente">📷 Em breve, imagem do material</div>`}
    <h3>${escapeHtml(data.descricao || itemCode)}</h3>
    <div class="modal-item-code">Código: ${escapeHtml(itemCode)}</div>
    ${data.uso ? `<div class="modal-label">Uso recomendado</div><div class="modal-text">${escapeHtml(data.uso)}</div>` : ''}
    ${campoEmbalagem(data, itemCode)}
  `;
  document.getElementById('fichaCloseBtn3').addEventListener('click', closeFichaModal);
  fichaModalBox.querySelectorAll('.embalagem-input').forEach(inp => {
    inp.addEventListener('change', () => salvarEmbalagem(inp));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });
  const chk3 = fichaModalBox.querySelector('.sem-padrao-check');
  if (chk3) chk3.addEventListener('change', () => salvarSemPadrao(chk3));
}

document.getElementById('tableBody').addEventListener('click', (e) => {
  const fichaBtn = e.target.closest('.ficha-btn');
  if (fichaBtn) { openFichaModal(fichaBtn.dataset.item); return; }
  const compareBtn = e.target.closest('.compare-btn');
  if (compareBtn) { openCompareModal(compareBtn.dataset.item); return; }
  const substitutoBtn = e.target.closest('.substituto-btn');
  if (substitutoBtn) { abrirSugestoesSubstitutoEstoque(substitutoBtn.dataset.item); return; }
  const padraoBtn = e.target.closest('.padrao-btn');
  if (padraoBtn) { mostrarPadraoCaixas(padraoBtn); return; }
  const avulsoBtn = e.target.closest('.avulso-btn');
  if (avulsoBtn) { marcarAvulsoRapido(avulsoBtn.dataset.item); return; }
  // Etiqueta de uma linha só (Trading), sem passar pela marcação: o caso
  // comum é imprimir a do item que está na mão.
  const etqBtn = e.target.closest('.etq-btn');
  if (etqBtn) {
    const linha = currentData.find(r => String(r.id) === String(etqBtn.dataset.id));
    if (linha) imprimirEtiquetasTrading([linha]);
    return;
  }
});

const padraoModal = document.getElementById('padraoModal');
function mostrarPadraoCaixas(btn) {
  const info = fichaBoxMap.get(btn.dataset.item);
  const um = umDoItem(btn.dataset.item);
  const texto = info && info.semPadrao
    ? 'Este item não tem padrão de caixa — vem avulso.'
    : formatarCaixas(btn.dataset.qtd, btn.dataset.item) || 'Sem padrão de caixa suficiente pra calcular.';
  document.getElementById('padraoCodigo').textContent = 'Item ' + btn.dataset.item;
  document.getElementById('padraoTexto').textContent = texto.replace(/^= /, '');
  document.getElementById('padraoReferencia').textContent = (info && !info.semPadrao)
    ? `Caixa master: ${info.master} ${um}${info.fracionada ? ` · Caixa fracionada: ${info.fracionada} ${um}` : ''}`
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
      .delete().eq('item', itemCode).eq('unidade', unidadeAtual).eq('localizacao', loc).eq('deposito', depositoAtual);
    if (error) return marcarFalhaContagem(input, diffSlot, error.message);
    if (diffSlot) diffSlot.innerHTML = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (caixasSlot) caixasSlot.innerHTML = '';
    delete contagemMap[chave];
    return;
  }

  const { error } = await sb.from('contagem_fisica').upsert({
    item: itemCode, unidade: unidadeAtual, localizacao: loc,
    deposito: depositoAtual, quantidade_fisica: valor,
    contado_por: nomeUsuarioAtual,
    contado_em: new Date().toISOString()
  }, { onConflict: 'item,unidade,localizacao,deposito' });
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
  input.style.borderColor = 'var(--erro-borda)';
  input.style.background = 'var(--erro-fundo)';
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
  const chave = chaveContagem(itemCode, loc);
  // "Limpar" e so da quantidade. Se ja tem localizacao fisica registrada,
  // apagar a linha inteira apagaria essa correcao tambem sem a pessoa
  // perceber -- por isso zera so a quantidade quando ha local pra manter.
  const temLocalFisico = !!localizacaoFisicaMap[chave];
  const { error } = temLocalFisico
    ? await sb.from('contagem_fisica')
        .update({ quantidade_fisica: null, contado_por: null, contado_em: null })
        .eq('item', itemCode).eq('unidade', unidadeAtual).eq('localizacao', loc).eq('deposito', depositoAtual)
    : await sb.from('contagem_fisica')
        .delete().eq('item', itemCode).eq('unidade', unidadeAtual).eq('localizacao', loc).eq('deposito', depositoAtual);
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

// ---- Compartilhar o conteúdo do modal (comparativo, pedidos, sugestão) ----
//
// O Robson: "preciso de um esquema pra eu copiar essa tabela, isso facilita
// eu enviar para o pessoal de outra unidade quando eu estiver precisando de
// transferência, até mesmo para eu enviar para compras pra eu justificar que
// preciso repor o estoque" -- depois: "um botão de compartilhar".
//
// Lê o PRÓPRIO conteúdo já renderizado do modal (em vez de remontar o texto
// a partir dos dados) de propósito: o modal é a MESMA caixa reaproveitada
// pelas três telas (comparativo entre unidades, "pedidos que precisam deste
// item" e sugestão de substituto -- ver openCompareModal/
// abrirSugestoesSubstituto/abrirSugestoesSubstitutoEstoque), então ler o DOM
// funciona pras três sem duplicar a lógica de cada uma aqui.
function celulasDaLinha(tr) {
  return [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim());
}

function tabelaParaTexto(tabela) {
  const linhas = [];
  const cabecalho = tabela.querySelector('thead tr');
  if (cabecalho) linhas.push(celulasDaLinha(cabecalho).join('\t'));
  tabela.querySelectorAll('tbody tr').forEach(tr => linhas.push(celulasDaLinha(tr).join('\t')));
  const rodape = tabela.querySelector('tfoot tr');
  if (rodape) linhas.push(celulasDaLinha(rodape).filter(Boolean).join('\t'));
  return linhas.join('\n');
}

// Percorre o conteúdo do modal na ordem em que aparece na tela. Um elemento
// SEM filho-elemento (título, código do item, texto explicativo, rótulo de
// seção) vira uma linha; uma <table> vira um bloco de texto; um <div> com
// filhos (o envelope do bloco de "pedidos que precisam deste item", ver
// pedidosDoItemHtml em js/analise.js) é aberto e percorrido por dentro --
// assim o rótulo da seção sai antes da tabela dela, na ordem certa.
function textoDoModal(container) {
  const partes = [];
  const percorrer = (el) => {
    [...el.children].forEach(filho => {
      if (filho.tagName === 'BUTTON') return; // fechar/compartilhar, não faz parte do conteúdo
      if (filho.tagName === 'TABLE') { partes.push(tabelaParaTexto(filho)); return; }
      if (filho.children.length === 0) {
        const texto = filho.textContent.replace(/\s+/g, ' ').trim();
        if (texto) partes.push(texto);
        return;
      }
      percorrer(filho);
    });
  };
  percorrer(container);
  return partes.filter(Boolean).join('\n\n');
}

async function compartilharConteudoModal() {
  const texto = textoDoModal(compareModalBox);
  if (!texto.trim()) return;

  // No celular, o compartilhamento nativo já oferece WhatsApp, e-mail etc.
  // direto -- é o caminho mais curto pro que o Robson pediu. Sem isso (a
  // maioria dos navegadores de computador), cai pra copiar: menos direto,
  // mas resolve o mesmo problema de colar em outro lugar.
  if (navigator.share) {
    try {
      await navigator.share({ text: texto });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // a pessoa cancelou a caixa de compartilhamento -- não é erro
      // segue pro fallback de copiar, abaixo
    }
  }

  const botao = document.getElementById('compareShareBtn');
  try {
    await navigator.clipboard.writeText(texto);
    if (botao) {
      const textoOriginal = botao.textContent;
      botao.textContent = '✓ Copiado! Cole onde precisar';
      setTimeout(() => { botao.textContent = textoOriginal; }, 2000);
    }
  } catch (e) {
    alert('Não foi possível compartilhar nem copiar: ' + e.message);
  }
}

// ---- Compartilhar como IMAGEM (pro WhatsApp, que não mostra tabela/HTML) --
//
// O Robson pediu "compartilhar em HTML também para o WhatsApp" -- perguntado
// o que resolveria (WhatsApp não renderiza HTML colado, só texto puro ou
// imagem), a resposta foi: gerar uma imagem da tabela, que o WhatsApp trata
// como uma foto qualquer, igual a um print de tela.
//
// html2canvas em vez de desenhar a tabela à mão num <canvas>: a tabela já
// tem cor, negrito, borda e o 🏆 da unidade com mais saldo -- reproduzir tudo
// isso célula por célula seria reinventar exatamente o que a biblioteca já
// resolve. Carregada só no primeiro uso (mesmo padrão do xlsx/tesseract, ver
// js/config.js) -- ninguém que só consulta item paga esse peso.
async function compartilharImagemModal() {
  const botao = document.getElementById('compareShareImgBtn');
  const textoOriginalBotao = botao ? botao.textContent : '';

  try {
    await carregarBiblioteca('a geração de imagem', CDN_HTML2CANVAS, () => typeof html2canvas !== 'undefined');
  } catch (e) {
    alert(e.message);
    return;
  }

  if (botao) { botao.disabled = true; botao.textContent = 'Gerando imagem...'; }

  // Os botões de ação (✕ fechar, Compartilhar, Compartilhar imagem) somem só
  // durante a captura -- ninguém quer print de botão clicável na imagem que
  // vai pro cliente ou pro compras.
  const escondidos = [...compareModalBox.querySelectorAll('.modal-close, .modal-acao-compartilhar')];
  const displayOriginal = escondidos.map(el => el.style.display);
  escondidos.forEach(el => { el.style.display = 'none'; });

  let canvas;
  try {
    // scale: 2 -- a imagem sai numa tela de celular depois de ir e voltar
    // pelo WhatsApp (que recomprime), então vale sair maior que o normal
    // pra não nascer borrada.
    canvas = await html2canvas(compareModalBox, { backgroundColor: 'var(--panel)', scale: 2 });
  } catch (e) {
    escondidos.forEach((el, i) => { el.style.display = displayOriginal[i]; });
    if (botao) { botao.disabled = false; botao.textContent = textoOriginalBotao; }
    alert('Não foi possível gerar a imagem: ' + e.message);
    return;
  }
  escondidos.forEach((el, i) => { el.style.display = displayOriginal[i]; });
  if (botao) { botao.disabled = false; botao.textContent = textoOriginalBotao; }

  canvas.toBlob(async (blob) => {
    if (!blob) { alert('Não foi possível gerar a imagem.'); return; }
    const nomeArquivo = 'comparativo-' + new Date().toISOString().slice(0, 10) + '.png';

    // canShare({ files }) e não só `!!navigator.share`: têm navegador que
    // compartilha TEXTO mas recusa ARQUIVO -- teria que ser conferido antes
    // de chamar share(), senão o erro só aparece depois de gerar a imagem.
    if (navigator.canShare) {
      const arquivo = new File([blob], nomeArquivo, { type: 'image/png' });
      if (navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo] });
          return;
        } catch (e) {
          if (e.name === 'AbortError') return; // cancelou o compartilhamento -- não é erro
          // segue pro fallback de baixar, abaixo
        }
      }
    }

    // Sem compartilhamento de arquivo (a maioria dos navegadores de
    // computador): baixa o PNG, pra anexar à mão no WhatsApp Web.
    baixarArquivo(blob, nomeArquivo);
    if (botao) {
      botao.textContent = '✓ Baixada! Anexe no WhatsApp';
      setTimeout(() => { botao.textContent = textoOriginalBotao; }, 2500);
    }
  }, 'image/png');
}

compareModalBox.addEventListener('click', (e) => {
  if (e.target.closest('#compareShareBtn')) compartilharConteudoModal();
  if (e.target.closest('#compareShareImgBtn')) compartilharImagemModal();
});

// `extraHtml` é opcional: um bloco de HTML pronto pra entrar depois da
// tabela de unidades. Hoje só a Análise de Compras usa (lista de pedidos
// que precisam do item, ver js/analise.js) -- o Robson: "quero que apareça
// para quais pedidos preciso, ai a ideia é eu enviar um print pro
// responsável do almoxarifado que vou pedir". Fica aqui e não lá pra não
// duplicar a montagem da tabela de unidades num segundo modal.
async function openCompareModal(itemCode, extraHtml) {
  compareModalBox.innerHTML = `
    <button class="modal-close" id="compareCloseBtn">✕</button>
    <div class="modal-empty">Carregando...</div>
  `;
  compareModal.classList.add('open');
  document.getElementById('compareCloseBtn').addEventListener('click', closeCompareModal);

  // ilike (não eq) de propósito: o mesmo item às vezes está gravado com
  // maiúscula/minúscula diferente entre unidades (bug relatado pelo Robson
  // em 2026-09-09 -- item existia com 43 no almoxarifado e a tela dizia que
  // não tinha em unidade nenhuma). `eq` é sensível a isso; `ilike` sem
  // curinga faz a mesma comparação exata, só que ignorando a caixa.
  const { data, error } = await sb.from('estoque').select('*').ilike('item', escapeIlike(itemCode)).eq('deposito', depositoAtual);

  // A Trading guarda este item com um código próprio (ver codigoTradingDoItem) --
  // busca à parte, e junta no mesmo grupo de linhas antes de somar por unidade.
  const codigoTrading = codigoTradingDoItem(itemCode);
  let dadosTrading = [];
  if (codigoTrading) {
    const { data: dt } = await sb.from('estoque').select('*')
      .ilike('item', escapeIlike(codigoTrading)).eq('unidade', UNIDADE_TRADING).eq('deposito', depositoAtual);
    dadosTrading = dt || [];
  }
  const todasAsLinhas = [...(data || []), ...dadosTrading];

  // Agrupa por unidade, somando a quantidade de TODOS os endereços daquela unidade
  const porUnidade = {};
  todasAsLinhas.forEach(r => {
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
    if (ehMaior) estilo = 'background:var(--aviso-fundo);';
    else if (ehAtual) estilo = 'background:var(--row-alt);';

    // Nota discreta só na Trading, e só quando o código de lá é diferente --
    // pra quem for conferir na mão saber qual código procurar no sistema
    // deles, sem estranhar o número batendo diferente do resto da tela.
    const notaCodigo = (cod === UNIDADE_TRADING && codigoTrading)
      ? ` <span style="color:var(--muted); font-weight:400;">(código lá: ${escapeHtml(codigoTrading)})</span>`
      : '';

    if (r) {
      const localTexto = r.locais.length > 1
        ? `${r.locais.length} locais`
        : (r.locais[0] || '-');
      return `
        <tr style="${estilo}">
          <td style="padding:9px 10px; font-weight:600;">${ehMaior ? '🏆 ' : ''}${escapeHtml(cod)} · ${escapeHtml(u.cidade)}${notaCodigo}</td>
          <td style="padding:9px 10px; text-align:right; font-weight:700; color:var(--blue-dark); white-space:nowrap;">${escapeHtml(r.totalQtd.toLocaleString('pt-BR'))}</td>
          <td style="padding:9px 10px; color:var(--muted); white-space:nowrap;" title="${escapeHtml(r.locais.join(', '))}">${escapeHtml(localTexto)}</td>
        </tr>`;
    }
    return `
      <tr style="${estilo}">
        <td style="padding:9px 10px; font-weight:600;">${escapeHtml(cod)} · ${escapeHtml(u.cidade)}${notaCodigo}</td>
        <td style="padding:9px 10px; text-align:right; color:var(--muted);" colspan="2">Não encontrado nessa unidade</td>
      </tr>`;
  }).join('');

  const totalGeral = codigosOrdenados.reduce((soma, cod) => soma + (porUnidade[cod] ? porUnidade[cod].totalQtd : 0), 0);

  const nomeItem = todasAsLinhas[0] ? todasAsLinhas[0].descricao : '';

  compareModalBox.innerHTML = `
    <button class="modal-close" id="compareCloseBtn2">✕</button>
    <h3 style="padding-right:24px;">${escapeHtml(nomeItem || itemCode)}</h3>
    <div class="modal-item-code">Código: ${escapeHtml(itemCode)}</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
      <button type="button" class="btn modal-acao-compartilhar" id="compareShareBtn" title="Compartilhar ou copiar como texto — pra pedir transferência a outra unidade, ou justificar reposição pro compras">📤 Compartilhar</button>
      <button type="button" class="btn modal-acao-compartilhar" id="compareShareImgBtn" title="Compartilhar como imagem — pro WhatsApp, que não mostra tabela colada">🖼️ Imagem</button>
    </div>
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
    ${extraHtml || ''}
  `;
  document.getElementById('compareCloseBtn2').addEventListener('click', closeCompareModal);
}

// Sugestão de item equivalente já em estoque (mesma medida, mesmo material)
// pra item zerado -- o Robson pediu que a Consulta de Itens usasse a mesma
// regra da Análise de Compras (sugerirSubstitutos(), ver js/estoque.js
// linhas acima), só que aberta pra todo mundo (inclusive consultor), não só
// pra quem tem acesso à Análise de Compras. Reaproveita o MESMO modal do
// comparativo entre unidades -- muda só o conteúdo de dentro.
function abrirSugestoesSubstitutoEstoque(itemCode) {
  const item = currentData.find(r => r.item === itemCode);
  if (!item) return;

  const candidatos = currentData.filter(r => parseQtd(r.quantidade) > 0);
  const sugestoes = sugerirSubstitutos(itemCode, item.descricao, candidatos);

  compareModalBox.innerHTML = `
    <button class="modal-close" id="compareCloseBtn2">✕</button>
    <h3 style="padding-right:24px;">${escapeHtml(item.descricao || itemCode)}</h3>
    <div class="modal-item-code">Código: ${escapeHtml(itemCode)} — sem saldo nesta unidade</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
      <button type="button" class="btn modal-acao-compartilhar" id="compareShareBtn" title="Compartilhar ou copiar como texto">📤 Compartilhar</button>
      <button type="button" class="btn modal-acao-compartilhar" id="compareShareImgBtn" title="Compartilhar como imagem — pro WhatsApp, que não mostra tabela colada">🖼️ Imagem</button>
    </div>
    <div class="modal-text" style="margin:8px 0 4px;">
      Itens já em estoque com a mesma medida e pelo menos uma palavra em comum
      (ex.: material) -- confira se algum serve no lugar deste.
    </div>
    ${sugestoes.length ? `
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
            <td style="padding:9px 10px; text-align:right; font-weight:700; color:var(--blue-dark);">${escapeHtml(s.quantidade.toLocaleString('pt-BR'))}</td>
            <td style="padding:9px 10px; color:var(--ok-texto);">${escapeHtml(s.comuns.join(', '))}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : `<div class="modal-empty">Nenhum item parecido com saldo nesta unidade.</div>`}
  `;
  document.getElementById('compareCloseBtn2').addEventListener('click', closeCompareModal);
  compareModal.classList.add('open');
}

compareModal.addEventListener('click', (e) => {
  if (e.target === compareModal) closeCompareModal();
});

// ---- Modo Contagem (planilha de inventário com senha própria) ----
const contagemModal = document.getElementById('contagemModal');
const contagemPinInput = document.getElementById('contagemPinInput');
const contagemPinMsg = document.getElementById('contagemPinMsg');

let contagemMap = {};
let localizacaoFisicaMap = {};

async function carregarContagens() {
  const { data, error } = await sb.from('contagem_fisica').select('*').eq('unidade', unidadeAtual).eq('deposito', depositoAtual);
  contagemMap = {};
  localizacaoFisicaMap = {};
  if (error) {
    // Sem isto, falha de leitura fica indistinguível de "ninguém contou ainda",
    // e a pessoa pode recontar por cima do trabalho de outra.
    console.error('Falha ao carregar as contagens:', error.message);
    alert('Não foi possível carregar as contagens já registradas: ' + error.message
      + ' \u2014 os campos podem aparecer em branco mesmo com contagem feita. Recarregue a página antes de contar.');
    return;
  }
  (data || []).forEach(r => {
    const chave = chaveContagem(r.item, r.localizacao);
    contagemMap[chave] = r.quantidade_fisica;
    if (r.localizacao_fisica) localizacaoFisicaMap[chave] = r.localizacao_fisica;
  });
}

// Grava a localizacao onde o item foi encontrado de verdade. NAO mexe em
// quantidade_fisica -- por isso e um upsert so com estes campos, e nao um
// delete/insert como a contagem de quantidade faz.
async function salvarLocalizacaoFisica(itemCode, loc, valorBruto, botao) {
  const valor = valorBruto.trim();
  const chave = chaveContagem(itemCode, loc);
  const msgAntiga = botao.parentElement.querySelector('.loc-fisica-msg');
  if (msgAntiga) msgAntiga.remove();

  botao.disabled = true;
  const { error } = await sb.from('contagem_fisica').upsert({
    item: itemCode, unidade: unidadeAtual, localizacao: loc,
    deposito: depositoAtual,
    localizacao_fisica: valor || null,
    contado_por: nomeUsuarioAtual
  }, { onConflict: 'item,unidade,localizacao,deposito' });
  botao.disabled = false;

  const msg = document.createElement('span');
  msg.className = 'loc-fisica-msg';
  if (error) {
    msg.textContent = 'NAO SALVOU: ' + error.message;
    msg.classList.add('loc-fisica-erro');
    botao.parentElement.appendChild(msg);
    console.error('Falha ao gravar localizacao fisica:', error.message);
    return;
  }

  if (valor) localizacaoFisicaMap[chave] = valor; else delete localizacaoFisicaMap[chave];
  msg.textContent = 'Salvo!';
  botao.parentElement.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
  applyFilterAndSort(); // reflete o aviso de divergencia na celula, sem reload
}

document.getElementById('tableBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.loc-fisica-confirmar');
  if (!btn) return;
  const input = btn.parentElement.querySelector('.loc-fisica-input');
  salvarLocalizacaoFisica(btn.dataset.item, btn.dataset.loc, input.value, btn);
});
document.getElementById('tableBody').addEventListener('keydown', (e) => {
  if (e.target.classList.contains('loc-fisica-input') && e.key === 'Enter') {
    e.preventDefault();
    const btn = e.target.parentElement.querySelector('.loc-fisica-confirmar');
    if (btn) btn.click();
  }
});

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

// Apagar a contagem inteira de uma unidade no meio de um inventário é
// irreversível e afeta todo mundo. A única proteção era o confirm() do
// navegador (AUDITORIA.md, item A4): qualquer conta aprovada com perfil
// estoque_alm da unidade conseguia. Agora é de admin ou gerente da unidade,
// e a pergunta de "pode?" é respondida pelo banco, não pela tela.
async function podeLimparContagem() {
  if (isAdminAtual) return true;
  if (!unidadeAtual) return false;
  const { data, error } = await sb.rpc('pode_atualizar_estoque', { uni: unidadeAtual });
  if (error) {
    console.error('Falha ao conferir permissão para limpar a contagem:', error.message);
    return false;   // falha fechado
  }
  return data === true;
}

async function limparTodasAsContagens() {
  if (!(await podeLimparContagem())) {
    alert('Apagar a contagem da unidade inteira é do administrador ou do gerente da unidade.'
      + ' — nada foi apagado.');
    return;
  }
  const confirmado = confirm(`Isso vai apagar TODAS as quantidades de estoque físico digitadas na Unidade ${unidadeAtual}, pra todo mundo. Essa ação não pode ser desfeita. Confirma?`);
  if (!confirmado) return;
  // Só o depósito aberto: "Limpar tudo" no almoxarifado não pode levar
  // a contagem do EPI da mesma unidade.
  const { error } = await sb.from('contagem_fisica').delete().eq('unidade', unidadeAtual).eq('deposito', depositoAtual);
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
  const { data, error } = await sb.from('contagem_fisica').select('item, localizacao, contado_por, contado_em').eq('unidade', unidadeAtual).eq('deposito', depositoAtual);

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
  const { data } = await sb.from('atribuicoes_corredor').select('*').eq('unidade', unidadeAtual).eq('deposito', depositoAtual);
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
  // O cliente do Supabase devolve { error } em vez de lançar, então o
  // try/catch que estava aqui nunca disparava: falha de gravação era
  // silenciosa de verdade (item A1 da AUDITORIA.md).
  const { error } = await sb.from('atribuicoes_corredor').upsert(
    { unidade: unidadeAtual, corredor, deposito: depositoAtual,
      pessoa: pessoa || null, atualizado_em: new Date().toISOString() },
    { onConflict: 'unidade,corredor,deposito' }
  );
  if (error) console.warn('Erro ao salvar atribuição:', error.message);
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
  // Quem não pode limpar não vê o botão. Esconder é cortesia; a trava é a
  // checagem em limparTodasAsContagens() e o RLS de DELETE no banco.
  const limpar = document.getElementById('limparContagemBtn');
  limpar.style.display = 'none';
  podeLimparContagem().then(pode => {
    if (modoContagemAtivo) limpar.style.display = pode ? '' : 'none';
  });
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
    // rotuloUnidade() é tolerante a unidade fora do mapa (ex.: SESMT, que
    // fica de fora de UNIDADES de propósito) -- ler UNIDADES[unidadeAtual]
    // direto quebrava aqui pro SESMT (undefined.cidade), travando o botão
    // sem erro visível pra quem clicava.
    document.getElementById('contagemHint').textContent =
      `Digite a senha da ${rotuloUnidade(unidadeAtual)} para liberar a coluna de contagem física.`;
    contagemModal.classList.add('open');
  }
});

// A senha nao esta no navegador: o banco responde apenas sim ou nao.
document.getElementById('contagemPinSubmit').addEventListener('click', async () => {
  const botao = document.getElementById('contagemPinSubmit');
  contagemPinMsg.textContent = 'Conferindo...';
  botao.disabled = true;

  const { data, error } = await sb.rpc('senha_contagem_confere',
    { uni: unidadeAtual, tentativa: contagemPinInput.value });

  botao.disabled = false;
  if (error) {
    // Erro de rede ou funcao ausente nao pode passar por "senha certa",
    // nem ficar calado.
    contagemPinMsg.textContent = 'Não foi possível conferir a senha: ' + error.message;
    console.error('Falha ao conferir a senha de contagem:', error.message);
    return;
  }
  if (data === true) {
    contagemPinMsg.textContent = '';
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
  filtros = { localizacao: '', um: '', padrao: '', zerado: false, comFoto: false, divergente: false, estoqueBaixo: false };
  document.getElementById('statEstoqueBaixoCard').classList.remove('stat-card-ativo');
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


// ===========================================================================
// ETIQUETA DE LOCALIZAÇÃO — só da Trading (unidade 1101)
//
// Uma folha por item, com o endereço em letra de longe, no mesmo desenho da
// folha do Controle EXP (js/programacao.js): tamanhos em MILÍMETROS, porque a
// medida aqui é o papel, e altura de maiúscula ≈ distância de leitura ÷ 200.
// Só entram os dados que a planilha da Trading tem (item, descrição, UM,
// quantidade e localização) -- Robson: "só com os dados que aparece na
// planilha da trading".
// ===========================================================================

function ehTrading() {
  return unidadeAtual === UNIDADE_TRADING;
}

function marcouTodasAsEtiquetas(rows) {
  return rows.length > 0 && rows.every(r => etiquetasTrading.has(String(r.id)));
}

// O botão diz quantas folhas vão sair ANTES de sair: "Etiquetas (12)" é a
// diferença entre conferir e descobrir no meio da resma.
function atualizarBotaoEtiquetas() {
  const botao = document.getElementById('etiquetaTradingBtn');
  if (!botao) return;
  botao.style.display = ehTrading() ? 'inline-block' : 'none';
  botao.textContent = `🖨️ Etiquetas (${etiquetasTrading.size})`;
  botao.disabled = etiquetasTrading.size === 0;
}

function montarHtmlEtiquetasTrading(linhas) {
  const impressoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const quem = nomeUsuarioAtual || emailUsuarioAtual || '—';
  const etiquetas = linhas.map(r => `
    <section class="etiqueta">
      <div class="etq-topo">
        <span class="etq-marca">TRADING</span>
        <span class="etq-unidade">${escapeHtml(rotuloUnidade(unidadeAtual))}</span>
      </div>
      <div class="etq-item">${escapeHtml(r.item)}</div>
      <div class="etq-desc">${escapeHtml(r.descricao || '')}</div>
      <div class="etq-qtd">${escapeHtml(r.quantidade != null ? r.quantidade : '')}${r.um ? ` <small>${escapeHtml(r.um)}</small>` : ''}</div>
      <div class="etq-local">${escapeHtml(r.localizacao || '—')}</div>
      <div class="etq-rodape">Impresso por ${escapeHtml(quem)} — ${escapeHtml(impressoEm)}</div>
    </section>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Etiquetas Trading — ${new Date().toLocaleDateString('pt-BR')}</title>
<style>
  /* Milímetros, não px: o papel é a medida. Altura de maiúscula ≈ distância
     ÷ 200 -- é a conta que traduz "ler a 3 metros" em corpo de fonte, a mesma
     da folha do Controle EXP.

     PAISAGEM (Robson, 09/09/2026: "coloque em modo paisagem"). Não é só girar
     o papel: na horizontal a linha útil passa de 178mm para 265mm, e é a
     largura que limita a letra da etiqueta -- o endereço é uma linha só e
     comprida. Por isso os corpos subiram junto; deixar os de retrato aqui
     seria desperdiçar exatamente o que a paisagem deu. */
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; margin: 0; }
  .etiqueta {
    box-sizing: border-box; padding: 5mm 6mm; text-align: center;
    /* Uma folha por item: é etiqueta de prateleira, duas na mesma folha
       viram uma folha que ninguém pode colar em lugar nenhum. */
    page-break-after: always; break-after: page;
  }
  .etiqueta:last-child { page-break-after: auto; break-after: auto; }
  .etq-topo {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 0.8mm solid #000; padding-bottom: 2mm; margin-bottom: 4mm;
  }
  .etq-marca { font-size: 12mm; font-weight: 900; letter-spacing: 0.08em; }
  .etq-unidade { font-size: 4mm; color: #333; }
  .etq-item { font-size: 32mm; font-weight: 900; line-height: 1; overflow-wrap: anywhere; }
  .etq-desc { font-size: 9mm; font-weight: 700; line-height: 1.15; margin-top: 3mm; }
  .etq-qtd { font-size: 16mm; font-weight: 800; margin-top: 3mm; }
  .etq-qtd small { font-size: 0.45em; font-weight: 700; }
  /* O endereço é o que se procura de longe na estante -- é o maior de todos.
     40mm e não mais: medido no navegador, "B-01-01-01" nesta fonte/peso ocupa
     5,98em (o hífen é ponto de quebra natural), e nos 265mm úteis da paisagem
     qualquer corpo acima de ~44mm parte o endereço em duas linhas -- "B-01-01-"
     numa e "01" na outra, que é pior que letra menor. Em 40mm lê-se a quase 6
     metros, bem além dos 3 pedidos. */
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

function imprimirEtiquetasTrading(linhas) {
  if (!linhas.length) return;
  const aba = window.open('', '_blank');
  if (!aba) { alert('O navegador bloqueou a nova aba. Libere pop-ups pra este site e tente de novo.'); return; }
  aba.document.write(montarHtmlEtiquetasTrading(linhas));
  aba.document.close();
}

// Marcar/desmarcar linha e "marcar todas" mexem só no Set e redesenham --
// nada vai pro banco: etiqueta é papel, não é estado do item.
document.getElementById('tableBody').addEventListener('change', (e) => {
  const check = e.target.closest('.etq-check');
  if (!check) return;
  if (check.checked) etiquetasTrading.add(check.dataset.id);
  else etiquetasTrading.delete(check.dataset.id);
  atualizarBotaoEtiquetas();
  const todas = document.getElementById('etqTodos');
  if (todas) todas.checked = marcouTodasAsEtiquetas(linhasFiltradasAtual);
});

document.querySelector('#dataTable thead').addEventListener('change', (e) => {
  if (e.target.id !== 'etqTodos') return;
  const filtradas = linhasFiltradasAtual;
  if (e.target.checked) filtradas.forEach(r => etiquetasTrading.add(String(r.id)));
  else filtradas.forEach(r => etiquetasTrading.delete(String(r.id)));
  atualizarBotaoEtiquetas();
  applyFilterAndSort();
});

document.getElementById('etiquetaTradingBtn').addEventListener('click', () => {
  const linhas = currentData.filter(r => etiquetasTrading.has(String(r.id)));
  if (!linhas.length) return;
  // Sai UMA folha por item -- com a lista inteira marcada isso é resma, e
  // quem clicou merece saber disso antes, não pela impressora.
  if (linhas.length > 10 &&
      !confirm(`Vão sair ${linhas.length} folhas, uma por item. Continuar?`)) return;
  imprimirEtiquetasTrading(linhas);
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

// Localização filtra ao digitar, sem precisar de "Aplicar filtros" -- mesmo
// padrão do campo de busca (#searchBox). Robson, 10/09/2026, digitando "CANT"
// na contagem: "quando eu escrever CANT aparecer todos" / "faça para as
// outras localizações também" / "deixe bem inteligente". Já era um filtro
// por trecho (`.includes()`, ver applyFilterAndSort) -- "CANT" já batia com
// "CANT A-01" e "CANT B-03" ao mesmo tempo; faltava só reagir à digitação em
// vez de esperar o clique no botão, que é o que fazia parecer que não
// "aparecia tudo" (o painel ficava mostrando o filtro de antes até clicar).
document.getElementById('filterLocalizacao').addEventListener('input', (e) => {
  filtros.localizacao = e.target.value;
  pagina = 1;
  atualizarBadgeFiltros();
  applyFilterAndSort();
});

document.getElementById('filterClearAllBtn').addEventListener('click', () => {
  filtros = { localizacao: '', um: '', padrao: '', zerado: false, comFoto: false, divergente: false, estoqueBaixo: false };
  document.getElementById('statEstoqueBaixoCard').classList.remove('stat-card-ativo');
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

// So o cabecalho da Consulta de Itens ordena. Antes era `thead th` sem
// recorte, e o clique em qualquer OUTRA tabela do portal caia aqui:
// `th.dataset.key` vinha undefined, as flechas desta tabela eram apagadas e
// `th.querySelector('.arrow')` era null -- TypeError.
document.querySelectorAll('#dataTable thead th').forEach(th => {
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

pinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('pinSubmitBtn').click();
});

document.getElementById('pinSubmitBtn').addEventListener('click', async () => {
  const botao = document.getElementById('pinSubmitBtn');
  pinMsg.textContent = 'Conferindo...';
  botao.disabled = true;

  const { data, error } = await sb.rpc('pin_edicao_confere',
    { uni: unidadeAtual, tentativa: pinInput.value });

  botao.disabled = false;
  if (error) {
    pinMsg.textContent = 'Não foi possível conferir o PIN: ' + error.message;
    console.error('Falha ao conferir o PIN de edição:', error.message);
    return;
  }
  if (data === true) {
    pinMsg.textContent = '';
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
  const itens = parsePastedTsv(pasteArea.value);
  if (itens.length === 0) {
    saveMsg.textContent = 'Nenhum item válido encontrado no texto colado.';
    saveMsg.className = 'status-msg status-err';
    return;
  }
  saveMsg.textContent = 'Salvando no banco de dados...';
  saveMsg.className = 'status-msg';

  // Uma chamada, uma transação. Antes eram duas -- delete e depois insert --
  // e duas chamadas do navegador nunca serão uma transação: se o insert
  // falhasse depois de o delete passar, a unidade ficava SEM ESTOQUE e não
  // havia rollback (AUDITORIA.md, item A2). Agora o delete e o insert vivem
  // dentro de substituir_estoque() no banco: falha qualquer linha, nada muda.
  const { data, error } = await sb.rpc('substituir_estoque', {
    payload: [{ unidade: unidadeAtual, atualizado_por: nomeUsuarioAtual, itens }]
  });

  if (error) {
    saveMsg.textContent = 'NÃO SALVOU: ' + error.message
      + ' — nada foi alterado, o estoque anterior continua no lugar.';
    saveMsg.className = 'status-msg status-err';
    console.error('Falha ao substituir o estoque da unidade:', error.message);
    return;
  }
  saveMsg.textContent = `Atualizado! ${itens.length} itens da Unidade ${unidadeAtual} publicados para todos que abrirem o link.`
    + avisoEstoqueMinimoNaoPreservado(data);
  saveMsg.className = 'status-msg status-ok';
  await loadData();
});

// Se algum item tinha Estoque Seguro configurado e não achou par na
// planilha nova (código de item com formatação diferente entre uma
// exportação e outra, por exemplo), o casamento em substituir_estoque()
// (sql/fase12) fica pra trás pra aquele item -- sem isso o app fica calado
// e a perda só aparece dias depois, quando alguém reparar. Ver
// estoque_minimo_existia_antes/estoque_minimo_preservado no retorno da RPC.
function avisoEstoqueMinimoNaoPreservado(resultadoRpc) {
  const unidades = (resultadoRpc && resultadoRpc.unidades) || [];
  const comPerda = unidades.filter(u =>
    (u.estoque_minimo_existia_antes || 0) > (u.estoque_minimo_preservado || 0));
  if (!comPerda.length) return '';
  return ' ⚠️ ATENÇÃO: ' + comPerda.map(u =>
    `${u.estoque_minimo_existia_antes - u.estoque_minimo_preservado} item(ns) da unidade ${u.unidade} tinha(m) Estoque Seguro configurado e não achou par na planilha nova (código de item pode ter mudado de formatação) — precisa reconferir.`
  ).join(' ');
}

// Chamada pelo seletor de unidade do cabecalho (js/navegacao.js). Antes era
// um listener nos botoes de unidade, que sairam do layout na Fase 2b.
async function trocarUnidade(cod) {
  if (!UNIDADES[cod] || cod === unidadeAtual) return;
  const estavaContando = modoContagemAtivo;
  unidadeAtual = cod;
  atualizarSubtituloUnidade();
  document.getElementById('searchBox').value = '';
  sortKey = null;
  filtros = { localizacao: '', um: '', padrao: '', zerado: false, comFoto: false, divergente: false, estoqueBaixo: false };
  const cardBaixo = document.getElementById('statEstoqueBaixoCard');
  if (cardBaixo) cardBaixo.classList.remove('stat-card-ativo');
  atualizarBadgeFiltros();
  if (modoContagemAtivo) desativarModoContagem();
  await loadData();
  await atualizarBotaoEditar();
  // Trocar a unidade tem de recarregar a tela ABERTA, nao so o estoque geral.
  // Sem isto, quem estava no Estoque de Aco trocava de unidade e continuava
  // vendo as bobinas da anterior (bug de 08/09/2026).
  if (paginaAtual === 'bobinas') await loadBobinas();
  if (paginaAtual === 'analise') await carregarAnalise();
  if (paginaAtual === 'requisicao') await carregarRequisicao();
  // Se a contagem estava ativa e a unidade ja foi desbloqueada nesta sessao,
  // mantem ativa sem pedir a senha de novo.
  if (estavaContando && unidadeDesbloqueada(unidadeAtual)) {
    await ativarModoContagem();
  }
}

