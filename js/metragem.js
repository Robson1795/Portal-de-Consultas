// Portal de Estoque Kingspan Isoeste — Contagem por Metragem (16/09/2026)
//
// O Robson: *"quero uma aba que faça contagem PAINEL FRIGO QTD DE PÇS VEZES
// A METRAGEM VEZES 1,13 / EVO/FACHADA QTD DE PÇS VEZES METRAGEM VEZES 1,04 /
// TELHA QUANTIDADE DE PÇS VEZES A METRAGEM, faça avaliando a descrição do
// item"*. Perguntado se calcula em cima de item já cadastrado ou é
// calculadora avulsa (digita na hora): calculadora avulsa.
//
// CALCULADORA, NÃO CADASTRO -- não lê nem grava em tabela nenhuma. Cada
// linha é conta de cabeça (pçs × metragem × fator) que o portal faz em vez
// de fazer na calculadora do celular; fechar a aba e abrir de novo começa
// do zero, de propósito -- é ferramenta de apoio pra um cálculo pontual
// (uma contagem física), não um registro que precise sobreviver.
//
// A CATEGORIA SAI DA DESCRIÇÃO, NÃO DE UM SELECT
//
// "faça avaliando a descrição do item" -- a pessoa digita a descrição como
// ela sai da planilha/etiqueta (ex.: "PAINEL FRIGORÍFICO 50MM ISOWALL"), e
// o portal decide sozinho qual fator aplicar procurando as palavras-chave
// (FRIGO / EVO / FACHADA / TELHA) dentro do texto -- sem acento e sem
// diferenciar maiúscula de minúscula, porque a planilha real não é
// consistente nisso. Item que não bate com nenhuma palavra-chave fica
// marcado "Não reconhecida" e SOMA FORA do total -- calcular um m² errado
// com fator chutado seria pior que avisar que aquela linha precisa de
// atenção manual.

function normalizaTextoMetragem(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// TELHA não tem fator (fator 1 = só pçs × metragem, exatamente como o
// Robson descreveu: "QUANTIDADE DE PÇS VEZES A METRAGEM", sem "vezes" um
// terceiro número).
const CATEGORIAS_METRAGEM = [
  { chave: 'frigo',       rotulo: 'Painel Frigorífico', fator: 1.13, bate: t => t.includes('FRIGO') },
  { chave: 'evo_fachada', rotulo: 'EVO/Fachada',        fator: 1.04, bate: t => t.includes('EVO') || t.includes('FACHADA') },
  { chave: 'telha',       rotulo: 'Telha',              fator: 1,    bate: t => t.includes('TELHA') }
];

function categoriaMetragem(descricao) {
  const t = normalizaTextoMetragem(descricao);
  if (!t) return null;
  return CATEGORIAS_METRAGEM.find(c => c.bate(t)) || null;
}

function calcularLinhaMetragem(linha) {
  const cat = categoriaMetragem(linha.descricao);
  const qtd = parseQtd(linha.qtd || '') || 0;
  const metragem = parseQtd(linha.metragem || '') || 0;
  const m2 = cat ? qtd * metragem * cat.fator : null;
  return { cat, qtd, metragem, m2 };
}

function linhaVaziaMetragem(linha) {
  return !linha.descricao.trim() && !linha.qtd.trim() && !linha.metragem.trim();
}

let metragemProximoId = 1;
let metragemLinhas = [{ id: metragemProximoId++, descricao: '', qtd: '', metragem: '' }];

function formatarM2(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Só as células CALCULADAS são reescritas a cada tecla -- os `<input>` nunca
// são recriados enquanto a pessoa digita, senão o cursor pularia pro fim do
// campo (ou pra fora dele) a cada letra. A tabela inteira só é reconstruída
// quando uma linha é adicionada ou removida (renderLinhasMetragem).
function atualizarCelulasCalculadasMetragem(id) {
  const linha = metragemLinhas.find(l => l.id === id);
  const tr = document.querySelector(`#metragemBody tr[data-linha="${id}"]`);
  if (!linha || !tr) return;
  const { cat, m2 } = calcularLinhaMetragem(linha);

  tr.querySelector('.metragem-categoria').innerHTML = cat
    ? `<span class="cfg-status st-ativo">${escapeHtml(cat.rotulo)}</span>`
    : (linha.descricao.trim() ? '<span class="cfg-status st-pendente">Não reconhecida</span>' : '—');
  tr.querySelector('.metragem-fator').textContent = cat ? cat.fator.toLocaleString('pt-BR') : '—';
  tr.querySelector('.metragem-m2').textContent = m2 !== null ? formatarM2(m2) : '—';
}

function renderLinhasMetragem() {
  const corpo = document.getElementById('metragemBody');
  corpo.innerHTML = metragemLinhas.map(linha => `
    <tr data-linha="${linha.id}">
      <td><input type="text" class="metragem-descricao" data-id="${linha.id}"
                 value="${escapeHtml(linha.descricao)}" placeholder="Ex.: Painel Frigorífico 50mm"
                 style="width:220px;"></td>
      <td class="metragem-categoria">—</td>
      <td class="num"><input type="text" inputmode="decimal" class="metragem-qtd" data-id="${linha.id}"
                 value="${escapeHtml(linha.qtd)}" style="width:70px; text-align:right;"></td>
      <td class="num"><input type="text" inputmode="decimal" class="metragem-metragem" data-id="${linha.id}"
                 value="${escapeHtml(linha.metragem)}" style="width:80px; text-align:right;"></td>
      <td class="num metragem-fator">—</td>
      <td class="num metragem-m2">—</td>
      <td class="col-acoes"><button class="acao-btn metragem-remover" data-id="${linha.id}" title="Remover linha">🗑</button></td>
    </tr>`).join('');
  metragemLinhas.forEach(l => atualizarCelulasCalculadasMetragem(l.id));
}

function atualizarTotaisMetragem() {
  const alvo = document.getElementById('metragemTotais');
  const porCategoria = new Map();
  let totalGeral = 0;
  let semCategoria = 0;

  metragemLinhas.forEach(linha => {
    if (linhaVaziaMetragem(linha)) return;
    const { cat, m2 } = calcularLinhaMetragem(linha);
    if (!cat) { semCategoria++; return; }
    porCategoria.set(cat.chave, (porCategoria.get(cat.chave) || 0) + (m2 || 0));
    totalGeral += m2 || 0;
  });

  const partes = CATEGORIAS_METRAGEM
    .filter(c => porCategoria.has(c.chave))
    .map(c => `${escapeHtml(c.rotulo)}: <b>${formatarM2(porCategoria.get(c.chave))} m²</b>`);

  alvo.innerHTML = (partes.length ? partes.join(' &nbsp;·&nbsp; ') + ' &nbsp;·&nbsp; ' : '')
    + `Total: <b>${formatarM2(totalGeral)} m²</b>`
    + (semCategoria ? ` &nbsp;·&nbsp; <span style="color:var(--aviso-texto);">${semCategoria} linha(s) sem categoria reconhecida, fora do total</span>` : '');
}

document.getElementById('metragemBody').addEventListener('input', (e) => {
  const campo = e.target;
  const id = Number(campo.dataset.id);
  const linha = metragemLinhas.find(l => l.id === id);
  if (!linha) return;

  if (campo.classList.contains('metragem-descricao')) linha.descricao = campo.value;
  else if (campo.classList.contains('metragem-qtd')) linha.qtd = campo.value;
  else if (campo.classList.contains('metragem-metragem')) linha.metragem = campo.value;
  else return;

  atualizarCelulasCalculadasMetragem(id);
  atualizarTotaisMetragem();
});

document.getElementById('metragemBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.metragem-remover');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  metragemLinhas = metragemLinhas.filter(l => l.id !== id);
  // Nunca fica sem nenhuma linha -- uma tabela vazia pareceria quebrada.
  if (!metragemLinhas.length) metragemLinhas.push({ id: metragemProximoId++, descricao: '', qtd: '', metragem: '' });
  renderLinhasMetragem();
  atualizarTotaisMetragem();
});

document.getElementById('metragemAdicionarLinhaBtn').addEventListener('click', () => {
  metragemLinhas.push({ id: metragemProximoId++, descricao: '', qtd: '', metragem: '' });
  renderLinhasMetragem();
  document.querySelector(`#metragemBody tr[data-linha="${metragemLinhas[metragemLinhas.length - 1].id}"] .metragem-descricao`).focus();
});

// ---- Imprimir -- reaproveita montarHtmlTabelaGenerica() (js/programacao.js),
// a mesma função usada pra exportar Entrada/Auditoria em HTML. Sem folha
// gigante nem etiqueta -- é uma lista de conferência, cabe numa tabela só.
document.getElementById('metragemImprimirBtn').addEventListener('click', () => {
  const validas = metragemLinhas.filter(l => !linhaVaziaMetragem(l));
  if (!validas.length) { alert('Nada pra imprimir -- preencha ao menos uma linha.'); return; }

  // Aba aberta ANTES de montar o HTML -- mesma regra de toda folha deste
  // portal (ativação transitória do clique).
  const aba = window.open('', '_blank');
  if (!aba) { alert('O navegador bloqueou a nova aba. Libere pop-ups pra este site e tente de novo.'); return; }

  let totalGeral = 0;
  const linhasTabela = validas.map(l => {
    const { cat, qtd, metragem, m2 } = calcularLinhaMetragem(l);
    if (m2 !== null) totalGeral += m2;
    return [
      l.descricao, cat ? cat.rotulo : 'Não reconhecida', qtd, metragem,
      cat ? cat.fator.toLocaleString('pt-BR') : '—',
      m2 !== null ? formatarM2(m2) : '—'
    ];
  });

  const html = montarHtmlTabelaGenerica({
    titulo: `Contagem por Metragem — ${new Date().toLocaleDateString('pt-BR')}`,
    cabecalho: ['Descrição', 'Categoria', 'Qtd Peças', 'Metragem (m)', 'Fator', 'm²'],
    linhas: linhasTabela,
    subtitulo: ` — Total: ${formatarM2(totalGeral)} m²`,
    imprimir: true,
    // Robson, 17/09/2026: "essa folha sera colada nos fardos no patio" --
    // letra grande e em negrito, porque isso vira etiqueta de fardo, não
    // relatório de mesa.
    grande: true
  });
  aba.document.write(html);
  aba.document.close();
});

renderLinhasMetragem();
atualizarTotaisMetragem();
