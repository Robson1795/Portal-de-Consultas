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

  const [demanda, estoque] = await Promise.all([
    sb.from('analise_demanda').select('*').eq('unidade', unidadeAtual),
    sb.from('estoque').select('item, quantidade').eq('unidade', unidadeAtual)
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
  // tela mandaria comprar o que já tem.
  analiseSaldoMap = new Map();
  (estoque.error ? [] : (estoque.data || [])).forEach(r => {
    const atual = analiseSaldoMap.get(r.item) || 0;
    analiseSaldoMap.set(r.item, atual + parseQtd(r.quantidade));
  });

  renderAnalise();
}

// ---- O cálculo ----------------------------------------------------------
// Uma linha por ITEM, somando o que todos os pedidos juntos precisam dele.
// É esse total que responde "não vou ter pra atender todos" -- item a item,
// pedido a pedido, cada um caberia; junto é que falta.
function agruparAnalise() {
  const porItem = new Map();

  analiseDemanda.forEach(l => {
    const chave = String(l.codigo_item || '').trim();
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
  let linhas = agruparAnalise();
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

// ---- Tela ---------------------------------------------------------------
function renderAnalise() {
  const corpo = document.getElementById('analiseBody');
  const vazio = document.getElementById('analiseVazio');
  const linhas = linhasFiltradasAnalise();
  const todas = agruparAnalise();
  const faltando = todas.filter(l => l.comprar > 0);

  document.getElementById('analiseResumo').innerHTML = analiseDemanda.length
    ? `<b>${numeroBR(todas.length)}</b> item(ns) na análise · `
      + `<b style="color:${faltando.length ? '#991b1b' : '#166534'};">${numeroBR(faltando.length)}</b> sem saldo pra atender tudo · `
      + `${numeroBR(analiseDemanda.length)} linha(s) de pedido`
    : '';

  vazio.style.display = linhas.length ? 'none' : 'block';
  if (!linhas.length) {
    vazio.textContent = analiseDemanda.length
      ? 'Nenhum item bate com a busca / filtro.'
      : 'Nenhuma planilha de pedidos colada ainda. Use "Colar planilha de pedidos" acima.';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = linhas.map(l => {
    const falta = l.comprar > 0;
    return `
    <tr${falta ? ' style="background:#fef2f2;"' : ''}>
      <td class="item">${escapeHtml(l.codigo_item)}</td>
      <td>${escapeHtml(l.descricao || '—')}</td>
      <td class="loc">${escapeHtml(l.um || '—')}</td>
      <td class="num">${numeroBR(l.pedido)}</td>
      <td class="num">${numeroBR(l.saldo)}</td>
      <td class="num" style="font-weight:700; color:${falta ? '#991b1b' : '#166534'};">
        ${falta ? '−' + numeroBR(l.comprar) : '+' + numeroBR(l.sobra)}</td>
      <td class="num" style="font-weight:800; color:#991b1b;">${falta ? numeroBR(l.comprar) : '—'}</td>
      <td class="loc" title="${escapeHtml([...l.pedidos].join(', '))}">${numeroBR(l.qtdPedidos)}</td>
      <td class="loc">${escapeHtml(l.primeiroEmbarqueTexto || '—')}</td>
    </tr>`;
  }).join('');
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
                                  'Qtd. pedidos', 'Pedidos', '1º embarque'];

function linhasExportacaoAnalise() {
  return linhasFiltradasAnalise().map(l => [
    l.codigo_item, l.descricao || '', l.um || '',
    l.pedido, l.saldo, l.sobra, l.comprar,
    l.qtdPedidos, [...l.pedidos].join(', '), l.primeiroEmbarqueTexto || ''
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
