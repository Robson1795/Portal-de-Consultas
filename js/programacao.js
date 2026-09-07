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
let progExpControle = [];   // exp_controle_itens -- localizacao por item, pro inventario
let expCtrlDescMap = new Map(); // codigo_item -> {descricao, um}, resolvido em cascata pra exibir a lista
let catalogoExpItens = []; // catalogo_exp_itens -- planilha do sistema, carregada só ao entrar na página

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

  const [pedidos, itens, expCtrl] = await Promise.all([
    sb.from('vw_pedidos_prioridade').select('*'),
    sb.from('pedido_itens').select('*').order('seq', { ascending: true }),
    sb.from('exp_controle_itens').select('*').order('localizacao', { ascending: true })
  ]);

  if (pedidos.error) return falhaProgramacao(pedidos.error.message);
  if (itens.error)  return falhaProgramacao(itens.error.message);
  // exp_controle_itens e novo (sql/programacao-03-controle-exp.sql) -- se o
  // script ainda nao rodou, o resto da tela continua funcionando; so essa
  // secao fica vazia, com o erro visivel ali em vez de travar a pagina toda.
  progExpControle = expCtrl.error ? [] : (expCtrl.data || []);
  // A tabela nao guarda descricao/UM (decisao consciente, ver o SQL) --
  // busca de novo em cascata pra exibir a lista ja gravada, mesma logica
  // do preview antes de gravar.
  expCtrlDescMap = await buscarDescricoesItens(progExpControle.map(l => l.codigo_item));

  progPedidos = pedidos.data || [];
  progItens = itens.data || [];

  renderSeparacao();
  renderExp();
  renderCarregamento();
  renderExpControle(expCtrl.error ? expCtrl.error.message : null);
  if (!expCtrl.error) renderConferencia(); // barato (so filtra em memoria); sem isso a Conferencia so atualizava ao trocar de sub-aba
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

// ---- Sub-abas do Estoque EXP Acessórios (plataforma própria, entrada/saída) -
let progExpAbaAtual = 'entrada';

document.getElementById('expAbas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-exp-aba]');
  if (b) trocarAbaExpAcessorios(b.dataset.expAba);
});

function trocarAbaExpAcessorios(aba) {
  progExpAbaAtual = aba;
  document.querySelectorAll('#expAbas [data-exp-aba]').forEach(b => {
    b.className = b.dataset.expAba === aba ? 'btn btn-primary' : 'btn';
  });
  // O formulário de registro (Entrada/Saída, os dois modos) não faz
  // sentido na aba Catálogo -- lá só se importa/consulta a planilha do
  // sistema, não se registra movimentação nenhuma.
  document.getElementById('expRegistroContainer').style.display = aba === 'catalogo' ? 'none' : 'block';
  document.getElementById('expEntradaAba').style.display = aba === 'entrada' ? 'block' : 'none';
  document.getElementById('progConferencia').style.display = aba === 'saida' ? 'block' : 'none';
  document.getElementById('expCatalogoAba').style.display = aba === 'catalogo' ? 'block' : 'none';
  if (aba === 'saida') renderConferencia();
}

document.getElementById('expAtualizarBtn').addEventListener('click', carregarProgramacao);

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

// ---- Prioridade (a razao de ser da aba Carregamento) ------------------------
// A view vw_pedidos_prioridade ja calcula tudo isso no banco (mesmo lugar
// pra todo mundo, sem depender do relogio do navegador de cada um). Aqui so
// traduz pra rotulo/cor e decide a ordem -- é isso que faz a Separacao
// mostrar primeiro o pedido cujo caminhao sai antes.
const ROTULO_PRIORIDADE = {
  atrasado: 'Atrasado', urgente: 'Urgente', atencao: 'Atenção',
  no_prazo: 'No prazo', concluido: 'Concluído', sem_agenda: 'Sem agenda'
};
const CLASSE_PRIORIDADE = {
  atrasado: 'st-atrasado', urgente: 'st-urgente', atencao: 'st-atencao',
  no_prazo: 'st-no-prazo', concluido: 'st-ativo', sem_agenda: 'st-inativo'
};

function tagPrioridade(pedido) {
  if (!pedido || !pedido.prioridade) return '';
  const classe = CLASSE_PRIORIDADE[pedido.prioridade] || 'st-inativo';
  const rotulo = ROTULO_PRIORIDADE[pedido.prioridade] || pedido.prioridade;
  return `<span class="cfg-status ${classe}">${escapeHtml(rotulo)}</span>`;
}

// Pedido sem horario (`momento_carregamento` null) vai pro fim -- nao da
// pra dizer que e urgente, mas tambem nao pode sumir da lista.
function compararPorUrgencia(pedidoA, pedidoB) {
  const ta = pedidoA ? pedidoA.momento_carregamento : null;
  const tb = pedidoB ? pedidoB.momento_carregamento : null;
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return new Date(ta) - new Date(tb);
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

  // A razao desta aba existir: separar primeiro o que tem caminhao saindo
  // antes. Ordena pelo pedido (momento_carregamento); dentro do mesmo
  // pedido mantem a ordem que ja vinha (seq), sem embaralhar os itens.
  linhas = [...linhas].sort((a, b) => compararPorUrgencia(a.pedido, b.pedido));

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

  const ROTULO_STATUS_ITEM = { aguardando: 'Pendente', separado: 'Separado', reportado: 'Separado', falta_reporte: 'Falta reporte' };
  const CLASSE_STATUS_ITEM = { aguardando: 'st-pendente', separado: 'st-ativo', reportado: 'st-ativo', falta_reporte: 'st-atencao' };

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
      <td>${escapeHtml(item.observacao || '—')}</td>
      <td><span class="cfg-status ${CLASSE_STATUS_ITEM[item.status_separacao] || 'st-pendente'}">${escapeHtml(ROTULO_STATUS_ITEM[item.status_separacao] || 'Pendente')}</span></td>
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
  // Ordenado pelo mesmo criterio da Separacao: caminhao que sai antes, primeiro.
  const naGrade = progPedidos
    .filter(p => p.horario_carregamento || p.tipo_veiculo)
    .sort(compararPorUrgencia);
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
      <td>${tagPrioridade(p)}</td>
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
    : 'Colunas, nesta ordem: <b>Bloco do veículo, Horário, Nº Pedido, Cliente, Cidade, UF, Modalidade, Descrição, Quantidade, Valor, Sim/Não, Observação, Vendedor</b>. As duas primeiras (bloco e horário) só vêm preenchidas na primeira linha de cada grupo — cole exatamente como está na planilha, sem tirar essas colunas.';
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

// Combina data+hora num numero comparavel, pra achar a carga mais proxima.
// So a hora nao basta: um pedido pode ter carga "10/09 07h" e "09/09 15h"
// -- 15h parece "mais tarde" mas 09/09 e antes de 10/09. Sem data valida
// (nunca deveria acontecer, mas nao trava a importacao por isso), empurra
// pro fim pra nao vencer por engano uma carga que tem data certa.
function instanteCarga(dataIso, horaHhmm) {
  if (!dataIso || !horaHhmm) return Infinity;
  const t = Date.parse(`${dataIso}T${horaHhmm}:00`);
  return Number.isFinite(t) ? t : Infinity;
}

async function importarPlanilhaB(linhas, dataRef) {
  const msg = document.getElementById('progImportMsg');
  const pedidos = new Map();
  const cargasPorPedido = new Map(); // so pra avisar quem tem mais de uma
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

    const dataDaCarga = entregaAtual ? `${String(dataRef).slice(0, 4)}-${entregaAtual}` : dataRef;

    // O mesmo pedido aparece em varias linhas -- e pode estar em cargas de
    // dias e veiculos diferentes (ex.: parte sai 10/09 07h, resto so 09/09
    // 15h). So uma linha de carregamento sobrevive por pedido (sem tabela
    // de cargas nao da pra guardar as duas), entao fica a MAIS PROXIMA no
    // tempo -- e a que decide a urgencia de separar. As demais so contam
    // pro aviso "aparece em mais de uma carga".
    if (cargasPorPedido.has(numero)) {
      cargasPorPedido.set(numero, cargasPorPedido.get(numero) + 1);
    } else {
      cargasPorPedido.set(numero, 1);
    }

    const existente = pedidos.get(numero);
    const instanteNovo = instanteCarga(dataDaCarga, horarioAtual);
    const instanteAtual = existente ? instanteCarga(existente.data_carregamento, existente.horario_carregamento) : Infinity;
    if (existente && instanteAtual <= instanteNovo) return; // a que ja estava guardada e igual ou mais cedo

    pedidos.set(numero, {
      unidade: unidadeAtual,
      numero_pedido: numero,
      cliente: col[COL_B.cliente] || null,
      cidade: col[COL_B.cidade] || null,
      uf: (col[COL_B.uf] || '').toUpperCase() || null,
      modalidade_frete: (col[COL_B.frete] || '').toUpperCase() || null,
      tipo_veiculo: veiculoAtual,
      data_carregamento: dataDaCarga,
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

  const comVariasCargas = [...cargasPorPedido.entries()].filter(([, n]) => n > 1);

  const lista = [...pedidos.values()];
  const { error } = await sb.from('pedidos').upsert(lista, { onConflict: 'unidade,numero_pedido' });
  if (error) { falhaImport(error.message); return null; }

  const semHorario = lista.filter(p => !p.horario_carregamento).length;
  const avisos = [];
  if (ignoradas) avisos.push(`${ignoradas} linha(s) sem pedido ignorada(s)`);
  if (semHorario) avisos.push(`${semHorario} sem horário (não veio linha de bloco antes)`);
  if (comVariasCargas.length) {
    // O app so guarda 1 carga por pedido (a mais proxima). Sem este aviso,
    // ninguem saberia que o pedido tem mais volume saindo depois.
    const detalhe = comVariasCargas.map(([num, n]) => `${num} (${n})`).join(', ');
    avisos.push(`${comVariasCargas.length} pedido(s) em mais de uma carga — mostrando só a mais próxima: ${detalhe}`);
  }
  return `${lista.length} pedido(s) na grade de carregamento.`
    + (avisos.length ? ' ' + avisos.join('; ') + '.' : '');
}

function falhaImport(mensagem) {
  const msg = document.getElementById('progImportMsg');
  msg.textContent = 'Não foi possível importar: ' + mensagem;
  msg.className = 'status-msg status-err';
  console.error('Falha ao importar planilha da programação:', mensagem);
}

// ---- Controle EXP: localizacao por item, pra ajudar o inventario -----------
// Diferente do endereco de pedido (exp_acessorios, 1 por pedido): aqui cada
// ITEM separado ganha seu proprio local, lote e referencia -- um pedido
// pode ter pecas guardadas em lugares diferentes da expedicao.

document.getElementById('expCtrlToggleBtn').addEventListener('click', () => {
  const area = document.getElementById('expCtrlColarArea');
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
});

let expCtrlPendentes = []; // linhas conferidas, aguardando o clique em "Gravar"

function parseExpControleTexto(texto) {
  return texto.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => l.split('\t').map(c => c.trim()))
    .filter(cols => cols[0]) // sem codigo do item, a linha nao serve pra nada
    .map(cols => ({
      codigo_item: cols[0],
      numero_pedido: cols[1] || null,
      quantidade: cols[2] ? parseQtd(cols[2]) : null,
      localizacao: cols[3] || null,
      numero_os_op: cols[4] || null,
      lote: cols[5] || null,
      referencia: cols[6] || null
    }));
}

// Busca a descricao/UM em cascata: primeiro o Catalogo EXP (planilha do
// sistema, ja em memoria -- mais especifico pros itens desta pagina),
// depois o catalogo da Requisicao ALM (itens_requisicao -- o Robson
// cadastra ali, ver js/requisicao.js), depois o estoque (qualquer unidade,
// cobre o que ja esta no almoxarifado e ainda nao foi cadastrado em
// nenhum catalogo). Gravar de novo aqui duplicaria dado que ja existe
// nesses lugares.
async function buscarDescricoesItens(codigos) {
  const unicos = [...new Set(codigos)].filter(Boolean);
  const mapa = new Map();
  if (!unicos.length) return mapa;

  unicos.forEach(c => {
    if (mapa.has(c)) return;
    const doCatalogoExp = catalogoExpItens.find(l => l.codigo_item === c && l.descricao);
    if (doCatalogoExp) mapa.set(c, { descricao: doCatalogoExp.descricao, um: doCatalogoExp.um });
  });

  const faltandoAlm = unicos.filter(c => !mapa.has(c));
  if (faltandoAlm.length) {
    const { data: doCatalogo } = await sb.from('itens_requisicao')
      .select('codigo, descricao, um').in('codigo', faltandoAlm);
    (doCatalogo || []).forEach(r => mapa.set(r.codigo, { descricao: r.descricao, um: r.um }));
  }

  const faltando = unicos.filter(c => !mapa.has(c));
  if (faltando.length) {
    const { data: doEstoque } = await sb.from('estoque')
      .select('item, descricao, um').in('item', faltando);
    (doEstoque || []).forEach(r => {
      if (!mapa.has(r.item)) mapa.set(r.item, { descricao: r.descricao, um: r.um });
    });
  }
  return mapa;
}

document.getElementById('expCtrlConferirBtn').addEventListener('click', async () => {
  const texto = document.getElementById('expCtrlTexto').value;
  const msg = document.getElementById('expCtrlMsg');
  const previa = document.getElementById('expCtrlPrevia');

  const linhas = parseExpControleTexto(texto);
  if (!linhas.length) {
    msg.textContent = 'Cole ao menos uma linha com o código do item.';
    msg.className = 'status-msg status-err';
    previa.innerHTML = '';
    return;
  }

  msg.textContent = 'Buscando descrição dos itens...';
  msg.className = 'status-msg';
  const mapaDescricoes = await buscarDescricoesItens(linhas.map(l => l.codigo_item));

  expCtrlPendentes = linhas.map(l => {
    const achou = mapaDescricoes.get(l.codigo_item);
    return { ...l, descricao: achou ? achou.descricao : null, um: achou ? achou.um : null };
  });

  const semDescricao = expCtrlPendentes.filter(l => !l.descricao).length;
  msg.textContent = `${expCtrlPendentes.length} linha(s) conferida(s).`
    + (semDescricao ? ` ${semDescricao} sem descrição encontrada — confira o código.` : '');
  msg.className = semDescricao ? 'status-msg status-err' : 'status-msg status-ok';

  previa.innerHTML = `
    <table>
      <thead>
        <tr><th>Item</th><th>Descrição</th><th>UM</th><th>Qtd</th><th>Nº Pedido</th><th>Local</th><th>Nº OP</th><th>Lote</th><th>Referência</th></tr>
      </thead>
      <tbody>
        ${expCtrlPendentes.map(l => `
          <tr${l.descricao ? '' : ' style="background:#fee2e2;"'}>
            <td class="item">${escapeHtml(l.codigo_item)}</td>
            <td>${l.descricao ? escapeHtml(l.descricao) : '⚠ não encontrada'}</td>
            <td class="loc">${escapeHtml(l.um || '—')}</td>
            <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
            <td class="loc">${escapeHtml(l.numero_pedido || '—')}</td>
            <td class="loc">${escapeHtml(l.localizacao || '—')}</td>
            <td class="loc">${escapeHtml(l.numero_os_op || '—')}</td>
            <td class="loc">${escapeHtml(l.lote || '—')}</td>
            <td class="loc">${escapeHtml(l.referencia || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="cfg-barra" style="padding:10px 0 0;">
      <button class="btn btn-primary" id="expCtrlGravarBtn">Gravar ${expCtrlPendentes.length} item(ns)</button>
    </div>
  `;
  document.getElementById('expCtrlGravarBtn').addEventListener('click', gravarExpControle);
});

async function gravarExpControle() {
  const msg = document.getElementById('expCtrlMsg');
  const btn = document.getElementById('expCtrlGravarBtn');
  if (btn) btn.disabled = true;

  const linhas = expCtrlPendentes.map(l => ({
    unidade: unidadeAtual,
    numero_pedido: l.numero_pedido,
    codigo_item: l.codigo_item,
    quantidade: l.quantidade,
    localizacao: l.localizacao,
    numero_os_op: l.numero_os_op,
    lote: l.lote,
    referencia: l.referencia,
    registrado_por: nomeUsuarioAtual
  }));

  const { error } = await sb.from('exp_controle_itens').insert(linhas);
  if (btn) btn.disabled = false;

  if (error) {
    msg.textContent = 'NÃO SALVOU: ' + error.message;
    msg.className = 'status-msg status-err';
    console.error('Falha ao gravar Controle EXP:', error.message);
    return;
  }

  msg.textContent = `${linhas.length} item(ns) gravado(s) no Controle EXP.`;
  msg.className = 'status-msg status-ok';
  document.getElementById('expCtrlTexto').value = '';
  document.getElementById('expCtrlPrevia').innerHTML = '';
  expCtrlPendentes = [];
  await carregarProgramacao();
}

function renderExpControle(erroCarregamento) {
  const corpo = document.getElementById('expCtrlBody');
  const vazio = document.getElementById('expCtrlVazio');

  if (erroCarregamento) {
    vazio.style.display = 'block';
    vazio.textContent = 'Não foi possível carregar: ' + erroCarregamento
      + ' — se a mensagem falar em tabela inexistente, sql/programacao-03-controle-exp.sql ainda não foi rodado no Supabase.';
    corpo.innerHTML = '';
    return;
  }

  const busca = document.getElementById('expCtrlBusca').value.trim().toLowerCase();
  let linhas = progExpControle;
  if (busca) {
    linhas = linhas.filter(l =>
      String(l.localizacao).toLowerCase().includes(busca) ||
      String(l.codigo_item).toLowerCase().includes(busca) ||
      String(l.numero_pedido).toLowerCase().includes(busca) ||
      String(l.numero_os_op).toLowerCase().includes(busca));
  }

  vazio.style.display = linhas.length ? 'none' : 'block';
  if (!linhas.length) {
    vazio.textContent = progExpControle.length
      ? 'Nenhum item bate com a busca.'
      : 'Nenhum item registrado no Controle EXP ainda.';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = linhas.map(l => {
    const desc = expCtrlDescMap.get(l.codigo_item);
    const retirado = l.status === 'retirado';
    return `
    <tr${retirado ? ' style="opacity:0.6;"' : ''}>
      <td class="loc"><span class="loc-chip">${escapeHtml(l.localizacao || '—')}</span></td>
      <td class="item">${escapeHtml(l.codigo_item)}</td>
      <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
      <td class="loc">${desc && desc.um ? escapeHtml(desc.um) : '—'}</td>
      <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
      <td class="loc">${escapeHtml(l.numero_pedido || '—')}</td>
      <td class="loc">${escapeHtml(l.numero_os_op || '—')}</td>
      <td class="loc">${escapeHtml(l.lote || '—')}</td>
      <td class="loc">${escapeHtml(l.referencia || '—')}</td>
      <td>${retirado
        ? `<span class="cfg-status st-ativo">Saiu p/ carregamento</span>`
        : `<span class="cfg-status st-pendente">Na expedição</span>`}</td>
      <td class="col-acoes">
        ${retirado ? '' : `<button class="acao-btn expctrl-saida" data-id="${escapeHtml(l.id)}" title="Marcar como retirado para o carregamento">🚚</button>`}
        <button class="acao-btn expctrl-excluir" data-id="${escapeHtml(l.id)}" title="Excluir este registro">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

// Marca que o item saiu da localizacao pro carregamento -- nao apaga o
// registro, so muda o status. E o mesmo registro que fica no historico
// (retirado_por/retirado_em), pra "quando perguntarem, pesquiso pelo
// numero do pedido" (pedido do Robson).
async function marcarSaidaExpControle(id, conferente, novoStatus) {
  const status = novoStatus || 'retirado';
  const patch = status === 'retirado'
    ? { status, retirado_por: conferente, retirado_em: new Date().toISOString() }
    : { status, retirado_por: null, retirado_em: null }; // "desfazer": volta pra na_expedicao
  const { error } = await sb.from('exp_controle_itens').update(patch).eq('id', id);
  if (error) { alert('Não foi possível salvar: ' + error.message); return false; }

  // log_movimentacao.pedido_id e NOT NULL com FK pra pedidos -- exp_controle_itens
  // so guarda o NUMERO do pedido (texto), entao so loga se achar o pedido de
  // verdade na grade carregada agora. Log e so rastreabilidade: sem achar,
  // a acao principal (que ja aconteceu, linha acima) nao e desfeita por isso.
  const item = progExpControle.find(l => l.id === id);
  const pedido = item ? pedidoDoNumero(item.numero_pedido) : null;
  if (item && pedido) {
    await registrarLogProgramacao(pedido.id, status === 'retirado' ? 'item_saiu_expedicao' : 'item_saida_desfeita',
      { exp_controle_id: id, codigo_item: item.codigo_item, numero_pedido: item.numero_pedido, conferente });
  }
  return true;
}

document.getElementById('expCtrlBusca').addEventListener('input', () => renderExpControle(null));

// Digitação manual, item a item -- pra quando o dado nao vem de planilha
// nenhuma (a pessoa esta com o material na mao e so quer registrar o
// local). Duas interfaces (formulario completo e passo-a-passo) chamam
// esta MESMA funcao pra nao duplicar a gravacao.
async function gravarMovimentacaoManual({ codigo, pedido, quantidadeTexto, local, op, lote, ref, tipo }) {
  codigo = (codigo || '').trim();
  if (!codigo) return { ok: false, mensagem: 'Informe o código do item.' };

  const linha = {
    unidade: unidadeAtual,
    numero_pedido: (pedido || '').trim() || null,
    codigo_item: codigo,
    quantidade: (quantidadeTexto || '').trim() ? parseQtd(quantidadeTexto.trim()) : null,
    localizacao: (local || '').trim() || null,
    numero_os_op: (op || '').trim() || null,
    lote: (lote || '').trim() || null,
    referencia: (ref || '').trim() || null,
    registrado_por: nomeUsuarioAtual
  };
  // Tipo de Movimentação decide o status inicial do registro: uma Saída
  // digitada aqui já nasce retirada (o item já foi embora, não precisa
  // esperar a Conferência marcar depois) -- mesma coluna que o botão 🚚 usa.
  if (tipo === 'saida') {
    linha.status = 'retirado';
    linha.retirado_por = nomeUsuarioAtual;
    linha.retirado_em = new Date().toISOString();
  }

  const { error } = await sb.from('exp_controle_itens').insert([linha]);
  if (error) {
    console.error('Falha ao gravar item manual do Controle EXP:', error.message);
    return { ok: false, mensagem: 'NÃO SALVOU: ' + error.message };
  }

  const semDescricao = !(await buscarDescricoesItens([codigo])).get(codigo);
  const rotuloTipo = tipo === 'saida' ? 'Saída' : 'Entrada';
  await carregarProgramacao();
  trocarAbaExpAcessorios(tipo === 'saida' ? 'saida' : 'entrada');
  return {
    ok: true,
    aviso: semDescricao,
    mensagem: `${rotuloTipo} do item ${codigo} salva.` + (semDescricao ? ' ⚠ Descrição não encontrada — confira o código.' : '')
  };
}

// ---- Formulário completo (todos os campos numa tela) -----------------------
document.getElementById('expManualAdicionarBtn').addEventListener('click', async () => {
  const msg = document.getElementById('expManualMsg');
  const btn = document.getElementById('expManualAdicionarBtn');
  const campoItem = document.getElementById('expManualItem');

  btn.disabled = true;
  msg.textContent = 'Salvando...';
  msg.className = 'status-msg';

  const resultado = await gravarMovimentacaoManual({
    codigo: campoItem.value,
    pedido: document.getElementById('expManualPedido').value,
    quantidadeTexto: document.getElementById('expManualQtd').value,
    local: document.getElementById('expManualLocal').value,
    op: document.getElementById('expManualOp').value,
    lote: document.getElementById('expManualLote').value,
    ref: document.getElementById('expManualRef').value,
    tipo: document.getElementById('expManualTipo').value
  });

  btn.disabled = false;
  msg.textContent = resultado.mensagem;
  msg.className = resultado.ok ? (resultado.aviso ? 'status-msg status-err' : 'status-msg status-ok') : 'status-msg status-err';
  if (!resultado.ok) { campoItem.focus(); return; }

  // Item, quantidade e os extras (Referência/Lote/OP) mudam a cada item de
  // verdade -- só Nº Pedido e Localização continuam preenchidos. Os extras
  // voltam escondidos: se o próximo item tiver dados no Catálogo EXP, o
  // blur do campo Item já reabre sozinho.
  document.getElementById('expManualItem').value = '';
  document.getElementById('expManualQtd').value = '';
  document.getElementById('expManualRef').value = '';
  document.getElementById('expManualLote').value = '';
  document.getElementById('expManualOp').value = '';
  document.getElementById('expManualExtras').style.display = 'none';
  document.getElementById('expManualExtrasToggleBtn').textContent = '+ Referência / Lote / Nº da OP';
  document.getElementById('expManualDescricao').textContent = '';
  document.getElementById('expManualCatalogoDica').textContent = '';
  campoItem.focus();
});

document.getElementById('expManualItem').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('expManualAdicionarBtn').click();
});

// ---- Passo-a-passo: um campo grande por tela, "Item" primeiro, na ordem -
// do formulario completo. So o Item e obrigatorio -- Nº da OP, Lote e
// Referencia sao itens de producao que nem todo pedido tem.
const EXP_WIZ_PASSOS = [
  { campo: 'codigo_item',   rotulo: 'Item', obrigatorio: true },
  { campo: 'numero_pedido', rotulo: 'Nº do Pedido' },
  { campo: 'quantidade',    rotulo: 'Quantidade' },
  { campo: 'localizacao',   rotulo: 'Localização' },
  { campo: 'numero_os_op',  rotulo: 'Nº da OP', opcional: true },
  { campo: 'lote',          rotulo: 'Lote', opcional: true },
  { campo: 'referencia',    rotulo: 'Referência', opcional: true }
];

let expWizPasso = 0;
let expWizDados = {};
let expWizDicaCatalogoTexto = ''; // preenchida quando o item bate com o Catálogo EXP

function rotuloTipoAtual() {
  return document.getElementById('expManualTipo').value === 'saida' ? 'Saída' : 'Entrada';
}

function iniciarWizardManual() {
  expWizPasso = 0;
  expWizDados = {};
  expWizDicaCatalogoTexto = '';
  renderWizardPasso();
}

// Passos onde a dica do Catálogo EXP faz sentido mostrar (depois que o
// item já foi digitado) -- não em Item/Pedido/Quantidade, que vêm antes.
const EXP_WIZ_PASSOS_COM_DICA = ['localizacao', 'numero_os_op', 'lote', 'referencia'];

function renderWizardPasso() {
  document.getElementById('expWizMsg').textContent = '';
  if (expWizPasso >= EXP_WIZ_PASSOS.length) { renderWizardRevisao(); return; }

  document.getElementById('expWizRevisao').style.display = 'none';
  const campo = document.getElementById('expWizInput');
  campo.style.display = 'block';

  const passo = EXP_WIZ_PASSOS[expWizPasso];
  document.getElementById('expWizPasso').textContent =
    `${rotuloTipoAtual()} — passo ${expWizPasso + 1} de ${EXP_WIZ_PASSOS.length}: ${passo.rotulo}` + (passo.opcional ? ' (opcional)' : '');
  campo.value = expWizDados[passo.campo] || '';
  campo.placeholder = passo.opcional ? 'Deixe em branco se não tiver' : passo.rotulo;
  document.getElementById('expWizVoltarBtn').disabled = expWizPasso === 0;
  document.getElementById('expWizAvancarBtn').textContent = 'Avançar';

  const dica = document.getElementById('expWizCatalogoDica');
  dica.textContent = EXP_WIZ_PASSOS_COM_DICA.includes(passo.campo) ? expWizDicaCatalogoTexto : '';
  dica.className = 'status-msg';

  campo.focus();
}

function salvarPassoAtual() {
  const passo = EXP_WIZ_PASSOS[expWizPasso];
  const valor = document.getElementById('expWizInput').value.trim();
  if (passo.obrigatorio && !valor) {
    document.getElementById('expWizMsg').textContent = `Informe ${passo.rotulo.toLowerCase()}.`;
    document.getElementById('expWizMsg').className = 'status-msg status-err';
    return false;
  }
  expWizDados[passo.campo] = valor;

  // Assim que o Item é confirmado, já consulta o Catálogo EXP: se só tem 1
  // lote pra esse item, preenche Referência/Lote sozinho (sem sobrescrever
  // o que a pessoa já tiver digitado); se tem vários, guarda o texto de
  // ajuda pra mostrar nos próximos passos.
  if (passo.campo === 'codigo_item') {
    expWizDicaCatalogoTexto = '';
    const lotes = lotesDoItemNoCatalogo(valor);
    if (lotes.length === 1) {
      if (!expWizDados.referencia && lotes[0].referencia) expWizDados.referencia = lotes[0].referencia;
      if (!expWizDados.lote && lotes[0].lote) expWizDados.lote = lotes[0].lote;
      expWizDicaCatalogoTexto = 'Referência/Lote preenchidos do Catálogo EXP (edite se precisar).';
    } else if (lotes.length > 1) {
      expWizDicaCatalogoTexto = `${lotes.length} lotes no Catálogo EXP pra este item — confira qual é: ${textoAjudaLotes(lotes)}`;
    }
  }
  return true;
}

function renderWizardRevisao() {
  document.getElementById('expWizInput').style.display = 'none';
  document.getElementById('expWizPasso').textContent = `${rotuloTipoAtual()} — confira antes de registrar`;
  const rev = document.getElementById('expWizRevisao');
  rev.style.display = 'block';
  rev.innerHTML = EXP_WIZ_PASSOS.map(p =>
    `<div style="display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid var(--border);">
       <span>${escapeHtml(p.rotulo)}</span><b>${escapeHtml(expWizDados[p.campo] || '—')}</b>
     </div>`).join('');
  document.getElementById('expWizVoltarBtn').disabled = false;
  document.getElementById('expWizAvancarBtn').textContent = 'Registrar';
}

document.getElementById('expWizAvancarBtn').addEventListener('click', async () => {
  if (expWizPasso < EXP_WIZ_PASSOS.length) {
    if (!salvarPassoAtual()) return;
    expWizPasso++;
    renderWizardPasso();
    return;
  }

  const btn = document.getElementById('expWizAvancarBtn');
  const msg = document.getElementById('expWizMsg');
  btn.disabled = true;
  msg.textContent = 'Salvando...';
  msg.className = 'status-msg';

  const resultado = await gravarMovimentacaoManual({
    codigo: expWizDados.codigo_item,
    pedido: expWizDados.numero_pedido,
    quantidadeTexto: expWizDados.quantidade,
    local: expWizDados.localizacao,
    op: expWizDados.numero_os_op,
    lote: expWizDados.lote,
    ref: expWizDados.referencia,
    tipo: document.getElementById('expManualTipo').value
  });

  btn.disabled = false;
  msg.textContent = resultado.mensagem;
  msg.className = resultado.ok ? (resultado.aviso ? 'status-msg status-err' : 'status-msg status-ok') : 'status-msg status-err';
  if (!resultado.ok) return;

  // Nº do pedido, localização, OP, lote e referência ficam preenchidos pro
  // próximo item (mesma conveniência do formulário completo); só item e
  // quantidade voltam em branco, porque mudam a cada item de verdade.
  const preservar = {
    numero_pedido: expWizDados.numero_pedido,
    localizacao: expWizDados.localizacao,
    numero_os_op: expWizDados.numero_os_op,
    lote: expWizDados.lote,
    referencia: expWizDados.referencia
  };
  expWizPasso = 0;
  expWizDados = preservar;
  expWizDicaCatalogoTexto = ''; // recalculada quando o próximo item for digitado
  renderWizardPasso(); // limpa expWizMsg -- por isso a mensagem de sucesso é escrita DEPOIS
  msg.textContent = resultado.mensagem;
  msg.className = resultado.aviso ? 'status-msg status-err' : 'status-msg status-ok';
});

document.getElementById('expWizVoltarBtn').addEventListener('click', () => {
  if (expWizPasso === 0) return;
  if (expWizPasso < EXP_WIZ_PASSOS.length) salvarPassoAtual();
  expWizPasso--;
  renderWizardPasso();
});

document.getElementById('expWizInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('expWizAvancarBtn').click(); }
});

// ---- Alternância formulário completo <-> passo-a-passo (celular) ----------
// Em tela pequena entra direto no passo-a-passo (um campo grande de cada
// vez -- mais fácil de digitar com o polegar). A pessoa pode trocar na mão
// a qualquer momento; a escolha fica salva pro próximo acesso. Vem DEPOIS
// das funções do wizard de propósito: aplicarModoManual() pode chamar
// iniciarWizardManual() assim que o script carrega, então essas funções
// (e o const EXP_WIZ_PASSOS) precisam já estar inicializadas nesse ponto.
const CHAVE_MODO_MANUAL_LS = 'expModoManualPref';
let expModoManual = 'completo';

function aplicarModoManual() {
  const wizard = expModoManual === 'wizard';
  document.getElementById('expFormCompleto').style.display = wizard ? 'none' : 'block';
  document.getElementById('expFormWizard').style.display = wizard ? 'block' : 'none';
  document.getElementById('expModoToggleBtn').textContent = wizard ? '🖥️ Tudo de uma vez' : '📱 Passo a passo';
  if (wizard) iniciarWizardManual();
}

document.getElementById('expModoToggleBtn').addEventListener('click', () => {
  expModoManual = expModoManual === 'wizard' ? 'completo' : 'wizard';
  try { localStorage.setItem(CHAVE_MODO_MANUAL_LS, expModoManual); } catch (err) { /* localStorage bloqueado -- so nao lembra */ }
  aplicarModoManual();
});

(function iniciarModoManualPadrao() {
  let salvo = null;
  try { salvo = localStorage.getItem(CHAVE_MODO_MANUAL_LS); } catch (err) { /* segue sem lembrar */ }
  expModoManual = salvo || (window.matchMedia('(max-width: 860px)').matches ? 'wizard' : 'completo');
  aplicarModoManual();
})();

document.getElementById('expCtrlBody').addEventListener('click', async (e) => {
  const btnExcluir = e.target.closest('.expctrl-excluir');
  if (btnExcluir) {
    const confirmado = confirm('Excluir este registro do Controle EXP? Não afeta a separação nem o estoque, só some da lista de localização.');
    if (!confirmado) return;
    const { error } = await sb.from('exp_controle_itens').delete().eq('id', btnExcluir.dataset.id);
    if (error) { alert('Não foi possível excluir: ' + error.message); return; }
    await carregarProgramacao();
    return;
  }
  const btnSaida = e.target.closest('.expctrl-saida');
  if (btnSaida) {
    const ok = await marcarSaidaExpControle(btnSaida.dataset.id, nomeUsuarioAtual);
    if (ok) await carregarProgramacao();
  }
});

// Exportar CSV pra conferir contra o sistema (a planilha real, ou outra
// fonte) -- e o motivo do Robson ter pedido este controle: "tiro a relação
// do sistema e confronto pra ver se as quantidades batem".
document.getElementById('expCtrlExportarBtn').addEventListener('click', () => {
  if (!progExpControle.length) { alert('Nenhum item no Controle EXP para exportar.'); return; }

  const cabecalho = ['Localização', 'Item', 'Nº Pedido', 'Quantidade', 'Nº OP', 'Lote', 'Referência'];
  const linhasCsv = progExpControle.map(l => [
    l.localizacao || '', l.codigo_item, l.numero_pedido || '', l.quantidade != null ? l.quantidade : '', l.numero_os_op || '', l.lote || '', l.referencia || ''
  ]);
  // ; como separador (nao vírgula) porque o numero brasileiro usa vírgula
  // decimal -- Excel PT-BR abre certo direto com ;.
  const csv = [cabecalho, ...linhasCsv]
    .map(linha => linha.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `controle-exp-${unidadeAtual}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---- Aba 4: Conferência EXP (quem retira fisicamente pro carregamento) ----
// O Controle EXP (acima) e a ENTRADA -- onde o item foi guardado. Aqui e a
// SAIDA: o conferente vem, confere fisicamente e retira da localizacao pra
// entregar ao carregamento. Mesma tabela (exp_controle_itens), so muda o
// status -- nunca apaga, porque vira o historico pesquisavel por pedido.

const CHAVE_CONFERENTE_LS = 'confExpNomeConferente';

function nomeConferenteAtual() {
  return document.getElementById('confNomeInput').value.trim();
}

// Lembra o ultimo nome digitado: normalmente e a mesma pessoa conferindo
// varias vezes ao longo do turno, redigitar toda hora seria atrito a toa.
// Cada navegador/aparelho guarda o seu -- nao e autenticacao, so conveniencia.
document.getElementById('confNomeInput').addEventListener('input', (e) => {
  try { localStorage.setItem(CHAVE_CONFERENTE_LS, e.target.value); } catch (err) { /* localStorage bloqueado -- so nao lembra, nao quebra a tela */ }
});
(function restaurarNomeConferente() {
  try {
    const salvo = localStorage.getItem(CHAVE_CONFERENTE_LS);
    if (salvo) document.getElementById('confNomeInput').value = salvo;
  } catch (err) { /* idem */ }
})();

function renderConferencia() {
  const pendentes = progExpControle.filter(l => l.status !== 'retirado');
  const corpo = document.getElementById('confBody');
  const vazio = document.getElementById('confVazio');

  vazio.style.display = pendentes.length ? 'none' : 'block';
  if (!pendentes.length) {
    corpo.innerHTML = '';
  } else {
    // Agrupado por localizacao: e assim que o conferente trabalha -- vai
    // fisicamente numa localizacao e retira tudo que tem la de uma vez.
    const porLocal = new Map();
    pendentes.forEach(l => {
      const chave = l.localizacao || '(sem localização)';
      if (!porLocal.has(chave)) porLocal.set(chave, []);
      porLocal.get(chave).push(l);
    });

    corpo.innerHTML = [...porLocal.entries()].map(([local, itens]) => `
      <div style="border:1px solid var(--border); border-radius:10px; margin-top:12px; overflow:hidden;">
        <div class="cfg-barra">
          <span class="loc-chip">${escapeHtml(local)}</span>
          <span style="font-size:12px; color:var(--muted);">${itens.length} item(ns)</span>
          <button class="btn btn-primary conf-retirar-tudo" data-local="${escapeHtml(local)}" style="margin-left:auto;">
            Confirmar tudo desta localização
          </button>
        </div>
        <div class="scroll-area">
          <table>
            <thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Nº Pedido</th><th>Ação</th></tr></thead>
            <tbody>
              ${itens.map(l => {
                const desc = expCtrlDescMap.get(l.codigo_item);
                return `
                <tr>
                  <td class="item">${escapeHtml(l.codigo_item)}</td>
                  <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
                  <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
                  <td class="loc">${escapeHtml(l.numero_pedido || '—')}</td>
                  <td class="col-acoes">
                    <button class="btn conf-retirar-item" data-id="${escapeHtml(l.id)}">Confirmar retirada</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');
  }

  renderHistoricoRetiradas();
}

document.getElementById('confBody').addEventListener('click', async (e) => {
  const nome = nomeConferenteAtual();
  if (!nome) { alert('Informe o nome de quem está retirando antes de confirmar.'); return; }

  const btnItem = e.target.closest('.conf-retirar-item');
  if (btnItem) {
    btnItem.disabled = true;
    const ok = await marcarSaidaExpControle(btnItem.dataset.id, nome);
    if (ok) await carregarProgramacao();
    else btnItem.disabled = false;
    return;
  }

  const btnLocal = e.target.closest('.conf-retirar-tudo');
  if (btnLocal) {
    const local = btnLocal.dataset.local;
    const itens = progExpControle.filter(l => (l.localizacao || '(sem localização)') === local && l.status !== 'retirado');
    if (!confirm(`Confirmar a retirada de ${itens.length} item(ns) de "${local}"?`)) return;
    btnLocal.disabled = true;
    for (const item of itens) await marcarSaidaExpControle(item.id, nome);
    await carregarProgramacao();
  }
});

// "Se um dia perguntarem quando carregou os materiais, pesquiso por número
// do pedido" -- pedido explicito do Robson. Historico nunca apaga o
// registro, so o marca como retirado; a busca cobre pedido, item e local.
function renderHistoricoRetiradas() {
  const busca = document.getElementById('confHistBusca').value.trim().toLowerCase();
  const corpo = document.getElementById('confHistBody');
  const vazio = document.getElementById('confHistVazio');

  let retirados = progExpControle.filter(l => l.status === 'retirado');
  retirados = [...retirados].sort((a, b) => new Date(b.retirado_em || 0) - new Date(a.retirado_em || 0));

  if (busca) {
    retirados = retirados.filter(l =>
      String(l.numero_pedido).toLowerCase().includes(busca) ||
      String(l.codigo_item).toLowerCase().includes(busca) ||
      String(l.localizacao).toLowerCase().includes(busca));
  }

  vazio.style.display = retirados.length ? 'none' : 'block';
  if (!retirados.length) {
    vazio.textContent = progExpControle.some(l => l.status === 'retirado')
      ? 'Nenhuma retirada bate com a busca.'
      : 'Nenhuma retirada registrada ainda.';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = retirados.map(l => {
    const desc = expCtrlDescMap.get(l.codigo_item);
    const quando = l.retirado_em ? new Date(l.retirado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    return `
    <tr>
      <td class="item">${escapeHtml(l.numero_pedido || '—')}</td>
      <td class="item">${escapeHtml(l.codigo_item)}</td>
      <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
      <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
      <td class="loc"><span class="loc-chip">${escapeHtml(l.localizacao || '—')}</span></td>
      <td>${escapeHtml(l.retirado_por || '—')}
        <button class="acao-btn hist-desfazer" data-id="${escapeHtml(l.id)}" title="Desfazer — volta pra &quot;na expedição&quot;">↺</button>
      </td>
      <td class="loc">${quando}</td>
    </tr>`;
  }).join('');
}

document.getElementById('confHistBusca').addEventListener('input', () => renderHistoricoRetiradas());

document.getElementById('confHistBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.hist-desfazer');
  if (!btn) return;
  if (!confirm('Desfazer esta retirada? O item volta para "na expedição" no Controle EXP.')) return;
  const ok = await marcarSaidaExpControle(btn.dataset.id, null, 'na_expedicao');
  if (ok) await carregarProgramacao();
});

// ---- Catálogo EXP: a planilha que sai do sistema (Item, Descrição, UM, -----
// Depósito, Referência, Lote, Quantidade), colada de vez em quando. Um item
// pode aparecer várias vezes -- cada linha é um LOTE diferente do mesmo
// item -- então isto NÃO é a mesma tabela do Controle EXP (que é por
// movimentação); é só um catálogo de consulta pra ajudar a preencher.
// Carregada uma vez ao entrar na página (não em carregarProgramacao(), que
// roda a cada movimentação registrada -- recarregar isto tudo toda hora
// seria desperdício, é uma tabela grande e muda raramente).

function ehLinhaCabecalhoCatalogoExp(primeiraColuna) {
  return String(primeiraColuna || '').trim().toLowerCase() === 'item';
}

function parseCatalogoExpTexto(texto) {
  return texto.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => l.split('\t').map(c => c.trim()))
    .filter(cols => cols[0] && !ehLinhaCabecalhoCatalogoExp(cols[0]))
    .map(cols => ({
      codigo_item: cols[0],
      descricao: cols[1] || null,
      um: cols[2] || null,
      deposito: cols[3] || null,
      referencia: cols[4] || null,
      lote: cols[5] || null,
      quantidade: cols[6] ? parseQtd(cols[6]) : null
    }));
}

async function carregarCatalogoExp() {
  const { data, error } = await sb.from('catalogo_exp_itens').select('*').eq('unidade', unidadeAtual);
  catalogoExpItens = error ? [] : (data || []);
  renderCatalogoExp(error ? error.message : null);
}

document.getElementById('catalogoExpImportarBtn').addEventListener('click', async () => {
  const texto = document.getElementById('catalogoExpTexto').value;
  const msg = document.getElementById('catalogoExpMsg');
  const btn = document.getElementById('catalogoExpImportarBtn');

  const linhas = parseCatalogoExpTexto(texto);
  if (!linhas.length) {
    msg.textContent = 'Cole ao menos uma linha com o código do item.';
    msg.className = 'status-msg status-err';
    return;
  }

  const confirmado = confirm(`Importar ${linhas.length} linha(s)? Isso substitui TODO o Catálogo EXP desta unidade pelo que está colado agora.`);
  if (!confirmado) return;

  btn.disabled = true;
  msg.textContent = 'Importando...';
  msg.className = 'status-msg';

  const registros = linhas.map(l => ({ unidade: unidadeAtual, ...l, atualizado_por: nomeUsuarioAtual }));

  // Substitui tudo -- a planilha do sistema é a fonte da verdade agora;
  // mesclar com o que tinha antes deixaria lote de item que já saiu do
  // estoque. Mesmo padrão da Planilha A da Programação de Separação.
  const { error: erroDelete } = await sb.from('catalogo_exp_itens').delete().eq('unidade', unidadeAtual);
  if (erroDelete) {
    btn.disabled = false;
    msg.textContent = 'NÃO IMPORTOU: ' + erroDelete.message;
    msg.className = 'status-msg status-err';
    return;
  }

  const { error: erroInsert } = await sb.from('catalogo_exp_itens').insert(registros);
  btn.disabled = false;

  if (erroInsert) {
    msg.textContent = 'NÃO IMPORTOU: ' + erroInsert.message;
    msg.className = 'status-msg status-err';
    console.error('Falha ao importar Catálogo EXP:', erroInsert.message);
    return;
  }

  msg.textContent = `${registros.length} linha(s) importada(s).`;
  msg.className = 'status-msg status-ok';
  document.getElementById('catalogoExpTexto').value = '';
  await carregarCatalogoExp();
});

function renderCatalogoExp(erroCarregamento) {
  const corpo = document.getElementById('catalogoExpBody');
  const vazio = document.getElementById('catalogoExpVazio');
  const contagem = document.getElementById('catalogoExpContagem');

  if (erroCarregamento) {
    vazio.style.display = 'block';
    vazio.textContent = 'Não foi possível carregar: ' + erroCarregamento
      + ' — se a mensagem falar em tabela inexistente, sql/programacao-06-catalogo-exp.sql ainda não foi rodado no Supabase.';
    corpo.innerHTML = '';
    contagem.textContent = '';
    return;
  }

  const busca = document.getElementById('catalogoExpBusca').value.trim().toLowerCase();
  let linhas = catalogoExpItens;
  if (busca) {
    linhas = linhas.filter(l =>
      String(l.codigo_item).toLowerCase().includes(busca) ||
      String(l.descricao).toLowerCase().includes(busca) ||
      String(l.lote).toLowerCase().includes(busca));
  }

  contagem.textContent = `${catalogoExpItens.length} linha(s) no catálogo`
    + (busca ? `, ${linhas.length} na busca` : '');

  vazio.style.display = linhas.length ? 'none' : 'block';
  if (!linhas.length) {
    vazio.textContent = catalogoExpItens.length
      ? 'Nenhuma linha bate com a busca.'
      : 'Nenhum item no Catálogo EXP ainda -- cole a relação do sistema acima.';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = linhas.map(l => `
    <tr>
      <td class="item">${escapeHtml(l.codigo_item)}</td>
      <td>${escapeHtml(l.descricao || '—')}</td>
      <td class="loc">${escapeHtml(l.um || '—')}</td>
      <td class="loc">${escapeHtml(l.referencia || '—')}</td>
      <td class="loc">${escapeHtml(l.lote || '—')}</td>
      <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
    </tr>`).join('');
}

document.getElementById('catalogoExpBusca').addEventListener('input', () => renderCatalogoExp(null));

// Ajuda a preencher Referência/Lote a partir do Catálogo EXP quando a
// pessoa digita o código do item: se só existe 1 lote em estoque pra
// aquele item, preenche sozinho (sem sobrescrever o que já foi digitado);
// se existem vários, mostra a lista pra pessoa escolher na mão -- preencher
// errado sozinho seria pior do que deixar em branco.
function lotesDoItemNoCatalogo(codigo) {
  return catalogoExpItens.filter(l => l.codigo_item === codigo && (l.referencia || l.lote));
}

function textoAjudaLotes(lotes) {
  return lotes.map(l => `${l.lote || '—'} (ref ${l.referencia || '—'}, ${l.quantidade != null ? l.quantidade : '?'} ${l.um || ''})`).join('; ');
}

// Referência/Lote/Nº da OP ficam escondidos por padrão -- só os itens de
// produção têm isso, a maioria do almoxarifado não. Botão manual revela;
// o Catálogo EXP revela sozinho quando confirma que o item tem os dados.
function mostrarExtrasManual() {
  document.getElementById('expManualExtras').style.display = 'block';
  document.getElementById('expManualExtrasToggleBtn').textContent = '− Referência / Lote / Nº da OP';
}

document.getElementById('expManualExtrasToggleBtn').addEventListener('click', () => {
  const extras = document.getElementById('expManualExtras');
  const abrindo = extras.style.display === 'none';
  extras.style.display = abrindo ? 'block' : 'none';
  document.getElementById('expManualExtrasToggleBtn').textContent =
    abrindo ? '− Referência / Lote / Nº da OP' : '+ Referência / Lote / Nº da OP';
});

document.getElementById('expManualItem').addEventListener('blur', async () => {
  const codigo = document.getElementById('expManualItem').value.trim();
  const descricaoEl = document.getElementById('expManualDescricao');
  const dica = document.getElementById('expManualCatalogoDica');
  if (!codigo) { descricaoEl.textContent = ''; dica.textContent = ''; return; }

  const mapaDescricoes = await buscarDescricoesItens([codigo]);
  const achou = mapaDescricoes.get(codigo);
  descricaoEl.textContent = achou && achou.descricao
    ? `${achou.descricao}${achou.um ? ' — ' + achou.um : ''}`
    : '⚠ Descrição não encontrada — confira o código.';
  descricaoEl.className = achou && achou.descricao ? 'status-msg status-ok' : 'status-msg status-err';

  const lotes = lotesDoItemNoCatalogo(codigo);
  if (!lotes.length) { dica.textContent = ''; return; }

  if (lotes.length === 1) {
    const campoRef = document.getElementById('expManualRef');
    const campoLote = document.getElementById('expManualLote');
    if (!campoRef.value.trim() && lotes[0].referencia) campoRef.value = lotes[0].referencia;
    if (!campoLote.value.trim() && lotes[0].lote) campoLote.value = lotes[0].lote;
    mostrarExtrasManual();
    dica.textContent = 'Referência/Lote preenchidos do Catálogo EXP (edite se precisar).';
    dica.className = 'status-msg status-ok';
  } else {
    mostrarExtrasManual();
    dica.textContent = `${lotes.length} lotes no Catálogo EXP pra este item — confira qual é: ${textoAjudaLotes(lotes)}`;
    dica.className = 'status-msg';
  }
});
