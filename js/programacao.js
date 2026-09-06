// Portal de Estoque Kingspan Isoeste — Programação de Separação
//
// Une as duas planilhas manuais que hoje vivem separadas, cruzando pelo
// NÚMERO DO PEDIDO:
//
//   Planilha A (PCP-FOR-001)  -> os itens de cada pedido   -> pedido_itens
//   Planilha B (programados)  -> a grade de carregamento   -> colunas de `pedidos`
//
// Três abas do mesmo fluxo: separar -> endereçar -> carregar.
//
// Por que as duas viram a MESMA tabela `pedidos`: o número do pedido é o
// mesmo nas duas planilhas. Duas tabelas de pedido dariam duas verdades
// sobre o mesmo pedido -- e o cruzamento (que é o motivo deste módulo
// existir) viraria um join frágil em vez de uma linha só.
//
// ⚠️ Escrita e leitura são limitadas pela unidade da pessoa no RLS
// (sql/programacao-01-tabelas-e-rls.sql). Esta tela não filtra por unidade
// de propósito: filtrar aqui daria a impressão de que a tela é que protege.

let progAbaAtual = 'separacao';
let progImportAba = 'A';
let progPedidos = [];       // vw_pedidos_prioridade (pedido + contagem de itens)
let progItens = [];         // pedido_itens dos pedidos carregados

// ---- Carga da tela ---------------------------------------------------------
async function carregarProgramacao() {
  const msg = document.getElementById('progMsg');
  msg.textContent = '';
  msg.className = 'status-msg';

  if (!unidadeAtual) {
    msg.textContent = 'Sua conta ainda não tem unidade definida. Peça ao administrador.';
    msg.className = 'status-msg status-err';
    return;
  }

  const [pedidos, itens] = await Promise.all([
    sb.from('vw_pedidos_prioridade').select('*'),
    sb.from('pedido_itens').select('*').order('seq', { ascending: true })
  ]);

  if (pedidos.error) return falhaProgramacao(pedidos.error.message);
  if (itens.error)  return falhaProgramacao(itens.error.message);

  progPedidos = pedidos.data || [];
  progItens = itens.data || [];

  renderSeparacao();
  renderExp();
  renderCarregamento();
}

function falhaProgramacao(mensagem) {
  const msg = document.getElementById('progMsg');
  msg.textContent = 'Não foi possível carregar a programação: ' + mensagem
    + ' — se a mensagem falar em tabela inexistente, os scripts sql/programacao-*.sql ainda não foram rodados no Supabase.';
  msg.className = 'status-msg status-err';
  console.error('Falha ao carregar programação:', mensagem);
}

// ---- Sub-abas ---------------------------------------------------------------
document.getElementById('progAbas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-prog-aba]');
  if (b) trocarAbaProgramacao(b.dataset.progAba);
});

function trocarAbaProgramacao(aba) {
  progAbaAtual = aba;
  document.querySelectorAll('#progAbas [data-prog-aba]').forEach(b => {
    b.className = b.dataset.progAba === aba ? 'btn btn-primary' : 'btn';
  });
  document.getElementById('progSeparacao').style.display = aba === 'separacao' ? 'block' : 'none';
  document.getElementById('progExp').style.display = aba === 'exp' ? 'block' : 'none';
  document.getElementById('progCarregamento').style.display = aba === 'carregamento' ? 'block' : 'none';
}

document.getElementById('progAtualizarBtn').addEventListener('click', carregarProgramacao);

// ---- Helpers ----------------------------------------------------------------
// 'separado' e 'reportado' contam os dois como concluído: a planilha A traz o
// status como o rótulo único "SEPARADO/REPORTADO". Se um dia "reportado" virar
// um estágio anterior, é só tirar daqui e do gatilho no SQL.
function itemConcluido(item) {
  return item.status_separacao === 'separado' || item.status_separacao === 'reportado';
}

function pedidoDoNumero(numero) {
  return progPedidos.find(p => p.numero_pedido === numero);
}

function itensDoPedido(pedidoId) {
  return progItens.filter(i => i.pedido_id === pedidoId);
}

function horaCurta(hora) {
  return hora ? String(hora).slice(0, 5) : '—';
}

function dataCurta(data) {
  if (!data) return '—';
  const [ano, mes, dia] = String(data).split('-');
  return (ano && mes && dia) ? `${dia}/${mes}` : String(data);
}

// ---- Aba 1: Separação -------------------------------------------------------
function renderSeparacao() {
  const total = progItens.length;
  const concluidos = progItens.filter(itemConcluido).length;
  document.getElementById('progTotalItens').textContent = total.toLocaleString('pt-BR');
  document.getElementById('progPendentes').textContent = (total - concluidos).toLocaleString('pt-BR');
  document.getElementById('progSeparados').textContent = concluidos.toLocaleString('pt-BR');

  const busca = document.getElementById('progBusca').value.trim().toLowerCase();
  const filtro = document.getElementById('progFiltroStatus').value;

  let linhas = progItens.map(i => {
    const pedido = progPedidos.find(p => p.id === i.pedido_id);
    return { item: i, pedido };
  });

  if (busca) {
    linhas = linhas.filter(({ item, pedido }) =>
      String(pedido && pedido.numero_pedido).toLowerCase().includes(busca) ||
      String(pedido && pedido.cliente).toLowerCase().includes(busca) ||
      String(item.codigo_item).toLowerCase().includes(busca) ||
      String(item.descricao).toLowerCase().includes(busca));
  }
  if (filtro === 'aguardando') linhas = linhas.filter(({ item }) => !itemConcluido(item));
  if (filtro === 'separado')   linhas = linhas.filter(({ item }) => itemConcluido(item));

  const corpo = document.getElementById('progItensBody');
  const vazio = document.getElementById('progItensVazio');
  document.getElementById('progTabelaItens').style.display = linhas.length ? 'table' : 'none';
  vazio.style.display = linhas.length ? 'none' : 'block';
  if (!linhas.length) {
    vazio.textContent = progItens.length
      ? 'Nenhum item bate com o filtro.'
      : 'Nenhum item importado ainda. Use "Importar planilhas".';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = linhas.map(({ item, pedido }) => {
    const feito = itemConcluido(item);
    return `
    <tr>
      <td class="item">${escapeHtml(pedido ? pedido.numero_pedido : '—')}</td>
      <td>${escapeHtml(pedido && pedido.cliente ? pedido.cliente : '—')}</td>
      <td class="loc">${escapeHtml(item.seq != null ? item.seq : '—')}</td>
      <td class="item">${escapeHtml(item.codigo_item || '—')}</td>
      <td>${escapeHtml(item.descricao || '—')}</td>
      <td class="loc">${escapeHtml(item.unidade_medida || '—')}</td>
      <td class="num">${escapeHtml(item.quantidade != null ? item.quantidade : '—')}</td>
      <td class="loc">${escapeHtml(item.numero_os_op || '—')}</td>
      <td><span class="cfg-status ${feito ? 'st-ativo' : 'st-pendente'}">${feito ? 'Separado' : 'Pendente'}</span></td>
      <td class="col-acoes">
        <button class="btn prog-alternar" data-id="${escapeHtml(item.id)}">
          ${feito ? 'Desmarcar' : 'Marcar separado'}
        </button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('progBusca').addEventListener('input', renderSeparacao);
document.getElementById('progFiltroStatus').addEventListener('change', renderSeparacao);

document.getElementById('progItensBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.prog-alternar');
  if (!btn) return;
  await alternarItemSeparado(btn.dataset.id, btn);
});

async function alternarItemSeparado(itemId, botao) {
  const item = progItens.find(i => String(i.id) === String(itemId));
  if (!item) return;
  const msg = document.getElementById('progMsg');
  const novo = itemConcluido(item) ? 'aguardando' : 'separado';
  const concluindo = novo === 'separado';

  botao.disabled = true;
  const { error } = await sb.from('pedido_itens').update({
    status_separacao: novo,
    separado_por: concluindo ? userIdAtual : null,
    separado_em: concluindo ? new Date().toISOString() : null
  }).eq('id', item.id);
  botao.disabled = false;

  if (error) {
    // O cliente do Supabase devolve { error } em vez de lançar: sem conferir,
    // a linha ficaria verde na tela sem ter gravado. AUDITORIA.md, item A1.
    msg.textContent = 'NÃO SALVOU: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  item.status_separacao = novo;
  await registrarLogProgramacao(item.pedido_id, 'item_separado', { item_id: item.id, status: novo });
  // O gatilho no banco recalcula pedidos.status_geral -- recarrega para a aba
  // EXP refletir o status consolidado novo.
  await carregarProgramacao();
}

async function registrarLogProgramacao(pedidoId, evento, detalhe) {
  const { error } = await sb.from('log_movimentacao').insert({
    pedido_id: pedidoId, evento, usuario_id: userIdAtual, detalhe: detalhe || null
  });
  // Log é rastreabilidade, não regra de negócio: se falhar, a ação principal
  // já aconteceu e não deve ser desfeita.
  if (error) console.error('Falha ao gravar log da programação:', error.message);
}

// ---- Aba 2: EXP Acessórios (visão cruzada) ----------------------------------
// Status consolidado do pedido, calculado dos itens da Planilha A:
//   SEM ACESSÓRIOS      -> pedido está na grade de carregamento mas não tem
//                          nenhum item na Planilha A
//   PENDENTE            -> nenhum item separado ainda
//   PARCIAL             -> alguns separados
//   TOTALMENTE SEPARADO -> todos
function statusConsolidado(pedido) {
  const itens = itensDoPedido(pedido.id);
  if (!itens.length) return { chave: 'sem', rotulo: 'Sem acessórios', classe: 'st-inativo' };
  const feitos = itens.filter(itemConcluido).length;
  if (feitos === 0) return { chave: 'pendente', rotulo: 'Pendente', classe: 'st-pendente' };
  if (feitos < itens.length) return { chave: 'parcial', rotulo: 'Parcial', classe: 'st-pendente' };
  return { chave: 'total', rotulo: 'Totalmente separado', classe: 'st-ativo' };
}

function renderExp() {
  // Só os pedidos que estão na grade de carregamento (vieram da Planilha B).
  const naGrade = progPedidos.filter(p => p.horario_carregamento || p.tipo_veiculo);
  const corpo = document.getElementById('progExpBody');
  const vazio = document.getElementById('progExpVazio');
  vazio.style.display = naGrade.length ? 'none' : 'block';

  corpo.innerHTML = naGrade.map(p => {
    const st = statusConsolidado(p);
    const itens = itensDoPedido(p.id);
    const feitos = itens.filter(itemConcluido).length;
    const destino = [p.cidade, p.uf].filter(Boolean).join('/');
    const podeEnderecar = st.chave === 'total' && p.status_geral !== 'pronto' && p.status_geral !== 'carregado';
    return `
    <tr>
      <td class="item">${escapeHtml(p.numero_pedido)}</td>
      <td>${escapeHtml(p.cliente || '—')}${destino ? `<div class="cad-desc">${escapeHtml(destino)}</div>` : ''}</td>
      <td class="loc">${dataCurta(p.data_carregamento)} ${horaCurta(p.horario_carregamento)}
        <div class="cad-desc">${escapeHtml(p.tipo_veiculo || '—')}</div></td>
      <td class="num">${itens.length ? `${feitos} de ${itens.length}` : '—'}</td>
      <td><span class="cfg-status ${st.classe}">${st.rotulo}</span></td>
      <td>
        <input type="text" class="prog-endereco" data-id="${escapeHtml(p.id)}"
               placeholder="Doca 3, Pallet 12..." style="width:150px;">
      </td>
      <td class="col-acoes">
        <button class="btn prog-enderecar" data-id="${escapeHtml(p.id)}" ${podeEnderecar ? '' : 'disabled'}>
          Confirmar endereço
        </button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('progExpBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.prog-enderecar');
  if (!btn) return;
  const id = btn.dataset.id;
  const campo = document.querySelector(`.prog-endereco[data-id="${CSS.escape(id)}"]`);
  const endereco = campo ? campo.value.trim() : '';
  const msg = document.getElementById('progMsg');

  if (!endereco) {
    msg.textContent = 'Informe o endereço na expedição antes de confirmar.';
    msg.className = 'status-msg status-err';
    return;
  }

  btn.disabled = true;
  // Duas escritas: o endereçamento em si e o status do pedido. O unique em
  // exp_acessorios.pedido_id impede duplicata se clicarem duas vezes.
  const { error: erroExp } = await sb.from('exp_acessorios').upsert({
    pedido_id: id, endereco, responsavel_id: userIdAtual, status: 'pronto_para_carregamento'
  }, { onConflict: 'pedido_id' });
  if (erroExp) { btn.disabled = false; return falhaEscrita(erroExp.message); }

  const { error: erroPedido } = await sb.from('pedidos').update({ status_geral: 'pronto' }).eq('id', id);
  if (erroPedido) { btn.disabled = false; return falhaEscrita(erroPedido.message); }

  await registrarLogProgramacao(id, 'endereco_definido', { endereco });
  msg.textContent = 'Endereço confirmado — o pedido foi para a aba Carregamento.';
  msg.className = 'status-msg status-ok';
  await carregarProgramacao();
});

function falhaEscrita(mensagem) {
  const msg = document.getElementById('progMsg');
  msg.textContent = 'NÃO SALVOU: ' + mensagem;
  msg.className = 'status-msg status-err';
  console.error('Falha ao gravar na programação:', mensagem);
}

// ---- Aba 3: Carregamento (grade por bloco e horário) ------------------------
// Observação que contém aviso operacional (SEM NF, não colocar na portaria)
// aparece destacada: é o tipo de recado que, perdido no meio da linha, faz
// caminhão sair errado.
function observacaoCritica(texto) {
  return /sem\s*nf|n[aã]o\s*colocar|portaria|avulso/i.test(String(texto || ''));
}

function renderCarregamento() {
  const naGrade = progPedidos.filter(p => p.horario_carregamento || p.tipo_veiculo);
  const alvo = document.getElementById('progGrade');
  const vazio = document.getElementById('progGradeVazio');
  vazio.style.display = naGrade.length ? 'none' : 'block';
  if (!naGrade.length) { alvo.innerHTML = ''; return; }

  // Agrupa como a planilha original: bloco de veículo, e dentro dele, horário.
  const blocos = {};
  naGrade.forEach(p => {
    const veiculo = p.tipo_veiculo || 'Sem veículo definido';
    const hora = horaCurta(p.horario_carregamento);
    blocos[veiculo] = blocos[veiculo] || {};
    blocos[veiculo][hora] = blocos[veiculo][hora] || [];
    blocos[veiculo][hora].push(p);
  });

  alvo.innerHTML = Object.keys(blocos).sort().map(veiculo => {
    const horas = blocos[veiculo];
    const corpoHoras = Object.keys(horas).sort().map(hora => `
      <div class="prog-hora">
        <div class="prog-hora-rotulo">${escapeHtml(hora)}</div>
        ${horas[hora].map(p => cardPedidoCarregamento(p)).join('')}
      </div>`).join('');
    return `
      <div class="prog-bloco">
        <div class="prog-bloco-titulo">${escapeHtml(veiculo)}</div>
        ${corpoHoras}
      </div>`;
  }).join('');
}

function cardPedidoCarregamento(p) {
  const st = statusConsolidado(p);
  const destino = [p.cidade, p.uf].filter(Boolean).join('/');
  const critica = observacaoCritica(p.observacao_carregamento);
  const carregado = p.status_geral === 'carregado';
  // cor_origem veio da planilha só como destaque visual herdado -- não entra
  // em nenhuma regra. Vira uma borda colorida e nada mais.
  const borda = p.cor_origem ? ` style="border-left:4px solid ${corDaOrigem(p.cor_origem)};"` : '';
  return `
    <div class="prog-card${carregado ? ' prog-card-feito' : ''}"${borda}>
      <div class="prog-card-topo">
        <b>${escapeHtml(p.numero_pedido)}</b>
        <span class="cfg-status ${st.classe}">${st.rotulo}</span>
        ${p.modalidade_frete ? `<span class="cad-um">${escapeHtml(p.modalidade_frete)}</span>` : ''}
      </div>
      <div class="cad-desc">${escapeHtml(p.cliente || '—')}${destino ? ' · ' + escapeHtml(destino) : ''}</div>
      ${p.observacao_carregamento
        ? `<div class="${critica ? 'prog-obs-critica' : 'cad-desc'}">${critica ? '⚠️ ' : ''}${escapeHtml(p.observacao_carregamento)}</div>`
        : ''}
      <div class="prog-card-acoes">
        ${carregado
          ? '<span class="cfg-status st-inativo">Saída registrada</span>'
          : `<button class="btn prog-saida" data-id="${escapeHtml(p.id)}"
                     ${p.status_geral === 'pronto' ? '' : 'disabled'}
                     title="${p.status_geral === 'pronto' ? '' : 'Confirme o endereço na aba EXP Acessórios primeiro'}">
               Registrar saída
             </button>`}
      </div>
    </div>`;
}

function corDaOrigem(nome) {
  const mapa = { amarelo: '#f0c419', rosa: '#ec4899', verde: '#2f9e5c', azul: '#0369a1', laranja: '#d97706', vermelho: '#b91c1c' };
  return mapa[String(nome).toLowerCase()] || '#94a3b8';
}

document.getElementById('progGrade').addEventListener('click', async (e) => {
  const btn = e.target.closest('.prog-saida');
  if (!btn) return;
  const id = btn.dataset.id;
  const pedido = progPedidos.find(p => String(p.id) === String(id));
  if (!pedido) return;

  const conferente = prompt(`Registrar saída do pedido ${pedido.numero_pedido}.\n\nNome do conferente:`, nomeUsuarioAtual || '');
  if (conferente === null) return;
  if (!conferente.trim()) {
    falhaEscrita('o nome do conferente é obrigatório.');
    return;
  }
  const placa = prompt('Placa do veículo (pode deixar em branco):', pedido.placa_veiculo || '') || '';

  btn.disabled = true;
  const { error: erroSaida } = await sb.from('registro_saida').insert({
    pedido_id: id, conferente: conferente.trim(),
    placa_veiculo: placa.trim() || null, registrado_por: userIdAtual
  });
  if (erroSaida) { btn.disabled = false; return falhaEscrita(erroSaida.message); }

  const { error: erroPedido } = await sb.from('pedidos').update({ status_geral: 'carregado' }).eq('id', id);
  if (erroPedido) { btn.disabled = false; return falhaEscrita(erroPedido.message); }

  await registrarLogProgramacao(id, 'saida_registrada', { conferente: conferente.trim(), placa: placa.trim() || null });
  const msg = document.getElementById('progMsg');
  msg.textContent = `Saída do pedido ${pedido.numero_pedido} registrada.`;
  msg.className = 'status-msg status-ok';
  await carregarProgramacao();
});


// ===========================================================================
// IMPORTAÇÃO DAS DUAS PLANILHAS
//
// Colar, e não upload de .xlsx: é o padrão da casa (a Requisição faz igual) e
// o portal não tem etapa de build para carregar uma biblioteca de xlsx.
//
// ⚠️ O QUE SE PERDE AO COLAR: a COR da linha da Planilha B. Cor não sobrevive
// a um Ctrl+C/Ctrl+V -- só ao arquivo .xlsx. Como `cor_origem` é só destaque
// visual herdado, sem regra de negócio, isso não quebra nada: o pedido entra
// sem cor. O que NÃO se perde é o bloco de veículo/horário: célula mesclada
// colada vira o texto na primeira linha e vazio nas seguintes, então o
// "arrastar para baixo" (forward-fill) continua funcionando.
// ===========================================================================
const progImportModal = document.getElementById('progImportModal');

document.getElementById('progImportarBtn').addEventListener('click', () => {
  progImportModal.classList.add('open');
  document.getElementById('progImportData').value = hojeIso();
  trocarAbaImport('A');
});
document.getElementById('progImportCloseBtn').addEventListener('click', () => progImportModal.classList.remove('open'));
progImportModal.addEventListener('click', (e) => {
  if (e.target === progImportModal) progImportModal.classList.remove('open');
});

document.getElementById('progImportAbas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-imp-aba]');
  if (b) trocarAbaImport(b.dataset.impAba);
});

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function trocarAbaImport(aba) {
  progImportAba = aba;
  document.querySelectorAll('#progImportAbas [data-imp-aba]').forEach(b => {
    b.className = b.dataset.impAba === aba ? 'btn btn-primary' : 'btn';
  });
  document.getElementById('progImportFormato').innerHTML = aba === 'A'
    ? 'Colunas, nesta ordem: <b>Nº Pedido, Cliente, Seq, Item, Descrição, UM, Qtde, Nº OS/OP, Observação, Status</b>. Linha em branco entre pedidos é ignorada.'
    : 'Colunas, nesta ordem: <b>Nº Pedido, Cliente, Cidade, UF, Modalidade, Descrição, Quantidade, Valor, Sim/Não, Observação</b>. As linhas de bloco (CARRETA, 07H) podem vir no meio — elas são reconhecidas e aplicadas às linhas abaixo.';
  document.getElementById('progImportTexto').value = '';
  document.getElementById('progImportPrevia').innerHTML = '';
  document.getElementById('progImportMsg').textContent = '';
}

const RE_VEICULO_PROG = /^(carreta|truck|toco|vuc|bitrem|rodotrem|cavalo|van|utilit[aá]rio)/i;
const RE_HORARIO_PROG = /^(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*$/i;

function horarioDoTextoProg(txt) {
  const m = String(txt).trim().match(RE_HORARIO_PROG);
  if (!m) return null;
  const h = m[1].padStart(2, '0');
  const min = (m[2] || '00').padStart(2, '0');
  if (Number(h) > 23 || Number(min) > 59) return null;
  return `${h}:${min}`;
}

// "Sim"/"Não"/vazio -> booleano. Vazio vira null, não false: não sabemos.
function flagDoTextoProg(txt) {
  const t = String(txt || '').trim().toLowerCase();
  if (!t) return null;
  if (/^(sim|s|x|true|verdadeiro|1)$/.test(t)) return true;
  if (/^(n[aã]o|n|false|falso|0)$/.test(t)) return false;
  return null;
}

// Os tres valores que a coluna STATUS da planilha real usa:
//   vazio                 -> aguardando
//   "SEPARADO/REPORTADO"  -> separado
//   "FALTA REPORTE"       -> falta_reporte
//
// "FALTA REPORTE" tem estado proprio de propósito: nao e o mesmo que vazio
// (ninguem mexeu) nem o mesmo que separado (pronto). Ele NAO conta como
// concluido -- ver itemConcluido().
function statusItemDoTexto(txt) {
  const t = String(txt || '').trim().toLowerCase();
  if (!t) return 'aguardando';
  if (/falta\s*report/.test(t)) return 'falta_reporte';
  if (/separad/.test(t)) return 'separado';
  if (/reportad/.test(t)) return 'reportado';
  return 'aguardando';
}

// Linhas de cabecalho/metadado da planilha A que nao sao pedido:
// "ALM", "CÓDIGO: PCP-FOR-001", "TÍTULO: ...", "Revisor: ...", "N° Pedido".
// Sem isto, "ALM" virava um pedido fantasma no banco.
function ehLinhaCabecalhoA(primeiraColuna) {
  const t = String(primeiraColuna || '').trim();
  if (!t) return false;
  return /^(alm|c[óo]digo\s*:|t[íi]tulo\s*:|revisor\s*:|aprovador\s*:|revis[ãa]o\s*:|unidade\s*:)/i.test(t)
      || /^(n?[ºo°]?\s*pedido|pedido)/i.test(t);
}

// "embarque 04/09" na observação -> a data daquele pedido, no lugar da data
// informada no formulário (é mais específica).
function dataDoEmbarque(observacao, dataRef) {
  const m = String(observacao || '').match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return dataRef;
  const dia = m[1].padStart(2, '0');
  const mes = m[2].padStart(2, '0');
  return `${String(dataRef).slice(0, 4)}-${mes}-${dia}`;
}

function lerColadoProg(texto) {
  return texto.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t').map(c => c.trim()));
}

document.getElementById('progImportConfirmBtn').addEventListener('click', async () => {
  const texto = document.getElementById('progImportTexto').value;
  const dataRef = document.getElementById('progImportData').value;
  const msg = document.getElementById('progImportMsg');

  if (!texto.trim()) {
    msg.textContent = 'Cole a planilha primeiro.';
    msg.className = 'status-msg status-err';
    return;
  }
  if (!dataRef) {
    msg.textContent = 'Informe a data de carregamento desta planilha.';
    msg.className = 'status-msg status-err';
    return;
  }

  msg.textContent = 'Lendo...';
  msg.className = 'status-msg';

  const resultado = progImportAba === 'A'
    ? await importarPlanilhaA(lerColadoProg(texto), dataRef)
    : await importarPlanilhaB(lerColadoProg(texto), dataRef);

  if (!resultado) return;
  msg.textContent = resultado;
  msg.className = 'status-msg status-ok';
  await carregarProgramacao();
});

// Assinatura da linha, pra reencontrar o mesmo item numa reimportacao.
// A planilha NAO tem chave: o mesmo pedido repete o mesmo `seq` em todas as
// linhas (KV874472 tem 7 itens, todos seq=10) e ate o mesmo item com a
// mesma OS aparece duas vezes com quantidades diferentes. Entao a unica
// identidade possivel e o conjunto dos campos.
function assinaturaItemA(i) {
  return [i.seq, i.codigo_item, i.numero_os_op, i.quantidade].join('|');
}

async function importarPlanilhaA(linhas, dataRef) {
  const msg = document.getElementById('progImportMsg');
  const itens = [];
  let ignoradas = 0;

  linhas.forEach((col) => {
    const numero = (col[0] || '').trim();
    if (ehLinhaCabecalhoA(numero)) return;
    if (!numero) { ignoradas++; return; }
    const seq = parseInt(col[2], 10);
    itens.push({
      numero_pedido: numero,
      cliente: col[1] || null,
      seq: Number.isFinite(seq) ? seq : null,
      codigo_item: col[3] || null,
      descricao: col[4] || null,
      unidade_medida: col[5] || null,
      quantidade: parseQtd(col[6] || ''),
      numero_os_op: col[7] || null,
      observacao: col[8] || null,
      status_separacao: statusItemDoTexto(col[9])
    });
  });

  if (!itens.length) {
    msg.textContent = 'Nenhuma linha válida. A primeira coluna precisa ser o número do pedido.';
    msg.className = 'status-msg status-err';
    return null;
  }

  // 1) Cabeçalho dos pedidos (um por número), sem sobrescrever o que a
  //    Planilha B já preencheu (cidade, veículo, horário).
  const porPedido = new Map();
  itens.forEach(i => {
    if (!porPedido.has(i.numero_pedido)) {
      porPedido.set(i.numero_pedido, {
        unidade: unidadeAtual,
        numero_pedido: i.numero_pedido,
        cliente: i.cliente,
        data_carregamento: dataDoEmbarque(i.observacao, dataRef)
      });
    }
  });

  const { data: gravados, error: erroPedidos } = await sb.from('pedidos')
    .upsert([...porPedido.values()], { onConflict: 'unidade,numero_pedido' })
    .select('id, numero_pedido');
  if (erroPedidos) { falhaImport(erroPedidos.message); return null; }

  const idPorNumero = new Map((gravados || []).map(p => [p.numero_pedido, p.id]));
  const idsAfetados = [...idPorNumero.values()];

  // 2) Antes de substituir, guarda o que o OPERADOR marcou no app. A planilha
  //    vem do Excel e nao sabe do que foi marcado aqui; sem isso, reimportar
  //    apagaria o trabalho de quem estava separando.
  const marcadoNoApp = new Map();
  if (idsAfetados.length) {
    const { data: antigos } = await sb.from('pedido_itens')
      .select('pedido_id, seq, codigo_item, numero_os_op, quantidade, status_separacao, separado_por, separado_em')
      .in('pedido_id', idsAfetados);
    (antigos || []).forEach(a => {
      if (a.status_separacao && a.status_separacao !== 'aguardando') {
        marcadoNoApp.set(a.pedido_id + '::' + assinaturaItemA(a), a);
      }
    });
  }

  // 3) Substituicao total dos itens desses pedidos. E o mesmo padrao do
  //    modulo de bobinas: sem chave natural, atualizar linha a linha nao e
  //    possivel -- some quem saiu da planilha, entra quem chegou.
  if (idsAfetados.length) {
    const { error: erroDel } = await sb.from('pedido_itens').delete().in('pedido_id', idsAfetados);
    if (erroDel) { falhaImport(erroDel.message); return null; }
  }

  let preservados = 0;
  const paraGravar = itens
    .filter(i => idPorNumero.has(i.numero_pedido))
    .map(i => {
      const pedidoId = idPorNumero.get(i.numero_pedido);
      const linha = {
        pedido_id: pedidoId,
        seq: i.seq, codigo_item: i.codigo_item, descricao: i.descricao,
        unidade_medida: i.unidade_medida, quantidade: i.quantidade,
        numero_os_op: i.numero_os_op, observacao: i.observacao,
        status_separacao: i.status_separacao
      };
      // A planilha manda quando traz status; quando vem vazia, o que o
      // operador ja marcou no app prevalece.
      if (i.status_separacao === 'aguardando') {
        const anterior = marcadoNoApp.get(pedidoId + '::' + assinaturaItemA(i));
        if (anterior) {
          linha.status_separacao = anterior.status_separacao;
          linha.separado_por = anterior.separado_por;
          linha.separado_em = anterior.separado_em;
          preservados++;
        }
      }
      return linha;
    });

  const { error: erroItens } = await sb.from('pedido_itens').insert(paraGravar);
  if (erroItens) { falhaImport(erroItens.message); return null; }

  const avisos = [];
  if (ignoradas) avisos.push(`${ignoradas} linha(s) em branco ou de cabeçalho ignorada(s)`);
  if (preservados) avisos.push(`${preservados} marcação(ões) feita(s) no app preservada(s)`);
  return `${paraGravar.length} item(ns) em ${porPedido.size} pedido(s) importado(s).`
    + (avisos.length ? ' ' + avisos.join('; ') + '.' : '');
}

// Layout real da planilha de carregamento (conferido com a planilha de
// 08/09/2026). O bloco de veiculo e o horario NAO vem em linha propria:
// eles ficam nas duas primeiras colunas da PRIMEIRA linha do bloco, e vem
// vazios nas linhas seguintes -- e o "arrasta" (forward-fill) do Excel.
//
//   col 0  bloco de veiculo + entrega  "TRUCK 8,5M - ENTREGA 09/09"
//   col 1  horario                     "06H"
//   col 2  numero do pedido            "KV875303"
//   col 3  cliente (abreviado)         "PLASSON DO B"
//   col 4  cidade (ja com UF junto)    "CRICIUMA/SC"
//   col 5  UF                          "SC"
//   col 6  modalidade de frete         "CIF"
//   col 7  descricao do produto
//   col 8  quantidade                  "423,07"
//   col 9  valor                       "R$ 52.689,14"
//   col 10 Sim/Nao                     "Não"
//   col 11 observacao                  "Engenharia" / "Avulso" / vazio
//   col 12 vendedor/representante       "RACHEL RUBIANE STOCK"
const COL_B = {
  bloco: 0, horario: 1, pedido: 2, cliente: 3, cidade: 4, uf: 5,
  frete: 6, produto: 7, quantidade: 8, valor: 9, flag: 10,
  observacao: 11, vendedor: 12
};

// "TRUCK 8,5M - ENTREGA 09/09" -> {veiculo: "TRUCK 8,5M", entrega: "09/09"}
// A data de entrega vem grudada no nome do veiculo; sem separar, ela se
// perderia e o pedido usaria so a data digitada no formulario.
function separarBlocoVeiculo(texto) {
  const t = String(texto || '').trim();
  if (!t) return { veiculo: null, entrega: null };
  const m = t.match(/^(.*?)\s*[-–]\s*ENTREGA\s+(\d{1,2})\s*\/\s*(\d{1,2})/i);
  if (m) return { veiculo: m[1].trim(), entrega: `${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}` };
  return { veiculo: t, entrega: null };
}

async function importarPlanilhaB(linhas, dataRef) {
  const msg = document.getElementById('progImportMsg');
  const pedidos = new Map();
  let veiculoAtual = null;
  let horarioAtual = null;
  let entregaAtual = null;
  let ignoradas = 0;

  linhas.forEach((col) => {
    const bloco = (col[COL_B.bloco] || '').trim();
    const horaCol = (col[COL_B.horario] || '').trim();
    const numero = (col[COL_B.pedido] || '').trim();

    // Forward-fill: quando a linha traz bloco/horario, eles passam a valer
    // para ela e para as seguintes ate aparecer o proximo bloco.
    if (bloco) {
      const sep = separarBlocoVeiculo(bloco);
      veiculoAtual = sep.veiculo;
      entregaAtual = sep.entrega;
    }
    if (horaCol) {
      const hora = horarioDoTextoProg(horaCol);
      if (hora) horarioAtual = hora;
    }

    // Titulo da planilha ("PEDIDOS PROGRAMADOS 08/09") e cabecalho.
    if (/^(n?[ºo°]?\s*pedido|pedido)/i.test(numero)) return;
    if (!numero) { ignoradas++; return; }

    // O mesmo pedido aparece em varias linhas (uma por carga/quantidade).
    // Aqui interessa o cabecalho do pedido, entao a ultima linha vence --
    // o upsert recusaria o lote se o mesmo par (unidade, numero) repetisse.
    pedidos.set(numero, {
      unidade: unidadeAtual,
      numero_pedido: numero,
      cliente: col[COL_B.cliente] || null,
      cidade: col[COL_B.cidade] || null,
      uf: (col[COL_B.uf] || '').toUpperCase() || null,
      modalidade_frete: (col[COL_B.frete] || '').toUpperCase() || null,
      tipo_veiculo: veiculoAtual,
      data_carregamento: entregaAtual ? `${String(dataRef).slice(0, 4)}-${entregaAtual}` : dataRef,
      horario_carregamento: horarioAtual,
      observacao_carregamento: col[COL_B.observacao] || null,
      flag_adicional: flagDoTextoProg(col[COL_B.flag])
    });
  });

  if (!pedidos.size) {
    msg.textContent = 'Nenhuma linha válida. A primeira coluna precisa ser o número do pedido.';
    msg.className = 'status-msg status-err';
    return null;
  }

  const lista = [...pedidos.values()];
  const { error } = await sb.from('pedidos').upsert(lista, { onConflict: 'unidade,numero_pedido' });
  if (error) { falhaImport(error.message); return null; }

  const semHorario = lista.filter(p => !p.horario_carregamento).length;
  const avisos = [];
  if (ignoradas) avisos.push(`${ignoradas} linha(s) sem pedido ignorada(s)`);
  if (semHorario) avisos.push(`${semHorario} sem horário (não veio linha de bloco antes)`);
  return `${lista.length} pedido(s) na grade de carregamento.`
    + (avisos.length ? ' ' + avisos.join('; ') + '.' : '');
}

function falhaImport(mensagem) {
  const msg = document.getElementById('progImportMsg');
  msg.textContent = 'Não foi possível importar: ' + mensagem;
  msg.className = 'status-msg status-err';
  console.error('Falha ao importar planilha da programação:', mensagem);
}
