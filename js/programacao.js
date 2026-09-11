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
// 'exp' (Controle EXP Acessórios) ou 'benchmark' -- mesma tabela, mesma
// tela, só o que é listado muda (ver linhasDoSetorAtual). Trocado por
// js/navegacao.js ao abrir a página.
//
// ⚠️ 'benchmark' não é mais alcançável pelo menu (10/09/2026): o Robson
// pediu pra trocar o Depósito Benchmark do modelo de pedido/etiqueta do
// Controle EXP para saldo simples, igual ao Almoxarifado/SESMT -- ver
// DEPOSITOS em js/estoque.js e o comentário em PAGINAS.expbenchmark
// (js/navegacao.js). O código daqui pra baixo que trata 'benchmark' fica
// no histórico (mesmo princípio do fase26 em sql/fase26-exp-em-lote.sql:
// função que sobra é pior que código morto só se alguém a chamar de novo
// sem querer -- aqui ninguém mais chama, `setorExpAtual` nunca mais vira
// 'benchmark') -- remover é decisão pra tomar separada, se um dia
// confirmar que não faz falta nenhuma.
let setorExpAtual = 'exp';
// Itens marcados para imprimir na aba Entrada, por id. E um Set, e nao um
// atributo no DOM, porque a tabela e redesenhada inteira a cada tecla da
// busca -- o que foi marcado antes de filtrar tem de continuar marcado
// depois. Mesmo motivo de `etiquetasTrading` em js/estoque.js.
let expCtrlSelecionadas = new Set();
// Filtros da aba Conferir. `situacao` nasce em 'divergentes' -- ver o
// comentario de montarConferirExp().
const filtrosConf = { busca: '', situacao: 'divergentes' };
// Observação e exclusão por item da aba Conferir (sql/fase33-conferir-exp-
// observacao.sql) -- chave normalizada (normalizaCodigoItem), igual à linha
// da tela. "Excluir" aqui NUNCA apaga catalogo_exp_itens/exp_controle_itens:
// é só uma marca (reversível) de "não preciso conferir este item nesta
// unidade" -- Robson, 10/09/2026: "tem itens que são do pátio aí é outra
// equipe". Mesmo padrão do "não repor" da Análise de Compras.
let conferirExpNotas = new Map();
let confVerExcluidos = false; // mostrando a lista dos excluídos em vez da normal
// Chaves (normalizaCodigoItem) marcadas pra ação em lote -- Robson,
// 11/09/2026: "coloque uma caixa de seleção, para que eu selecione os itens
// que eu quero tirar da planilha do exp". Limpa ao trocar de modo (excluídos
// x normal): o significado do botão muda (excluir x restaurar), e manter a
// marcação de um pro outro poderia restaurar/excluir item que a pessoa nem
// estava vendo quando selecionou.
let confSelecionados = new Map(); // chave -> código original do item (p/ gravar em conferir_exp_notas)
// Segundo clique do Imprimir quando a impressão vai passar de LIMITE_FOLHAS.
// Desde 10/09/2026 sai uma folha POR ITEM, então o número de folhas é o
// número de itens -- "Imprimir tudo" numa unidade cheia é resma, e quem
// clicou merece saber pela tela, não pela impressora. Mesma régua da etiqueta
// da Trading.
//
// ⚠️ Não é `confirm()`, de propósito: marcado "impedir que esta página crie
// novos diálogos", o Chrome faz `confirm()` devolver `false` na hora, e num
// `if (!confirm(...)) return` o clique deixa de imprimir sem dizer nada --
// indistinguível de botão quebrado. Aconteceu em 08/09/2026 na aba de lote.
// Ver pedirConfirmacaoLote() em js/configuracoes.js.
// O limite mora em js/estoque.js (LIMITE_FOLHAS_IMPRESSAO), carregado antes:
// e a MESMA regra da etiqueta da Trading, e dois numeros iguais em arquivos
// diferentes sairiam de sincronia na primeira vez que um deles mudasse.
let expImprimirConfirmar = false;
let expCtrlDescMap = new Map(); // codigo_item -> {descricao, um}, resolvido em cascata pra exibir a lista
let catalogoExpItens = []; // catalogo_exp_itens -- planilha do sistema, carregada só ao entrar na página
let expPedidoProntoMap = new Map(); // numero_pedido -> {pronto_em, pronto_por} -- ver marcarPedidoAnteriorComoPronto()
let ultimoPedidoRegistrado = null; // último Nº Pedido gravado nesta sessão, pra detectar troca (ver gravarMovimentacaoManual)

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

  // Filtra por unidade AQUI, no cliente -- não só confia no RLS. O RLS
  // (público admin: eh_admin() or minha_unidade() = unidade) deixa o admin
  // ver TODAS as unidades de propósito (visão geral) -- então sem este
  // filtro, uma conta admin vendo a tela via o seletor de unidade do topo
  // via TODOS os pedidos/itens/registros do Controle EXP de TODAS as
  // unidades misturados, não só da unidade escolhida. Foi exatamente o bug
  // que o Robson viu: item da unidade 106 aparecendo com a 105 selecionada.
  // pedido_itens não tem coluna unidade própria (só via pedidos.unidade),
  // então filtra pelos IDs dos pedidos já filtrados.
  const [pedidos, expCtrl, pedidoStatus] = await Promise.all([
    sb.from('vw_pedidos_prioridade').select('*').eq('unidade', unidadeAtual),
    // Paginado: a movimentação da expedição é append-only de propósito (nunca
    // apaga, vira histórico), então esta é a tabela que passa de 1.000 linhas
    // primeiro -- e é um dos dois lados da aba Conferir.
    buscarTudoPaginado((de, ate) => sb.from('exp_controle_itens').select('*')
      .eq('unidade', unidadeAtual).order('id', { ascending: true }).range(de, ate)),
    sb.from('exp_pedido_status').select('*').eq('unidade', unidadeAtual)
  ]);

  let itens = { data: [], error: null };
  if (!pedidos.error && (pedidos.data || []).length) {
    itens = await sb.from('pedido_itens')
      .select('*').in('pedido_id', pedidos.data.map(p => p.id)).order('seq', { ascending: true });
  }

  // Programação de Separação e Controle EXP Acessórios são páginas
  // independentes que só compartilham esta função de carga -- um erro na
  // Programação (ex.: sql/programacao-01/02 ainda não rodado) NÃO pode
  // travar o Controle EXP antes de ele renderizar, senão um item recém
  // gravado em exp_controle_itens ficaria invisível na lista mesmo tendo
  // salvo certinho. Por isso cada bloco trata o próprio erro, sem "return"
  // que corte o resto.
  if (pedidos.error || itens.error) falhaProgramacao((pedidos.error || itens.error).message);
  progPedidos = pedidos.error ? [] : (pedidos.data || []);
  progItens = itens.error ? [] : (itens.data || []);

  // exp_controle_itens e novo (sql/programacao-03-controle-exp.sql) -- se o
  // script ainda nao rodou, o resto da tela continua funcionando; so essa
  // secao fica vazia, com o erro visivel ali em vez de travar a pagina toda.
  progExpControle = expCtrl.error ? [] : (expCtrl.data || []);
  // A tabela nao guarda descricao/UM (decisao consciente, ver o SQL) --
  // busca de novo em cascata pra exibir a lista ja gravada, mesma logica
  // do preview antes de gravar.
  expCtrlDescMap = await buscarDescricoesItens(progExpControle.map(l => l.codigo_item));

  // exp_pedido_status e mais novo ainda (fase17) -- mesmo tratamento: se o
  // script nao rodou, o mapa fica vazio, sem travar a pagina.
  expPedidoProntoMap = new Map(
    (pedidoStatus.error ? [] : (pedidoStatus.data || []))
      .map(l => [l.numero_pedido, l])
  );

  // Retoma de onde a digitação parou: o último pedido gravado (por
  // criado_em) volta a ser "o pedido atual" pra detecção de troca continuar
  // funcionando depois de um recarregamento de página no meio do trabalho.
  if (progExpControle.length) {
    ultimoPedidoRegistrado = progExpControle
      .slice()
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))[0].numero_pedido || null;
  }

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
  // O formulário de registro (Entrada/Saída, os dois modos) não faz sentido nas
  // abas Catálogo nem Conferir: as duas só LEEM -- uma é a planilha do sistema,
  // a outra é o confronto entre as duas pontas. Registrar movimentação a partir
  // de uma tela de conferência seria mexer no que se está medindo.
  document.getElementById('expRegistroContainer').style.display =
    (aba === 'catalogo' || aba === 'conferir') ? 'none' : 'block';
  document.getElementById('expEntradaAba').style.display = aba === 'entrada' ? 'block' : 'none';
  document.getElementById('progConferencia').style.display = aba === 'saida' ? 'block' : 'none';
  document.getElementById('expCatalogoAba').style.display = aba === 'catalogo' ? 'block' : 'none';
  document.getElementById('expConferirAba').style.display = aba === 'conferir' ? 'block' : 'none';
  if (aba === 'saida') renderConferencia();
  if (aba === 'conferir') {
    renderConferirExp(); // mostra rápido com o que já tem em memória (a 1ª vez, sem observação/exclusão ainda)
    carregarConferirExpNotas().then(renderConferirExp);
  }
}

// Catálogo antes da Programação, mesmo motivo do carregamento inicial em
// js/navegacao.js -- senão um "Atualizar" manual clicado antes do catálogo
// terminar de carregar também deixaria Descrição/UM em branco.
document.getElementById('expAtualizarBtn').addEventListener('click', () => carregarCatalogoExp().then(carregarProgramacao));

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
  const mapa = { amarelo: '#f0c419', rosa: '#ec4899', verde: 'var(--ok-borda)', azul: '#0369a1', laranja: 'var(--aviso-borda)', vermelho: 'var(--erro-borda)' };
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
      // Almoxarifado: e so pra preencher descricao/UM na tela. Sem o recorte,
      // um EPI com o mesmo codigo poderia emprestar a descricao dele aqui.
      .select('item, descricao, um').in('item', faltando).eq('deposito', 'alm');
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
          <tr${l.descricao ? '' : ' style="background:var(--erro-fundo);"'}>
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
    setor: setorExpAtual,
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

// Entrada/Saída em texto puro (não <input type="datetime-local">) porque
// o Robson quer poder digitar direto, sem lutar com os campinhos
// separados do seletor nativo do navegador. Mesmo formato que já
// aparecia na tela antes de virar editável (toLocaleString pt-BR).
function formatarDataHoraBR(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Aceita "DD/MM/AAAA" ou "DD/MM/AAAA, HH:mm" (a hora é opcional -- sem
// ela, mantém a hora que já estava, `dataAtualFallback`). Monta a data com
// new Date(ano, mes-1, dia, ...) em vez de jogar a string direto pro
// construtor do Date: "07/09/2026" sem isso é ambíguo (DD/MM ou MM/DD
// depende do navegador) e podia trocar dia com mês sem avisar.
function parseDataHoraBR(texto, dataAtualFallback) {
  const m = texto.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const dia = parseInt(m[1], 10), mes = parseInt(m[2], 10), ano = parseInt(m[3], 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const fallback = dataAtualFallback ? new Date(dataAtualFallback) : new Date();
  const hora = m[4] != null ? parseInt(m[4], 10) : fallback.getHours();
  const minuto = m[5] != null ? parseInt(m[5], 10) : fallback.getMinutes();
  if (hora > 23 || minuto > 59) return null;

  const data = new Date(ano, mes - 1, dia, hora, minuto);
  // new Date "conserta" data invalida em vez de recusar (31/02 vira
  // 03/03) -- se o resultado nao bate com o que foi digitado, rejeita em
  // vez de aceitar uma data diferente da que a pessoa quis.
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  return data;
}

// Só as linhas do setor da tela aberta agora (Controle EXP Acessórios ou
// Depósito Benchmark) -- `progExpControle` traz as duas juntas da mesma
// tabela (uma query só por unidade), e é aqui que elas se separam pra tela.
// `|| 'exp'` cobre linha antiga, gravada antes de a coluna setor existir.
function linhasDoSetorAtual() {
  return progExpControle.filter(l => (l.setor || 'exp') === setorExpAtual);
}

// Atualiza o título visível dentro da tela (mesmo elemento pras duas
// páginas -- sem isso, nada na tela diria qual das duas está aberta).
function atualizarTituloSetorExp() {
  const el = document.getElementById('expSetorTitulo');
  if (!el) return;
  el.textContent = setorExpAtual === 'benchmark' ? '🏭 Depósito Benchmark' : '🔄 Controle EXP Acessórios';
}

// Mesmo filtro da busca (#expCtrlBusca) usado tanto pra desenhar a lista
// quanto pra exportar/imprimir -- assim, pra imprimir só o que tem numa
// localização, é só digitar ela na busca antes de clicar em Imprimir ou
// Exportar (nenhum controle novo, reaproveita o que já existe).
function linhasFiltradasExpControle() {
  const busca = document.getElementById('expCtrlBusca').value.trim().toLowerCase();
  let linhas = linhasDoSetorAtual();
  if (busca) {
    linhas = linhas.filter(l =>
      String(l.localizacao).toLowerCase().includes(busca) ||
      String(l.codigo_item).toLowerCase().includes(busca) ||
      String(l.numero_pedido).toLowerCase().includes(busca) ||
      String(l.numero_os_op).toLowerCase().includes(busca));
  }
  return ordenarPorColunaExp(linhas);
}

// Ordenação por coluna da tabela da aba Entrada (Robson, 10/09/2026: "quero
// colocar filtros nas colunas também", "ex localização de A-Z por codigo de
// itens") -- mesmo padrão do #dataTable em js/estoque.js (sortKey/sortDir +
// setinha no cabeçalho), com nome próprio (sortKeyExp/sortDirExp) pra não
// disputar estado com a tabela da Consulta de Itens.
//
// Fica AQUI, dentro de linhasFiltradasExpControle() (a fonte única de tudo:
// tela, impressão e exportação -- ver comentário de
// linhasImprimiveisExpControle()), e não só no render: assim imprimir/
// exportar também sai na ordem escolhida na tela.
let sortKeyExp = null;
let sortDirExp = 1;

// Descrição/UM não são campos da própria linha -- vêm de expCtrlDescMap,
// resolvida em cascata (Catálogo EXP -> itens_requisicao -> estoque). Por
// isso o valor de cada coluna passa por uma função, não por um nome de
// campo direto como no #dataTable.
function valorColunaExp(l, key) {
  const desc = expCtrlDescMap.get(l.codigo_item);
  switch (key) {
    case 'loc':     return l.localizacao || '';
    case 'item':    return l.codigo_item || '';
    case 'desc':    return (desc && desc.descricao) || '';
    case 'um':      return (desc && desc.um) || '';
    case 'qtd':     return parseQtd(l.quantidade);
    case 'pedido':  return l.numero_pedido || '';
    case 'op':      return l.numero_os_op || '';
    case 'lote':    return l.lote || '';
    case 'ref':     return l.referencia || '';
    case 'status':  return l.status === 'retirado' ? 'Saiu p/ carregamento' : 'Na expedição';
    case 'entrada': return l.criado_em || '';
    case 'saida':   return l.retirado_em || '';
    default:        return '';
  }
}

function ordenarPorColunaExp(linhas) {
  if (!sortKeyExp) return linhas;
  const numericos = new Set(['qtd']);
  const datas = new Set(['entrada', 'saida']);
  return [...linhas].sort((a, b) => {
    let va = valorColunaExp(a, sortKeyExp), vb = valorColunaExp(b, sortKeyExp);
    if (numericos.has(sortKeyExp)) {
      // já são números (parseQtd) -- comparação direta
    } else if (datas.has(sortKeyExp)) {
      va = va ? new Date(va).getTime() : 0;
      vb = vb ? new Date(vb).getTime() : 0;
    } else {
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
    }
    if (va < vb) return -1 * sortDirExp;
    if (va > vb) return 1 * sortDirExp;
    return 0;
  });
}

// Recorte específico (#expCtrlTable thead th), e não `thead th` sem mais
// nada -- o mesmo defeito já corrigido no #dataTable (js/estoque.js,
// 10/09/2026): sem o recorte, clicar em QUALQUER outro cabeçalho do portal
// cairia aqui, `th.dataset.key` viria undefined e apagaria a ordenação à
// toa, além de arriscar `.arrow` nulo em tabela sem essa marcação.
document.querySelectorAll('#expCtrlTable thead th[data-key]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (sortKeyExp === key) { sortDirExp *= -1; } else { sortKeyExp = key; sortDirExp = 1; }
    document.querySelectorAll('#expCtrlTable thead th .arrow').forEach(a => a.textContent = '');
    th.querySelector('.arrow').textContent = sortDirExp === 1 ? '▲' : '▼';
    renderExpControle();
  });
});

// Item que já saiu p/ carregamento não entra em "marcar todos" nem sai de
// novo na impressora -- Robson, 10/09/2026: "itens que ja carregou bloqueie
// para impressao". Já foi retirado fisicamente; reimprimir a etiqueta dele
// não faz sentido (o material não está mais na expedição pra colar nada) e
// só confundiria quem conferisse a pilha de folhas depois.
function linhasImprimiveisExpControle() {
  return linhasFiltradasExpControle().filter(l => l.status !== 'retirado');
}

// Conta pedidos DISTINTOS ainda na expedição (não retirados) -- um pedido
// vira várias linhas (uma por item), então contar linhas contaria o mesmo
// pedido várias vezes. Respeita a busca (#expCtrlBusca) igual à tabela,
// pra bater com o que a pessoa está vendo na tela.
function contarPedidosNaExpedicao(linhas) {
  const pedidos = new Set();
  linhas.forEach(l => {
    if (l.status === 'retirado') return;
    const numero = (l.numero_pedido || '').trim();
    if (numero) pedidos.add(numero);
  });
  return pedidos.size;
}

// Diz na barra o que vai sair da impressora, e acerta a caixa do cabecalho.
//
// O rotulo do botao TROCA ("Imprimir tudo" / "Imprimir marcados") em vez de
// so ganhar um numero: sai uma folha por item, e clicar achando que ia sair
// um pallet e sair a lista inteira e resma -- quem clicou merece saber pela
// tela, nao pela impressora. Mesma regra da etiqueta da Trading.
//
// A caixa do cabecalho fica INDETERMINADA quando a selecao e parcial. Sem
// isso ela apareceria vazia com itens marcados na lista, e o proximo clique
// pareceria "marcar tudo" quando na verdade limpa.
function atualizarSelecaoExpControle() {
  // Mexer na seleção ou na busca cancela a confirmação pendente: o número de
  // folhas que ela leu na tela deixou de valer.
  expImprimirConfirmar = false;
  const naBusca = linhasImprimiveisExpControle();
  const marcadosNaBusca = naBusca.filter(l => expCtrlSelecionadas.has(String(l.id))).length;

  const botao = document.getElementById('expCtrlImprimirBtn');
  if (botao) botao.textContent = marcadosNaBusca
    ? '\u{1F5A8}\uFE0F Imprimir marcados (' + marcadosNaBusca + ')'
    : '\u{1F5A8}\uFE0F Imprimir tudo (' + naBusca.length + ')';

  const todos = document.getElementById('expCtrlMarcarTodos');
  if (todos) {
    todos.checked = naBusca.length > 0 && marcadosNaBusca === naBusca.length;
    todos.indeterminate = marcadosNaBusca > 0 && marcadosNaBusca < naBusca.length;
  }
}

function renderExpControle(erroCarregamento) {
  const corpo = document.getElementById('expCtrlBody');
  const vazio = document.getElementById('expCtrlVazio');

  if (erroCarregamento) {
    vazio.style.display = 'block';
    vazio.textContent = 'Não foi possível carregar: ' + erroCarregamento
      + ' — se a mensagem falar em tabela inexistente, sql/programacao-03-controle-exp.sql ainda não foi rodado no Supabase.';
    corpo.innerHTML = '';
    document.getElementById('expCtrlPedidosCount').textContent = '';
    atualizarSelecaoExpControle();
    return;
  }

  // Tira da selecao o que nao esta mais nesta tela: registro excluido, troca
  // de unidade (a lista e recarregada), troca de setor (Controle EXP <->
  // Deposito Benchmark) e item que acabou de sair p/ carregamento (nao
  // imprime mais, ver linhasImprimiveisExpControle()). Sem isso, marcar na
  // Benchmark e voltar pro EXP imprimiria item do outro deposito, ou
  // confirmar a saida de um item marcado o deixaria "preso" selecionado
  // sem nunca poder imprimir. A BUSCA nao poda nada -- filtrar e desfiltrar
  // tem de devolver o que estava marcado.
  const idsDaTela = new Set(linhasDoSetorAtual().filter(l => l.status !== 'retirado').map(l => String(l.id)));
  expCtrlSelecionadas.forEach(id => { if (!idsDaTela.has(id)) expCtrlSelecionadas.delete(id); });

  // Só o que ainda está fisicamente na expedição -- Robson, 10/09/2026: "os
  // itens marcado como saida deixe só nessa aba" / "só quero na aba entrada
  // o que realmente tem lá no físico". Quem já saiu tem histórico completo
  // (pedido, item, quantidade, local, quem retirou, desfazer) na aba Saída/
  // Conferência -- renderHistoricoRetiradas() -- então sair daqui não perde
  // registro nenhum, só limpa a lista do que precisa ser conferido agora.
  const linhas = linhasImprimiveisExpControle();
  const totalPedidos = contarPedidosNaExpedicao(linhas);
  document.getElementById('expCtrlPedidosCount').textContent =
    `${totalPedidos} pedido${totalPedidos === 1 ? '' : 's'} na expedição`;
  vazio.style.display = linhas.length ? 'none' : 'block';
  if (!linhas.length) {
    vazio.textContent = linhasDoSetorAtual().length
      ? 'Nenhum item bate com a busca.'
      : 'Nenhum item registrado ainda.';
    corpo.innerHTML = '';
    atualizarSelecaoExpControle();
    return;
  }

  corpo.innerHTML = linhas.map(l => {
    const desc = expCtrlDescMap.get(l.codigo_item);
    const retirado = l.status === 'retirado';
    return `
    <tr${retirado ? ' style="opacity:0.6;"' : ''}>
      <td><input type="checkbox" class="expctrl-marcar" data-id="${escapeHtml(l.id)}"
                   ${!retirado && expCtrlSelecionadas.has(String(l.id)) ? 'checked' : ''}
                   ${retirado ? 'disabled title="Já saiu para carregamento -- não imprime de novo"' : ''}
                   aria-label="Marcar este item para imprimir"></td>
      <td class="loc"><input type="text" class="expctrl-loc-input" data-id="${escapeHtml(l.id)}"
             value="${escapeHtml(l.localizacao || '')}" placeholder="—"
             style="width:90px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;"></td>
      <td class="item">${escapeHtml(l.codigo_item)}</td>
      <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
      <td class="loc">${desc && desc.um ? escapeHtml(desc.um) : '—'}</td>
      <td class="num"><input type="text" class="expctrl-qtd-input" data-id="${escapeHtml(l.id)}"
             value="${l.quantidade != null ? escapeHtml(l.quantidade) : ''}" placeholder="—"
             style="width:70px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px; text-align:right;"></td>
      <td class="loc">${escapeHtml(l.numero_pedido || '—')}</td>
      <td class="loc">${escapeHtml(l.numero_os_op || '—')}</td>
      <td class="loc">${escapeHtml(l.lote || '—')}</td>
      <td class="loc">${escapeHtml(l.referencia || '—')}</td>
      <td class="loc">${l.etiqueta_emitida_em
        ? `<span title="Etiqueta emitida em ${escapeHtml(formatarDataHoraBR(l.etiqueta_emitida_em))}${l.etiqueta_emitida_por ? ' por ' + escapeHtml(l.etiqueta_emitida_por) : ''}" style="color:var(--ok-texto); font-weight:700;">✓</span>`
        : `<span title="Etiqueta ainda não emitida — sai marcada quando você imprimir esta lista" style="color:var(--muted);">—</span>`}</td>
      <td>${retirado
        ? `<span class="cfg-status st-ativo">Saiu p/ carregamento</span>`
        : `<span class="cfg-status st-pendente">Na expedição</span>`}</td>
      <td class="loc"><input type="text" class="expctrl-criado-input" data-id="${escapeHtml(l.id)}"
             value="${escapeHtml(formatarDataHoraBR(l.criado_em))}" placeholder="DD/MM/AAAA, HH:mm"
             style="width:140px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;"></td>
      <td class="loc">${retirado
        ? `<input type="text" class="expctrl-retirado-input" data-id="${escapeHtml(l.id)}"
             value="${escapeHtml(formatarDataHoraBR(l.retirado_em))}" placeholder="DD/MM/AAAA, HH:mm"
             style="width:140px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;">`
        : '—'}</td>
      <td class="col-acoes">
        ${retirado ? '' : `<button class="acao-btn expctrl-saida" data-id="${escapeHtml(l.id)}" title="Marcar como retirado para o carregamento">🚚</button>`}
        <button class="acao-btn expctrl-excluir" data-id="${escapeHtml(l.id)}" title="Excluir este registro">🗑</button>
      </td>
    </tr>`;
  }).join('');
  atualizarSelecaoExpControle();
}

// ======================= ABA CONFERIR: SISTEMA x FÍSICO ==================
//
// O Victor, 10/09/2026: "faça um confronto do que existe no sistema e o que tem
// no fisico, faça uma comparação e retorne indicadores. Quais tem diferença,
// quanto é, se ta no sistema ou nao".
//
//   SISTEMA = `catalogo_exp_itens` desta unidade (a planilha do Datasul, colada
//             na aba Catálogo). É a coluna `quantidade` dela.
//   FÍSICO  = `exp_controle_itens` com status `na_expedicao`. Item já retirado
//             saiu da expedição -- contá-lo diria que o material está lá quando
//             ele foi embora no caminhão.
//
// ⚠️ POR ITEM, SOMANDO OS DOIS LADOS. O mesmo código aparece em várias linhas
// dos dois lados (o sistema separa por lote e depósito, o físico por endereço e
// pedido), então comparar linha a linha acusaria diferença onde só há material
// espalhado. Mesma decisão da Análise de Compras, e pelo mesmo motivo.
//
// ⚠️ A CHAVE PASSA POR `normalizaCodigoItem()`. As duas pontas são planilhas
// COLADAS À MÃO, de origens diferentes, e o projeto já perdeu uma tarde com o
// item 996613I gravado como `996613i` numa e maiúsculo na outra (seção 14): o
// `Map` do JavaScript diferencia a caixa, e a conta saía com saldo zero num
// item que existia. Numa tela de conferência isso não seria um número errado --
// seria uma divergência inventada, e alguém indo procurar material que está no
// lugar.
async function carregarConferirExpNotas() {
  const { data, error } = await sb.from('conferir_exp_notas').select('*').eq('unidade', unidadeAtual);
  conferirExpNotas = new Map();
  if (error) {
    // Silencioso de propósito (como limparObservacoesResolvidas() em
    // js/analise.js): se o fase33 ainda não rodou, a tela continua
    // funcionando sem observação/exclusão em vez de travar a aba inteira.
    console.warn('Não foi possível carregar as notas da conferência:', error.message);
    return;
  }
  (data || []).forEach(r => conferirExpNotas.set(normalizaCodigoItem(r.codigo_item), r));
}

function notaConferirDoItem(chave) {
  return conferirExpNotas.get(chave) || { observacao: '', excluido_em: null, excluido_por: '' };
}

function montarConferirExp() {
  const somar = (mapa, chave, valor) => mapa.set(chave, (mapa.get(chave) || 0) + valor);

  // --- lado do sistema ---
  const sistema = new Map();
  const infoItem = new Map();   // codigo normalizado -> { codigo, descricao, um }
  catalogoExpItens.forEach(c => {
    const chave = normalizaCodigoItem(c.codigo_item);
    if (!chave) return;
    somar(sistema, chave, parseNum(c.quantidade));
    if (!infoItem.has(chave)) {
      infoItem.set(chave, { codigo: c.codigo_item, descricao: c.descricao || '', um: c.um || '' });
    }
  });

  // --- lado do físico ---
  const fisico = new Map();
  // codigo normalizado -> Map<localização, Set<nº pedido>> -- guarda o pedido
  // junto pra responder "ao clicar aparecer todas as localizações e os
  // pedidos referentes" (Robson), não só a lista solta de localizações.
  const ondeEsta = new Map();
  linhasDoSetorAtual().forEach(l => {
    if (l.status === 'retirado') return;
    const chave = normalizaCodigoItem(l.codigo_item);
    if (!chave) return;
    somar(fisico, chave, parseNum(l.quantidade));
    const local = (l.localizacao || '').trim();
    if (local) {
      if (!ondeEsta.has(chave)) ondeEsta.set(chave, new Map());
      const porLocal = ondeEsta.get(chave);
      if (!porLocal.has(local)) porLocal.set(local, new Set());
      porLocal.get(local).add((l.numero_pedido || '').trim() || '—');
    }
    // A descrição do catálogo é a preferida (é a do sistema); esta cobre o item
    // que só existe no físico, e que por definição não está no catálogo.
    if (!infoItem.has(chave)) {
      const d = expCtrlDescMap.get(l.codigo_item) || {};
      infoItem.set(chave, { codigo: l.codigo_item, descricao: d.descricao || '', um: d.um || '' });
    }
  });

  // --- o confronto ---
  // `noCatalogo`/`noFisico` olham a PRESENÇA da linha, não a quantidade: item
  // cadastrado no sistema com saldo zero é diferente de item que o sistema não
  // conhece, e a tela precisa dizer qual dos dois é.
  return [...new Set([...sistema.keys(), ...fisico.keys()])].map(chave => {
    const qtdSistema = sistema.get(chave) || 0;
    const qtdFisico = fisico.get(chave) || 0;
    const noCatalogo = sistema.has(chave);
    const noFisico = fisico.has(chave);
    const diferenca = qtdFisico - qtdSistema;

    let situacao;
    if (!noCatalogo) situacao = 'so_fisico';
    else if (!noFisico) situacao = 'so_sistema';
    else if (Math.abs(diferenca) > 0.0001) situacao = 'diferenca';
    else situacao = 'ok';

    const info = infoItem.get(chave) || { codigo: chave, descricao: '', um: '' };
    const porLocal = ondeEsta.get(chave) || new Map();
    const locaisDetalhe = [...porLocal.entries()]
      .map(([localizacao, pedidos]) => ({ localizacao, pedidos: [...pedidos].sort() }))
      .sort((a, b) => a.localizacao.localeCompare(b.localizacao));
    return {
      chave, codigo: info.codigo, descricao: info.descricao, um: info.um,
      qtdSistema, qtdFisico, diferenca, situacao,
      locais: locaisDetalhe.map(d => d.localizacao),
      locaisDetalhe
    };
  });
}

// `numeroBR()` vive em js/analise.js, que carrega DEPOIS deste arquivo. Vale
// porque declaracao de funcao no topo de script classico entra no objeto
// global, e nada aqui roda antes de todos os scripts terminarem de carregar.
// Preferi reusar a duplicar: dois formatadores de quantidade divergiriam no
// dia em que um deles ganhasse casa decimal.
const SITUACOES_CONF = {
  so_fisico:  { rotulo: 'Só no físico',  classe: 'st-atrasado' },
  so_sistema: { rotulo: 'Só no sistema', classe: 'st-atencao'  },
  diferenca:  { rotulo: 'Diferença',     classe: 'st-pendente' },
  ok:         { rotulo: 'Confere',       classe: 'st-ativo'    }
};

// A ordem da lista é a ordem do risco, não a alfabética:
//
//   1. SÓ NO FÍSICO primeiro. Material guardado que o sistema não conhece é o
//      que se perde no inventário -- ninguém vai procurar o que não está na
//      lista.
//   2. Depois DIFERENÇA, da maior para a menor em módulo: a diferença grande é
//      a que muda decisão de compra e de carregamento.
//   3. Depois SÓ NO SISTEMA, do maior saldo para o menor.
//   4. O que confere vai por último -- não há o que fazer com ele.
const ORDEM_SITUACAO = ['so_fisico', 'diferenca', 'so_sistema', 'ok'];
function ordenarConferir(lista) {
  return lista.slice().sort((a, b) =>
    ORDEM_SITUACAO.indexOf(a.situacao) - ORDEM_SITUACAO.indexOf(b.situacao)
    || Math.abs(b.diferenca) - Math.abs(a.diferenca)
    || Math.max(b.qtdSistema, b.qtdFisico) - Math.max(a.qtdSistema, a.qtdFisico)
    || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR'));
}

// Teto de linhas desenhadas. O catálogo é o depósito INTEIRO (a mensagem de
// substituição em lote já falava em 4.000 linhas), e "Tudo" numa unidade cheia
// desenharia uma tabela que trava a aba sem ninguém conseguir ler. O número
// aparece na tela junto com o total, então o corte nunca é silencioso.
const LIMITE_LINHAS_CONF = 300;

function renderConferirExp() {
  const corpo = document.getElementById('confCorpo');
  const vazio = document.getElementById('confVazio');
  if (!corpo) return;

  // Item excluído (Robson, 10/09/2026: "tem itens que são do pátio aí é
  // outra equipe") sai dos cards e do filtro normal -- não é mais problema
  // desta conferência. Só reaparece no modo "Ver excluídos".
  const todasComExcluidos = montarConferirExp();
  const todas = todasComExcluidos.filter(l => !notaConferirDoItem(l.chave).excluido_em);
  const excluidos = todasComExcluidos.filter(l => !!notaConferirDoItem(l.chave).excluido_em);

  const contar = s => todas.filter(l => l.situacao === s).length;
  document.getElementById('conf-total').textContent = todas.length;
  document.getElementById('conf-diferenca').textContent = contar('diferenca');
  document.getElementById('conf-so-sistema').textContent = contar('so_sistema');
  document.getElementById('conf-so-fisico').textContent = contar('so_fisico');
  document.getElementById('conf-ok').textContent = contar('ok');

  const btnExcluidos = document.getElementById('confVerExcluidosBtn');
  if (btnExcluidos) {
    btnExcluidos.style.display = (excluidos.length || confVerExcluidos) ? 'inline-block' : 'none';
    btnExcluidos.className = confVerExcluidos ? 'btn btn-primary' : 'btn';
    btnExcluidos.textContent = confVerExcluidos
      ? '← Voltar pra conferência'
      : `🚫 Ver excluídos (${excluidos.length})`;
  }

  const busca = filtrosConf.busca.trim().toLowerCase();
  let lista = (confVerExcluidos ? excluidos : todas).filter(l => {
    if (!confVerExcluidos) {
      if (filtrosConf.situacao === 'divergentes' && l.situacao === 'ok') return false;
      if (filtrosConf.situacao && filtrosConf.situacao !== 'divergentes'
          && l.situacao !== filtrosConf.situacao) return false;
    }
    if (busca && !String(l.codigo).toLowerCase().includes(busca)
             && !String(l.descricao).toLowerCase().includes(busca)) return false;
    return true;
  });
  lista = ordenarConferir(lista);

  const cortou = lista.length > LIMITE_LINHAS_CONF;
  const naTela = cortou ? lista.slice(0, LIMITE_LINHAS_CONF) : lista;

  document.getElementById('confContagem').textContent = cortou
    ? `Mostrando ${LIMITE_LINHAS_CONF} de ${lista.length} — use a busca para estreitar`
    : `${lista.length} item(ns)`;

  vazio.style.display = lista.length ? 'none' : 'block';
  if (!lista.length) {
    vazio.textContent = confVerExcluidos
      ? 'Nenhum item excluído da conferência ainda.'
      : todasComExcluidos.length
        ? 'Nenhum item bate com o filtro. Se o Catálogo EXP desta unidade estiver vazio, cole a planilha do sistema na aba Catálogo primeiro.'
        : 'Nada para confrontar: nem o Catálogo EXP nem a expedição têm item nesta unidade.';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = naTela.map(l => {
    const s = SITUACOES_CONF[l.situacao];
    const nota = notaConferirDoItem(l.chave);
    // O sinal da diferença é a informação: + é sobra no físico, - é falta. Sem
    // ele a pessoa lê "3" e não sabe para que lado.
    const sinal = l.diferenca > 0 ? '+' : '';
    return `
    <tr>
      <td><input type="checkbox" class="conf-sel-check" data-chave="${escapeHtml(l.chave)}" data-item="${escapeHtml(l.codigo)}"
                  ${confSelecionados.has(l.chave) ? 'checked' : ''}></td>
      <td class="item">${escapeHtml(l.codigo)}</td>
      <td>${escapeHtml(l.descricao || '—')}</td>
      <td class="loc">${escapeHtml(l.um || '—')}</td>
      <td class="num">${l.situacao === 'so_fisico' ? '—' : numeroBR(l.qtdSistema)}</td>
      <td class="num">${l.situacao === 'so_sistema' ? '—' : numeroBR(l.qtdFisico)}</td>
      <td class="num" style="font-weight:800; color:${l.situacao === 'ok' ? 'var(--muted)' : 'var(--erro-texto)'};">
        ${l.situacao === 'ok' ? '0' : sinal + numeroBR(l.diferenca)}</td>
      <td><span class="cfg-status ${s.classe}">${s.rotulo}</span></td>
      <td class="loc${l.locais.length ? ' onde-esta-cell' : ''}" data-chave="${escapeHtml(l.chave)}"
          title="${l.locais.length ? 'Clique para ver localização e pedido de cada um' : ''}">
        ${l.locais.length ? escapeHtml(l.locais.join(', ')) : '—'}</td>
      <td>
        ${confVerExcluidos
          ? `<div style="font-size:12px; color:var(--muted); margin-bottom:4px;"
                title="${nota.excluido_por ? escapeHtml(nota.excluido_por) + ' — ' : ''}${nota.excluido_em ? escapeHtml(formatarDataHoraBR(nota.excluido_em)) : ''}">
               ${escapeHtml(nota.observacao || '—')}
             </div>
             <button class="acao-btn conf-restaurar" data-chave="${escapeHtml(l.chave)}" data-item="${escapeHtml(l.codigo)}"
                     title="Restaurar -- volta a aparecer na conferência">↺ Restaurar</button>`
          : `<input type="text" class="conf-obs-input" data-chave="${escapeHtml(l.chave)}" data-item="${escapeHtml(l.codigo)}"
                    value="${escapeHtml(nota.observacao || '')}" placeholder="—"
                    style="width:${escapeHtml(String(larguraObservacao(nota.observacao || '')))}px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;">
             <button class="acao-btn conf-excluir" data-chave="${escapeHtml(l.chave)}" data-item="${escapeHtml(l.codigo)}"
                     title="Não preciso conferir este item nesta unidade (ex.: item de outra equipe/pátio) -- reversível">🗑️</button>`}
      </td>
    </tr>`;
  }).join('');

  // Refina a largura estimada por caractere com a largura real do texto já
  // renderizado (mesmo ajuste feito em analise.js -- reaproveita as mesmas
  // funções, não duplica).
  document.querySelectorAll('.conf-obs-input').forEach(ajustarLarguraObservacao);

  // Redesenho zera o DOM: descarta da seleção quem não está mais na tela
  // (trocou de modo, ou o filtro/busca mudou) -- manter marcado um item que
  // nem aparece mais confundiria a contagem do botão de ação em lote.
  const chavesNaTela = new Set(naTela.map(l => l.chave));
  [...confSelecionados.keys()].forEach(chave => { if (!chavesNaTela.has(chave)) confSelecionados.delete(chave); });
  const selTodos = document.getElementById('confSelTodos');
  if (selTodos) selTodos.checked = marcouTodosConf();
  atualizarBotaoAcaoLoteConf();
}

function marcouTodosConf() {
  const boxes = [...document.querySelectorAll('#confCorpo .conf-sel-check')];
  return boxes.length > 0 && boxes.every(c => c.checked);
}

function atualizarBotaoAcaoLoteConf() {
  const botao = document.getElementById('confAcaoLoteBtn');
  if (!botao) return;
  const n = confSelecionados.size;
  botao.style.display = n > 0 ? 'inline-block' : 'none';
  botao.disabled = n === 0;
  botao.textContent = confVerExcluidos ? `↺ Restaurar selecionados (${n})` : `🗑️ Excluir selecionados (${n})`;
}


// Grava etiqueta em lote: `marcar = true` marca como emitida. Chamada pelo
// Imprimir, que marca sozinho a etiqueta de tudo que sai na impressão.
//
// Vai em blocos de 100: o `in` do PostgREST viaja na URL e cada id e um uuid
// de 36 caracteres. Selecionar tudo numa unidade cheia estouraria o limite de
// tamanho da URL, e o sintoma seria "marcar 5 funciona, marcar 300 falha" --
// dificil de ligar a causa depois.
async function gravarEtiquetaEmLote(linhas) {
  // So alcanca quem ainda nao tem etiqueta: reimprimir nao reescreve a data
  // da primeira emissao, que e a que responde "desde quando este item esta
  // etiquetado?".
  const alvo = linhas.filter(l => !l.etiqueta_emitida_em);
  if (!alvo.length) return { marcados: 0, naoGravados: 0, error: null };

  const agora = new Date().toISOString();
  const patch = { etiqueta_emitida_em: agora, etiqueta_emitida_por: nomeUsuarioAtual };
  const BLOCO = 100;
  let marcados = 0;
  let naoGravados = 0;
  for (let de = 0; de < alvo.length; de += BLOCO) {
    const pedaco = alvo.slice(de, de + BLOCO);

    // O `.select('id')` nao e enfeite: sem ele o update volta sem erro mesmo
    // quando o RLS esconde a linha e nada e gravado -- PostgREST nao avisa que
    // atualizou zero. A tela mostraria o certinho verde e o F5 desmentiria.
    // Com o recibo, sabemos a diferenca entre "marquei 12" e "pedi 12, o banco
    // aceitou 9".
    const { data, error } = await sb.from('exp_controle_itens')
      .update(patch)
      .in('id', pedaco.map(l => l.id))
      .select('id');
    // Devolve quantos ja foram: depois de gravar 200 linhas, dizer so
    // "falhou" seria mentira, e a pessoa marcaria tudo de novo.
    if (error) return { marcados, naoGravados, error };

    const gravados = new Set((data || []).map(r => r.id));
    // So a linha que o banco confirmou muda na tela.
    pedaco.forEach(l => {
      if (!gravados.has(l.id)) return;
      l.etiqueta_emitida_em = patch.etiqueta_emitida_em;
      l.etiqueta_emitida_por = patch.etiqueta_emitida_por;
    });
    marcados += gravados.size;
    naoGravados += pedaco.length - gravados.size;
  }
  return { marcados, naoGravados, error: null };
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

// Aba Conferir: filtra ao digitar, sem ir ao banco -- as duas pontas já estão
// em memória (`catalogoExpItens` e `progExpControle`).
document.getElementById('confBusca').addEventListener('input', (e) => {
  filtrosConf.busca = e.target.value;
  renderConferirExp();
});
document.getElementById('confFiltroSituacao').addEventListener('change', (e) => {
  filtrosConf.situacao = e.target.value;
  renderConferirExp();
});
// Recarregar busca as DUAS pontas de novo: a conferência só vale se os dois
// lados forem do mesmo momento. Buscar um só deixaria a tela comparando o
// catálogo de agora com o físico de dez minutos atrás.
document.getElementById('confRecarregar').addEventListener('click', async () => {
  const msg = document.getElementById('confMsg');
  msg.textContent = 'Recarregando as duas pontas...';
  msg.className = 'status-msg';
  confSelecionados.clear(); // dados novos: a seleção de antes pode nem existir mais
  await carregarCatalogoExp();
  await carregarProgramacao();
  await carregarConferirExpNotas();
  renderConferirExp();
  msg.textContent = '';
});

document.getElementById('confVerExcluidosBtn').addEventListener('click', () => {
  confVerExcluidos = !confVerExcluidos;
  confSelecionados.clear(); // o botão de ação em lote muda de significado (excluir x restaurar)
  renderConferirExp();
});

// Observação: salva ao sair do campo (mesmo padrão da Análise de Compras) --
// upsert por (unidade, item), então funciona igual pra criar e pra editar.
document.getElementById('confCorpo').addEventListener('focusout', async (e) => {
  const input = e.target.closest('.conf-obs-input');
  if (!input) return;
  const chave = input.dataset.chave;
  const nota = notaConferirDoItem(chave);
  const novoValor = input.value.trim();
  if (novoValor === (nota.observacao || '')) return; // nada mudou

  input.disabled = true;
  const { error } = await sb.from('conferir_exp_notas').upsert({
    unidade: unidadeAtual, codigo_item: input.dataset.item, observacao: novoValor || null,
    atualizado_por: nomeUsuarioAtual, atualizado_em: new Date().toISOString()
  }, { onConflict: 'unidade,codigo_item' });
  input.disabled = false;

  if (error) {
    alert('Não foi possível salvar a observação: ' + error.message
      + ' — se a mensagem falar em tabela inexistente, sql/fase33-conferir-exp-observacao.sql ainda não foi rodado no Supabase.');
    input.value = nota.observacao || '';
    return;
  }
  conferirExpNotas.set(chave, { ...nota, unidade: unidadeAtual, codigo_item: input.dataset.item, observacao: novoValor || null });
  input.style.borderColor = 'var(--blue)';
  setTimeout(() => { input.style.borderColor = ''; }, 1200);
});

// Enter também salva (mesmo atalho da Análise de Compras), sem precisar
// clicar fora do campo.
document.getElementById('confCorpo').addEventListener('keydown', (e) => {
  if (e.target.classList.contains('conf-obs-input') && e.key === 'Enter') e.target.blur();
});

// Cresce o campo em tempo real -- o Robson: "conforme a escrita alongar
// essa aba" (mesmo comportamento já usado na Análise de Compras).
document.getElementById('confCorpo').addEventListener('input', (e) => {
  if (e.target.classList.contains('conf-obs-input')) ajustarLarguraObservacao(e.target);
});

// Excluir/restaurar: mesma tabela, só muda excluido_em/excluido_por. Nunca
// mexe em catalogo_exp_itens nem exp_controle_itens -- ver sql/fase33.
document.getElementById('confCorpo').addEventListener('click', async (e) => {
  const btnExcluir = e.target.closest('.conf-excluir');
  const btnRestaurar = e.target.closest('.conf-restaurar');
  const btn = btnExcluir || btnRestaurar;
  if (!btn) return;

  const chave = btn.dataset.chave;
  const nota = notaConferirDoItem(chave);
  const patch = btnExcluir
    ? { excluido_em: new Date().toISOString(), excluido_por: nomeUsuarioAtual }
    : { excluido_em: null, excluido_por: null };

  btn.disabled = true;
  const { error } = await sb.from('conferir_exp_notas').upsert({
    unidade: unidadeAtual, codigo_item: btn.dataset.item, observacao: nota.observacao || null, ...patch
  }, { onConflict: 'unidade,codigo_item' });
  btn.disabled = false;

  if (error) {
    alert((btnExcluir ? 'Não foi possível excluir: ' : 'Não foi possível restaurar: ') + error.message);
    return;
  }
  conferirExpNotas.set(chave, { ...nota, unidade: unidadeAtual, codigo_item: btn.dataset.item, ...patch });
  confSelecionados.delete(chave); // saiu de uma lista pra outra -- não faz mais sentido continuar marcado
  renderConferirExp();
});

// Seleção em lote (checkbox por linha + "selecionar todos" do cabeçalho) --
// Robson: "coloque uma caixa de seleção, para que eu selecione os itens que
// eu quero tirar da planilha do exp".
document.getElementById('confCorpo').addEventListener('change', (e) => {
  const check = e.target.closest('.conf-sel-check');
  if (!check) return;
  if (check.checked) confSelecionados.set(check.dataset.chave, check.dataset.item);
  else confSelecionados.delete(check.dataset.chave);
  atualizarBotaoAcaoLoteConf();
  const todas = document.getElementById('confSelTodos');
  if (todas) todas.checked = marcouTodosConf();
});

document.getElementById('confSelTodos').addEventListener('change', (e) => {
  const marcar = e.target.checked;
  document.querySelectorAll('#confCorpo .conf-sel-check').forEach(chk => {
    chk.checked = marcar;
    if (marcar) confSelecionados.set(chk.dataset.chave, chk.dataset.item);
    else confSelecionados.delete(chk.dataset.chave);
  });
  atualizarBotaoAcaoLoteConf();
});

// Mesma exclusão/restauração reversível de sempre (conferir_exp_notas),
// só aplicada a todos os selecionados de uma vez -- um upsert só, com um
// array de linhas, em vez de repetir o clique item por item.
document.getElementById('confAcaoLoteBtn').addEventListener('click', async () => {
  if (confSelecionados.size === 0) return;
  const excluindo = !confVerExcluidos;
  const itens = [...confSelecionados.entries()]; // [chave, codigoOriginal]
  const confirmado = confirm(excluindo
    ? `Excluir ${itens.length} item(ns) selecionado(s) da conferência?\n\nReversível -- dá pra restaurar depois em "Ver excluídos".`
    : `Restaurar ${itens.length} item(ns) selecionado(s) de volta pra conferência?`);
  if (!confirmado) return;

  const agora = new Date().toISOString();
  const linhas = itens.map(([chave, codigoOriginal]) => {
    const nota = notaConferirDoItem(chave);
    return {
      unidade: unidadeAtual, codigo_item: codigoOriginal || nota.codigo_item,
      observacao: nota.observacao || null,
      excluido_em: excluindo ? agora : null,
      excluido_por: excluindo ? nomeUsuarioAtual : null
    };
  });

  const botao = document.getElementById('confAcaoLoteBtn');
  botao.disabled = true;
  const { error } = await sb.from('conferir_exp_notas')
    .upsert(linhas, { onConflict: 'unidade,codigo_item' });
  botao.disabled = false;

  if (error) {
    alert((excluindo ? 'Não foi possível excluir: ' : 'Não foi possível restaurar: ') + error.message);
    return;
  }
  linhas.forEach(row => {
    const chave = normalizaCodigoItem(row.codigo_item);
    const notaAntiga = notaConferirDoItem(chave);
    conferirExpNotas.set(chave, { ...notaAntiga, ...row });
  });
  confSelecionados.clear();
  renderConferirExp();
});

// "Onde está" -- Robson: "ao clicar aparecer todas as localizações e os
// pedidos referentes". Recalcula na hora (mesma fonte da tabela) em vez de
// guardar estado à parte, então mostra sempre o que está na tela agora.
const ondeEstaModal = document.getElementById('ondeEstaModal');
const ondeEstaModalBox = document.getElementById('ondeEstaModalBox');
function fecharOndeEstaModal() { ondeEstaModal.classList.remove('open'); }
document.getElementById('confCorpo').addEventListener('click', (e) => {
  const celula = e.target.closest('.onde-esta-cell');
  if (!celula) return;
  const linha = montarConferirExp().find(l => l.chave === celula.dataset.chave);
  if (!linha || !linha.locaisDetalhe.length) return;

  ondeEstaModalBox.innerHTML = `
    <button class="modal-close" id="ondeEstaCloseBtn">✕</button>
    <h3 style="margin-top:0;">📍 ${escapeHtml(linha.codigo)}</h3>
    <div class="modal-text" style="margin-bottom:10px;">${escapeHtml(linha.descricao || '—')}</div>
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left; padding:4px 8px; border-bottom:1px solid var(--border);">Localização</th>
        <th style="text-align:left; padding:4px 8px; border-bottom:1px solid var(--border);">Nº Pedido</th>
      </tr></thead>
      <tbody>
        ${linha.locaisDetalhe.map(d => `
          <tr>
            <td style="padding:4px 8px; border-bottom:1px solid var(--border);">${escapeHtml(d.localizacao)}</td>
            <td style="padding:4px 8px; border-bottom:1px solid var(--border);">${escapeHtml(d.pedidos.join(', '))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  document.getElementById('ondeEstaCloseBtn').addEventListener('click', fecharOndeEstaModal);
  ondeEstaModal.classList.add('open');
});
ondeEstaModal.addEventListener('click', (e) => {
  if (e.target === ondeEstaModal) fecharOndeEstaModal();
});

// Marcar/desmarcar um item. Guarda o id, nao a posicao da linha: a ordem e
// o conjunto mudam com a busca.
document.getElementById('expCtrlBody').addEventListener('change', (e) => {
  const caixa = e.target.closest('.expctrl-marcar');
  if (!caixa) return;
  const id = String(caixa.dataset.id);
  if (caixa.checked) expCtrlSelecionadas.add(id); else expCtrlSelecionadas.delete(id);
  atualizarSelecaoExpControle();
});

// "Marcar todos" vale pra tudo o que esta NA BUSCA, e nao so pro trecho
// visivel da rolagem -- e o mesmo criterio que o Imprimir sempre usou.
document.getElementById('expCtrlMarcarTodos').addEventListener('change', (e) => {
  const naBusca = linhasImprimiveisExpControle();
  if (e.target.checked) naBusca.forEach(l => expCtrlSelecionadas.add(String(l.id)));
  else naBusca.forEach(l => expCtrlSelecionadas.delete(String(l.id)));
  renderExpControle(null);
});

// Digitação manual, item a item -- pra quando o dado nao vem de planilha
// nenhuma (a pessoa esta com o material na mao e so quer registrar o
// local). Duas interfaces (formulario completo e passo-a-passo) chamam
// esta MESMA funcao pra nao duplicar a gravacao.
async function gravarMovimentacaoManual({ codigo, pedido, quantidadeTexto, local, op, lote, ref, tipo }) {
  codigo = (codigo || '').trim();
  if (!codigo) return { ok: false, mensagem: 'Informe o código do item.' };
  // Trava repetida aqui (defesa em profundidade): o formulário completo já
  // barra pelo blur do campo Item, mas o passo-a-passo confirma o Item num
  // passo e só chega aqui bem depois -- sem checar de novo na gravação, um
  // código digitado errado no wizard passaria batido.
  if (!itemExisteNoCatalogoExp(codigo)) {
    return { ok: false, mensagem: `NÃO SALVOU: o item ${codigo} não está no Catálogo EXP desta unidade — confira o código.` };
  }

  const linha = {
    unidade: unidadeAtual,
    setor: setorExpAtual, // 'exp' ou 'benchmark' -- qual das duas telas gravou
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

  // Só entrada participa da detecção de troca de pedido -- é o fluxo de
  // "colocar o item na localização"; uma saída digitada aqui é outra coisa
  // (o item já foi embora), não sinaliza nada sobre o pedido anterior.
  if (tipo !== 'saida') await atualizarPedidoProntoAoRegistrar(linha.numero_pedido);

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
// Referência vem ANTES de Lote de propósito: a etiqueta física mostra a
// Referência inteira, mas o Lote sai cortado/ilegível nela -- então dá pra
// digitar a Referência e o Lote exato vem sozinho do Catálogo EXP no passo
// seguinte, em vez de depender do que deu pra ler.
const EXP_WIZ_PASSOS = [
  { campo: 'codigo_item',   rotulo: 'Item', obrigatorio: true },
  { campo: 'numero_pedido', rotulo: 'Nº do Pedido' },
  { campo: 'quantidade',    rotulo: 'Quantidade' },
  { campo: 'localizacao',   rotulo: 'Localização' },
  { campo: 'numero_os_op',  rotulo: 'Nº da OP', opcional: true },
  { campo: 'referencia',    rotulo: 'Referência', opcional: true },
  { campo: 'lote',          rotulo: 'Lote', opcional: true }
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
  // Mesma trava do formulário completo (travarFormularioManual/
  // itemExisteNoCatalogoExp): sem ela, a pessoa preencheria os seis passos
  // seguintes antes de descobrir, só na revisão final, que o item nem
  // existe no Catálogo EXP desta unidade.
  if (passo.campo === 'codigo_item' && valor && !itemExisteNoCatalogoExp(valor)) {
    document.getElementById('expWizMsg').textContent =
      'Este código não está no Catálogo EXP desta unidade — confira o código.';
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
      expWizDicaCatalogoTexto = `${lotes.length} lotes no Catálogo EXP pra este item — digite a Referência (dá pra ler na etiqueta) que o Lote certo vem sozinho: ${textoAjudaLotes(lotes)}`;
    }
  }

  // Referência dá pra ler inteira na etiqueta; Lote não. Ao confirmar a
  // Referência, busca o Lote exato no Catálogo EXP e SUBSTITUI o que
  // estiver ali -- é justamente pra corrigir um Lote lido errado/
  // incompleto, não pra preservar o que já tinha.
  if (passo.campo === 'referencia' && valor) {
    const lote = loteExatoPorReferencia(expWizDados.codigo_item, valor);
    if (lote) {
      expWizDados.lote = lote;
      expWizDicaCatalogoTexto = `Lote ${lote} encontrado no Catálogo EXP pra essa referência.`;
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

// Localização editável direto na lista -- pra quando o item muda de lugar
// depois de já registrado, sem precisar excluir e digitar tudo de novo.
// 'focusout' (não 'blur') porque bubbla até o <tbody> delegado. Não
// recarrega a tela toda: só atualiza o registro em memória, senão o campo
// perderia o foco a cada edição.
document.getElementById('expCtrlBody').addEventListener('focusout', async (e) => {
  const input = e.target.closest('.expctrl-loc-input');
  if (!input) return;

  const item = progExpControle.find(l => l.id === input.dataset.id);
  if (!item) return;

  const novaLocalizacao = input.value.trim() || null;
  if (novaLocalizacao === (item.localizacao || null)) return; // nada mudou

  input.disabled = true;
  const { error } = await sb.from('exp_controle_itens').update({ localizacao: novaLocalizacao }).eq('id', item.id);
  input.disabled = false;

  if (error) {
    alert('Não foi possível salvar a localização: ' + error.message);
    input.value = item.localizacao || '';
    return;
  }
  item.localizacao = novaLocalizacao;
  input.style.borderColor = 'var(--blue)';
  setTimeout(() => { input.style.borderColor = ''; }, 1200);
});

// Quantidade editável direto na lista -- pra corrigir sem excluir e
// digitar tudo de novo (mesmo padrão da Localização acima).
document.getElementById('expCtrlBody').addEventListener('focusout', async (e) => {
  const input = e.target.closest('.expctrl-qtd-input');
  if (!input) return;

  const item = progExpControle.find(l => l.id === input.dataset.id);
  if (!item) return;

  const novaQtd = input.value.trim() ? parseQtd(input.value.trim()) : null;
  if (novaQtd === (item.quantidade != null ? parseQtd(item.quantidade) : null)) return; // nada mudou

  input.disabled = true;
  const { error } = await sb.from('exp_controle_itens').update({ quantidade: novaQtd }).eq('id', item.id);
  input.disabled = false;

  if (error) {
    alert('Não foi possível salvar a quantidade: ' + error.message);
    input.value = item.quantidade != null ? item.quantidade : '';
    return;
  }
  item.quantidade = novaQtd;
  input.style.borderColor = 'var(--blue)';
  setTimeout(() => { input.style.borderColor = ''; }, 1200);
});

// Data de Entrada/Saída editáveis -- pra quando o registro é digitado
// depois (ex.: no dia seguinte), a pessoa põe o dia que separou/retirou
// de verdade, não o dia que digitou no app. Mesmo padrão da Localização
// (focusout salva, só se mudou, feedback de borda azul).
async function salvarDataExpControle(input, campo, obrigatorio) {
  const item = progExpControle.find(l => l.id === input.dataset.id);
  if (!item) return;

  const textoDigitado = input.value.trim();
  if (!textoDigitado) {
    // criado_em não aceita nulo no banco (not null); retirado_em até
    // aceitaria, mas apagar aqui deixaria "Saiu p/ carregamento" sem data
    // de saída -- pra desfazer de vez, tem o botão ↺ no Histórico.
    input.value = formatarDataHoraBR(item[campo]);
    if (obrigatorio) alert('Essa data não pode ficar em branco.');
    return;
  }

  const dataDigitada = parseDataHoraBR(textoDigitado, item[campo]);
  if (!dataDigitada) {
    alert('Data inválida. Use o formato DD/MM/AAAA ou DD/MM/AAAA, HH:mm (ex.: 07/09/2026, 13:44).');
    input.value = formatarDataHoraBR(item[campo]);
    return;
  }

  const novaData = dataDigitada.toISOString();
  if (novaData === item[campo]) { input.value = formatarDataHoraBR(item[campo]); return; } // nada mudou

  input.disabled = true;
  const { error } = await sb.from('exp_controle_itens').update({ [campo]: novaData }).eq('id', item.id);
  input.disabled = false;

  if (error) {
    alert('Não foi possível salvar a data: ' + error.message);
    input.value = formatarDataHoraBR(item[campo]);
    return;
  }
  item[campo] = novaData;
  input.value = formatarDataHoraBR(novaData);
  input.style.borderColor = 'var(--blue)';
  setTimeout(() => { input.style.borderColor = ''; }, 1200);
}

document.getElementById('expCtrlBody').addEventListener('focusout', (e) => {
  const criadoInput = e.target.closest('.expctrl-criado-input');
  if (criadoInput) { salvarDataExpControle(criadoInput, 'criado_em', true); return; }
  const retiradoInput = e.target.closest('.expctrl-retirado-input');
  if (retiradoInput) salvarDataExpControle(retiradoInput, 'retirado_em', false);
});

document.getElementById('expCtrlBody').addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.key === 'Enter') e.target.blur();
});

// Exportar pra conferir contra o sistema (a planilha real, ou outra fonte)
// -- e o motivo do Robson ter pedido este controle: "tiro a relação do
// sistema e confronto pra ver se as quantidades batem". Ele também usa a
// exportação pra montar relatório -- por isso 3 formatos: Excel de
// verdade (biblioteca xlsx, número fica número, não texto com vírgula),
// CSV (mais leve, abre em qualquer coisa) e HTML (visual, pronto pra
// colar num e-mail ou imprimir/"salvar como PDF" do próprio navegador).
const EXP_EXPORT_CABECALHO = ['Localização', 'Item', 'Descrição', 'UM', 'Nº Pedido', 'Quantidade', 'Nº OP', 'Lote', 'Referência', 'Status', 'Entrada em', 'Saída em'];

// O que vai para o papel (e para o Exportar): os itens MARCADOS, e a lista
// inteira da busca quando nada esta marcado.
//
// Nada marcado = imprimir tudo de proposito: era assim antes de existir a
// caixa de selecao, e quem so quer a folha do dia nao precisa marcar nada.
// A selecao e um recorte a mais DENTRO da busca, nao em vez dela -- item
// marcado que a busca escondeu nao sai na folha, senao a folha traria
// item que a pessoa nao esta vendo na tela.
// A chave que agrupa a folha impressa. Item sem numero de pedido nao e um
// pedido: todos eles caem num grupo unico, que sai por ultimo, em vez de
// virar uma folha para cada.
//
// Mora numa funcao porque a mesma regra e usada em dois lugares: aqui, para
// montar os grupos da folha, e no botao Imprimir, para contar quantas folhas
// vao sair antes de mandar para a impressora.
function chavePedidoFolha(numeroPedido) {
  const n = String(numeroPedido == null ? '' : numeroPedido).trim();
  return n || '(sem pedido)';
}

function linhasParaImprimirExpControle() {
  const linhas = linhasImprimiveisExpControle();
  if (!expCtrlSelecionadas.size) return linhas;
  return linhas.filter(l => expCtrlSelecionadas.has(String(l.id)));
}

function linhasExportacaoExpControle() {
  return linhasParaImprimirExpControle().map(l => {
    const desc = expCtrlDescMap.get(l.codigo_item);
    return [
      l.localizacao || '', l.codigo_item, desc && desc.descricao ? desc.descricao : '', desc && desc.um ? desc.um : '',
      l.numero_pedido || '', l.quantidade != null ? l.quantidade : null, l.numero_os_op || '', l.lote || '', l.referencia || '',
      l.status === 'retirado' ? 'Saiu p/ carregamento' : 'Na expedição',
      l.criado_em ? new Date(l.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '',
      l.retirado_em ? new Date(l.retirado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
    ];
  });
}

function baixarArquivo(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportarExpControleCsv(nomeBase) {
  // ; como separador (nao vírgula) porque o numero brasileiro usa vírgula
  // decimal -- Excel PT-BR abre certo direto com ;.
  const csv = [EXP_EXPORT_CABECALHO, ...linhasExportacaoExpControle()]
    .map(linha => linha.map(v => `"${String(v != null ? v : '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  baixarArquivo(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), nomeBase + '.csv');
}

// O xlsx.full.min.js tem 861 KB e so esta funcao o usa: e buscado aqui, na
// primeira exportacao da sessao. Ver carregarBiblioteca() no config.js.
async function exportarExpControleXlsx(nomeBase) {
  await carregarBiblioteca('o Exportar Excel', CDN_XLSX,
                           () => typeof XLSX !== 'undefined');
  const planilha = XLSX.utils.aoa_to_sheet([EXP_EXPORT_CABECALHO, ...linhasExportacaoExpControle()]);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Controle EXP');
  XLSX.writeFile(livro, nomeBase + '.xlsx');
}

// Só do Imprimir (botão "Imprimir", folha pro pallet) -- o Exportar HTML
// tinha o MESMO layout gigante até 11/09/2026, quando o Robson pediu um
// tamanho menor "como planilha" só pro exportado, e depois confirmou "só
// ao exportar": quem imprime cola no pallet e precisa ler de 3 metros;
// quem exporta abre o arquivo na tela pra olhar, e a ficha gigante ali só
// atrapalhava. Ver montarHtmlExpControleTabela() logo abaixo, que é o que
// o Exportar HTML usa agora.
function montarHtmlExpControle(scriptAutoImprimir) {
  const linhasFiltradas = linhasParaImprimirExpControle();
  // Uma FICHA por item, e não uma linha de tabela. A folha vai colada no
  // pallet no nível 3 do porta-pallet e é lida do chão (Robson, 09/09/2026:
  // "preciso que aumente a letra para visualizar até 03 metros de altura").
  // Numa tabela de doze colunas não cabe letra desse tamanho -- a largura da
  // folha é dividida entre todas, e sobra pouco pro que importa de longe. Na
  // ficha, código do item e quantidade ficam sozinhos na primeira linha e usam
  // a largura inteira; OP, lote, referência e datas continuam na folha, miúdos,
  // porque esses só são lidos de perto, na conferência.
  // Uma leitura só do relógio: o cabeçalho e o rodapé de cada ficha usam a
  // MESMA hora. Duas chamadas a new Date() podem cair em minutos diferentes
  // na virada, e aí a folha 1 diria 13:59 e a folha 2, 14:00.
  const impressoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const detalhe = (rotulo, valor) => (valor !== null && valor !== undefined && String(valor).trim())
    ? `<span><b>${rotulo}</b> ${escapeHtml(valor)}</span>` : '';
  // AGRUPADO POR PEDIDO (pedido do Victor, 10/09/2026: "não separar por item,
  // separar por pedido. Se for do mesmo pedido, pode por na mesma pagina.
  // Pedidos diferentes, separar por paginas"). A folha vai colada no pallet, e
  // o pallet é o pedido -- não o item.
  //
  // ⚠️ Agrupar é obrigatório, não é enfeite: a consulta traz as linhas ordenadas
  // por LOCALIZAÇÃO (ver o .order() da carga), então dois itens do mesmo pedido
  // guardados em corredores diferentes chegam longe um do outro. Sem agrupar, o
  // mesmo pedido sairia em duas folhas e uma folha misturaria pedidos.
  const grupos = new Map();
  linhasExportacaoExpControle().forEach(linha => {
    const chave = chavePedidoFolha(linha[4]);   // [4] = Nº Pedido
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(linha);
  });
  // Ordem de aparição (o Map preserva), com o grupo sem pedido no fim: ele não
  // é um pedido, e deixá-lo no meio empurraria pedido de verdade para trás.
  const ordemGrupos = [...grupos.keys()]
    .sort((a, b) => (a === '(sem pedido)' ? 1 : 0) - (b === '(sem pedido)' ? 1 : 0));

  const gruposHtml = ordemGrupos.map(chave => `<section class="grupo">
      <div class="grupo-topo">
        <span class="grupo-pedido">${chave === '(sem pedido)' ? 'Sem nº de pedido' : 'Pedido ' + escapeHtml(chave)}</span>
        <span class="grupo-itens">${grupos.get(chave).length} item(ns)</span>
      </div>
      <div class="grupo-quem">${escapeHtml(rotuloUnidade(unidadeAtual))} &middot; Impresso por ${escapeHtml(nomeUsuarioAtual || emailUsuarioAtual || '—')} &mdash; ${impressoEm}</div>
      ${grupos.get(chave).map(
        ([localizacao, item, descricao, um, pedido, qtd, op, lote, referencia, status, entrada, saida]) =>
        `<article class="ficha">
          <div class="ficha-topo">
            <span class="ficha-item">${escapeHtml(item)}</span>
            <span class="ficha-qtd">${escapeHtml(qtd != null ? qtd : '')}${um ? ` <small>${escapeHtml(um)}</small>` : ''}</span>
          </div>
          <div class="ficha-desc">${escapeHtml(descricao || '')}</div>
          <div class="ficha-detalhes">${detalhe('Local', localizacao)}${detalhe('Pedido', pedido)}${detalhe('OP', op)}${detalhe('Lote', lote)}${detalhe('Ref.', referencia)}${detalhe('Status', status)}${detalhe('Entrada', entrada)}${detalhe('Saída', saida)}</div>
        </article>`).join('')}
    </section>`).join('');
  const busca = document.getElementById('expCtrlBusca').value.trim();
  // Diz no papel DE ONDE veio este recorte -- a folha vai colada no pallet
  // (o Robson: "essa folha coloco no pallet"), e uma folha parcial sem dizer
  // que e parcial passa por lista completa na conferencia.
  const marcados = linhasFiltradasExpControle()
    .filter(l => expCtrlSelecionadas.has(String(l.id))).length;
  const subtitulo = (busca ? ` — busca: "${escapeHtml(busca)}"` : '')
    + (marcados ? ` — ${marcados} item(ns) escolhido(s) na tela` : '');

  // Se der pra filtrar pra UMA localização só, ela some no fim da folha,
  // gigante, ocupando o espaço que sobra embaixo da tabela -- é a etiqueta
  // que vai colada no pallet, precisa dar pra ler de longe. Se a lista
  // tiver mais de uma localização (busca por item, ou sem busca nenhuma),
  // não tem uma localização só pra destacar, então essa parte some.
  const localizacoes = [...new Set(linhasFiltradas.map(l => l.localizacao).filter(Boolean))];
  const enderecoGrande = localizacoes.length === 1
    ? `<div class="endereco-grande">${escapeHtml(localizacoes[0])}</div>`
    : '';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Controle EXP — ${escapeHtml(rotuloUnidade(unidadeAtual))} — ${new Date().toLocaleDateString('pt-BR')}</title>
<style>
  /* Tamanhos em MILÍMETROS, não em px: aqui o papel é a medida, e a conta que
     importa é a da distância de leitura. Regra de sinalização: altura da letra
     maiúscula ≈ distância / 200. Para os 3 metros do nível 3 do porta-pallet
     isso dá 15 mm de altura de maiúscula, que na Arial (maiúscula ≈ 0,72 do
     corpo) pede corpo de ~21 mm. É por isso que o código do item está em 21mm
     e não num número redondo qualquer. */
  @page { size: A4 portrait; margin: 8mm; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 8mm; box-sizing: border-box; }
  h2 { font-size: 5mm; margin: 0 0 1mm; }
  .impresso-por { font-size: 3.5mm; color: #333; margin: 0 0 4mm; }
  .ficha {
    border: 0.6mm solid #000; border-radius: 2mm; padding: 3mm 4mm; margin-bottom: 3mm;
    page-break-inside: avoid; break-inside: avoid;
  }
  /* UMA FOLHA POR PEDIDO, e nao por item (o Victor, 10/09/2026: "nao separar
     por item, separar por pedido. Se for do mesmo pedido, pode por na mesma
     pagina. Pedidos diferentes, separar por paginas"). A folha vai colada no
     pallet, e o pallet e o PEDIDO -- os itens dele saem juntos, e quem separa
     ve numa folha so tudo o que aquele pedido leva.

     A quebra e entre GRUPOS, com a regra escrita como grupo-mais-grupo em vez
     de page-break-after em todo grupo: quebrando ANTES do segundo em diante, o
     primeiro divide a folha 1 com o cabecalho e nenhuma folha em branco sobra
     no fim. Com page-break-after em todos, o ultimo quebra depois de si mesmo
     e o navegador emite uma pagina vazia.

     O grupo pode passar de uma folha (pedido com muitos itens) -- e por isso
     que nao leva break-inside: avoid. Cada ficha segue inteira numa folha so,
     e o numero do pedido continua na linha de detalhes de cada uma, entao a
     folha 2 de um pedido grande ainda se identifica. */
  .grupo + .grupo { page-break-before: always; break-before: page; }
  .grupo-topo {
    display: flex; align-items: baseline; gap: 0 6mm; flex-wrap: wrap;
    border-bottom: 0.5mm solid #000; padding-bottom: 1.5mm; margin-bottom: 2mm;
  }
  /* O numero do pedido e o que se procura na pilha de folhas, entao e o maior
     texto do cabecalho do grupo -- mas menor que o codigo do item, que e o que
     se le do chao a 3 metros. */
  .grupo-pedido { font-size: 9mm; font-weight: 900; line-height: 1; }
  .grupo-itens { font-size: 4mm; font-weight: 700; color: #444; margin-left: auto; }
  /* A identificacao e do GRUPO, e nao de cada ficha: cada folha e um pedido, e
     repetir a mesma linha embaixo de cada item da folha gastaria altura sem
     dizer nada de novo. Era por ficha enquanto a folha era por item. */
  .grupo-quem { font-size: 3.5mm; color: #555; margin: 0 0 3mm; }
  /* flex-wrap em vez de encolher a letra: com item de 8 dígitos e quantidade de
     6 (ex.: 120918iT + 1284.5 Kg) a linha dá 183mm e no A4 só cabem 178mm --
     sem o wrap o navegador quebraria o CÓDIGO DO ITEM no meio, que é
     justamente o que não pode ficar ilegível. Assim a quantidade desce
     inteira pra linha de baixo, e o item mantém os 21mm. */
  .ficha-topo { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 4mm; }
  /* 21mm = os 3 metros pedidos. */
  .ficha-item { font-size: 21mm; font-weight: 900; line-height: 1; letter-spacing: 0.02em; overflow-wrap: anywhere; }
  /* Quantidade um pouco menor: quem está no chão confere QUAL material é;
     quanto tem se lê chegando perto, junto com OP e lote. */
  .ficha-qtd { font-size: 15mm; font-weight: 800; line-height: 1; white-space: nowrap; margin-left: auto; }
  .ficha-qtd small { font-size: 0.45em; font-weight: 700; }
  .ficha-desc { font-size: 9mm; font-weight: 700; line-height: 1.15; margin-top: 2mm; }
  .ficha-detalhes {
    font-size: 3.5mm; margin-top: 2.5mm; color: #222;
    display: flex; flex-wrap: wrap; gap: 1mm 6mm;
  }
  .ficha-detalhes b { color: #555; font-weight: 700; }
  .endereco-grande {
    text-align: center; page-break-before: avoid; page-break-inside: avoid;
    font-size: 15vw; line-height: 1; font-weight: 900; letter-spacing: 0.05em;
    padding: 10mm 0 3mm; word-break: break-word;
  }
</style></head><body>
<h2>Controle EXP Acessórios — ${escapeHtml(rotuloUnidade(unidadeAtual))} — ${new Date().toLocaleDateString('pt-BR')}${subtitulo}</h2>
<div class="impresso-por">Impresso por ${escapeHtml(nomeUsuarioAtual || emailUsuarioAtual || '—')} &mdash; ${impressoEm}</div>
${gruposHtml}
${enderecoGrande}
${scriptAutoImprimir ? '<script>window.onload = () => window.print();<' + '/script>' : ''}
</body></html>`;
}

// Uma linha por item, mesmas colunas do CSV/Excel (EXP_EXPORT_CABECALHO) --
// pra abrir e olhar como planilha, sem rolar página por página de ficha
// gigante (que é o que montarHtmlExpControle() faz, e continua fazendo,
// só que agora exclusivo do Imprimir).
function montarHtmlExpControleTabela() {
  const impressoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const busca = document.getElementById('expCtrlBusca').value.trim();
  const marcados = linhasFiltradasExpControle()
    .filter(l => expCtrlSelecionadas.has(String(l.id))).length;
  const subtitulo = (busca ? ` — busca: "${escapeHtml(busca)}"` : '')
    + (marcados ? ` — ${marcados} item(ns) escolhido(s) na tela` : '');

  const linhasHtml = linhasExportacaoExpControle().map(linha => `<tr>${
    linha.map(v => `<td>${escapeHtml(v != null && v !== '' ? v : '—')}</td>`).join('')
  }</tr>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Controle EXP — ${escapeHtml(rotuloUnidade(unidadeAtual))} — ${new Date().toLocaleDateString('pt-BR')}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 14px; color: #111; font-size: 12px; }
  h2 { font-size: 15px; margin: 0 0 2px; }
  .impresso-por { font-size: 11px; color: #444; margin: 0 0 10px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 3px 7px; text-align: left; white-space: nowrap; }
  th { background: #eef2f6; font-weight: 700; }
  tr:nth-child(even) td { background: #f7f9fb; }
  @media print { @page { size: A4 landscape; margin: 10mm; } thead { display: table-header-group; } }
</style></head><body>
<h2>Controle EXP Acessórios — ${escapeHtml(rotuloUnidade(unidadeAtual))} — ${new Date().toLocaleDateString('pt-BR')}${subtitulo}</h2>
<div class="impresso-por">Impresso por ${escapeHtml(nomeUsuarioAtual || emailUsuarioAtual || '—')} &mdash; ${impressoEm}</div>
<table>
  <thead><tr>${EXP_EXPORT_CABECALHO.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
  <tbody>${linhasHtml}</tbody>
</table>
</body></html>`;
}

function exportarExpControleHtml(nomeBase) {
  const html = montarHtmlExpControleTabela();
  baixarArquivo(new Blob([html], { type: 'text/html;charset=utf-8;' }), nomeBase + '.html');
}

// Exportar/Imprimir respeitam a busca (#expCtrlBusca) -- pra pegar só o
// que tem numa localização, é só digitar ela na busca antes de clicar
// (mesmo filtro que já estreita a lista na tela).
document.getElementById('expCtrlExportarBtn').addEventListener('click', async () => {
  const linhas = linhasParaImprimirExpControle();
  if (!linhas.length) {
    alert(expCtrlSelecionadas.size
      ? 'Nenhum item marcado bate com a busca atual \u2014 limpe a busca ou desmarque os itens.'
      : (linhasDoSetorAtual().length ? 'Nenhum item bate com a busca atual.'
                                     : 'Nenhum item para exportar.'));
    return;
  }

  const formato = document.getElementById('expCtrlExportarFormato').value;
  const busca = document.getElementById('expCtrlBusca').value.trim();
  const sufixoBusca = busca ? '-' + busca.replace(/[^a-z0-9]+/gi, '') : '';
  const nomeBase = `controle-exp-${unidadeAtual}${sufixoBusca}-${new Date().toISOString().slice(0, 10)}`;

  if (formato === 'xlsx') {
    const botao = document.getElementById('expCtrlExportarBtn');
    const rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Preparando...';
    try {
      await exportarExpControleXlsx(nomeBase);
    } catch (err) {
      // Sem isto a pessoa clica, nada baixa e nada explica o porque.
      alert(err.message);
      console.error('Falha ao exportar em Excel:', err.message);
    } finally {
      botao.disabled = false;
      botao.textContent = rotulo;
    }
  }
  else if (formato === 'html') exportarExpControleHtml(nomeBase);
  else exportarExpControleCsv(nomeBase);
});

// Abre a mesma listagem numa aba nova já pronta pra impressora -- a
// própria caixa de impressão do navegador tem "Salvar como PDF", então
// cobre o PDF de graça, sem precisar de outra biblioteca.
document.getElementById('expCtrlImprimirBtn').addEventListener('click', async () => {
  const linhas = linhasParaImprimirExpControle();
  const msg = document.getElementById('expEtiquetaMsg');
  if (!linhas.length) {
    alert(expCtrlSelecionadas.size
      ? 'Nenhum item marcado bate com a busca atual \u2014 limpe a busca ou desmarque os itens.'
      : (linhasDoSetorAtual().length ? 'Nenhum item bate com a busca atual.'
                                     : 'Nenhum item para imprimir.'));
    return;
  }

  // Sai uma folha por PEDIDO, então o que conta são os pedidos distintos, não
  // as linhas: marcar 30 itens de um pedido só é UMA folha, e avisar "30 folhas"
  // ali seria mentira que treina a pessoa a ignorar o aviso.
  const folhas = new Set(linhas.map(l => chavePedidoFolha(l.numero_pedido))).size;
  if (folhas > LIMITE_FOLHAS_IMPRESSAO && !expImprimirConfirmar) {
    expImprimirConfirmar = true;
    document.getElementById('expCtrlImprimirBtn').textContent =
      '\u26A0\uFE0F Confirmar ' + folhas + ' folhas';
    msg.textContent = 'Vai sair uma folha por pedido: ' + folhas + ' folhas, com '
      + linhas.length + ' item(ns). Clique de novo para imprimir, ou marque só o'
      + ' que precisa.';
    msg.className = 'status-msg status-err';
    return;
  }
  expImprimirConfirmar = false;

  const aba = window.open('', '_blank');
  if (!aba) { alert('O navegador bloqueou a nova aba. Libere pop-ups pra este site e tente de novo.'); return; }
  aba.document.write(montarHtmlExpControle(true));
  aba.document.close();

  // Imprimir aqui É o ato de emitir a etiqueta, então a marcação sai junto:
  // marcar num segundo clique seria mais um passo para esquecer, e a lista
  // passaria a mentir sobre o que já foi etiquetado.
  //
  // Só as linhas desta impressão (respeita a busca) e só as que ainda não
  // tinham etiqueta -- reimprimir não reescreve a data da primeira emissão,
  // que é a que responde "desde quando este item está etiquetado?".
  const { marcados, naoGravados, error } = await gravarEtiquetaEmLote(linhas);
  if (!marcados && !naoGravados && !error) return;

  if (error) {
    // A impressão já saiu -- dizer isso importa, senão a pessoa acha que nada
    // aconteceu e imprime de novo.
    msg.textContent = 'A impressão saiu'
      + (marcados ? ', e marcou ' + marcados + ' etiqueta(s), mas parou no resto: '
                  : ', mas NÃO foi possível marcar a etiqueta como emitida: ')
      + error.message + ' — se a mensagem falar em coluna inexistente, '
      + 'sql/fase16-etiqueta-emitida.sql ainda não foi rodado no Supabase.';
    msg.className = 'status-msg status-err';
    console.error('Falha ao marcar etiqueta emitida:', error.message);
    renderExpControle();
    return;
  }
  renderExpControle();
  msg.textContent = naoGravados
    ? 'A impressão saiu e ' + marcados + ' etiqueta(s) foram marcadas, mas o banco recusou '
      + naoGravados + ' — recarregue a página para ver quais valeram.'
    : marcados + ' etiqueta(s) marcada(s) como emitida(s).';
  msg.className = naoGravados ? 'status-msg status-err' : 'status-msg status-ok';

  // A etiqueta destes itens acabou de sair: deixar tudo marcado convida a
  // reimprimir o mesmo pallet no clique seguinte.
  if (expCtrlSelecionadas.size) { expCtrlSelecionadas.clear(); renderExpControle(null); }
});

// Detecta sozinho quando um pedido está pronto: se o pedido que acabou de
// ganhar um item é DIFERENTE do último pedido registrado, é sinal de que
// quem alimenta a planilha terminou o anterior e seguiu pra outro -- então
// o anterior vira "pronto" (pode imprimir). Pedido do Robson (2026-09-09):
// "quando ela colocar um numero de pedido diferente ao anterior,
// automaticamente ja e pra entender que ja posso tirar a etiqueta".
//
// Reabre sozinho se ela voltar: se o pedido que está recebendo o item agora
// já tinha sido marcado pronto antes, isso significa que na verdade faltava
// item nele -- desmarca, porque óbvio que não estava pronto de verdade.
//
// Só a entrada manual (item por item) passa por aqui -- colar uma planilha
// inteira de uma vez não tem essa noção de "sequência", então não teria
// sentido aplicar a mesma lógica lá.
async function atualizarPedidoProntoAoRegistrar(numeroPedidoNovo) {
  const novo = (numeroPedidoNovo || '').trim() || null;

  if (novo && expPedidoProntoMap.has(novo)) {
    const { error } = await sb.from('exp_pedido_status').delete().eq('unidade', unidadeAtual).eq('numero_pedido', novo);
    if (!error) expPedidoProntoMap.delete(novo);
  }

  if (novo && ultimoPedidoRegistrado && novo !== ultimoPedidoRegistrado) {
    const anterior = ultimoPedidoRegistrado;
    const agora = new Date().toISOString();
    const { error } = await sb.from('exp_pedido_status').upsert({
      unidade: unidadeAtual, numero_pedido: anterior, pronto_por: nomeUsuarioAtual, pronto_em: agora
    }, { onConflict: 'unidade,numero_pedido' });
    if (!error) expPedidoProntoMap.set(anterior, { pronto_por: nomeUsuarioAtual, pronto_em: agora });
    else console.error('Falha ao marcar pedido anterior como pronto:', error.message);
  }

  if (novo) ultimoPedidoRegistrado = novo;
}

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
  const pendentes = linhasDoSetorAtual().filter(l => l.status !== 'retirado');
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
    const itens = linhasDoSetorAtual().filter(l => (l.localizacao || '(sem localização)') === local && l.status !== 'retirado');
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

  let retirados = linhasDoSetorAtual().filter(l => l.status === 'retirado');
  retirados = [...retirados].sort((a, b) => new Date(b.retirado_em || 0) - new Date(a.retirado_em || 0));

  if (busca) {
    retirados = retirados.filter(l =>
      String(l.numero_pedido).toLowerCase().includes(busca) ||
      String(l.codigo_item).toLowerCase().includes(busca) ||
      String(l.localizacao).toLowerCase().includes(busca));
  }

  vazio.style.display = retirados.length ? 'none' : 'block';
  if (!retirados.length) {
    vazio.textContent = linhasDoSetorAtual().some(l => l.status === 'retirado')
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

// ---- Relatório de saídas do dia pro PCP -------------------------------------
// "isso que saiu pro carregamento foi realmente faturado?" (pedido do
// Robson). Mesmo padrão de mailto da Requisição ALM: o portal não manda
// e-mail sozinho (não existe servidor aqui), só abre pronto no Outlook —
// a pessoa confere e clica em enviar. O e-mail do PCP fica em
// config_unidade (aba Configurações), NÃO fixo no código: cada unidade
// tem o próprio PCP.
(function iniciarDataRelatorioPcp() {
  const hoje = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD, formato do <input type="date">
  document.getElementById('relPcpData').value = hoje;
})();

// Monta o mailto do relatório -- função pura (não mexe no DOM nem navega),
// separada do listener só pra poder testar a lógica sem precisar simular
// clique de botão nem navegação de verdade.
function montarRelatorioPcp(dataEscolhida, emailPcp) {
  // Compara por data local (nao UTC) -- e a mesma data que a coluna
  // "Retirado em" mostra na tela (toLocaleString), pra bater com o que a
  // pessoa esta vendo.
  const saidasDoDia = linhasDoSetorAtual().filter(l =>
    l.status === 'retirado' && l.retirado_em
    && new Date(l.retirado_em).toLocaleDateString('en-CA') === dataEscolhida);

  if (!saidasDoDia.length) {
    return { ok: false, mensagem: 'Nenhuma saída registrada nessa data.' };
  }

  const dataFormatada = new Date(dataEscolhida + 'T00:00:00').toLocaleDateString('pt-BR');
  const rotuloSetor = setorExpAtual === 'benchmark' ? 'Benchmark' : 'EXP';
  const assunto = `Saídas ${rotuloSetor} ${rotuloUnidade(unidadeAtual)} - ${dataFormatada}`;

  const linhas = saidasDoDia
    .sort((a, b) => new Date(a.retirado_em) - new Date(b.retirado_em))
    .map(l => {
      const desc = expCtrlDescMap.get(l.codigo_item);
      const quando = new Date(l.retirado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${quando}  Pedido ${l.numero_pedido || '—'}  |  Item ${l.codigo_item} - ${desc && desc.descricao ? desc.descricao : 'sem descrição'}`
        + `  |  Qtd ${l.quantidade != null ? l.quantidade : '—'}  |  Retirado por ${l.retirado_por || '—'}`;
    });

  const corpo = [
    `Relatório de saídas do Controle EXP Acessórios — ${rotuloUnidade(unidadeAtual)} — ${dataFormatada}`,
    `${saidasDoDia.length} item(ns) saíram para o carregamento nesse dia.`,
    '',
    ...linhas,
    '',
    'Favor confirmar se todos os pedidos acima foram realmente faturados.',
    '--',
    'Relatório gerado pelo Portal de Estoque (Controle EXP Acessórios).'
  ].join('\n');

  const href = 'mailto:' + encodeURIComponent(emailPcp)
             + '?subject=' + encodeURIComponent(assunto)
             + '&body=' + encodeURIComponent(corpo);

  const cortado = href.length > 1900;
  return {
    ok: true,
    href,
    cortado,
    quantidade: saidasDoDia.length,
    mensagem: cortado
      ? `${saidasDoDia.length} saída(s) encontrada(s). ATENÇÃO: são muitos itens e o e-mail pode sair cortado `
        + '— confira antes de enviar, ou exporte o CSV do Controle EXP pra anexar em vez de listar tudo no corpo.'
      : `${saidasDoDia.length} saída(s) encontrada(s). Abrindo o e-mail — confira e clique em enviar.`
  };
}

document.getElementById('relPcpGerarBtn').addEventListener('click', async () => {
  const msg = document.getElementById('relPcpMsg');
  const btn = document.getElementById('relPcpGerarBtn');
  const dataEscolhida = document.getElementById('relPcpData').value;

  if (!dataEscolhida) {
    msg.textContent = 'Escolha uma data.';
    msg.className = 'status-msg status-err';
    return;
  }

  btn.disabled = true;
  msg.textContent = 'Buscando e-mail do PCP...';
  msg.className = 'status-msg';

  // config_unidade só é lida direto por admin (fase7) -- quem não é admin
  // (estoque_alm, que também acessa esta página) precisa da função.
  const { data: emailPcp, error: erroConfig } = await sb.rpc('email_pcp_da_unidade', { uni: unidadeAtual });

  btn.disabled = false;

  if (erroConfig || !emailPcp) {
    msg.textContent = 'Esta unidade não tem e-mail do PCP cadastrado. Peça pro admin cadastrar em Configurações.';
    msg.className = 'status-msg status-err';
    return;
  }

  const resultado = montarRelatorioPcp(dataEscolhida, emailPcp);
  msg.textContent = resultado.mensagem;
  msg.className = resultado.ok ? (resultado.cortado ? 'status-msg status-err' : 'status-msg status-ok') : 'status-msg status-err';
  if (!resultado.ok) return;

  window.location.href = resultado.href;
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
  // Paginado pelo mesmo motivo: o catálogo do sistema tem milhares de linhas
  // numa unidade cheia (a mensagem de substituição já falava em 4.000), e
  // cortado em 1.000 ele viraria "item não existe no sistema" na aba Conferir.
  const { data, error } = await buscarTudoPaginado((de, ate) =>
    sb.from('catalogo_exp_itens').select('*').eq('unidade', unidadeAtual)
      .order('id', { ascending: true }).range(de, ate));
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
  // UMA chamada, numa transação: era delete + insert em duas, e uma falha no
  // meio deixava a unidade SEM catálogo nenhum -- item A2 da AUDITORIA.md, já
  // fechado no estoque e nas bobinas e esquecido aqui. A mesma função serve a
  // aba de lote das Configurações: uma regra de substituição, um lugar.
  const { error: erroInsert } = await sb.rpc('substituir_catalogo_exp', {
    payload: [{ unidade: unidadeAtual, itens: linhas, atualizado_por: nomeUsuarioAtual }]
  });
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
// Código que não existe no Catálogo EXP desta unidade -- Robson, 10/09/2026,
// vendo o item "135556i" na aba Conferir como "Só no físico", sem
// descrição nenhuma: "escrevi o codigo errado, quero que coloque uma trava
// se eu digitar o codigo que nao estiver no catalago nao deixar preencher".
// Sem a trava, um código digitado errado virava uma linha fantasma em
// exp_controle_itens -- ninguém vai apagar isso na mão, e é exatamente o
// tipo de "Só no físico" que a aba Conferir foi feita pra achar.
function itemExisteNoCatalogoExp(codigo) {
  return catalogoExpItens.some(l => l.codigo_item === codigo);
}

// Trava/destrava os campos que vêm DEPOIS do Item no formulário completo,
// conforme o código bater ou não com o Catálogo EXP desta unidade. Chamada
// no blur do Item (ver mais abaixo) -- então a pessoa só digita o resto
// depois de o código já ter sido conferido.
function travarFormularioManual(bloquear) {
  ['expManualQtd', 'expManualLocal', 'expManualAdicionarBtn', 'expManualExtrasToggleBtn']
    .forEach(id => { document.getElementById(id).disabled = bloquear; });
}

function lotesDoItemNoCatalogo(codigo) {
  return catalogoExpItens.filter(l => l.codigo_item === codigo && (l.referencia || l.lote));
}

function textoAjudaLotes(lotes) {
  return lotes.map(l => `${l.lote || '—'} (ref ${l.referencia || '—'}, ${l.quantidade != null ? l.quantidade : '?'} ${l.um || ''})`).join('; ');
}

// A etiqueta física do item mostra Nº da OP e Referência inteiros, mas o
// Lote sai cortado/ilegível nela -- por isso, quando a pessoa digita a
// Referência (que ela CONSEGUE ler), busca o Lote exato no Catálogo EXP em
// vez de depender do que deu pra ler na etiqueta. O Catálogo EXP não tem
// coluna de OP (a planilha do sistema não traz isso), então a busca é só
// por Item + Referência -- é o par que já identifica o lote sem ambiguidade.
function loteExatoPorReferencia(codigo, referencia) {
  if (!codigo || !referencia) return null;
  const achou = catalogoExpItens.find(l => l.codigo_item === codigo && l.referencia === referencia);
  return achou ? achou.lote : null;
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
  if (!codigo) { descricaoEl.textContent = ''; dica.textContent = ''; travarFormularioManual(false); return; }

  if (!itemExisteNoCatalogoExp(codigo)) {
    descricaoEl.textContent = '⚠ Este código não está no Catálogo EXP desta unidade — confira o código, ou cole a planilha do sistema na aba Catálogo.';
    descricaoEl.className = 'status-msg status-err';
    dica.textContent = '';
    travarFormularioManual(true);
    return;
  }
  travarFormularioManual(false);

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
    dica.textContent = `${lotes.length} lotes no Catálogo EXP pra este item — digite a Referência (dá pra ler na etiqueta) que o Lote certo vem sozinho: ${textoAjudaLotes(lotes)}`;
    dica.className = 'status-msg';
  }
});

// Referência dá pra ler inteira na etiqueta; Lote não. Digitando a
// Referência, busca o Lote exato no Catálogo EXP e substitui o que
// estiver no campo (o objetivo aqui é justamente corrigir um Lote lido
// errado/incompleto, não preservar o que já tinha).
document.getElementById('expManualRef').addEventListener('blur', () => {
  const codigo = document.getElementById('expManualItem').value.trim();
  const referencia = document.getElementById('expManualRef').value.trim();
  const lote = loteExatoPorReferencia(codigo, referencia);
  if (!lote) return;
  document.getElementById('expManualLote').value = lote;
  const dica = document.getElementById('expManualCatalogoDica');
  dica.textContent = `Lote ${lote} encontrado no Catálogo EXP pra essa referência.`;
  dica.className = 'status-msg status-ok';
});
