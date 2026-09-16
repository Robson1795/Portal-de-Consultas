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
let paradosObsMap = new Map(); // numero_pedido -> {observacao, atualizado_por, atualizado_em} -- aba Parados
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
  const [pedidos, expCtrl, pedidoStatus, paradosObs] = await Promise.all([
    sb.from('vw_pedidos_prioridade').select('*').eq('unidade', unidadeAtual),
    // Paginado: a movimentação da expedição é append-only de propósito (nunca
    // apaga, vira histórico), então esta é a tabela que passa de 1.000 linhas
    // primeiro -- e é um dos dois lados da aba Conferir.
    buscarTudoPaginado((de, ate) => sb.from('exp_controle_itens').select('*')
      .eq('unidade', unidadeAtual).order('id', { ascending: true }).range(de, ate)),
    sb.from('exp_pedido_status').select('*').eq('unidade', unidadeAtual),
    sb.from('exp_pedido_parado_obs').select('*').eq('unidade', unidadeAtual)
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

  // exp_pedido_parado_obs e mais novo ainda (fase56) -- mesmo tratamento:
  // se o script nao rodou, o mapa fica vazio e a aba Parados continua
  // funcionando, só sem observação nenhuma.
  paradosObsMap = new Map(
    (paradosObs.error ? [] : (paradosObs.data || []))
      .map(l => [l.numero_pedido, l])
  );

  progEstoqueMap = await buscarSaldoAlmoxarifado(progItens.map(i => i.codigo_item));

  // Retoma de onde a digitação parou: o último pedido gravado (por
  // criado_em) volta a ser "o pedido atual" pra detecção de troca continuar
  // funcionando depois de um recarregamento de página no meio do trabalho.
  if (progExpControle.length) {
    ultimoPedidoRegistrado = progExpControle
      .slice()
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))[0].numero_pedido || null;
  }

  renderSeparacao();
  renderPendencias();
  renderCarregamento();
  renderExpControle(expCtrl.error ? expCtrl.error.message : null);
  if (!expCtrl.error) {
    renderConferencia(); // barato (so filtra em memoria); sem isso a Conferencia so atualizava ao trocar de sub-aba
    // Robson, 11/09/2026: "pega o historico do que coloquei na doca e ja
    // coloca la" -- mesmo motivo da linha acima: sem isso, item ja marcado
    // DOCA (nesta sessao ou em outra) só aparecia na aba DOCA se essa aba
    // já estivesse aberta na hora da chamada, não ao simplesmente carregar
    // os dados de novo (Atualizar, ou reabrir a página).
    renderDoca();
    // Mesmo motivo: "dias parado" muda todo dia mesmo sem ninguém clicar em
    // nada, então recalcula sempre que os dados forem recarregados, não só
    // ao trocar pra esta sub-aba.
    renderParadosExp();
    // Painel de Docas: mantém fresco o mapa "pedido -> caminhão que está
    // carregando agora", usado pelo "✓ Carregou" da aba DOCA. Não bloqueia
    // a tela (sem await): o Controle EXP tem de aparecer mesmo que o
    // fase39 ainda não tenha rodado no Supabase.
    carregarCarregamentosAbertos();
  }
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
  document.getElementById('progCarregamento').style.display = aba === 'carregamento' ? 'block' : 'none';
  document.getElementById('progPendencias').style.display = aba === 'pendencias' ? 'block' : 'none';
  // Campo de observacao so consegue se medir com a aba aberta (ver
  // ajustarAlturaObs): ao voltar pra Separacao, remede o que ficou de fora.
  if (aba === 'separacao') ajustarTodasAlturasObs();
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
    (aba === 'catalogo' || aba === 'conferir' || aba === 'auditoria' || aba === 'doca' || aba === 'parados' || aba === 'avisoprep') ? 'none' : 'block';
  document.getElementById('expEntradaAba').style.display = aba === 'entrada' ? 'block' : 'none';
  document.getElementById('progConferencia').style.display = aba === 'saida' ? 'block' : 'none';
  document.getElementById('expCatalogoAba').style.display = aba === 'catalogo' ? 'block' : 'none';
  document.getElementById('expConferirAba').style.display = aba === 'conferir' ? 'block' : 'none';
  document.getElementById('expAuditoriaAba').style.display = aba === 'auditoria' ? 'block' : 'none';
  document.getElementById('expDocaAba').style.display = aba === 'doca' ? 'block' : 'none';
  document.getElementById('expParadosAba').style.display = aba === 'parados' ? 'block' : 'none';
  document.getElementById('expAvisoPrepAba').style.display = aba === 'avisoprep' ? 'block' : 'none';
  if (aba === 'saida') renderConferencia();
  if (aba === 'conferir') {
    renderConferirExp(); // mostra rápido com o que já tem em memória (a 1ª vez, sem observação/exclusão ainda)
    carregarConferirExpNotas().then(renderConferirExp);
    carregarPedidoFaturamentoConfirmado();
  }
  if (aba === 'auditoria') {
    renderAuditoriaFisica();
    carregarConfFisica().then(renderAuditoriaFisica);
  }
  if (aba === 'doca') {
    renderDoca(); // mostra rápido com o que já tem em memória
    // Robson, 11/09/2026: "pega o historico do que coloquei na doca e ja
    // coloca la" -- busca de novo no banco ao abrir a aba, em vez de
    // confiar só no que já estava carregado: item marcado DOCA antes de
    // abrir esta aba (ou por outra pessoa, em outra sessão) aparece na
    // hora, sem precisar de nenhuma ação a mais.
    carregarProgramacao();
  }
  if (aba === 'parados') {
    renderParadosExp(); // mostra rápido com o que já tem em memória
    carregarProgramacao(); // mesma lógica do DOCA: busca de novo ao abrir
  }
  if (aba === 'avisoprep') {
    carregarAvisosPreparo().then(renderAvisosPreparo);
  }
}

// Catálogo antes da Programação, mesmo motivo do carregamento inicial em
// js/navegacao.js -- senão um "Atualizar" manual clicado antes do catálogo
// terminar de carregar também deixaria Descrição/UM em branco.
document.getElementById('expAtualizarBtn').addEventListener('click', () => carregarCatalogoExp().then(carregarProgramacao));

// ---- Helpers ----------------------------------------------------------------
// 'separado', 'reportado' e 'falta_reporte' contam os três como concluído.
// Os dois primeiros vêm da planilha A com o rótulo único "SEPARADO/REPORTADO".
// 'falta_reporte' entrou em 15/09/2026 como estado marcável à mão na tela
// (antes só vinha da planilha) -- o Robson: material já separado, só falta o
// registro no sistema, então o caminhão pode sair igual. Se um dia
// "reportado" ou "falta_reporte" virarem estágio anterior de verdade, é só
// tirar daqui e do gatilho em sql/programacao-02 (`recalcular_status_pedido`).
function itemConcluido(item) {
  return item.status_separacao === 'separado' || item.status_separacao === 'reportado'
    || item.status_separacao === 'falta_reporte';
}

// Ciclo do botão manual da Separação (15/09/2026): Pendente -> Separado/
// Reportado -> Falta reporte -> Pendente de novo. 'reportado' (só chega por
// importação da planilha) avança pra 'falta_reporte' igual a 'separado' --
// não tem um quarto clique só pra ele.
function proximoStatusSeparacao(atual) {
  if (atual === 'aguardando') return 'separado';
  if (atual === 'separado' || atual === 'reportado') return 'falta_reporte';
  return 'aguardando';
}

const ROTULO_BOTAO_SEPARACAO = {
  aguardando: 'Marcar separado/reportado',
  separado: 'Marcar falta reporte',
  reportado: 'Marcar falta reporte',
  falta_reporte: 'Reabrir (pendente)'
};

const ROTULO_STATUS_ITEM = { aguardando: 'Pendente', separado: 'Separado', reportado: 'Separado', falta_reporte: 'Falta reporte' };
const CLASSE_STATUS_ITEM = { aguardando: 'st-pendente', separado: 'st-ativo', reportado: 'st-ativo', falta_reporte: 'st-atencao' };

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

// Hoje no mesmo formato de `data_carregamento` ("YYYY-MM-DD"), pelo relogio
// da maquina. Aqui e so pra ESCONDER dia que ja passou -- se o relogio de
// alguem estiver um dia torto, o pior que acontece e ver um dia a mais ou a
// menos na tela; nada e gravado a partir disto.
function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Quando o item foi marcado como separado. Robson, 16/09/2026: "coloca data e
// horario da separação tambem". `separado_em` e timestamp UTC do banco; aqui
// vira hora local de quem olha, que e a que o pessoal do almoxarifado usa.
function momentoSeparacao(quando) {
  if (!quando) return '—';
  const d = new Date(quando);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Com ano: o titulo da divisao de carregamento diz o dia inteiro, pra nao
// deixar duvida de qual 17/09 e quando a lista pega mais de um mes.
function dataLonga(data) {
  if (!data) return '—';
  const [ano, mes, dia] = String(data).split('-');
  return (ano && mes && dia) ? `${dia}/${mes}/${ano}` : String(data);
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

// Pedido sem DATA nenhuma de carregamento vai pro fim -- nao da pra dizer
// que e urgente, mas tambem nao pode sumir da lista.
//
// Robson, 16/09/2026, olhando a Separação com quase todo pedido mostrando
// "16/09 —" (data sim, horário não): "faça a sequencia de pedido conforme
// horario de agendamento dos caminhões". Comparar só por
// `momento_carregamento` (data+hora, de vw_pedidos_prioridade) tratava
// pedido com DATA mas sem HORA como se não tivesse agendamento nenhum --
// null + qualquer coisa vira null em SQL, então a maioria dos pedidos reais
// (que só tem a data, ainda sem hora exata na planilha B) caía toda no
// mesmo "fim da fila" indistinto, em vez de ordenados pelo dia que saem.
// Agora compara por DATA primeiro (a maior parte do trabalho de
// sequenciar), e só usa a HORA como desempate de quem tem data igual --
// pedido com hora definida vem antes do que só tem a data (é a informação
// mais precisa que se tem), e entre dois com hora, o mais cedo primeiro.
//
// Último desempate: `ordem_carregamento` (posição em que o pedido apareceu
// na planilha de Carregamento colada). O Robson, perguntado o que decide a
// ordem entre pedidos do MESMO dia sem hora nenhuma (a maioria): "a ordem
// que aparece na planilha colada" -- geralmente já reflete a sequência de
// carregamento que o PCP pretendeu, mesmo sem hora exata digitada ainda.
// Sem isso, dois pedidos empatados em data e hora (as duas ausentes, o caso
// mais comum) ficavam na ordem que o JS array.sort() decidisse, que não é
// garantida estável em todo motor -- podia mudar sozinha a cada F5.
function compararPorUrgencia(pedidoA, pedidoB) {
  const dataA = pedidoA ? pedidoA.data_carregamento : null;
  const dataB = pedidoB ? pedidoB.data_carregamento : null;
  if (!dataA && !dataB) return 0;
  if (!dataA) return 1;
  if (!dataB) return -1;
  if (dataA !== dataB) return dataA < dataB ? -1 : 1; // "YYYY-MM-DD" compara certo como string

  const horaA = pedidoA.horario_carregamento;
  const horaB = pedidoB.horario_carregamento;
  if (horaA !== horaB) {
    if (!horaA) return 1;
    if (!horaB) return -1;
    return horaA < horaB ? -1 : 1;
  }

  const ordemA = pedidoA.ordem_carregamento;
  const ordemB = pedidoB.ordem_carregamento;
  if (!ordemA && !ordemB) return 0;
  if (!ordemA) return 1;
  if (!ordemB) return -1;
  return ordemA - ordemB;
}

// ---- Saldo do Almoxarifado na lista de separação ----------------------------
// Robson, 16/09/2026, vendo o botao "sem estoque" em item que ele TEM:
// "puxa o estoque na aba do almoxarifado e coloca ali". Sem o saldo do lado,
// decidir se o item vira pendencia era memoria ou ir conferir em outra tela.
//
// Mesma fonte da Consulta de Itens: tabela `estoque`, depósito 'alm' e a
// unidade aberta -- saldo de outra unidade nao ajuda quem esta separando aqui.
let progEstoqueMap = new Map();

// Verde quando o saldo cobre o que o pedido precisa, vermelho quando nao tem
// nada, amarelo quando tem mas nao o suficiente -- e o que decide se o item
// pode ser separado agora, vira pendencia ou sai parcial.
//
// Fica no fim da linha, colado no botao que usa essa informacao, e NAO ao lado
// de "Qtd". Robson, 16/09/2026: "estoque coloque em outra coluna para nao
// confundir com a quantidade do pedido" -- duas colunas de numero vizinhas,
// uma dizendo quanto o cliente pediu e outra quanto tem na prateleira, davam
// leitura trocada. O cabecalho tambem diz de onde vem o numero: "Estoque ALM".
function celulaEstoqueHtml(item) {
  const saldo = progEstoqueMap.get(String(item.codigo_item));
  if (saldo == null) return '<td class="num prog-estoque">—</td>';
  const precisa = parseQtd(item.quantidade);
  const classe = saldo <= 0 ? 'prog-estoque-zero'
    : (precisa > 0 && saldo < precisa) ? 'prog-estoque-parcial'
    : 'prog-estoque-ok';
  return `<td class="num prog-estoque ${classe}">${escapeHtml(saldo.toLocaleString('pt-BR'))}</td>`;
}

async function buscarSaldoAlmoxarifado(codigos) {
  const unicos = [...new Set((codigos || []).filter(Boolean).map(String))];
  if (!unicos.length) return new Map();

  const mapa = new Map();
  // Em pedaços: a lista de itens da separacao passa de 300 codigos, e tudo
  // isso num `in(...)` viraria uma URL grande demais pro PostgREST.
  for (let i = 0; i < unicos.length; i += 150) {
    const pedaco = unicos.slice(i, i + 150);
    const { data, error } = await sb.from('estoque')
      .select('item, quantidade')
      .in('item', pedaco)
      .eq('unidade', unidadeAtual)
      .eq('deposito', 'alm');
    if (error) {
      // Saldo e informacao de apoio: sem ele a coluna fica "—" e a separacao
      // continua funcionando. Travar a aba inteira por isso seria pior.
      console.warn('Não foi possível puxar o saldo do almoxarifado:', error.message);
      return mapa;
    }
    // O mesmo item pode ter mais de uma linha (localizacoes diferentes) --
    // o que interessa pra quem separa e o total.
    (data || []).forEach(r => {
      mapa.set(String(r.item), (mapa.get(String(r.item)) || 0) + parseQtd(r.quantidade));
    });
  }
  return mapa;
}

// ---- Aba 1: Separação -------------------------------------------------------
// Robson, 16/09/2026: "na aba separação pode colocar meio que uma divisao só
// dos pedidos que carregam amanhã, ou pode colocar outra aba de separaçaõ com
// o titulo carregamento do dia 17/09/2026". Em vez de uma aba nova por dia
// (que teria de ser recriada a cada planilha colada), o seletor filtra por dia
// e a lista sai dividida por dia -- mesmo efeito, sem aba que nasce e morre.
let filtroEmbarquePadraoAplicado = false;

function preencherFiltroEmbarque(linhas) {
  const sel = document.getElementById('progFiltroEmbarque');
  const datas = [...new Set(linhas
    .map(({ pedido }) => pedido && pedido.data_carregamento)
    .filter(Boolean))].sort();
  const temSemData = linhas.some(({ pedido }) => !(pedido && pedido.data_carregamento));

  const html = ['<option value="">Todas as datas</option>']
    .concat(datas.map(d => `<option value="${escapeHtml(d)}">Carregamento ${escapeHtml(dataLonga(d))}</option>`))
    .concat(temSemData ? ['<option value="sem">Sem data de embarque</option>'] : [])
    .join('');
  if (sel.innerHTML === html) return; // sem novidade: nao mexe, pra nao perder a escolha

  const escolhido = sel.value;
  sel.innerHTML = html;
  sel.value = [...sel.options].some(o => o.value === escolhido) ? escolhido : '';

  // Abre no proximo dia de carregamento. Robson, 16/09/2026: "quero que pegue
  // só o do dia posterior, tipo hoje pega de amanhã amanhã pega do dia 18" --
  // e o que ele vai separar HOJE. So na primeira montagem: depois disso a
  // escolha e dele, e re-render (cada tecla na busca) nao pode puxar de volta.
  if (!filtroEmbarquePadraoAplicado && datas.length) {
    const proximo = datas.find(d => d > hojeIso());
    if (proximo) sel.value = proximo;
    filtroEmbarquePadraoAplicado = true;
  }
}

function renderSeparacao() {
  // Item em pendencia sai de cena: nao da pra separar o que nao tem em
  // estoque, e ele so atrapalharia a contagem de quem esta separando.
  const doDia = progItens.filter(i => !i.em_pendencia);
  const total = doDia.length;
  const concluidos = doDia.filter(itemConcluido).length;
  document.getElementById('progTotalItens').textContent = total.toLocaleString('pt-BR');
  document.getElementById('progPendentes').textContent = (total - concluidos).toLocaleString('pt-BR');
  document.getElementById('progSeparados').textContent = concluidos.toLocaleString('pt-BR');

  const busca = document.getElementById('progBusca').value.trim().toLowerCase();
  const filtro = document.getElementById('progFiltroStatus').value;

  let linhas = doDia.map(i => {
    const pedido = progPedidos.find(p => p.id === i.pedido_id);
    return { item: i, pedido };
  });

  // As opcoes saem da lista INTEIRA, antes de qualquer filtro -- senao escolher
  // um dia tiraria os outros dias do proprio seletor e nao teria como voltar.
  preencherFiltroEmbarque(linhas);
  const filtroEmbarque = document.getElementById('progFiltroEmbarque').value;
  if (filtroEmbarque === 'sem') {
    linhas = linhas.filter(({ pedido }) => !(pedido && pedido.data_carregamento));
  } else if (filtroEmbarque) {
    linhas = linhas.filter(({ pedido }) => pedido && pedido.data_carregamento === filtroEmbarque);
  }

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

  // A lista ja vem ordenada por dia de carregamento, entao cada dia e um bloco
  // continuo: basta abrir uma divisao toda vez que a data muda.
  const grupos = [];
  linhas.forEach(linha => {
    const data = (linha.pedido && linha.pedido.data_carregamento) || null;
    const atual = grupos[grupos.length - 1];
    if (atual && atual.data === data) atual.linhas.push(linha);
    else grupos.push({ data, linhas: [linha] });
  });

  const linhaHtml = ({ item, pedido }) => `
    <tr>
      <td class="item">${escapeHtml(pedido ? pedido.numero_pedido : '—')}</td>
      <td>${escapeHtml(pedido && pedido.cliente ? pedido.cliente : '—')}</td>
      <td class="loc">${pedido && pedido.data_carregamento ? escapeHtml(dataCurta(pedido.data_carregamento) + ' ' + horaCurta(pedido.horario_carregamento)) : '—'}</td>
      <td class="loc">${escapeHtml(item.seq != null ? item.seq : '—')}</td>
      <td class="item">${escapeHtml(item.codigo_item || '—')}</td>
      <td>${escapeHtml(item.descricao || '—')}</td>
      <td class="loc">${escapeHtml(item.unidade_medida || '—')}</td>
      <td class="num">${escapeHtml(item.quantidade != null ? item.quantidade : '—')}</td>
      <td class="loc">${escapeHtml(item.numero_os_op || '—')}</td>
      <td>
        <textarea class="prog-item-obs" data-id="${escapeHtml(item.id)}" rows="1"
                  placeholder="—">${escapeHtml(item.observacao || '')}</textarea>
      </td>
      <td><span class="cfg-status ${CLASSE_STATUS_ITEM[item.status_separacao] || 'st-pendente'}">${escapeHtml(ROTULO_STATUS_ITEM[item.status_separacao] || 'Pendente')}</span></td>
      <td class="loc">${escapeHtml(momentoSeparacao(item.separado_em))}</td>
      ${celulaEstoqueHtml(item)}
      <td class="col-acoes">
        <button class="btn prog-alternar" data-id="${escapeHtml(item.id)}">
          ${escapeHtml(ROTULO_BOTAO_SEPARACAO[item.status_separacao] || ROTULO_BOTAO_SEPARACAO.aguardando)}
        </button>
        ${item.status_separacao && item.status_separacao !== 'aguardando'
          ? `<button class="btn prog-reabrir" data-id="${escapeHtml(item.id)}"
                     title="Voltar este item para Pendente">↶ Pendente</button>`
          : `<button class="btn prog-pendencia" data-id="${escapeHtml(item.id)}"
                     title="Não tem em estoque: manda este item para a aba Pendências">Marcar sem estoque</button>`}
      </td>
    </tr>`;

  // Dentro do dia, cada PEDIDO ganha sua propria faixa. Robson, 16/09/2026:
  // "pode deixar cada pedido separado com um espaço" e "pode colocar tambem
  // alguma coisa como selecionar todos os itens de cada pedido" -- a faixa
  // resolve os dois: separa visualmente e e onde mora o botao de marcar o
  // pedido inteiro. Os itens ja vem juntos (a ordenacao e por pedido), entao
  // basta abrir faixa nova quando o pedido muda.
  const porPedido = (linhasDoGrupo) => {
    const blocos = [];
    linhasDoGrupo.forEach(linha => {
      const id = linha.pedido ? linha.pedido.id : null;
      const atual = blocos[blocos.length - 1];
      if (atual && atual.id === id) atual.linhas.push(linha);
      else blocos.push({ id, pedido: linha.pedido, linhas: [linha] });
    });
    return blocos;
  };

  corpo.innerHTML = grupos.map(grupo => {
    const pedidos = new Set(grupo.linhas.map(l => l.pedido && l.pedido.id));
    const titulo = grupo.data
      ? `Carregamento ${dataLonga(grupo.data)}`
      : 'Sem data de embarque';
    const contagem = `${pedidos.size} pedido(s) · ${grupo.linhas.length} item(ns)`;
    const blocosHtml = porPedido(grupo.linhas).map(bloco => {
      const pedido = bloco.pedido;
      const pendentes = bloco.linhas.filter(l => !itemConcluido(l.item)).length;
      const cabecalho = [
        pedido ? pedido.numero_pedido : 'Sem pedido',
        pedido && pedido.cliente ? pedido.cliente : null,
        pedido && pedido.data_carregamento
          ? dataCurta(pedido.data_carregamento) + ' ' + horaCurta(pedido.horario_carregamento)
          : null
      ].filter(Boolean).join(' · ');
      const botao = (pedido && pendentes)
        ? `<button class="btn prog-marcar-pedido" data-pedido-id="${escapeHtml(pedido.id)}">
             Marcar os ${pendentes} pendente(s)
           </button>`
        : '';
      return `
    <tr class="prog-pedido">
      <td colspan="14">
        <span class="prog-pedido-nome">${escapeHtml(cabecalho)}</span>
        <span class="prog-grupo-contagem">${escapeHtml(`${bloco.linhas.length} item(ns)`)}</span>
        ${botao}
      </td>
    </tr>` + bloco.linhas.map(linhaHtml).join('');
    }).join('');
    return `
    <tr class="prog-grupo">
      <td colspan="14">${escapeHtml(titulo)} <span class="prog-grupo-contagem">${escapeHtml(contagem)}</span></td>
    </tr>` + blocosHtml;
  }).join('');

  ajustarTodasAlturasObs();
  atualizarBotaoDesfazer();
}

// Robson, 16/09/2026, com "SEM SALDO PEDID..." cortado no campo: "deixe
// maleavel conforme a escrita aumenta esse retangulo". Campo de uma linha so
// escondia o resto do recado -- que e justamente o que quem separa precisa ler.
function ajustarAlturaObs(campo) {
  campo.style.height = 'auto';
  // Aba fechada nao tem layout: scrollHeight vem 0 e travaria o campo em
  // altura zero ate o proximo render. Sem medida, deixa o CSS mandar.
  const altura = campo.scrollHeight;
  if (altura > 0) campo.style.height = altura + 'px';
  else campo.style.removeProperty('height');
}

function ajustarTodasAlturasObs() {
  document.querySelectorAll('#progItensBody .prog-item-obs').forEach(ajustarAlturaObs);
}

document.getElementById('progItensBody').addEventListener('input', (e) => {
  if (e.target.classList.contains('prog-item-obs')) ajustarAlturaObs(e.target);
});

document.getElementById('progBusca').addEventListener('input', renderSeparacao);
document.getElementById('progFiltroStatus').addEventListener('change', renderSeparacao);
document.getElementById('progFiltroEmbarque').addEventListener('change', renderSeparacao);

document.getElementById('progItensBody').addEventListener('click', async (e) => {
  const pedidoTodo = e.target.closest('.prog-marcar-pedido');
  if (pedidoTodo) { await marcarPedidoInteiro(pedidoTodo.dataset.pedidoId, pedidoTodo); return; }
  const pendencia = e.target.closest('.prog-pendencia');
  if (pendencia) { await mandarParaPendencia(pendencia.dataset.id, pendencia); return; }
  const reabrir = e.target.closest('.prog-reabrir');
  if (reabrir) { await reabrirItemSeparacao(reabrir.dataset.id, reabrir); return; }
  const btn = e.target.closest('.prog-alternar');
  if (!btn) return;
  await alternarItemSeparado(btn.dataset.id, btn);
});

// Observação editável (Robson, 16/09/2026: "aqui em observação deixa
// editavel") -- salva ao sair do campo, mesmo padrão do resto do portal.
document.getElementById('progItensBody').addEventListener('focusout', async (e) => {
  const input = e.target.closest('.prog-item-obs');
  if (!input) return;
  const id = input.dataset.id;
  const item = progItens.find(i => String(i.id) === String(id));
  if (!item) return;
  const novo = input.value.trim();
  if (novo === (item.observacao || '')) return; // nada mudou

  input.disabled = true;
  const { error } = await sb.from('pedido_itens').update({ observacao: novo || null }).eq('id', id);
  input.disabled = false;
  if (error) {
    falhaEscrita(error.message);
    input.value = item.observacao || '';
    return;
  }
  item.observacao = novo || null;
});

async function alternarItemSeparado(itemId, botao) {
  const item = progItens.find(i => String(i.id) === String(itemId));
  if (!item) return;
  const msg = document.getElementById('progMsg');
  const anterior = item.status_separacao;
  const novo = proximoStatusSeparacao(item.status_separacao);
  const concluindo = novo !== 'aguardando';

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
  const pedido = progPedidos.find(p => p.id === item.pedido_id);
  empilharDesfazer({
    pedidoId: item.pedido_id,
    itens: [{ id: item.id, statusAnterior: anterior }],
    descricao: `${pedido ? pedido.numero_pedido : 'pedido'} · item ${item.codigo_item || '—'} volta para "${ROTULO_STATUS_ITEM[anterior] || 'Pendente'}"`
  });
  await registrarLogProgramacao(item.pedido_id, 'item_separado', { item_id: item.id, status: novo });
  // O gatilho no banco recalcula pedidos.status_geral -- recarrega para a aba
  // EXP refletir o status consolidado novo.
  await carregarProgramacao();
}

// ---- Pendências: item que não tem em estoque --------------------------------
// Robson, 16/09/2026, mostrando itens com "SEM SALDO PEDIDO 313.412" escrito
// na observação: "esses itens nao tenho em estoque dai quero que crie uma nova
// aba de pendencias e jogue esses itens la, dai pode limpar ele da aba
// separação". Eles entulhavam a lista de quem separa sem ter o que separar.
//
// O motivo ja costuma estar escrito na observacao do item -- aproveita, em vez
// de pedir pra digitar de novo o que ele acabou de escrever.
async function mandarParaPendencia(itemId, botao) {
  const item = progItens.find(i => String(i.id) === String(itemId));
  if (!item || item.em_pendencia) return;
  const msg = document.getElementById('progMsg');
  const pedido = progPedidos.find(p => p.id === item.pedido_id);

  botao.disabled = true;
  const { error } = await sb.from('pedido_itens').update({
    em_pendencia: true,
    pendencia_motivo: item.observacao || null,
    pendencia_em: new Date().toISOString(),
    pendencia_por: userIdAtual
  }).eq('id', item.id);
  botao.disabled = false;

  if (error) {
    // Erro tipico de quem ainda nao rodou a fase 58: a coluna nao existe.
    // Dizer "NÃO SALVOU: could not find the column" nao ajuda ninguem.
    msg.textContent = /em_pendencia|pendencia_/.test(error.message)
      ? 'NÃO SALVOU: falta rodar sql/fase58-pedido-itens-pendencia.sql no Supabase — a aba Pendências depende das colunas que ele cria.'
      : 'NÃO SALVOU: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  await registrarLogProgramacao(item.pedido_id, 'item_pendencia',
    { item_id: item.id, motivo: item.observacao || null });
  msg.textContent = `Item ${item.codigo_item || ''} de ${pedido ? pedido.numero_pedido : 'pedido'} foi para Pendências.`;
  msg.className = 'status-msg status-ok';
  await carregarProgramacao();
}

// Chegou o material: volta pra fila de separação exatamente como estava.
async function voltarDePendencia(itemId, botao) {
  const item = progItens.find(i => String(i.id) === String(itemId));
  if (!item) return;
  const msg = document.getElementById('progMsg');

  botao.disabled = true;
  const { error } = await sb.from('pedido_itens').update({
    em_pendencia: false, pendencia_motivo: null, pendencia_em: null, pendencia_por: null
  }).eq('id', item.id);
  botao.disabled = false;

  if (error) {
    msg.textContent = 'NÃO SALVOU: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  await registrarLogProgramacao(item.pedido_id, 'item_pendencia',
    { item_id: item.id, resolvido: true });
  msg.textContent = 'Item voltou para a Separação.';
  msg.className = 'status-msg status-ok';
  await carregarProgramacao();
}

function renderPendencias() {
  const emPendencia = progItens.filter(i => i.em_pendencia);
  const contador = document.getElementById('progPendenciasContador');
  contador.textContent = emPendencia.length ? ` (${emPendencia.length})` : '';

  const busca = document.getElementById('progPendBusca').value.trim().toLowerCase();
  let linhas = emPendencia.map(i => ({ item: i, pedido: progPedidos.find(p => p.id === i.pedido_id) }));
  if (busca) {
    linhas = linhas.filter(({ item, pedido }) =>
      String(pedido && pedido.numero_pedido).toLowerCase().includes(busca) ||
      String(item.codigo_item).toLowerCase().includes(busca) ||
      String(item.descricao).toLowerCase().includes(busca) ||
      String(item.pendencia_motivo).toLowerCase().includes(busca));
  }
  linhas.sort((a, b) => compararPorUrgencia(a.pedido, b.pedido));

  const corpo = document.getElementById('progPendenciasBody');
  const vazio = document.getElementById('progPendenciasVazio');
  document.getElementById('progTabelaPendencias').style.display = linhas.length ? 'table' : 'none';
  vazio.style.display = linhas.length ? 'none' : 'block';
  if (!linhas.length) {
    vazio.textContent = emPendencia.length
      ? 'Nenhuma pendência bate com a busca.'
      : 'Nenhum item em pendência. Use "Sem estoque" na aba Separação para mandar um item pra cá.';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = linhas.map(({ item, pedido }) => `
    <tr>
      <td class="item">${escapeHtml(pedido ? pedido.numero_pedido : '—')}</td>
      <td>${escapeHtml(pedido && pedido.cliente ? pedido.cliente : '—')}</td>
      <td class="loc">${pedido && pedido.data_carregamento ? escapeHtml(dataCurta(pedido.data_carregamento) + ' ' + horaCurta(pedido.horario_carregamento)) : '—'}</td>
      <td class="item">${escapeHtml(item.codigo_item || '—')}</td>
      <td>${escapeHtml(item.descricao || '—')}</td>
      <td class="loc">${escapeHtml(item.unidade_medida || '—')}</td>
      <td class="num">${escapeHtml(item.quantidade != null ? item.quantidade : '—')}</td>
      <td class="loc">${escapeHtml(item.numero_os_op || '—')}</td>
      <td>${escapeHtml(item.pendencia_motivo || '—')}</td>
      <td class="loc">${escapeHtml(momentoSeparacao(item.pendencia_em))}</td>
      <td class="col-acoes">
        <button class="btn prog-voltar-pendencia" data-id="${escapeHtml(item.id)}"
                title="Chegou o material: devolve para a lista de separação">↶ Voltar para Separação</button>
      </td>
    </tr>`).join('');
}

document.getElementById('progPendBusca').addEventListener('input', renderPendencias);

document.getElementById('progPendenciasBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.prog-voltar-pendencia');
  if (!btn) return;
  await voltarDePendencia(btn.dataset.id, btn);
});

// Marca de uma vez todos os itens ainda pendentes de um pedido. Robson,
// 16/09/2026: "pode colocar tambem alguma coisa como selecionar todos os itens
// de cada pedido" -- pedido com 15 acessorios eram 15 cliques, e cada clique
// some com a linha (filtro "Só pendentes"), entao ele perdia o lugar na lista.
//
// So mexe em quem esta PENDENTE: item ja marcado nao volta atras nem avanca
// pro ciclo seguinte, senao "marcar o pedido" viraria uma roleta do que ja
// estava certo. Vai inteiro pra pilha de desfazer, como UMA acao.
async function marcarPedidoInteiro(pedidoId, botao) {
  const pendentes = progItens.filter(i =>
    String(i.pedido_id) === String(pedidoId) && !itemConcluido(i) && !i.em_pendencia);
  if (!pendentes.length) return;
  const msg = document.getElementById('progMsg');
  const pedido = progPedidos.find(p => String(p.id) === String(pedidoId));

  botao.disabled = true;
  const { error } = await sb.from('pedido_itens').update({
    status_separacao: 'separado',
    separado_por: userIdAtual,
    separado_em: new Date().toISOString()
  }).in('id', pendentes.map(i => i.id));
  botao.disabled = false;

  if (error) {
    msg.textContent = 'NÃO SALVOU: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  const itensDesfazer = pendentes.map(i => ({ id: i.id, statusAnterior: i.status_separacao }));
  pendentes.forEach(i => { i.status_separacao = 'separado'; });
  empilharDesfazer({
    pedidoId,
    itens: itensDesfazer,
    descricao: `${pedido ? pedido.numero_pedido : 'pedido'} · ${itensDesfazer.length} item(ns) voltam para "Pendente"`
  });
  await registrarLogProgramacao(pedidoId, 'item_separado',
    { itens: itensDesfazer.map(i => i.id), status: 'separado', pedido_inteiro: true });
  msg.textContent = `${itensDesfazer.length} item(ns) marcado(s) em ${pedido ? pedido.numero_pedido : 'pedido'}.`;
  msg.className = 'status-msg status-ok';
  await carregarProgramacao();
}

// Volta o item direto pra "Pendente", sem passar pelo ciclo do botao.
// Robson, 16/09/2026: "esse item que marquei como separado mas ele nao tenho em
// estoque dai quero voltar" -- pelo ciclo (separado -> falta reporte ->
// aguardando) ele teria que passar por "falta reporte", que afirma o contrario
// do que aconteceu: falta reporte quer dizer que a peca FOI separada e so o
// relatorio nao saiu. Item que nao tem em estoque volta pra pendente e pronto.
async function reabrirItemSeparacao(itemId, botao) {
  const item = progItens.find(i => String(i.id) === String(itemId));
  if (!item || item.status_separacao === 'aguardando') return;
  const msg = document.getElementById('progMsg');
  const anterior = item.status_separacao;

  botao.disabled = true;
  const { error } = await sb.from('pedido_itens').update({
    status_separacao: 'aguardando', separado_por: null, separado_em: null
  }).eq('id', item.id);
  botao.disabled = false;

  if (error) {
    msg.textContent = 'NÃO SALVOU: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  item.status_separacao = 'aguardando';
  const pedido = progPedidos.find(p => p.id === item.pedido_id);
  empilharDesfazer({
    pedidoId: item.pedido_id,
    itens: [{ id: item.id, statusAnterior: anterior }],
    descricao: `${pedido ? pedido.numero_pedido : 'pedido'} · item ${item.codigo_item || '—'} volta para "${ROTULO_STATUS_ITEM[anterior] || 'Pendente'}"`
  });
  await registrarLogProgramacao(item.pedido_id, 'item_separado',
    { item_id: item.id, status: 'aguardando', reaberto: true });
  await carregarProgramacao();
}

// ---- Desfazer da Separação --------------------------------------------------
// Robson, 16/09/2026: "quero um botao de voltar tipo Ctrl Z as vezes acabo
// marcando um item sem querer dai nao consigo voltar". O status ate cicla
// (aguardando -> separado -> falta reporte -> aguardando), mas com o filtro
// "Só pendentes" -- que e o padrao desde a secao 40 -- o item SOME da lista no
// primeiro clique, entao nao da nem pra clicar de novo pra dar a volta.
//
// Pilha em memoria, so desta sessao: e pra corrigir o clique errado de agora,
// nao pra virar histórico (esse ja existe em log_movimentacao).
const desfazerSeparacao = [];
const LIMITE_DESFAZER = 20;

function empilharDesfazer(entrada) {
  desfazerSeparacao.push(entrada);
  if (desfazerSeparacao.length > LIMITE_DESFAZER) desfazerSeparacao.shift();
  atualizarBotaoDesfazer();
}

function atualizarBotaoDesfazer() {
  const btn = document.getElementById('progDesfazerBtn');
  if (!btn) return;
  const ultimo = desfazerSeparacao[desfazerSeparacao.length - 1];
  btn.disabled = !ultimo;
  btn.title = ultimo ? 'Desfazer: ' + ultimo.descricao : 'Nada para desfazer';
}

async function desfazerUltimaSeparacao() {
  const ultimo = desfazerSeparacao[desfazerSeparacao.length - 1];
  if (!ultimo) return;
  const msg = document.getElementById('progMsg');
  const btn = document.getElementById('progDesfazerBtn');
  if (btn) btn.disabled = true;

  // Um pedido inteiro pode ter sido marcado de uma vez, e cada item pode ter
  // vindo de um status diferente -- agrupa por status pra gravar de uma vez
  // cada grupo, em vez de um update por item.
  const porStatus = new Map();
  ultimo.itens.forEach(({ id, statusAnterior }) => {
    if (!porStatus.has(statusAnterior)) porStatus.set(statusAnterior, []);
    porStatus.get(statusAnterior).push(id);
  });

  for (const [status, ids] of porStatus) {
    // Mesma regra do alternar: so quem termina em status concluido carrega
    // assinatura. Voltar pra "aguardando" limpa quem separou e quando.
    const concluindo = status !== 'aguardando';
    const { error } = await sb.from('pedido_itens').update({
      status_separacao: status,
      separado_por: concluindo ? userIdAtual : null,
      separado_em: concluindo ? new Date().toISOString() : null
    }).in('id', ids);
    if (error) {
      msg.textContent = 'NÃO SALVOU: ' + error.message;
      msg.className = 'status-msg status-err';
      atualizarBotaoDesfazer();
      return;
    }
  }

  desfazerSeparacao.pop();
  ultimo.itens.forEach(({ id, statusAnterior }) => {
    const item = progItens.find(i => String(i.id) === String(id));
    if (item) item.status_separacao = statusAnterior;
  });
  await registrarLogProgramacao(ultimo.pedidoId, 'item_separado',
    { itens: ultimo.itens.map(i => i.id), desfeito: true });
  msg.textContent = 'Desfeito — ' + ultimo.descricao;
  msg.className = 'status-msg status-ok';
  await carregarProgramacao();
}

document.getElementById('progDesfazerBtn').addEventListener('click', desfazerUltimaSeparacao);

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== 'z') return;
  // Ctrl+Z dentro de campo de texto e o desfazer do proprio campo -- nao roubar.
  const alvo = e.target;
  if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
  const pagina = document.getElementById('programacaoContent');
  if (!pagina || getComputedStyle(pagina).display === 'none') return;
  if (!desfazerSeparacao.length) return;
  e.preventDefault();
  desfazerUltimaSeparacao();
});

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
  // Dia que ja passou sai da tela. Robson, 16/09/2026, com um bloco de
  // "Carregamento 08/09/2026" ainda aparecendo: "nao precisa deixar historico,
  // aqui quero uma coisa mais leve, só um espelho". Some da VISTA, nao do
  // banco -- o pedido antigo continua lá, e volta se a data dele mudar.
  const hoje = hojeIso();
  const naGrade = progPedidos.filter(p => (p.horario_carregamento || p.tipo_veiculo)
    && (!p.data_carregamento || p.data_carregamento >= hoje));
  const alvo = document.getElementById('progGrade');
  const vazio = document.getElementById('progGradeVazio');
  vazio.style.display = naGrade.length ? 'none' : 'block';
  if (!naGrade.length) { alvo.innerHTML = ''; return; }

  // Agrupa como a planilha original, que e por DIA ("PEDIDOS PROGRAMADOS
  // 17/09") e, dentro do dia, por horario do caminhao. Robson, 16/09/2026,
  // apontando pra esta aba: "a data nessa aba do carregamento é importante
  // tambem" -- antes o titulo do bloco era o veiculo e o dia nao aparecia em
  // lugar nenhum, o que fica pior ainda quando a grade acumula mais de um dia.
  // O veiculo nao se perde: vira etiqueta no card, junto do frete.
  const porDia = {};
  naGrade.forEach(p => {
    const dia = p.data_carregamento || 'sem data';
    const hora = horaCurta(p.horario_carregamento);
    porDia[dia] = porDia[dia] || {};
    porDia[dia][hora] = porDia[dia][hora] || [];
    porDia[dia][hora].push(p);
  });

  alvo.innerHTML = Object.keys(porDia).sort().map(dia => {
    const horas = porDia[dia];
    const corpoHoras = Object.keys(horas).sort().map(hora => `
      <div class="prog-hora">
        <div class="prog-hora-rotulo">${escapeHtml(hora)}</div>
        ${horas[hora].map(p => cardPedidoCarregamento(p)).join('')}
      </div>`).join('');
    const titulo = dia === 'sem data' ? 'Sem data de carregamento' : `Carregamento ${dataLonga(dia)}`;
    return `
      <div class="prog-bloco">
        <div class="prog-bloco-titulo">${escapeHtml(titulo)}</div>
        ${corpoHoras}
      </div>`;
  }).join('');
}

function cardPedidoCarregamento(p) {
  const st = statusConsolidado(p);
  // 'sem' = pedido não tem nenhum acessório da Planilha A pra separar --
  // não há o que esperar, libera a saída direto. 'total' = tudo separado.
  const podeSair = st.chave === 'total' || st.chave === 'sem';
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
        ${p.tipo_veiculo ? `<span class="cad-um">${escapeHtml(p.tipo_veiculo)}</span>` : ''}
      </div>
      <div class="cad-desc">${escapeHtml(p.cliente || '—')}${destino ? ' · ' + escapeHtml(destino) : ''}</div>
      ${p.observacao_carregamento
        ? `<div class="${critica ? 'prog-obs-critica' : 'cad-desc'}">${critica ? '⚠️ ' : ''}${escapeHtml(p.observacao_carregamento)}</div>`
        : ''}
      <div class="prog-card-acoes">
        ${carregado
          ? '<span class="cfg-status st-inativo">Saída registrada</span>'
          : `<button class="btn prog-saida" data-id="${escapeHtml(p.id)}"
                     ${podeSair ? '' : 'disabled'}
                     title="${podeSair ? '' : 'Ainda faltam itens sendo separados'}">
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
    : 'Colunas, nesta ordem: <b>Veículo, Horário, Nº Pedido, Cliente</b> (Cidade, UF, Modalidade, Descrição, Quantidade, Valor, Sim/Não, Observação e Vendedor continuam aceitas se vierem, mas não são obrigatórias). As duas primeiras (veículo e horário) só vêm preenchidas na primeira linha de cada grupo — cole exatamente como está na planilha.';
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

function lerColadoProg(texto) {
  return texto.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t').map(c => c.trim()));
}

// A grade ja vem com o dia escrito no topo: "PEDIDOS PROGRAMADOS 17/09".
// Robson, 16/09/2026: "só puxe da data e pronto" -- digitar a data de novo no
// modal e uma chance a mais de colar a grade de amanha com a data de hoje.
// O ano nao esta no titulo; sai da data do formulario quando ela existe, e do
// relogio da maquina quando nao.
function dataDoTituloPlanilhaB(texto, dataRef) {
  const m = String(texto || '').match(/pedidos\s+programados\s+(\d{1,2})\s*\/\s*(\d{1,2})/i);
  if (!m) return null;
  const dia = m[1].padStart(2, '0');
  const mes = m[2].padStart(2, '0');
  const ano = dataRef ? String(dataRef).slice(0, 4) : hojeIso().slice(0, 4);
  return `${ano}-${mes}-${dia}`;
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
  // A grade traz o dia no proprio titulo; quando traz, ele manda -- inclusive
  // por cima da data digitada, que e justamente a que costuma vir errada
  // (colar a grade de amanha com a data de hoje ainda no campo).
  const dataTitulo = progImportAba === 'B' ? dataDoTituloPlanilhaB(texto, dataRef) : null;
  const dataPlanilha = dataTitulo || dataRef;
  if (!dataPlanilha) {
    msg.textContent = 'Informe a data de carregamento desta planilha.';
    msg.className = 'status-msg status-err';
    return;
  }

  msg.textContent = 'Lendo...';
  msg.className = 'status-msg';

  const resultado = progImportAba === 'A'
    ? await importarPlanilhaA(lerColadoProg(texto), dataPlanilha)
    : await importarPlanilhaB(lerColadoProg(texto), dataPlanilha);

  if (!resultado) return;
  msg.textContent = resultado;
  msg.className = 'status-msg status-ok';
  await carregarProgramacao();
});

// "embarque 17/09" escrito na observação -> a data de embarque daquele pedido.
// Só vale a data ESCRITA: sem "dd/mm" na observação, devolve null e o pedido
// fica sem data. (Até 16/09/2026 caía na data digitada no modal de importação,
// o que carimbava a mesma data em TODO pedido -- ver seção 42 do CLAUDE.md.)
// O ano sai da data do formulário, que a planilha não traz.
function dataDoEmbarque(observacao, dataRef) {
  const m = String(observacao || '').match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return null;
  const dia = m[1].padStart(2, '0');
  const mes = m[2].padStart(2, '0');
  return `${String(dataRef).slice(0, 4)}-${mes}-${dia}`;
}

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
  //    Planilha B já preencheu (cidade, veículo, horário, data/hora de
  //    carregamento). `data_carregamento` NÃO entra neste upsert -- a data
  //    anotada na observação é aplicada depois, em (1b), só onde pode.
  const porPedido = new Map();
  itens.forEach(i => {
    if (!porPedido.has(i.numero_pedido)) {
      porPedido.set(i.numero_pedido, {
        unidade: unidadeAtual,
        numero_pedido: i.numero_pedido,
        cliente: i.cliente
      });
    }
  });

  const { data: gravados, error: erroPedidos } = await sb.from('pedidos')
    .upsert([...porPedido.values()], { onConflict: 'unidade,numero_pedido' })
    .select('id, numero_pedido');
  if (erroPedidos) { falhaImport(erroPedidos.message); return null; }

  const idPorNumero = new Map((gravados || []).map(p => [p.numero_pedido, p.id]));
  const idsAfetados = [...idPorNumero.values()];

  // 1b) Data de embarque anotada na observação da própria planilha ("embarque
  //     17/09"). Robson, 16/09/2026, sobre o KV812379 aparecendo sem data
  //     nenhuma na Separação: "esse pedido colocaram com data para amanhã, por
  //     que nao apareceu pra eu separar por primeiro?" -- o PCP anota o
  //     embarque aqui enquanto o pedido ainda não entrou na Grade de
  //     carregamento, e é a única data que existe pra ele nesse meio-tempo.
  //
  //     Não encosta em quem já veio da Grade (`ordem_carregamento` preenchido):
  //     lá a informação é mais precisa (tem hora e veículo), e foi justamente
  //     esse upsert por cima que apagava a data certa antes.
  const numerosPorData = new Map();
  itens.forEach(i => {
    const data = dataDoEmbarque(i.observacao, dataRef);
    if (!data) return;
    if (!numerosPorData.has(data)) numerosPorData.set(data, new Set());
    numerosPorData.get(data).add(i.numero_pedido);
  });

  const comEmbarqueAnotado = new Set();
  let falhouEmbarque = false;
  for (const [data, numeros] of numerosPorData) {
    const { error } = await sb.from('pedidos')
      .update({ data_carregamento: data })
      .eq('unidade', unidadeAtual)
      .in('numero_pedido', [...numeros])
      .is('ordem_carregamento', null);
    if (error) {
      falhouEmbarque = true;
      console.error('Falha ao gravar embarque anotado na observação:', error.message);
    } else {
      numeros.forEach(n => comEmbarqueAnotado.add(n));
    }
  }

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
  if (comEmbarqueAnotado.size) avisos.push(`${comEmbarqueAnotado.size} pedido(s) com embarque anotado na observação`);
  if (falhouEmbarque) avisos.push('não deu pra gravar o embarque anotado de alguns pedidos (ver console)');
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
//
// A partir de 2026-09-15 o Robson simplificou a planilha que ele mesmo
// preenche pra so ter as 4 primeiras colunas (Veiculo, Horario, Pedido,
// Cliente) -- as demais colunas (4 a 12) ficam undefined nesse caso, e o
// codigo abaixo ja trata isso: `col[indice] || null` vira null sem quebrar.
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
  // Posição do pedido na planilha colada (1ª vez que aparece) -- Robson,
  // 16/09/2026: "a ordem que aparece na planilha colada" decide a sequência
  // de quem separa primeiro, pra pedido do MESMO DIA sem horário exato
  // (a maioria) -- ver compararPorUrgencia() em js/programacao.js e
  // sql/fase57-pedidos-ordem-carregamento.sql.
  const ordemPorPedido = new Map();
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
    // A coluna do bloco as vezes traz o VEICULO ("TRUCK 8,5M - ENTREGA 09/09")
    // e as vezes so o HORARIO ("08H") -- depende de como cada unidade monta a
    // planilha. Na do Robson (CONTROLE DE PATIO) vem o horario ali, e ler isso
    // como nome de veiculo deixava todo pedido sem hora: a aba Carregamento
    // mostrava blocos chamados "08H" com o horario vazio ("—") embaixo, e a
    // coluna Embarque da Separacao so a data. Se o texto for hora, e hora.
    if (bloco) {
      const horaNoBloco = horarioDoTextoProg(bloco);
      if (horaNoBloco) {
        horarioAtual = horaNoBloco;
      } else {
        const sep = separarBlocoVeiculo(bloco);
        veiculoAtual = sep.veiculo;
        entregaAtual = sep.entrega;
      }
    }
    if (horaCol) {
      const hora = horarioDoTextoProg(horaCol);
      if (hora) horarioAtual = hora;
    }

    // Titulo da planilha ("PEDIDOS PROGRAMADOS 08/09") e cabecalho.
    if (/^(n?[ºo°]?\s*pedido|pedido)/i.test(numero)) return;
    if (!numero) { ignoradas++; return; }
    if (!ordemPorPedido.has(numero)) ordemPorPedido.set(numero, ordemPorPedido.size + 1);

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
      flag_adicional: flagDoTextoProg(col[COL_B.flag]),
      ordem_carregamento: ordemPorPedido.get(numero)
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

  // A grade vale por UM dia. Robson, 16/09/2026: "vou alimentar a do
  // carregamento só de um dia, nao precisa ter varios dias ali como esta".
  // Entao colar uma grade nova aposenta a anterior: quem tinha vindo de grade
  // (`ordem_carregamento` preenchido) e nao esta nesta perde os campos de
  // carregamento -- some da aba, mas o PEDIDO e os itens dele ficam inteiros.
  //
  // `ordem_carregamento is not null` e o que separa "veio de grade" de "veio
  // da observação da planilha de separação" (o 'embarque 17/09' da secao 43),
  // que nao pode ser apagado aqui -- nao e grade, e o unico embarque que
  // aquele pedido tem.
  const numerosDaGrade = lista
    .map(p => String(p.numero_pedido).replace(/["(),]/g, ''))
    .map(n => `"${n}"`)
    .join(',');
  const { error: erroLimpeza, count: aposentados } = await sb.from('pedidos')
    .update({
      data_carregamento: null, horario_carregamento: null, tipo_veiculo: null,
      observacao_carregamento: null, flag_adicional: null, ordem_carregamento: null
    }, { count: 'exact' })
    .eq('unidade', unidadeAtual)
    .not('ordem_carregamento', 'is', null)
    .not('numero_pedido', 'in', `(${numerosDaGrade})`);
  if (erroLimpeza) console.error('Falha ao aposentar a grade anterior:', erroLimpeza.message);

  const semHorario = lista.filter(p => !p.horario_carregamento).length;
  const avisos = [];
  if (aposentados) avisos.push(`${aposentados} pedido(s) da grade anterior saíram do Carregamento`);
  if (ignoradas) avisos.push(`${ignoradas} linha(s) sem pedido ignorada(s)`);
  if (semHorario) avisos.push(`${semHorario} sem horário (não veio linha de bloco antes)`);
  if (comVariasCargas.length) {
    // O app so guarda 1 carga por pedido (a mais proxima). Sem este aviso,
    // ninguem saberia que o pedido tem mais volume saindo depois.
    const detalhe = comVariasCargas.map(([num, n]) => `${num} (${n})`).join(', ');
    avisos.push(`${comVariasCargas.length} pedido(s) em mais de uma carga — mostrando só a mais próxima: ${detalhe}`);
  }
  return `${lista.length} pedido(s) na grade de carregamento de ${dataLonga(dataRef)}.`
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
      // Robson, 12/09/2026: "os endereços deixe só em letra maiuscula para
      // mantermos o padrao" -- a planilha colada vem como o Datasul escreveu
      // (às vezes minúscula/mista), então padroniza já na entrada.
      localizacao: cols[3] ? cols[3].toUpperCase() : null,
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

  // ⚠️ O MAPA É CHAVEADO PELO CÓDIGO NORMALIZADO (trim + maiúscula), não pelo
  // código cru -- e quem lê usa a mesma normalização. Até 11/09/2026 era cru
  // dos dois lados, e um item gravado como "131556i" não achava a descrição do
  // "131556I" do catálogo: aparecia sem descrição na lista e na aba Conferir.
  // Era o mesmo defeito da trava de código (ver itemExisteNoCatalogoExp), e a
  // aba Conferir já normalizava desde sempre -- aqui só alinha com ela.
  unicos.forEach(c => {
    const chave = normalizaCodigoItem(c);
    if (mapa.has(chave)) return;
    const doCatalogoExp = catalogoExpItens.find(l => normalizaCodigoItem(l.codigo_item) === chave && l.descricao);
    if (doCatalogoExp) mapa.set(chave, { descricao: doCatalogoExp.descricao, um: doCatalogoExp.um });
  });

  // As duas buscas abaixo vão ao banco com o código como ele foi digitado: o
  // `in` do PostgREST é sensível a maiúscula/minúscula e não dá pra
  // normalizar do outro lado sem trocar por ilike item a item. O que dá pra
  // garantir aqui é a CHAVE do mapa -- resultado que voltar entra normalizado,
  // então a leitura acha do mesmo jeito.
  const faltandoAlm = unicos.filter(c => !mapa.has(normalizaCodigoItem(c)));
  if (faltandoAlm.length) {
    const { data: doCatalogo } = await sb.from('itens_requisicao')
      .select('codigo, descricao, um').in('codigo', faltandoAlm);
    (doCatalogo || []).forEach(r => mapa.set(normalizaCodigoItem(r.codigo), { descricao: r.descricao, um: r.um }));
  }

  const faltando = unicos.filter(c => !mapa.has(normalizaCodigoItem(c)));
  if (faltando.length) {
    const { data: doEstoque } = await sb.from('estoque')
      // Almoxarifado: e so pra preencher descricao/UM na tela. Sem o recorte,
      // um EPI com o mesmo codigo poderia emprestar a descricao dele aqui.
      .select('item, descricao, um').in('item', faltando).eq('deposito', 'alm');
    (doEstoque || []).forEach(r => {
      const chave = normalizaCodigoItem(r.item);
      if (!mapa.has(chave)) mapa.set(chave, { descricao: r.descricao, um: r.um });
    });
  }

  // Robson, 15/09/2026: "esses itens pode deixar no banco de dados, na
  // proxima vez que digitar ele ja vai puxar a descrição" -- último
  // recorte, só quando nenhum dos três catálogos oficiais tinha o código:
  // descrição que ELE digitou na mão numa entrada anterior
  // (exp_item_descricao_avulsa, fase48). Tabela própria e não
  // catalogo_exp_itens porque aquela é apagada e recriada inteira a cada
  // "Importar" -- uma descrição digitada na mão hoje sumiria no próximo
  // Importar, bem quando ele mais espera que ela já esteja lá.
  const faltandoAvulsa = unicos.filter(c => !mapa.has(normalizaCodigoItem(c)));
  if (faltandoAvulsa.length) {
    const { data: doAvulsa } = await sb.from('exp_item_descricao_avulsa')
      .select('codigo_item, descricao, um').eq('unidade', unidadeAtual).in('codigo_item', faltandoAvulsa);
    (doAvulsa || []).forEach(r => {
      const chave = normalizaCodigoItem(r.codigo_item);
      if (!mapa.has(chave)) mapa.set(chave, { descricao: r.descricao, um: r.um });
    });
  }
  return mapa;
}

// Grava a descrição digitada na mão -- silencioso no erro (mesmo padrão de
// carregarConferirExpNotas): se o fase48 ainda não rodou, o item ainda
// assim é registrado no Controle EXP, só não fica lembrado pra próxima vez.
async function salvarDescricaoAvulsa(codigoItem, descricao, um) {
  const { error } = await sb.from('exp_item_descricao_avulsa').upsert({
    unidade: unidadeAtual, codigo_item: codigoItem.trim(), descricao: descricao.trim(),
    um: (um || '').trim() || null, cadastrado_por: nomeUsuarioAtual
  }, { onConflict: 'unidade,codigo_item' });
  if (error) console.warn('Não foi possível salvar a descrição avulsa do item:', error.message);
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

// Três estados agora, não dois (11/09/2026, ver sql/fase36-doca.sql):
// na_expedicao (no endereço) -> na_doca (saiu do endereço, esperando o
// caminhão) -> retirado (carregou de verdade, fim de linha). Qualquer
// lugar que hoje pergunta "ainda está no endereço físico, pronto pra
// imprimir/conferir/auditar?" tem de excluir os DOIS estados de saída, não
// só o `retirado` -- item na doca já não está mais na prateleira, mesmo
// não tendo carregado ainda. `status === 'retirado'` sozinho (sem este
// helper) continua correto nos lugares que perguntam especificamente
// "carregou de vez" (Histórico de retiradas, relatório do PCP): esses NÃO
// mudam com a doca.
function aindaNoEndereco(status) {
  return status !== 'retirado' && status !== 'na_doca';
}

// ---- Ponte com o Painel de Docas (fase39) --------------------------------
// Qual carregamento está EM CURSO para cada nº de pedido. Um mapa só,
// carregado junto com o resto do Controle EXP, em vez de uma consulta a
// cada clique em "✓ Carregou": "Todo pedido carregou" marca item por item
// em laço, e uma ida ao banco por item deixaria o botão lento justamente
// na hora em que o conferente está com pressa.
//
// Chave normalizada (sem espaço, maiúscula) dos dois lados: o pedido é
// digitado na chegada do caminhão por uma pessoa e na Entrada do EXP por
// outra, e "kv876431 " não pode deixar de casar com "KV876431".
let carregamentoAbertoPorPedido = new Map();

// Pedido que tem caminhão ENCOSTADO numa doca esperando (já chamado, mas
// ainda não necessariamente carregando) -- Robson, 14/09/2026: "a
// responsavel pelo exp acessoris ja sabe que tem que deixar o material na
// parte que o conferente busca o material". É o aviso que faz o material
// ser separado ANTES do conferente ir buscar.
//
// Mapa SEPARADO do de cima, mesmo saindo da mesma consulta, porque
// respondem perguntas diferentes: este é só aviso na tela (inclui o
// veículo que encostou e ainda não começou), o de cima decide em qual
// caminhão a baixa vai ser carimbada (só quem está carregando de fato --
// carimbar num carregamento que nem começou faria a barra de progresso
// dele andar antes da hora).
let pedidoChamadoParaDoca = new Map();   // numero_pedido -> { doca, carregando }

function chavePedidoCarregamento(numeroPedido) {
  return String(numeroPedido == null ? '' : numeroPedido).trim().toUpperCase();
}

function carregamentoAbertoDoPedido(numeroPedido) {
  const chave = chavePedidoCarregamento(numeroPedido);
  return chave ? (carregamentoAbertoPorPedido.get(chave) || null) : null;
}

function chamadoParaDocaDoPedido(numeroPedido) {
  const chave = chavePedidoCarregamento(numeroPedido);
  return chave ? (pedidoChamadoParaDoca.get(chave) || null) : null;
}

// Selo "🚛 Doca 2" ao lado do nº do pedido, onde quer que o Controle EXP
// mostre um pedido. Vazio quando não há caminhão esperando por ele.
function seloDocaDoPedido(numeroPedido) {
  const chamado = chamadoParaDocaDoPedido(numeroPedido);
  if (!chamado) return '';
  const titulo = chamado.carregando
    ? `Carregando agora na ${chamado.doca} — o conferente está buscando este material`
    : `Veículo encostado na ${chamado.doca} esperando — deixe o material na área de carregamento`;
  return ` <span class="doca-chamado${chamado.carregando ? ' doca-chamado-carregando' : ''}"
                 title="${escapeHtml(titulo)}">🚛 ${escapeHtml(chamado.doca)}</span>`;
}

// Três consultas pequenas em vez de um embed aninhado
// (doca_carregamento_pedidos -> doca_carregamentos -> docas): o aninhado
// depende de o PostgREST resolver duas relações de uma vez, e quando
// falha, falha silencioso -- aqui é preferível previsível.
// As 3 docas cadastradas, pro select do botão 🚚 DOCA (ver
// marcarDocaFisica() e opcoesDocaFisicaHtml()) -- alimentado pela mesma
// consulta de baixo, sem busca própria.
let docasParaEscolha = [];

// Select "qual doca" repetido em três lugares (Entrada, Saída/Conferência
// item a item, e o "Tudo pra DOCA" por localização) -- função só, pra não
// desalinhar as opções entre eles.
function opcoesDocaFisicaHtml(selecionadoId) {
  if (!docasParaEscolha.length) return '<option value="">Sem doca cadastrada</option>';
  return '<option value="">Qual doca?</option>'
    + docasParaEscolha.map(d => `<option value="${escapeHtml(d.id)}"${d.id === selecionadoId ? ' selected' : ''}>${escapeHtml(d.nome)}</option>`).join('');
}

// Se todo item do grupo já está na mesma doca, o select nasce marcado
// nela (confirma o que já foi feito); se estão em docas diferentes (ou
// ainda sem nenhuma), nasce em branco -- marcar "Doca 1" por padrão
// quando os itens divergem inventaria um dado que ninguém confirmou.
function docaComumDoGrupo(linhas) {
  const valores = new Set(linhas.map(l => l.doca_id || ''));
  return valores.size === 1 ? [...valores][0] : '';
}

async function carregarCarregamentosAbertos() {
  carregamentoAbertoPorPedido = new Map();
  pedidoChamadoParaDoca = new Map();

  const [carregamentos, docas] = await Promise.all([
    sb.from('doca_carregamentos').select('id, status, doca_id')
      .eq('unidade', unidadeAtual).in('status', ['aguardando', 'carregando']).not('doca_id', 'is', null),
    sb.from('docas').select('id, nome').eq('unidade', unidadeAtual)
  ]);

  if (carregamentos.error || docas.error) {
    // Silencioso de propósito (mesmo padrão de carregarConferirExpNotas):
    // se o fase39 ainda não rodou no Supabase, o Controle EXP continua
    // funcionando inteiro -- só não mostra o aviso da doca, e o botão
    // 🚚 DOCA não tem doca pra oferecer (ver marcarDocaFisica()).
    console.warn('Não foi possível carregar os carregamentos das docas:',
                 (carregamentos.error || docas.error).message);
    return;
  }
  // Mesma consulta alimenta o select "qual doca" do botão 🚚 DOCA (fase43)
  // -- é a mesma lista de docas, não precisa buscar de novo.
  docasParaEscolha = docas.data || [];
  if (!(carregamentos.data || []).length) return;

  const nomeDaDoca = new Map((docas.data || []).map(d => [d.id, d.nome]));
  const porCarregamento = new Map((carregamentos.data || []).map(c => [c.id, c]));

  const { data: vinculos, error } = await sb.from('doca_carregamento_pedidos')
    .select('numero_pedido, carregamento_id')
    .in('carregamento_id', [...porCarregamento.keys()]);
  if (error) { console.warn('Não foi possível carregar os pedidos das docas:', error.message); return; }

  (vinculos || []).forEach(v => {
    const c = porCarregamento.get(v.carregamento_id);
    if (!c) return;
    const chave = chavePedidoCarregamento(v.numero_pedido);
    if (c.status === 'carregando') carregamentoAbertoPorPedido.set(chave, c.id);
    pedidoChamadoParaDoca.set(chave, {
      doca: nomeDaDoca.get(c.doca_id) || 'doca',
      carregando: c.status === 'carregando'
    });
  });
}

// Rótulo/classe do badge de status do Controle EXP -- usado onde quer que
// se mostre a situação do item (tabela da Entrada, exportação/ordenação).
// Um lugar só pros três nomes: escrever "Na doca"/"st-atencao" em mais de
// um lugar seria o tipo de duplicação que já causou divergência de
// terminologia noutras partes do portal.
function rotuloStatusExp(status) {
  if (status === 'retirado') return { rotulo: 'Saiu p/ carregamento', classe: 'st-ativo' };
  if (status === 'na_doca') return { rotulo: 'Na doca', classe: 'st-atencao' };
  return { rotulo: 'Na expedição', classe: 'st-pendente' };
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
  const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
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
    case 'status':  return rotuloStatusExp(l.status).rotulo;
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

// Item que já saiu do endereço (foi pra doca ou já carregou) não entra em
// "marcar todos" nem sai de novo na impressora -- Robson, 10/09/2026:
// "itens que ja carregou bloqueie para impressao". Não está mais na
// prateleira pra colar etiqueta nenhuma; reimprimir só confundiria quem
// conferisse a pilha de folhas depois.
function linhasImprimiveisExpControle() {
  return linhasFiltradasExpControle().filter(l => aindaNoEndereco(l.status));
}

// Conta pedidos DISTINTOS ainda no endereço (nem na doca, nem retirados) --
// um pedido vira várias linhas (uma por item), então contar linhas contaria
// o mesmo pedido várias vezes. Respeita a busca (#expCtrlBusca) igual à
// tabela, pra bater com o que a pessoa está vendo na tela.
function contarPedidosNaExpedicao(linhas) {
  const pedidos = new Set();
  linhas.forEach(l => {
    if (!aindaNoEndereco(l.status)) return;
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
  const idsDaTela = new Set(linhasDoSetorAtual().filter(l => aindaNoEndereco(l.status)).map(l => String(l.id)));
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
    const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
    const retirado = l.status === 'retirado';
    return `
    <tr${retirado ? ' style="opacity:0.6;"' : ''}>
      <td><input type="checkbox" class="expctrl-marcar" data-id="${escapeHtml(l.id)}"
                   ${!retirado && expCtrlSelecionadas.has(String(l.id)) ? 'checked' : ''}
                   ${retirado ? 'disabled title="Já saiu para carregamento -- não imprime de novo"' : ''}
                   aria-label="Marcar este item para imprimir"></td>
      <td class="loc"><input type="text" class="expctrl-loc-input" data-id="${escapeHtml(l.id)}"
             value="${escapeHtml(l.localizacao || '')}" placeholder="—"
             size="${Math.max(8, String(l.localizacao || '').length + 2)}"
             style="min-width:70px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px; text-transform:uppercase;"></td>
      <td class="item">${escapeHtml(l.codigo_item)}</td>
      <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
      <td class="loc">${desc && desc.um ? escapeHtml(desc.um) : '—'}</td>
      <td class="num"><input type="text" class="expctrl-qtd-input" data-id="${escapeHtml(l.id)}"
             value="${l.quantidade != null ? escapeHtml(l.quantidade) : ''}" placeholder="—"
             style="width:70px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px; text-align:right;"></td>
      <td class="loc">${escapeHtml(l.numero_pedido || '—')}${seloDocaDoPedido(l.numero_pedido)}</td>
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
        ${retirado ? '' : `<button class="acao-btn expctrl-saida" data-id="${escapeHtml(l.id)}" title="Saiu do endereço pra área de carregamento (DOCA)">🚚 DOCA</button>`}
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

// Robson, 11/09/2026, na telinha "Onde está": "coloca um botao que vou
// colocar que o pedido esta certo no sistema esperando faturamento".
// Confirmado que o botão só marca (não muda a conta sistema x físico):
// fica registrado quem/quando, e o pedido some do destaque de "suspeito"
// dali em diante (ver sql/fase37-pedido-aguardando-faturamento.sql).
let pedidoFaturamentoConfirmadoMap = new Map(); // numero_pedido -> {confirmado_por, confirmado_em}

async function carregarPedidoFaturamentoConfirmado() {
  const { data, error } = await sb.from('exp_pedido_faturamento_confirmado').select('*').eq('unidade', unidadeAtual);
  pedidoFaturamentoConfirmadoMap = new Map();
  if (error) {
    // Silencioso de propósito (mesmo padrão de carregarConferirExpNotas):
    // se o fase37 ainda não rodou, a telinha continua funcionando sem a
    // marcação em vez de travar a aba inteira.
    console.warn('Não foi possível carregar as confirmações de faturamento:', error.message);
    return;
  }
  (data || []).forEach(r => pedidoFaturamentoConfirmadoMap.set(r.numero_pedido, r));
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
  // codigo normalizado -> Map<localização, Map<nº pedido, quantidade>> --
  // guarda pedido E quantidade juntos pra responder "ao clicar aparecer
  // todas as localizações e os pedidos referentes" (Robson) -- depois
  // também "coloque as quantidades por pedido também", 11/09/2026.
  const ondeEsta = new Map();
  linhasDoSetorAtual().forEach(l => {
    // ⚠️ De propósito só `=== 'retirado'` (não `aindaNoEndereco`): item na
    // doca ainda não carregou de verdade, continua fisicamente dentro do
    // prédio -- pra fins de conferência sistema x físico, ele CONTINUA
    // contando como físico presente. Só some daqui quando carrega mesmo.
    if (l.status === 'retirado') return;
    const chave = normalizaCodigoItem(l.codigo_item);
    if (!chave) return;
    const qtdLinha = parseNum(l.quantidade);
    somar(fisico, chave, qtdLinha);
    const local = (l.localizacao || '').trim();
    if (local) {
      if (!ondeEsta.has(chave)) ondeEsta.set(chave, new Map());
      const porLocal = ondeEsta.get(chave);
      if (!porLocal.has(local)) porLocal.set(local, new Map());
      // Duas linhas do MESMO pedido na MESMA localização (dois lotes, por
      // exemplo) somam -- listar duas vezes o mesmo pedido confundiria mais
      // do que ajudaria.
      somar(porLocal.get(local), (l.numero_pedido || '').trim() || '—', qtdLinha);
    }
    // A descrição do catálogo é a preferida (é a do sistema); esta cobre o item
    // que só existe no físico, e que por definição não está no catálogo.
    if (!infoItem.has(chave)) {
      const d = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item)) || {};
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
      .map(([localizacao, porPedido]) => ({
        localizacao,
        pedidos: [...porPedido.entries()]
          .map(([pedido, quantidade]) => ({ pedido, quantidade }))
          .sort((a, b) => a.pedido.localeCompare(b.pedido))
      }))
      .sort((a, b) => a.localizacao.localeCompare(b.localizacao));

    // Um pedido pode aparecer em mais de uma localização (lotes diferentes,
    // por exemplo) -- soma o TOTAL do pedido pro item, não só o pedaço de
    // cada endereço. É essa soma que se compara com a diferença, não a
    // parcela de uma localização só.
    const totalPorPedido = new Map();
    locaisDetalhe.forEach(d => d.pedidos.forEach(p => somar(totalPorPedido, p.pedido, p.quantidade)));
    const pedidosTotais = [...totalPorPedido.entries()].map(([pedido, quantidade]) => ({ pedido, quantidade }));

    return {
      chave, codigo: info.codigo, descricao: info.descricao, um: info.um,
      qtdSistema, qtdFisico, diferenca, situacao,
      locais: locaisDetalhe.map(d => d.localizacao),
      locaisDetalhe, pedidosTotais
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

// Motivo de negócio mais comum por trás de cada tipo de divergência --
// Robson, 11/09/2026: "pode dar uma informação que o pedido pode ter sido
// faturado e não carregou... pode ser ao contrário também, quando está no
// sistema e não no físico, pode ser que carregou e não faturou".
//
// "Só no sistema" e "a mais no sistema" são o MESMO motivo: um item
// marcado `retirado` sai da conta do físico (linhasDoSetorAtual() ignora
// status 'retirado'), então "carregou de verdade mas o sistema ainda não
// sabe" e "sumiu do físico" são a mesma história vista de dois jeitos.
//
// É só um PALPITE pelo padrão mais comum, não um fato -- por isso o texto
// nunca afirma, só sugere.
function explicacaoDivergenciaConf(situacao, diferenca) {
  if (situacao === 'so_sistema' || (situacao === 'diferenca' && diferenca < 0)) {
    return 'Motivo comum: o pedido pode já ter carregado de verdade (some do físico assim que é retirado) -- '
      + 'mas o faturamento ainda não foi lançado no sistema.';
  }
  if (situacao === 'diferenca' && diferenca > 0) {
    return 'Motivo comum: o pedido pode já ter sido faturado no sistema, mas ainda não chegou a carregar de verdade '
      + '-- continua fisicamente aqui.';
  }
  return '';
}

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
    // Robson, 11/09/2026, sobre a coluna Situação: "quero mais detalhado,
    // que diz se esta a mais no fisico ou no sistema". "Diferença" sozinho
    // não dizia PRA QUE LADO -- a pessoa tinha que olhar a coluna Diferença
    // do lado (com sinal) pra descobrir. Sistema/Físico continuam sendo os
    // MESMOS dois estados internos (contam nos mesmos cards, mesmo filtro
    // "Com diferença") -- só o rótulo exibido muda conforme o sinal.
    const s = l.situacao === 'diferenca'
      ? (l.diferenca > 0
          ? { rotulo: 'A mais no físico', classe: SITUACOES_CONF.diferenca.classe }
          : { rotulo: 'A mais no sistema', classe: SITUACOES_CONF.diferenca.classe })
      : SITUACOES_CONF[l.situacao];
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
      <td><span class="cfg-status ${s.classe}" title="${escapeHtml(explicacaoDivergenciaConf(l.situacao, l.diferenca))}">${s.rotulo}</span></td>
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

// Marca a mudança de estado do item no fluxo de saída -- nao apaga o
// registro, so muda o status. Três destinos possíveis desde 11/09/2026
// (sql/fase36-doca.sql, ver aindaNoEndereco()):
//
//   'na_doca'      -- saiu do endereço, esperando o caminhão (botão DOCA)
//   'retirado'     -- carregou de verdade, fim de linha (botão ✓ Carregou,
//                     na aba DOCA -- é o default quando novoStatus não é
//                     informado, mesmo comportamento de sempre)
//   'na_expedicao' -- "desfazer": volta pro endereço, limpa os dois carimbos
//
// `na_doca_por`/`na_doca_em` e `retirado_por`/`retirado_em` NÃO se
// sobrescrevem um ao outro: um item passa pelos dois carimbos em
// sequência (entrou na doca, depois carregou), e usar as mesmas colunas
// pras duas coisas apagaria "há quanto tempo ficou na doca antes de
// carregar" assim que a segunda etapa acontecesse.
async function marcarSaidaExpControle(id, conferente, novoStatus, docaFisicaId) {
  const status = novoStatus || 'retirado';
  const linha = progExpControle.find(l => l.id === id);
  let patch;
  if (status === 'na_doca') {
    // Robson, 14/09/2026: "a minha responsavel que deixou o material la
    // ela coloca o numero da doca" -- quem carrega o material já sabe pra
    // qual das 3 docas físicas está indo; `doca_id` registra isso no
    // mesmo instante (ver sql/fase43-exp-item-doca-fisica.sql). Diferente
    // de `doca_carregamento_id` (fase39): aquele é o CAMINHÃO específico
    // que carrega o pedido; este é só o ENDEREÇO FÍSICO (Doca 1/2/3), e
    // pode existir antes de qualquer caminhão estar registrado ali.
    patch = { status, na_doca_por: conferente, na_doca_em: new Date().toISOString(), doca_id: docaFisicaId || null };
  } else if (status === 'retirado') {
    patch = { status, retirado_por: conferente, retirado_em: new Date().toISOString() };
    // Painel de Docas (fase39): carimba em QUAL caminhão este item subiu,
    // se o pedido dele estiver num carregamento em curso. É isto -- e só
    // isto -- que faz a barra de progresso do painel andar sozinha: o
    // conferente continua clicando "✓ Carregou" como sempre, sem tela
    // nova nem digitação a mais. Sem carregamento aberto pro pedido, a
    // coluna fica nula e a baixa acontece igual (a coluna não tem FK
    // justamente pra baixa nunca depender de registro acessório).
    const carregamentoId = carregamentoAbertoDoPedido(linha && linha.numero_pedido);
    if (carregamentoId) patch.doca_carregamento_id = carregamentoId;
  } else {
    // "desfazer": volta pra na_expedicao, limpa os dois carimbos -- não
    // interessa de qual dos dois estados de saída ele estava desfazendo.
    // O vínculo com o carregamento sai junto: o item não subiu naquele
    // caminhão, então não pode continuar contando na barra dele.
    patch = { status, na_doca_por: null, na_doca_em: null, retirado_por: null, retirado_em: null,
              doca_carregamento_id: null, doca_id: null };
  }
  const { error } = await sb.from('exp_controle_itens').update(patch).eq('id', id);
  if (error) { alert('Não foi possível salvar: ' + error.message); return false; }

  // log_movimentacao.pedido_id e NOT NULL com FK pra pedidos -- exp_controle_itens
  // so guarda o NUMERO do pedido (texto), entao so loga se achar o pedido de
  // verdade na grade carregada agora. Log e so rastreabilidade: sem achar,
  // a acao principal (que ja aconteceu, linha acima) nao e desfeita por isso.
  const item = linha;
  const pedido = item ? pedidoDoNumero(item.numero_pedido) : null;
  if (item && pedido) {
    const evento = status === 'retirado' ? 'item_saiu_expedicao'
      : status === 'na_doca' ? 'item_foi_pra_doca' : 'item_saida_desfeita';
    await registrarLogProgramacao(pedido.id, evento,
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
  renderOndeEstaModal(celula.dataset.chave);
  ondeEstaModal.classList.add('open');
  aplicarPosicaoOndeEsta();   // reabre no lugar onde foi deixada
});

// Extraído do handler de clique pra poder ser chamado de novo depois de
// confirmar um pedido (redesenha a MESMA telinha com o estado atualizado,
// sem fechar e sem perder a posição arrastada).
function renderOndeEstaModal(chave) {
  const linha = montarConferirExp().find(l => l.chave === chave);
  if (!linha || !linha.locaisDetalhe.length) return;

  // Robson, 11/09/2026: "coloque as quantidades por pedido também" -- uma
  // linha por (localização, pedido), pra quantidade não ficar solta sem
  // dizer de qual pedido é (uma localização pode ter mais de um pedido).
  const linhasTabela = linha.locaisDetalhe.flatMap(d =>
    d.pedidos.map((p, i) => ({
      // Localização só aparece na primeira linha do grupo (rowspan) -- repetir
      // em toda linha do mesmo endereço poluiria mais do que ajudaria.
      localizacao: i === 0 ? d.localizacao : null,
      rowspan: d.pedidos.length,
      pedido: p.pedido,
      quantidade: p.quantidade
    })));

  // Robson, 11/09/2026: "pode me dar só um aviso do que pode ter
  // acontecido, pelas quantidades seria mais facil de identificar qual
  // pedido é" -- SÓ um aviso, não uma certeza: o Catálogo EXP não separa
  // por pedido (é só a quantidade total esperada do item), então não tem
  // como AFIRMAR qual pedido está de fora. O que dá pra fazer com segurança
  // é comparar: se a quantidade de algum pedido bate (quase) exatamente com
  // a diferença "a mais no físico", esse pedido é candidato forte -- avisa
  // qual é, sem apagar os outros da lista.
  //
  // ⚠️ Só entra quando a SITUAÇÃO é 'diferenca' -- não basta checar
  // `diferenca > 0`: "Só no físico" (sistema = 0) também tem diferença
  // positiva (é o próprio total do físico), e comparar pedido contra ela
  // não tem o mesmo significado -- não existe "quantidade esperada" pra
  // sobrar. Aqui a modal só abre pra 'ok'/'diferenca'/'so_fisico' (item sem
  // localização nenhuma nem abre a modal), então o filtro explícito
  // importa de verdade.
  const EPSILON_QTD = 0.005; // tolera arredondamento de casa decimal
  let aviso = '';
  // Declarado fora do `if` de propósito: a tabela mais abaixo usa
  // `pedidosSuspeitos` pra destacar a(s) linha(s), mesmo depois deste
  // bloco acabar.
  //
  // ⚠️ Corrigido 11/09/2026: o Robson conferiu na mão e o pedido apontado
  // (o primeiro que batia com a diferença) NÃO era o que já tinha sido
  // faturado -- era outro pedido, com a MESMA quantidade. `.find()`
  // pegava só o primeiro em ordem alfabética de localização e o mostrava
  // como se fosse o único candidato, escondendo que havia empate. Agora é
  // `.filter()`: quando duas pedidos batem igual, os DOIS aparecem como
  // candidatos -- apontar um só, escondendo o empate, é pior que não
  // apontar nenhum (dá falsa certeza numa conferência que não pode errar).
  let pedidosSuspeitos = [];
  if (linha.situacao === 'diferenca') {
    // Robson, 11/09/2026: "pode dar uma informação que o pedido pode ter
    // sido faturado e não carregou... pode ser ao contrário também, quando
    // está no sistema e não no físico, pode ser que carregou e não
    // faturou" -- mesmo texto do title do badge da coluna Situação, aqui
    // por extenso porque a telinha tem espaço.
    const explicacao = explicacaoDivergenciaConf(linha.situacao, linha.diferenca);
    if (linha.diferenca > 0) {
      pedidosSuspeitos = linha.pedidosTotais.filter(p => Math.abs(p.quantidade - linha.diferenca) < EPSILON_QTD);
      const listaPedidos = pedidosSuspeitos.map(p => `<b>${escapeHtml(p.pedido)}</b>`).join(', ');
      aviso = pedidosSuspeitos.length === 1
        ? `<div class="modal-text" style="margin-bottom:10px; padding:8px 10px; background:var(--aviso-fundo); color:var(--aviso-texto); border-radius:8px; font-weight:600;">
             ⚠ Pedido ${listaPedidos} tem exatamente ${numeroBR(pedidosSuspeitos[0].quantidade)}${linha.um ? ' ' + escapeHtml(linha.um) : ''}
             — bate com a diferença "a mais no físico". Pode ser o que ainda não foi lançado no sistema
             (não é certeza, é só a pista mais provável pela quantidade). ${escapeHtml(explicacao)}
           </div>`
        : pedidosSuspeitos.length > 1
          ? `<div class="modal-text" style="margin-bottom:10px; padding:8px 10px; background:var(--aviso-fundo); color:var(--aviso-texto); border-radius:8px; font-weight:600;">
               ⚠ ${pedidosSuspeitos.length} pedidos batem igual com a diferença de ${numeroBR(linha.diferenca)}${linha.um ? ' ' + escapeHtml(linha.um) : ''}
               (${listaPedidos}) — não dá pra saber qual pela quantidade sozinha, confira cada um.
               ${escapeHtml(explicacao)}
             </div>`
          : `<div class="modal-text" style="margin-bottom:10px; color:var(--muted);">
               Nenhum pedido bate sozinho com a diferença de ${numeroBR(linha.diferenca)}${linha.um ? ' ' + escapeHtml(linha.um) : ''}
               — pode ser soma de mais de um pedido, ou a diferença não vem de pedido nenhum. ${escapeHtml(explicacao)}
             </div>`;
    } else {
      aviso = `<div class="modal-text" style="margin-bottom:10px; color:var(--muted);">
          O sistema espera ${numeroBR(Math.abs(linha.diferenca))}${linha.um ? ' ' + escapeHtml(linha.um) : ''} a mais do que está
          registrado fisicamente aqui. ${escapeHtml(explicacao)}
        </div>`;
    }
  }

  // Robson, 11/09/2026: "ali aonde está a flecha laranja coloca um botao
  // que vou colocar que o pedido esta certo no sistema esperando
  // faturamento" -- só faz sentido no lado "a mais no sistema" (o pedido já
  // carregou, físico sumiu, só falta o Datasul processar). No lado "a mais
  // no físico" o motivo é o oposto (já faturado, ainda não carregou) --
  // "esperando faturamento" não se aplica lá, por isso o botão só aparece
  // aqui. Confirmado que o clique SÓ MARCA (não muda a conta sistema x
  // físico nem a situação do item) -- ver sql/fase37.
  const mostraColunaFaturamento = linha.situacao === 'diferenca' && linha.diferenca < 0;

  ondeEstaModalBox.innerHTML = `
    <button class="modal-close" id="ondeEstaCloseBtn">✕</button>
    <h3 style="margin-top:0;">📍 ${escapeHtml(linha.codigo)}</h3>
    <div class="modal-text" style="margin-bottom:10px;">${escapeHtml(linha.descricao || '—')}</div>
    ${aviso}
    <div style="overflow-x:auto; max-width:100%;">
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left; padding:4px 8px; border-bottom:1px solid var(--border);">Localização</th>
        <th style="text-align:left; padding:4px 8px; border-bottom:1px solid var(--border);">Nº Pedido</th>
        <th style="text-align:right; padding:4px 8px; border-bottom:1px solid var(--border);">Quantidade</th>
        ${mostraColunaFaturamento ? '<th style="text-align:left; padding:4px 8px; border-bottom:1px solid var(--border);">Faturamento</th>' : ''}
      </tr></thead>
      <tbody>
        ${linhasTabela.map(r => {
          const confirmado = pedidoFaturamentoConfirmadoMap.get(r.pedido);
          // Pedido já confirmado não é mais "suspeito" -- já foi revisado,
          // manter o amarelo/⚠ depois de confirmado só ignoraria o clique.
          const suspeito = !confirmado && pedidosSuspeitos.some(p => p.pedido === r.pedido);
          const estilo = suspeito ? ' style="background:var(--aviso-fundo);"' : '';
          const acaoFaturamento = !mostraColunaFaturamento ? '' : confirmado
            ? `<td style="padding:4px 8px; border-bottom:1px solid var(--border); color:var(--ok-texto); font-size:12px;"
                   title="${confirmado.confirmado_por ? escapeHtml(confirmado.confirmado_por) + ' — ' : ''}${escapeHtml(formatarDataHoraBR(confirmado.confirmado_em))}">
                 ✓ Aguardando faturamento
               </td>`
            : `<td style="padding:4px 8px; border-bottom:1px solid var(--border);">
                 <button class="acao-btn onde-esta-confirmar-faturamento" data-pedido="${escapeHtml(r.pedido)}"
                         title="Marca que este pedido está certo no sistema, só esperando o faturamento">
                   Está certo, aguardando faturamento
                 </button>
               </td>`;
          return `
          <tr${estilo}>
            ${r.localizacao !== null
              ? `<td rowspan="${r.rowspan}" style="padding:4px 8px; border-bottom:1px solid var(--border); vertical-align:top;">${escapeHtml(r.localizacao)}</td>`
              : ''}
            <td style="padding:4px 8px; border-bottom:1px solid var(--border);">${suspeito ? '⚠ ' : ''}${escapeHtml(r.pedido)}</td>
            <td style="padding:4px 8px; border-bottom:1px solid var(--border); text-align:right;">${numeroBR(r.quantidade)}${linha.um ? ' ' + escapeHtml(linha.um) : ''}</td>
            ${acaoFaturamento}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
  document.getElementById('ondeEstaCloseBtn').addEventListener('click', fecharOndeEstaModal);
  document.querySelectorAll('.onde-esta-confirmar-faturamento').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await sb.from('exp_pedido_faturamento_confirmado').upsert({
        unidade: unidadeAtual, numero_pedido: btn.dataset.pedido,
        confirmado_por: nomeUsuarioAtual, confirmado_em: new Date().toISOString()
      }, { onConflict: 'unidade,numero_pedido' });
      if (error) {
        alert('Não foi possível confirmar: ' + error.message
          + ' — se a mensagem falar em tabela inexistente, sql/fase37-pedido-aguardando-faturamento.sql ainda não foi rodado no Supabase.');
        btn.disabled = false;
        return;
      }
      await carregarPedidoFaturamentoConfirmado();
      renderOndeEstaModal(chave); // redesenha a mesma telinha já com a marca
    });
  });
}
ondeEstaModal.addEventListener('click', (e) => {
  // Soltar o arrasto fora da caixa não pode contar como "clicou fora, fecha".
  if (ondeEstaArrastou) return;
  if (e.target === ondeEstaModal) fecharOndeEstaModal();
});

// ---- Arrastar a telinha "Onde está" -------------------------------------
// Robson, 11/09/2026: "essa telinha deixa livre para eu movimentar ela, as
// vezes vou tirar print da tela aí ajusto aonde quero ela".
//
// Move por `transform`, e não por left/top: a caixa é centralizada pelo flex
// do overlay, e mexer em left/top brigaria com essa centralização.
//
// A posição fica GUARDADA enquanto a página estiver aberta -- ajustou uma
// vez, as próximas aberturas já nascem no mesmo lugar (é o que "ajusto aonde
// quero ela" pede; reabrir no centro obrigaria a arrastar de novo a cada
// item).
let ondeEstaDeslocX = 0;
let ondeEstaDeslocY = 0;
let ondeEstaArrastou = false;   // houve arrasto de verdade desde o último clique

// Segura a caixa DENTRO da tela inteira -- Robson, 11/09/2026, mostrando a
// coluna Quantidade cortada na borda direita: a régua antiga só evitava a
// caixa sumir quase inteira (só entrava em ação com a caixa quase toda fora
// da tela), e deixava passar um arrasto "só um pouco demais" que empurra a
// borda DIREITA (onde mora a Quantidade, a última coluna) pra fora da
// janela -- o resto da página então precisava rolar pro lado pra completar
// a visão, e a posição fica GUARDADA, então o corte se repetia toda vez
// que a telinha abria de novo.
//
// Agora trava a caixa INTEIRA dentro da tela (nenhuma borda passa), com
// prioridade pro canto esquerdo/superior quando a caixa é maior que a
// tela disponível -- é onde ficam o título e o ✕, o mínimo pra continuar
// usável mesmo nesse caso extremo.
function aplicarPosicaoOndeEsta() {
  ondeEstaModalBox.style.transform = `translate(${ondeEstaDeslocX}px, ${ondeEstaDeslocY}px)`;
  const r = ondeEstaModalBox.getBoundingClientRect();
  const margem = 16;
  let corrigeX = 0, corrigeY = 0;
  if (r.right > window.innerWidth - margem) corrigeX = (window.innerWidth - margem) - r.right;
  else if (r.left < margem) corrigeX = margem - r.left;
  if (r.bottom > window.innerHeight - margem) corrigeY = (window.innerHeight - margem) - r.bottom;
  else if (r.top < margem) corrigeY = margem - r.top;
  if (corrigeX || corrigeY) {
    ondeEstaDeslocX += corrigeX;
    ondeEstaDeslocY += corrigeY;
    ondeEstaModalBox.style.transform = `translate(${ondeEstaDeslocX}px, ${ondeEstaDeslocY}px)`;
  }
}

// `pointerdown` (e não mousedown) cobre mouse e toque com um código só.
ondeEstaModalBox.addEventListener('pointerdown', (e) => {
  // O ✕ e a tabela ficam de fora: a tabela rola pro lado quando a lista é
  // comprida, e arrastar a janela roubaria esse gesto.
  if (e.target.closest('.modal-close, table')) return;

  ondeEstaArrastou = false;
  const origemX = e.clientX - ondeEstaDeslocX;
  const origemY = e.clientY - ondeEstaDeslocY;
  // Captura o ponteiro: o arrasto continua valendo mesmo quando o cursor sai
  // da caixa, que é o caso normal ao jogar a janela pro canto.
  ondeEstaModalBox.setPointerCapture(e.pointerId);

  const mover = (ev) => {
    ondeEstaArrastou = true;
    ondeEstaDeslocX = ev.clientX - origemX;
    ondeEstaDeslocY = ev.clientY - origemY;
    aplicarPosicaoOndeEsta();
  };
  const soltar = () => {
    ondeEstaModalBox.removeEventListener('pointermove', mover);
    ondeEstaModalBox.removeEventListener('pointerup', soltar);
    ondeEstaModalBox.removeEventListener('pointercancel', soltar);
    // Zera só depois que o `click` do fim do arrasto já passou.
    setTimeout(() => { ondeEstaArrastou = false; }, 0);
  };
  ondeEstaModalBox.addEventListener('pointermove', mover);
  ondeEstaModalBox.addEventListener('pointerup', soltar);
  ondeEstaModalBox.addEventListener('pointercancel', soltar);
  e.preventDefault();   // sem isso o arrasto seleciona o texto da janela
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
async function gravarMovimentacaoManual({ codigo, pedido, quantidadeTexto, local, op, lote, ref, tipo, descricaoManual }) {
  codigo = (codigo || '').trim();
  if (!codigo) return { ok: false, mensagem: 'Informe o código do item.' };

  // Robson, 15/09/2026: "não consigo inserir itens que nao esta na
  // planilha do exp, preciso que libere para eu digitar o que nao caiu
  // ainda no sistema, as vezes é só por falta de reporte ou eu nao
  // atualizei a planilha" -- não trava mais por não estar no Catálogo
  // EXP (ver itemExisteNoCatalogoExp(), agora só usado como dica visual,
  // não como bloqueio). Busca em cascata (Catálogo EXP -> Requisição ALM
  // -> estoque -> descrição avulsa de uma entrada anterior) pra saber se
  // já existe descrição; se não achar em lugar nenhum e a pessoa tiver
  // digitado uma na hora, ela fica salva (exp_item_descricao_avulsa,
  // fase48) pra já vir pronta da próxima vez.
  const chave = normalizaCodigoItem(codigo);
  const jaTemDescricao = (await buscarDescricoesItens([codigo])).get(chave);
  if (!jaTemDescricao && (descricaoManual || '').trim()) {
    await salvarDescricaoAvulsa(codigo, descricaoManual.trim());
  }

  const linha = {
    unidade: unidadeAtual,
    setor: setorExpAtual, // 'exp' ou 'benchmark' -- qual das duas telas gravou
    numero_pedido: (pedido || '').trim() || null,
    codigo_item: codigo,
    quantidade: (quantidadeTexto || '').trim() ? parseQtd(quantidadeTexto.trim()) : null,
    localizacao: (local || '').trim() ? local.trim().toUpperCase() : null,
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

  const semDescricao = !jaTemDescricao && !(descricaoManual || '').trim();
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

  // Robson, 11/09/2026: "nao deixe colocar numero de pedido no mesmo
  // endereço, envie um avis que ja tem pedido no mesmo endereço" -- aviso
  // que exige confirmação, não trava sozinha: às vezes o pedido anterior
  // já carregou e só não foi marcado como retirado ainda, então bloquear
  // de vez impediria um registro válido. O confirm() é o "avisa e deixa a
  // pessoa decidir".
  if (document.getElementById('expManualTipo').value !== 'saida') {
    const conflito = pedidoConflitanteNaLocalizacao(
      document.getElementById('expManualLocal').value,
      document.getElementById('expManualPedido').value
    );
    if (conflito) {
      const confirmado = confirm(`Já existe o pedido ${conflito} nesta localização (ainda na expedição, não retirado).\n\n`
        + 'Confirma mesmo assim? Se ele já carregou, lembre de marcar a saída na aba Saída/Conferência.');
      if (!confirmado) return;
    }
  }

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
    tipo: document.getElementById('expManualTipo').value,
    descricaoManual: document.getElementById('expManualDescricaoInput').value
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
  document.getElementById('expManualDescricaoInput').style.display = 'none';
  document.getElementById('expManualDescricaoInput').value = '';
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
  // Robson, 15/09/2026: "preciso que libere para eu digitar o que nao
  // caiu ainda no sistema" -- não trava mais aqui (era bloqueio duro até
  // 15/09/2026). Só avisa: o wizard não tem campo de descrição próprio
  // (diferente do formulário completo, que deixa digitar uma e ela fica
  // salva pra próxima vez -- ver expManualDescricaoInput), então quem
  // continuar por aqui com um código fora de todo catálogo vai gravar sem
  // descrição, igual à colagem em lote.
  if (passo.campo === 'codigo_item' && valor && !itemExisteNoCatalogoExp(valor)) {
    document.getElementById('expWizMsg').textContent =
      '⚠ Este código não está no Catálogo EXP desta unidade -- vai ser registrado mesmo assim, '
      + 'mas sem descrição garantida (ela pode vir de outro catálogo). Pra digitar a descrição na mão, use o formulário completo.';
    document.getElementById('expWizMsg').className = 'status-msg status-err';
  }

  // Mesmo aviso do formulário completo (pedidoConflitanteNaLocalizacao) --
  // Robson, 11/09/2026: "as vezes esqueço de tirar da localização quando
  // expediçao leva para carregamento". Confirm() aqui porque o passo já
  // avançaria sozinho sem dar chance de a pessoa notar o pedido misturado.
  if (passo.campo === 'localizacao' && valor && document.getElementById('expManualTipo').value !== 'saida') {
    const conflito = pedidoConflitanteNaLocalizacao(valor, expWizDados.numero_pedido);
    if (conflito) {
      const confirmado = confirm(`Já existe o pedido ${conflito} nesta localização (ainda na expedição, não retirado).\n\n`
        + 'Confirma mesmo assim? Se ele já carregou, lembre de marcar a saída na aba Saída/Conferência.');
      if (!confirmado) return false;
    }
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
    // Robson, 14/09/2026, depois de ver o seletor de doca nesta tela:
    // "a parte em qual doca so na aba que coloquei a flecha, me importa
    // mais a doca la de fora do carregamento" -- escolher a doca saiu
    // daqui (e da Saída/Conferência) e virou só um seletor por PEDIDO
    // dentro da própria aba DOCA (ver renderDoca()), pra não travar o
    // clique rápido de quem está esvaziando o endereço.
    const ok = await marcarSaidaExpControle(btnSaida.dataset.id, nomeUsuarioAtual, 'na_doca');
    if (ok) await carregarProgramacao();
  }
});

// Localização editável direto na lista -- pra quando o item muda de lugar
// depois de já registrado, sem precisar excluir e digitar tudo de novo.
// ---- Gravação dos campos editáveis direto na lista (aba Entrada) ---------
//
// O Victor, 14/09/2026: *"ao tentar mudar a data de entrada aparece o erro
// 'Não foi possível salvar a data: TypeError: failed to fetch'"*.
//
// ⚠️ "Failed to fetch" NÃO é recusa do banco. É a exceção do `fetch` do
// navegador, que o supabase-js repassa como texto dentro de `error.message`:
// a requisição não chegou a ter resposta -- rede caiu, VPN dormiu, proxy ou
// extensão bloqueou, a máquina hibernou com a tela aberta. Sondado em
// 14/09/2026 direto na API (projeto acordado, preflight de PATCH liberado,
// PATCH aceito com os cabeçalhos de CORS certos), então não é o portal nem o
// Supabase recusando: é o caminho entre os dois.
//
// Três coisas que estas gravações precisavam e não tinham:
//
//  1. ⚠️ RECIBO (`.select('id')`). Conferido na API no mesmo dia: um PATCH que
//     não casa linha nenhuma -- inclusive um barrado pelo RLS -- responde
//     **204 No Content com `error: null`**. Sem o recibo a tela pintava a
//     borda azul, dizia que salvou, e o F5 desmentia. É o item A1 da
//     AUDITORIA.md, que o resto do projeto já fecha e estes três editores
//     tinham deixado passar.
//  2. UMA SEGUNDA TENTATIVA quando a falha é de rede. Um `update` destes é
//     idempotente (grava um valor fixo numa linha), então repetir é seguro --
//     e uma piscada de rede deixa de custar o que a pessoa digitou.
//  3. MENSAGEM EM PORTUGUÊS pro caso de rede. "TypeError: failed to fetch" não
//     diz a ninguém o que fazer.
function falhaDeRedeSupabase(error) {
  // Não há `code` para testar: numa exceção do fetch o supabase-js monta o
  // erro com a exceção convertida em texto, e só. Então é pelo texto mesmo.
  return !!error && /failed to fetch|networkerror|network error|load failed/i.test(error.message || '');
}

async function gravarCampoExpControle(id, campos) {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const { data, error } = await sb.from('exp_controle_itens')
      .update(campos).eq('id', id).select('id');

    if (!error) {
      if (data && data.length) return { ok: true };
      return { ok: false, mensagem: 'o banco não alterou nenhuma linha — ou o '
        + 'registro foi excluído por outra pessoa, ou seu acesso não permite '
        + 'editar. Clique em Atualizar e confira antes de digitar de novo.' };
    }

    if (!falhaDeRedeSupabase(error)) return { ok: false, mensagem: error.message };

    if (tentativa === 2) {
      console.error('Falha de rede ao gravar em exp_controle_itens:', error.message);
      return { ok: false, rede: true, mensagem: 'o navegador não conseguiu falar '
        + 'com o banco de dados (tentei duas vezes). Confira a internet e a VPN '
        + 'e tente de novo — o que você digitou continua no campo.' };
    }
    await new Promise(f => setTimeout(f, 700));
  }
}

// Campo que não salvou fica VERMELHO e continua com o texto digitado, em vez
// de voltar sozinho pro valor antigo: numa falha de rede o que está na tela é
// a única cópia que existe, e apagar obriga a pessoa a digitar tudo de novo só
// pra tentar outra vez. Mesmo princípio do "⚠ não salvou" da contagem
// (marcarFalhaContagem em js/estoque.js).
function marcarCampoExpNaoSalvou(input, mensagem) {
  input.style.borderColor = 'var(--erro-borda)';
  input.style.background = 'var(--erro-fundo)';
  input.title = 'NÃO SALVOU: ' + mensagem;
}

function marcarCampoExpSalvou(input) {
  input.style.background = '';
  input.title = '';
  input.style.borderColor = 'var(--blue)';
  setTimeout(() => { input.style.borderColor = ''; }, 1200);
}

// 'focusout' (não 'blur') porque bubbla até o <tbody> delegado. Não
// recarrega a tela toda: só atualiza o registro em memória, senão o campo
// perderia o foco a cada edição.
document.getElementById('expCtrlBody').addEventListener('focusout', async (e) => {
  const input = e.target.closest('.expctrl-loc-input');
  if (!input) return;

  const item = progExpControle.find(l => l.id === input.dataset.id);
  if (!item) return;

  // Robson, 12/09/2026: "os endereços deixe só em letra maiuscula para
  // mantermos o padrao" -- maiúscula direto no que é salvo, não só na
  // exibição, senão a mesma localização digitada em caixas diferentes por
  // pessoas diferentes contaria como dois endereços distintos na busca.
  const novaLocalizacao = input.value.trim() ? input.value.trim().toUpperCase() : null;
  if (novaLocalizacao === (item.localizacao || null)) { input.value = novaLocalizacao || ''; return; }

  input.disabled = true;
  const res = await gravarCampoExpControle(item.id, { localizacao: novaLocalizacao });
  input.disabled = false;

  if (!res.ok) {
    alert('Não foi possível salvar a localização: ' + res.mensagem);
    marcarCampoExpNaoSalvou(input, res.mensagem);
    return;
  }
  item.localizacao = novaLocalizacao;
  input.value = novaLocalizacao || '';
  input.size = Math.max(8, (novaLocalizacao || '').length + 2);
  marcarCampoExpSalvou(input);
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
  const res = await gravarCampoExpControle(item.id, { quantidade: novaQtd });
  input.disabled = false;

  if (!res.ok) {
    alert('Não foi possível salvar a quantidade: ' + res.mensagem);
    marcarCampoExpNaoSalvou(input, res.mensagem);
    return;
  }
  item.quantidade = novaQtd;
  marcarCampoExpSalvou(input);
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
  const res = await gravarCampoExpControle(item.id, { [campo]: novaData });
  input.disabled = false;

  if (!res.ok) {
    alert('Não foi possível salvar a data: ' + res.mensagem);
    marcarCampoExpNaoSalvou(input, res.mensagem);
    return;
  }
  item[campo] = novaData;
  input.value = formatarDataHoraBR(novaData);
  marcarCampoExpSalvou(input);
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

// Robson, 12/09/2026, mostrando 3 pedidos diferentes no mesmo endereço EXP
// CANT A-01: "precisa que os itens do CANT saia na mesma folha". No CANT um
// endereço só guarda vários pedidos pequenos ao mesmo tempo -- agrupar por
// pedido botaria pedaço do MESMO endereço físico em folhas separadas, e
// quem for lá só precisa de UMA folha, não uma por pedido. Fora do CANT
// continua a regra do Victor (folha = pedido, porque o pallet é o pedido).
// Prefixo (`loc::`/`ped::`) evita que um nº de pedido bata por acaso com um
// texto de localização e misture os dois grupos na mesma chave.
function chaveFolhaExpControle(localizacao, numeroPedido) {
  const loc = String(localizacao == null ? '' : localizacao).trim();
  if (/CANT/i.test(loc)) return 'loc::' + loc;
  return 'ped::' + chavePedidoFolha(numeroPedido);
}

function linhasParaImprimirExpControle() {
  const linhas = linhasImprimiveisExpControle();
  if (!expCtrlSelecionadas.size) return linhas;
  return linhas.filter(l => expCtrlSelecionadas.has(String(l.id)));
}

function linhasExportacaoExpControle() {
  return linhasParaImprimirExpControle().map(l => {
    const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
    return [
      l.localizacao || '', l.codigo_item, desc && desc.descricao ? desc.descricao : '', desc && desc.um ? desc.um : '',
      l.numero_pedido || '', l.quantidade != null ? l.quantidade : null, l.numero_os_op || '', l.lote || '', l.referencia || '',
      rotuloStatusExp(l.status).rotulo,
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

// Reaproveitado por qualquer aba que exporte planilha (Entrada, Auditoria)
// -- só cabeçalho e linhas mudam entre elas.
function exportarCsvGenerico(cabecalho, linhas, nomeBase) {
  // ; como separador (nao vírgula) porque o numero brasileiro usa vírgula
  // decimal -- Excel PT-BR abre certo direto com ;.
  const csv = [cabecalho, ...linhas]
    .map(linha => linha.map(v => `"${String(v != null ? v : '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  baixarArquivo(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), nomeBase + '.csv');
}

function exportarExpControleCsv(nomeBase) {
  exportarCsvGenerico(EXP_EXPORT_CABECALHO, linhasExportacaoExpControle(), nomeBase);
}

// O xlsx.full.min.js tem 861 KB e so esta funcao o usa: e buscado aqui, na
// primeira exportacao da sessao. Ver carregarBiblioteca() no config.js.
async function exportarXlsxGenerico(cabecalho, linhas, nomeAba, nomeBase) {
  await carregarBiblioteca('o Exportar Excel', CDN_XLSX,
                           () => typeof XLSX !== 'undefined');
  const planilha = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, nomeAba);
  XLSX.writeFile(livro, nomeBase + '.xlsx');
}

async function exportarExpControleXlsx(nomeBase) {
  await exportarXlsxGenerico(EXP_EXPORT_CABECALHO, linhasExportacaoExpControle(), 'Controle EXP', nomeBase);
}

// Só do Imprimir (botão "Imprimir", folha pro pallet) -- o Exportar HTML
// tinha o MESMO layout gigante até 11/09/2026, quando o Robson pediu um
// tamanho menor "como planilha" só pro exportado, e depois confirmou "só
// ao exportar": quem imprime cola no pallet e precisa ler de 3 metros;
// quem exporta abre o arquivo na tela pra olhar, e a ficha gigante ali só
// atrapalhava. Ver montarHtmlExpControleTabela() logo abaixo, que é o que
// o Exportar HTML usa agora.
function montarHtmlExpControle(scriptAutoImprimir, qrPorCodigo) {
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
  // o pallet é o pedido -- não o item. EXCETO no CANT, onde a folha é o
  // endereço (ver chaveFolhaExpControle(), 12/09/2026).
  //
  // ⚠️ Agrupar é obrigatório, não é enfeite: a consulta traz as linhas ordenadas
  // por LOCALIZAÇÃO (ver o .order() da carga), então dois itens do mesmo pedido
  // guardados em corredores diferentes chegam longe um do outro. Sem agrupar, o
  // mesmo pedido sairia em duas folhas e uma folha misturaria pedidos.
  const grupos = new Map();
  linhasExportacaoExpControle().forEach(linha => {
    const chave = chaveFolhaExpControle(linha[0], linha[4]);   // [0] = Localização, [4] = Nº Pedido
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(linha);
  });
  // Ordem de aparição (o Map preserva), com o grupo sem pedido no fim: ele não
  // é um pedido, e deixá-lo no meio empurraria pedido de verdade para trás.
  const ordemGrupos = [...grupos.keys()]
    .sort((a, b) => (a === 'ped::(sem pedido)' ? 1 : 0) - (b === 'ped::(sem pedido)' ? 1 : 0));

  const gruposHtml = ordemGrupos.map(chave => {
    const rotuloGrupo = chave.startsWith('loc::')
      ? escapeHtml(chave.slice(5))
      : (chave === 'ped::(sem pedido)' ? 'Sem nº de pedido' : 'Pedido ' + escapeHtml(chave.slice(5)));
    return `<section class="grupo">
      <div class="grupo-topo">
        <span class="grupo-pedido">${rotuloGrupo}</span>
        <span class="grupo-itens">${grupos.get(chave).length} item(ns)</span>
      </div>
      <div class="grupo-quem">${escapeHtml(rotuloUnidade(unidadeAtual))} &middot; Impresso por ${escapeHtml(nomeUsuarioAtual || emailUsuarioAtual || '—')} &mdash; ${impressoEm}</div>
      ${grupos.get(chave).map(
        ([localizacao, item, descricao, um, pedido, qtd, op, lote, referencia, status, entrada, saida]) => {
          // Robson, 11/09/2026: "na etiqueta desses itens que tem numero de
          // OP, lote e referencia preciso que saia na folha tambem em um
          // tamanho visivel" -- até aqui os três só apareciam na linha
          // miúda (3.5mm, "só lida de perto na conferência"). Item de
          // produção usa OP/Lote/Referência pra rastrear o lote de verdade,
          // e isso não pode depender de chegar bem perto da folha colada no
          // pallet pra enxergar. Só aparece quando pelo menos um dos três
          // existe -- item comum de almoxarifado não tem nenhum, e a linha
          // vazia seria um espaço em branco sem sentido na ficha.
          const producaoPartes = [
            op ? `OP ${escapeHtml(op)}` : '',
            lote ? `Lote ${escapeHtml(lote)}` : '',
            referencia ? `Ref. ${escapeHtml(referencia)}` : ''
          ].filter(Boolean);
          const producaoHtml = producaoPartes.length
            ? `<div class="ficha-producao">${producaoPartes.join(' &middot; ')}</div>` : '';
          return `<article class="ficha">
          <div class="ficha-topo">
            <span class="ficha-item">${escapeHtml(item)}</span>
            <span class="ficha-qtd">${escapeHtml(qtd != null ? qtd : '')}${um ? ` <small>${escapeHtml(um)}</small>` : ''}</span>
          </div>
          <div class="ficha-desc">${escapeHtml(descricao || '')}</div>
          ${producaoHtml}
          <div class="ficha-detalhes">${detalhe('Local', localizacao)}${detalhe('Pedido', pedido)}${detalhe('Status', status)}${detalhe('Entrada', entrada)}${detalhe('Saída', saida)}</div>
          ${(qrPorCodigo && qrPorCodigo.get(normalizaCodigoItem(item)))
            ? `<img class="ficha-qr" src="${qrPorCodigo.get(normalizaCodigoItem(item))}" alt="">` : ''}
        </article>`;
        }).join('')}
    </section>`;
  }).join('');
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
  /* color-scheme: light + preto no branco explicitos. Esta folha abre numa aba
     do navegador de quem talvez esteja com o portal no tema ESCURO, e sem isto
     o navegador escurece a folha por conta propria: ela aparece preto no preto
     na previa, e a pessoa so descobre se olhar antes de mandar imprimir. Nao e
     o @media print do portal (secao 16) -- esta folha e outro documento, sem os
     tokens de tema. Mesma correcao ja feita na etiqueta de reserva. */
  :root { color-scheme: light; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 8mm; box-sizing: border-box; background: #fff; color: #000; }
  h2 { font-size: 5mm; margin: 0 0 1mm; }
  .impresso-por { font-size: 3.5mm; color: #333; margin: 0 0 4mm; }
  .ficha {
    border: 0.6mm solid #000; border-radius: 2mm; padding: 3mm 4mm; margin-bottom: 3mm;
    page-break-inside: avoid; break-inside: avoid;
    /* position: relative por causa do QR do canto -- ver .ficha-qr. */
    position: relative; min-height: 26mm;
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
     quanto tem se lê chegando perto. */
  .ficha-qtd { font-size: 15mm; font-weight: 800; line-height: 1; white-space: nowrap; margin-left: auto; }
  .ficha-qtd small { font-size: 0.45em; font-weight: 700; }
  .ficha-desc { font-size: 9mm; font-weight: 700; line-height: 1.15; margin-top: 2mm; }
  /* OP/Lote/Referência -- Robson, 11/09/2026: "preciso que saia na folha
     tambem em um tamanho visivel". Maior que a linha miúda de detalhes
     (7mm ≈ dá pra ler a 1,4m, não precisa colar o olho na folha), menor
     que a descrição: item de produção usa isso pra rastrear o lote de
     verdade, mas não é o que identifica QUAL material é (isso continua
     sendo o código, em 21mm). */
  .ficha-producao {
    font-size: 7mm; font-weight: 800; line-height: 1.2; margin-top: 2mm;
    display: flex; flex-wrap: wrap; gap: 0.5mm 5mm;
  }
  .ficha-detalhes {
    font-size: 3.5mm; margin-top: 2.5mm; color: #222;
    display: flex; flex-wrap: wrap; gap: 1mm 6mm;
  }
  .ficha-detalhes b { color: #555; font-weight: 700; }
  /* ⚠️ O QR é POSICIONADO NO CANTO, fora do fluxo, e a única coisa que cede
     espaço pra ele é a linha miúda de detalhes (3.5mm, que já quebra sozinha).
     Ele NÃO entra na linha .ficha-topo: aquela linha é medida -- item de 8 dígitos
     mais quantidade de 6 já dá 183mm contra os 178mm úteis do A4, e é o
     flex-wrap que impede o navegador de quebrar o CÓDIGO DO ITEM no meio.
     Um QR ali empurraria a conta e tiraria os 21mm que valem os 3 metros de
     leitura -- justamente o que a ficha existe para garantir.
     16mm: a uns 10cm do celular, sobra folga. */
  .ficha-qr { position: absolute; right: 4mm; bottom: 3mm; width: 16mm; height: 16mm; }
  .ficha-detalhes { padding-right: 19mm; }
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

// Planilha em HTML genérica -- reaproveitada por qualquer aba que exporte
// tabela (Entrada, Auditoria): só título, cabeçalho e linhas mudam. `titulo`
// e `subtitulo` já chegam prontos pra ir direto no HTML (o subtítulo em
// especial já vem com o que precisar de escapeHtml feito por quem chamou,
// porque mistura texto fixo com `—` e afins).
function montarHtmlTabelaGenerica({ titulo, cabecalho, linhas, subtitulo, imprimir }) {
  const impressoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const linhasHtml = linhas.map(linha => `<tr>${
    linha.map(v => `<td>${escapeHtml(v != null && v !== '' ? v : '—')}</td>`).join('')
  }</tr>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escapeHtml(titulo)}</title>
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
<h2>${escapeHtml(titulo)}${subtitulo || ''}</h2>
<div class="impresso-por">Impresso por ${escapeHtml(nomeUsuarioAtual || emailUsuarioAtual || '—')} &mdash; ${impressoEm}</div>
<table>
  <thead><tr>${cabecalho.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
  <tbody>${linhasHtml}</tbody>
</table>
${imprimir ? '<script>window.onload = () => window.print();<' + '/script>' : ''}
</body></html>`;
}

// Uma linha por item, mesmas colunas do CSV/Excel (EXP_EXPORT_CABECALHO) --
// pra abrir e olhar como planilha, sem rolar página por página de ficha
// gigante (que é o que montarHtmlExpControle() faz, e continua fazendo,
// só que agora exclusivo do Imprimir).
function montarHtmlExpControleTabela() {
  const busca = document.getElementById('expCtrlBusca').value.trim();
  const marcados = linhasFiltradasExpControle()
    .filter(l => expCtrlSelecionadas.has(String(l.id))).length;
  const subtitulo = (busca ? ` — busca: "${escapeHtml(busca)}"` : '')
    + (marcados ? ` — ${marcados} item(ns) escolhido(s) na tela` : '');

  return montarHtmlTabelaGenerica({
    titulo: `Controle EXP Acessórios — ${rotuloUnidade(unidadeAtual)} — ${new Date().toLocaleDateString('pt-BR')}`,
    cabecalho: EXP_EXPORT_CABECALHO,
    linhas: linhasExportacaoExpControle(),
    subtitulo
  });
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

  // Sai uma folha por PEDIDO (ou por endereço, no CANT -- ver
  // chaveFolhaExpControle()), então o que conta são os grupos distintos, não
  // as linhas: marcar 30 itens de um pedido só é UMA folha, e avisar "30 folhas"
  // ali seria mentira que treina a pessoa a ignorar o aviso.
  const folhas = new Set(linhas.map(l => chaveFolhaExpControle(l.localizacao, l.numero_pedido))).size;
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

  // Os QR de todos os itens da folha, de uma vez e antes de abrir a aba (ver
  // qrDataURLs em js/scanner.js): a folha sai com o desenho embutido, sem
  // depender de rede na hora de imprimir. Falhando, a folha sai igual, sem QR.
  // ⚠️ A ABA É ABERTA ANTES DO `await`, e a ordem é o ponto: `window.open`
  // exige ativação transitória do usuário, que expira poucos segundos depois
  // do clique. Gerando o QR primeiro, um CDN lento faria o navegador BLOQUEAR
  // a aba -- e a pessoa veria só o aviso de pop-up, sem folha nenhuma. Assim a
  // aba nasce em branco por alguns milissegundos e recebe a folha em seguida.
  const aba = window.open('', '_blank');
  if (!aba) { alert('O navegador bloqueou a nova aba. Libere pop-ups pra este site e tente de novo.'); return; }
  const qrPorCodigo = await qrDataURLs(linhas.map(l => l.codigo_item));
  aba.document.write(montarHtmlExpControle(true, qrPorCodigo));
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

// Robson, 11/09/2026: "acima do conferente colocar aba de pesquisa que
// busque por localizaçao ou numero do pedido" -- estado próprio (não
// reaproveita filtrosConf, que é da aba Conferir, outro assunto).
let buscaSaida = '';
document.getElementById('confSaidaBusca').addEventListener('input', (e) => {
  buscaSaida = e.target.value;
  renderConferencia();
});

// Tira espaço, hífen e afins -- Robson digitou "EXP-A-02" pra achar "EXP
// A-02" e não achou nada, porque a busca comparava caractere a caractere.
// O endereço físico não tem uma grafia única (com espaço, com hífen, sem
// nada), então a busca ignora esses separadores dos dois lados.
function normalizaBuscaLocal(texto) {
  return String(texto || '').toLowerCase().replace(/[\s\-_.]+/g, '');
}

function renderConferencia() {
  // Robson, 11/09/2026: "quero que localize só o que esta no exp no
  // fisico, o que ja carregou nao é para aparecer, pois ja existe a mesma
  // aba de historico" -- confirma o recorte que já existia (`status ===
  // 'retirado'` sai da lista): esta busca é só do que ainda está
  // fisicamente na expedição; o que já carregou tem a própria busca em
  // "Histórico de retiradas", mais abaixo.
  const busca = normalizaBuscaLocal(buscaSaida);
  const pendentes = linhasDoSetorAtual().filter(l => {
    // Item já na doca não está mais no endereço -- não é mais "ainda por
    // retirar" (ver aindaNoEndereco(), sql/fase36-doca.sql).
    if (!aindaNoEndereco(l.status)) return false;
    if (!busca) return true;
    return normalizaBuscaLocal(l.localizacao).includes(busca)
        || normalizaBuscaLocal(l.numero_pedido).includes(busca);
  });
  const corpo = document.getElementById('confBody');
  const vazio = document.getElementById('confVazio');

  vazio.style.display = pendentes.length ? 'none' : 'block';
  if (!pendentes.length) {
    corpo.innerHTML = '';
    vazio.textContent = busca
      ? 'Nenhum item pendente bate com a busca.'
      : 'Nenhum item pendente de retirada.';
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
          <button class="btn btn-primary conf-retirar-tudo" data-local="${escapeHtml(local)}" style="margin-left:auto;"
                  title="Todo mundo saiu deste endereço pra área de carregamento">
            🚚 Tudo pra DOCA
          </button>
        </div>
        <div class="scroll-area">
          <table>
            <thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Nº Pedido</th><th>Ação</th></tr></thead>
            <tbody>
              ${itens.map(l => {
                const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
                return `
                <tr>
                  <td class="item">${escapeHtml(l.codigo_item)}</td>
                  <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
                  <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
                  <td class="loc">${escapeHtml(l.numero_pedido || '—')}${seloDocaDoPedido(l.numero_pedido)}</td>
                  <td class="col-acoes">
                    <button class="btn conf-retirar-item" data-id="${escapeHtml(l.id)}"
                            title="Saiu deste endereço pra área de carregamento">🚚 DOCA</button>
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

  // Robson, 11/09/2026: "quero uma aba só de DOCA, aí quando eu marcar na
  // aba de saída da localização automaticamente o material é transferido
  // pra lá" -- vai pra 'na_doca', não direto pro 'retirado' (fim de linha
  // fica pro botão ✓ Carregou, na aba DOCA). Ver sql/fase36-doca.sql.
  // Robson, 14/09/2026, depois de ver o seletor de doca nesta tela: "a
  // parte em qual doca so na aba que coloquei a flecha, me importa mais
  // a doca la de fora do carregamento" -- escolher a doca saiu daqui (e
  // da Entrada) e virou um seletor por PEDIDO dentro da própria aba DOCA
  // (ver renderDoca()), pra não travar o clique rápido de quem está
  // esvaziando o endereço.
  const btnItem = e.target.closest('.conf-retirar-item');
  if (btnItem) {
    btnItem.disabled = true;
    const ok = await marcarSaidaExpControle(btnItem.dataset.id, nome, 'na_doca');
    if (ok) await carregarProgramacao();
    else btnItem.disabled = false;
    return;
  }

  const btnLocal = e.target.closest('.conf-retirar-tudo');
  if (btnLocal) {
    const local = btnLocal.dataset.local;
    const itens = linhasDoSetorAtual().filter(l => (l.localizacao || '(sem localização)') === local && aindaNoEndereco(l.status));
    if (!confirm(`Confirmar que ${itens.length} item(ns) de "${local}" saíram pra DOCA?`)) return;
    btnLocal.disabled = true;
    for (const item of itens) await marcarSaidaExpControle(item.id, nome, 'na_doca');
    await carregarProgramacao();
  }
});

// "Se um dia perguntarem quando carregou os materiais, pesquiso por número
// do pedido" -- pedido explicito do Robson. Historico nunca apaga o
// registro, so o marca como retirado; a busca cobre pedido, item e local.
//
// Reaproveitada nas DUAS abas que mostram histórico de retiradas -- Saída/
// Conferência (original) e DOCA (12/09/2026: "assim que der saida da doca
// o itens ficam arquivados em baixo, como fizemos na Aba saida/conferencia")
// -- mesma lista (`status === 'retirado'`), só muda pra onde ela desenha.
function renderHistoricoRetiradasGenerica(buscaInputId, corpoId, vazioId) {
  const busca = document.getElementById(buscaInputId).value.trim().toLowerCase();
  const corpo = document.getElementById(corpoId);
  const vazio = document.getElementById(vazioId);

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
    const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
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

function renderHistoricoRetiradas() {
  renderHistoricoRetiradasGenerica('confHistBusca', 'confHistBody', 'confHistVazio');
}

function renderHistoricoRetiradasDoca() {
  renderHistoricoRetiradasGenerica('docaHistBusca', 'docaHistBody', 'docaHistVazio');
}

document.getElementById('confHistBusca').addEventListener('input', () => renderHistoricoRetiradas());
document.getElementById('docaHistBusca').addEventListener('input', () => renderHistoricoRetiradasDoca());

// Mesmo handler de "Desfazer" nas duas abas -- reseta sempre pra
// "na_expedicao" (não interessa se a retirada tinha passado pela DOCA ou
// não), e carregarProgramacao() já atualiza as duas listas de histórico.
async function handleHistDesfazerClick(e) {
  const btn = e.target.closest('.hist-desfazer');
  if (!btn) return;
  if (!confirm('Desfazer esta retirada? O item volta para "na expedição" no Controle EXP.')) return;
  const ok = await marcarSaidaExpControle(btn.dataset.id, null, 'na_expedicao');
  if (ok) await carregarProgramacao();
}
document.getElementById('confHistBody').addEventListener('click', handleHistDesfazerClick);
document.getElementById('docaHistBody').addEventListener('click', handleHistDesfazerClick);

// ---- Relatório de saídas do dia pro PCP -------------------------------------
// "isso que saiu pro carregamento foi realmente faturado?" (pedido do
// Robson). Mesmo padrão de mailto da Requisição ALM: o portal não manda
// e-mail sozinho (não existe servidor aqui), só abre pronto no Outlook —
// a pessoa confere e clica em enviar. O e-mail do PCP fica em
// config_unidade (aba Configurações), NÃO fixo no código: cada unidade
// tem o próprio PCP.
// Robson, 12/09/2026: "coloque a aba de relatorio de saida nessa aba doca" --
// mesmo relatório, também na DOCA (é lá que o "Carregou" de verdade acontece
// desde a etapa DOCA), sem duplicar a lógica: os dois campos de data partem
// preenchidos com hoje.
(function iniciarDataRelatorioPcp() {
  const hoje = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD, formato do <input type="date">
  document.getElementById('relPcpData').value = hoje;
  document.getElementById('relPcpDocaData').value = hoje;
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
      const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
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

// Reaproveitado pelos dois botões "Gerar e enviar pro PCP" (Saída/Conferência
// e DOCA, 12/09/2026) -- mesma lógica, só muda de onde lê a data e onde
// escreve a mensagem.
async function gerarRelatorioPcpClick(dataInputId, msgId, botaoId) {
  const msg = document.getElementById(msgId);
  const btn = document.getElementById(botaoId);
  const dataEscolhida = document.getElementById(dataInputId).value;

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
}

document.getElementById('relPcpGerarBtn').addEventListener('click',
  () => gerarRelatorioPcpClick('relPcpData', 'relPcpMsg', 'relPcpGerarBtn'));
document.getElementById('relPcpDocaGerarBtn').addEventListener('click',
  () => gerarRelatorioPcpClick('relPcpDocaData', 'relPcpDocaMsg', 'relPcpDocaGerarBtn'));

// ---- Aba DOCA: item que já saiu do endereço, esperando o caminhão ------
// Robson, 11/09/2026: "quero uma aba só de DOCA, aí quando eu marcar na
// aba de saída da localização automaticamente o material é transferido
// pra lá". Confirmado como etapa INTERMEDIÁRIA (não é fim de linha):
// endereço -> DOCA (aqui) -> Carregado (aí sim vira histórico, em
// "Histórico de retiradas", mais acima). Ver sql/fase36-doca.sql e
// aindaNoEndereco().
//
// Agrupado por Nº Pedido, igual à folha impressa (montarHtmlExpControle())
// -- é assim que o carregamento de verdade acontece: por pedido, não por
// endereço (o endereço de origem já não importa mais nesta etapa, só fica
// de referência na coluna "Veio de").
let buscaDoca = '';

// Conferente da DOCA -- Robson, 11/09/2026: "de lá na doca coloca o
// conferente que retirou". Pessoa diferente de quem LEVOU o item até a
// doca (isso é `na_doca_por`, já capturado no clique do botão DOCA lá na
// Saída/Conferência ou na Entrada) -- aqui é quem confirma o carregamento
// de verdade, na ponta final. Mesmo padrão de `nomeConferenteAtual()`
// (Saída/Conferência), campo e chave de localStorage próprios.
const CHAVE_CONFERENTE_DOCA_LS = 'docaNomeConferente';

function nomeConferenteDoca() {
  return document.getElementById('docaConferenteInput').value.trim();
}

document.getElementById('docaConferenteInput').addEventListener('input', (e) => {
  try { localStorage.setItem(CHAVE_CONFERENTE_DOCA_LS, e.target.value); } catch (err) { /* localStorage bloqueado -- so nao lembra, nao quebra a tela */ }
});
(function restaurarNomeConferenteDoca() {
  try {
    const salvo = localStorage.getItem(CHAVE_CONFERENTE_DOCA_LS);
    if (salvo) document.getElementById('docaConferenteInput').value = salvo;
  } catch (err) { /* idem */ }
})();

// Nome da doca física (Doca 1/2/3) a partir do id gravado no item --
// mesma lista de docasParaEscolha que alimenta o select do botão 🚚 DOCA.
function nomeDaDocaFisica(docaId) {
  if (!docaId) return '—';
  return (docasParaEscolha.find(d => d.id === docaId) || {}).nome || '—';
}

function linhasNaDoca() {
  const busca = normalizaBuscaLocal(buscaDoca);
  return linhasDoSetorAtual().filter(l => {
    if (l.status !== 'na_doca') return false;
    if (!busca) return true;
    return normalizaBuscaLocal(l.numero_pedido).includes(busca)
        || normalizaBuscaLocal(l.codigo_item).includes(busca)
        || normalizaBuscaLocal(l.localizacao).includes(busca);
  });
}

function renderDoca() {
  const itens = linhasNaDoca();
  const corpo = document.getElementById('docaBody');
  const vazio = document.getElementById('docaVazio');

  vazio.style.display = itens.length ? 'none' : 'block';
  if (!itens.length) {
    corpo.innerHTML = '';
    vazio.textContent = buscaDoca.trim()
      ? 'Nenhum item na doca bate com a busca.'
      : 'Nada na doca no momento.';
    // Mesmo sem nada esperando na doca agora, o histórico de quem já
    // carregou continua tendo o que mostrar -- não pode sumir junto.
    renderHistoricoRetiradasDoca();
    return;
  }

  const porPedido = new Map();
  itens.forEach(l => {
    const chave = chavePedidoFolha(l.numero_pedido);
    if (!porPedido.has(chave)) porPedido.set(chave, []);
    porPedido.get(chave).push(l);
  });
  // Sem pedido no fim -- mesmo critério da folha impressa: não é um pedido
  // de verdade, deixá-lo no meio empurraria pedido de verdade pra trás.
  const grupos = [...porPedido.keys()]
    .sort((a, b) => (a === '(sem pedido)' ? 1 : 0) - (b === '(sem pedido)' ? 1 : 0));

  corpo.innerHTML = grupos.map(chave => {
    const linhas = porPedido.get(chave);
    return `
    <div style="border:1px solid var(--border); border-radius:10px; margin-top:12px; overflow:hidden;">
      <div class="cfg-barra">
        <span class="loc-chip">${chave === '(sem pedido)' ? 'Sem nº de pedido' : 'Pedido ' + escapeHtml(chave)}</span>
        <span style="font-size:12px; color:var(--muted);">${linhas.length} item(ns)</span>
        <!-- Robson, 14/09/2026: "a parte em qual doca so na aba que
             coloquei a flecha, me importa mais a doca la de fora do
             carregamento" -- um seletor por PEDIDO aqui na aba DOCA
             (não mais item a item na Entrada/Saída-Conferência): marca
             de uma vez a doca física de todo o pedido, sem travar o
             clique rápido de quem esvazia o endereço. -->
        <select class="doca-grupo-select" data-pedido="${escapeHtml(chave)}" style="margin-left:auto;
                padding:5px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;">
          ${opcoesDocaFisicaHtml(docaComumDoGrupo(linhas))}
        </select>
        <button class="btn btn-primary doca-tudo-carregou" data-pedido="${escapeHtml(chave)}">
          ✓ Todo pedido carregou
        </button>
      </div>
      <div class="scroll-area">
        <table>
          <thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Veio de</th><th>Doca</th><th>Levou pra doca</th><th>Ação</th></tr></thead>
          <tbody>
            ${linhas.map(l => {
              const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
              // Robson, 11/09/2026: "coloca os dados de quem levou pra lá,
              // no caso está sendo a Jessica" -- visível na própria célula,
              // não escondido num tooltip (era só no `title` antes).
              const desde = l.na_doca_em ? formatarDataHoraBR(l.na_doca_em) : '—';
              const quemLevou = l.na_doca_por ? escapeHtml(l.na_doca_por) : '—';
              return `
              <tr>
                <td class="item">${escapeHtml(l.codigo_item)}</td>
                <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
                <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
                <td class="loc">${escapeHtml(l.localizacao || '—')}</td>
                <td class="loc"><span class="loc-chip">${escapeHtml(nomeDaDocaFisica(l.doca_id))}</span></td>
                <td class="loc">${quemLevou}<div style="font-size:11px; color:var(--muted);">${escapeHtml(desde)}</div></td>
                <td class="col-acoes">
                  <button class="btn doca-carregou" data-id="${escapeHtml(l.id)}">✓ Carregou</button>
                  <button class="acao-btn doca-desfazer" data-id="${escapeHtml(l.id)}" title="Desfazer -- volta pro endereço de origem">↺</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  renderHistoricoRetiradasDoca();
}

// Marca a doca física de TODO o pedido de uma vez (um update só, não um
// por item) -- não é transição de status, é só o dado "onde está
// fisicamente parado", então não passa por marcarSaidaExpControle().
document.getElementById('docaBody').addEventListener('change', async (e) => {
  const select = e.target.closest('.doca-grupo-select');
  if (!select) return;
  const docaId = select.value;
  if (!docaId) return; // voltou pro "Qual doca?" -- nada a gravar

  const pedido = select.dataset.pedido;
  const itens = linhasNaDoca().filter(l => chavePedidoFolha(l.numero_pedido) === pedido);
  if (!itens.length) return;

  select.disabled = true;
  const { error } = await sb.from('exp_controle_itens')
    .update({ doca_id: docaId }).in('id', itens.map(l => l.id));
  select.disabled = false;

  if (error) { alert('Não foi possível marcar a doca: ' + error.message); return; }
  await carregarProgramacao();
});

document.getElementById('docaBusca').addEventListener('input', (e) => {
  buscaDoca = e.target.value;
  renderDoca();
});

document.getElementById('docaBody').addEventListener('click', async (e) => {
  const btnCarregou = e.target.closest('.doca-carregou');
  const btnDesfazer = e.target.closest('.doca-desfazer');
  const btnTudo = e.target.closest('.doca-tudo-carregou');

  // Robson, 11/09/2026: "de lá na doca coloca o conferente que retirou" --
  // mesma trava da Saída/Conferência (nomeConferenteAtual()): sem nome,
  // nem tenta gravar. Só vale pra Carregou/Tudo carregou -- Desfazer não é
  // uma retirada de verdade, é "cancela o que eu marquei".
  if (btnCarregou || btnTudo) {
    if (!nomeConferenteDoca()) { alert('Informe o conferente da doca antes de confirmar o carregamento.'); return; }
  }

  if (btnCarregou) {
    btnCarregou.disabled = true;
    // 'retirado' aqui é o default de marcarSaidaExpControle() (mesmo botão
    // que sempre existiu no Histórico) -- é o passo FINAL, fim de linha.
    const ok = await marcarSaidaExpControle(btnCarregou.dataset.id, nomeConferenteDoca(), 'retirado');
    if (ok) await carregarProgramacao();
    else btnCarregou.disabled = false;
    renderDoca();
    return;
  }

  if (btnDesfazer) {
    if (!confirm('Desfazer? O item volta pro endereço de origem, como se não tivesse ido pra doca.')) return;
    btnDesfazer.disabled = true;
    const ok = await marcarSaidaExpControle(btnDesfazer.dataset.id, null, 'na_expedicao');
    if (ok) await carregarProgramacao();
    else btnDesfazer.disabled = false;
    renderDoca();
    return;
  }

  if (btnTudo) {
    const pedido = btnTudo.dataset.pedido;
    const itens = linhasNaDoca().filter(l => chavePedidoFolha(l.numero_pedido) === pedido);
    if (!itens.length) return;
    if (!confirm(`Confirmar que ${itens.length} item(ns) do pedido "${pedido}" carregaram de verdade?`)) return;

    btnTudo.disabled = true;
    for (const item of itens) await marcarSaidaExpControle(item.id, nomeConferenteDoca(), 'retirado');
    await carregarProgramacao();
    renderDoca();
  }
});

// ---- Aba Parados: pedido esquecido na expedição -------------------------
// Robson, 14/09/2026: "quero também uma aba de pedidos que estao a mais de
// 05 dias parados no EXP, dai monte um esquema para um aviso ao PCP, faz de
// uma forma profissional". "Parado" é bem mais amplo que "aindaNoEndereco":
// um item na_doca também não carregou ainda (só mudou de endereço dentro do
// prédio), então continua contando aqui -- só 'retirado' de verdade resolve.
const LIMITE_DIAS_PARADO_EXP = 5;

// Dias INTEIROS desde a entrada, arredondado pra baixo -- "5 dias parado"
// só depois de 5 dias completos, não no mesmo dia por causa da hora exata.
function diasParadoExp(criadoEm) {
  if (!criadoEm) return 0;
  const ms = Date.now() - new Date(criadoEm).getTime();
  return Math.floor(ms / 86400000);
}

function linhasParadasExpControle() {
  return linhasDoSetorAtual().filter(l =>
    l.status !== 'retirado' && diasParadoExp(l.criado_em) > LIMITE_DIAS_PARADO_EXP);
}

function renderParadosExp() {
  const paradas = linhasParadasExpControle();
  const corpo = document.getElementById('paradosBody');
  const vazio = document.getElementById('paradosVazio');

  vazio.style.display = paradas.length ? 'none' : 'block';
  if (!paradas.length) { corpo.innerHTML = ''; return; }

  const porPedido = new Map();
  paradas.forEach(l => {
    const chave = chavePedidoFolha(l.numero_pedido);
    if (!porPedido.has(chave)) porPedido.set(chave, []);
    porPedido.get(chave).push(l);
  });

  // Pedido mais velho primeiro -- é o que precisa de resposta há mais tempo.
  // Dentro do grupo, o item mais velho é quem decide "há quantos dias esse
  // PEDIDO está parado" (o pedido só está resolvido quando o último item sair).
  const gruposOrdenados = [...porPedido.entries()]
    .map(([chave, itens]) => [chave, itens, Math.max(...itens.map(l => diasParadoExp(l.criado_em)))])
    .sort((a, b) => b[2] - a[2]);

  corpo.innerHTML = gruposOrdenados.map(([chave, itens, diasMax]) => {
    const obs = paradosObsMap.get(chave) || { observacao: '' };
    return `
    <div style="border:1px solid var(--erro-borda); border-radius:10px; margin-top:12px; overflow:hidden;">
      <div class="cfg-barra" style="background:var(--erro-fundo);">
        <span class="loc-chip">${chave === '(sem pedido)' ? 'Sem nº de pedido' : 'Pedido ' + escapeHtml(chave)}</span>
        <span style="font-weight:700; color:var(--erro-texto);">⏰ ${diasMax} dia(s) parado</span>
        <span style="font-size:12px; color:var(--muted); margin-left:auto;">${itens.length} item(ns)</span>
        <button class="acao-btn parado-excluir" data-pedido="${escapeHtml(chave)}" data-ids="${escapeHtml(itens.map(l => l.id).join(','))}"
                title="Pedido cancelado, material voltou pro almoxarifado -- exclui daqui">🗑</button>
      </div>
      <div class="scroll-area">
        <table>
          <thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Localização</th><th>Status</th><th>Entrada em</th><th>Dias parado</th></tr></thead>
          <tbody>
            ${itens.map(l => {
              const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
              const dias = diasParadoExp(l.criado_em);
              return `
              <tr>
                <td class="item">${escapeHtml(l.codigo_item)}</td>
                <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
                <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
                <td class="loc"><span class="loc-chip">${escapeHtml(l.localizacao || '—')}</span></td>
                <td>${rotuloStatusExp(l.status).rotulo}</td>
                <td class="loc">${formatarDataHoraBR(l.criado_em)}</td>
                <td class="num" style="font-weight:700; color:var(--erro-texto);">${dias}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:8px 16px; border-top:1px solid var(--border);">
        <input type="text" class="parado-obs-input" data-pedido="${escapeHtml(chave)}"
               value="${escapeHtml(obs.observacao || '')}" placeholder="Observação deste pedido (ex.: aguardando confirmação do PCP)..."
               style="width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:12.5px;">
      </div>
    </div>`;
  }).join('');
}

// 🗑 -- "alguns pedisos sao cancelados e eu volto para o almoxarifado":
// exclui de vez os itens deste pedido em exp_controle_itens (o material já
// não está mais na expedição de verdade) e a observação que tinha sido
// anotada pra ele -- não sobra referência solta a um pedido que a pessoa
// disse que não existe mais nesta lista.
document.getElementById('paradosBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.parado-excluir');
  if (!btn) return;
  const pedido = btn.dataset.pedido;
  const ids = btn.dataset.ids.split(',').filter(Boolean);
  const rotuloPedido = pedido === '(sem pedido)' ? 'sem nº de pedido' : 'pedido ' + pedido;
  if (!confirm(`Excluir os ${ids.length} item(ns) do ${rotuloPedido} do Controle EXP? Use quando o pedido foi cancelado e o material voltou pro almoxarifado. Não tem como desfazer.`)) return;

  btn.disabled = true;
  const { error } = await sb.from('exp_controle_itens').delete().in('id', ids);
  if (error) { alert('Não foi possível excluir: ' + error.message); btn.disabled = false; return; }

  if (pedido !== '(sem pedido)') {
    await sb.from('exp_pedido_parado_obs').delete().eq('unidade', unidadeAtual).eq('numero_pedido', pedido);
    paradosObsMap.delete(pedido);
  }
  await carregarProgramacao();
});

// Observação por pedido -- salva ao sair do campo, mesmo padrão da
// Localização do Controle EXP e da Observação da Análise de Compras.
document.getElementById('paradosBody').addEventListener('focusout', async (e) => {
  const input = e.target.closest('.parado-obs-input');
  if (!input) return;
  const pedido = input.dataset.pedido;
  const novo = input.value.trim();
  const atual = (paradosObsMap.get(pedido) || {}).observacao || '';
  if (novo === atual) return; // nada mudou

  input.disabled = true;
  const { error } = await sb.from('exp_pedido_parado_obs').upsert({
    unidade: unidadeAtual, numero_pedido: pedido, observacao: novo || null,
    atualizado_por: nomeUsuarioAtual, atualizado_em: new Date().toISOString()
  }, { onConflict: 'unidade,numero_pedido' });
  input.disabled = false;

  if (error) {
    alert('NÃO SALVOU a observação: ' + error.message
      + (/does not exist|relation/i.test(error.message) ? ' — rode sql/fase56-parados-excluir-observacao.sql no Supabase.' : ''));
    input.value = atual;
    return;
  }
  paradosObsMap.set(pedido, { observacao: novo, atualizado_por: nomeUsuarioAtual, atualizado_em: new Date().toISOString() });
});

// Mesmo padrão de mailto do Relatório pro PCP (não manda e-mail sozinho, só
// abre pronto no Outlook) -- mas em tom formal de aviso, não de relatório
// informativo: aqui é pra alguém agir, não só arquivar.
function montarAvisoParadosPcp(emailPcp) {
  const paradas = linhasParadasExpControle();
  if (!paradas.length) {
    return { ok: false, mensagem: `Nenhum pedido parado há mais de ${LIMITE_DIAS_PARADO_EXP} dias no momento.` };
  }

  const porPedido = new Map();
  paradas.forEach(l => {
    const chave = chavePedidoFolha(l.numero_pedido);
    if (!porPedido.has(chave)) porPedido.set(chave, []);
    porPedido.get(chave).push(l);
  });
  const gruposOrdenados = [...porPedido.entries()]
    .map(([chave, itens]) => [chave, itens, Math.max(...itens.map(l => diasParadoExp(l.criado_em)))])
    .sort((a, b) => b[2] - a[2]);

  const rotuloSetor = setorExpAtual === 'benchmark' ? 'Benchmark' : 'EXP';
  const dataFormatada = new Date().toLocaleDateString('pt-BR');
  const assunto = `[Ação necessária] Pedidos parados há mais de ${LIMITE_DIAS_PARADO_EXP} dias na expedição — `
    + `${rotuloSetor} ${rotuloUnidade(unidadeAtual)} — ${dataFormatada}`;

  const blocosPedidos = gruposOrdenados.map(([chave, itens, diasMax]) => {
    const cabecalho = (chave === '(sem pedido)' ? 'Sem nº de pedido' : `Pedido ${chave}`) + ` — ${diasMax} dia(s) parado`;
    const linhasItens = itens.map(l => {
      const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
      return `    - Item ${l.codigo_item} - ${desc && desc.descricao ? desc.descricao : 'sem descrição'}`
        + `  |  Qtd ${l.quantidade != null ? l.quantidade : '—'}  |  Local ${l.localizacao || '—'}`
        + `  |  ${rotuloStatusExp(l.status).rotulo}  |  Entrada em ${formatarDataHoraBR(l.criado_em)}`;
    });
    return [cabecalho, ...linhasItens].join('\n');
  });

  const corpo = [
    'Prezados,',
    '',
    `Identificamos ${gruposOrdenados.length} pedido(s) parado(s) na expedição do Controle EXP Acessórios `
      + `(${rotuloSetor} — ${rotuloUnidade(unidadeAtual)}) há mais de ${LIMITE_DIAS_PARADO_EXP} dias, `
      + 'sem confirmação de carregamento. Segue o detalhamento para verificação:',
    '',
    ...blocosPedidos.flatMap(b => [b, '']),
    'Solicitamos a gentileza de verificar a situação de faturamento/carregamento desses pedidos e retornar '
      + 'com um posicionamento, para que possamos regularizar o quanto antes.',
    '',
    'Atenciosamente,',
    `${nomeUsuarioAtual || emailUsuarioAtual || '—'} — ${rotuloUnidade(unidadeAtual)}`,
    '--',
    'Aviso gerado pelo Portal de Estoque (Controle EXP Acessórios).'
  ].join('\n');

  const href = 'mailto:' + encodeURIComponent(emailPcp)
             + '?subject=' + encodeURIComponent(assunto)
             + '&body=' + encodeURIComponent(corpo);

  const cortado = href.length > 1900;
  return {
    ok: true,
    href,
    cortado,
    quantidade: gruposOrdenados.length,
    mensagem: cortado
      ? `${gruposOrdenados.length} pedido(s) parado(s). ATENÇÃO: são muitos itens e o e-mail pode sair cortado `
        + '— confira antes de enviar.'
      : `${gruposOrdenados.length} pedido(s) parado(s) encontrado(s). Abrindo o e-mail — confira e clique em enviar.`
  };
}

document.getElementById('avisoParadosGerarBtn').addEventListener('click', async () => {
  const msg = document.getElementById('avisoParadosMsg');
  const btn = document.getElementById('avisoParadosGerarBtn');

  btn.disabled = true;
  msg.textContent = 'Buscando e-mail do PCP...';
  msg.className = 'status-msg';

  const { data: emailPcp, error: erroConfig } = await sb.rpc('email_pcp_da_unidade', { uni: unidadeAtual });

  btn.disabled = false;

  if (erroConfig || !emailPcp) {
    msg.textContent = 'Esta unidade não tem e-mail do PCP cadastrado. Peça pro admin cadastrar em Configurações.';
    msg.className = 'status-msg status-err';
    return;
  }

  const resultado = montarAvisoParadosPcp(emailPcp);
  msg.textContent = resultado.mensagem;
  msg.className = resultado.ok ? (resultado.cortado ? 'status-msg status-err' : 'status-msg status-ok') : 'status-msg status-err';
  if (!resultado.ok) return;

  window.location.href = resultado.href;
});

// ---- Aba Preparar: aviso da expedição pro EXP antes do caminhão chegar ----
// Robson, 15/09/2026: "o encarregado da expedição quando receber a lista
// do pcp, coloca o numero do pedido... abre um aviso para que a gente
// entenda que devemos deixar o material preparado ja". É ANTES do Painel
// de Docas: lá o caminhão já está no pátio; aqui é só a lista do PCP
// avisando o que vai precisar sair, pra dar tempo de separar com calma.
//
// Fluxo simples, confirmado pelo Robson: avisado -> preparado. Sem status
// intermediário, sem "assumir tarefa" -- é uma anotação reversível, mesmo
// espírito de conferir_exp_notas/exp_pedido_faturamento_confirmado.
let avisosPreparoMap = new Map();      // numero_pedido (normalizado) -> registro
let avisoPrepHistVisivel = false;

async function carregarAvisosPreparo() {
  avisosPreparoMap = new Map();
  const { data, error } = await sb.from('exp_pedido_aviso_preparo')
    .select('*').eq('unidade', unidadeAtual);
  if (error) {
    // Silencioso de propósito (mesmo padrão de carregarConferirExpNotas):
    // se o fase45 ainda não rodou, a aba abre vazia em vez de travar o
    // resto do Controle EXP.
    console.warn('Não foi possível carregar os avisos de preparo:', error.message);
    return;
  }
  (data || []).forEach(r => avisosPreparoMap.set(chavePedidoCarregamento(r.numero_pedido), r));
}

// Robson, 15/09/2026: "uma area aonde o encarregado coloque se a
// separaçao é imediata, ou ele colloca o tempo estimado que tem que
// deixar pronto" -- `prazo_em` nulo = imediata. "Urgência" de ordenação:
// imediata e prazo já vencido pesam igual (os dois são "precisa agora"),
// prazo futuro ordena pelo relógio (quem vence primeiro sobe), e dentro do
// mesmo nível o mais antigo avisado vem primeiro -- é quem espera há mais
// tempo.
function urgenciaDoAviso(a) {
  if (!a.prazo_em) return 0;                              // imediata
  if (new Date(a.prazo_em).getTime() <= Date.now()) return 0; // prazo já vencido conta como imediata
  return new Date(a.prazo_em).getTime();                  // prazo futuro: quanto mais cedo, mais urgente
}

function avisosPendentes() {
  return [...avisosPreparoMap.values()].filter(a => a.status === 'pendente')
    .sort((a, b) => {
      const ua = urgenciaDoAviso(a), ub = urgenciaDoAviso(b);
      if (ua !== ub) return ua - ub;
      return new Date(a.avisado_em) - new Date(b.avisado_em);
    });
}

// Selo de urgência do cartão -- "⚡ Imediata" ou "Prazo: até HH:mm", com o
// mesmo vermelho de urgente quando é imediata OU o prazo já passou (as
// duas situações pedem a mesma atenção agora).
function seloUrgenciaAviso(a) {
  const vencido = a.prazo_em && new Date(a.prazo_em).getTime() <= Date.now();
  if (!a.prazo_em || vencido) {
    return `<span class="avisoprep-urgencia avisoprep-urgencia-imediata">⚡ ${vencido ? 'Prazo vencido' : 'Imediata'}</span>`;
  }
  const hora = new Date(a.prazo_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `<span class="avisoprep-urgencia avisoprep-urgencia-prazo">🕒 Até ${escapeHtml(hora)}</span>`;
}

function avisosJaPreparados() {
  return [...avisosPreparoMap.values()].filter(a => a.status === 'preparado')
    .sort((a, b) => new Date(b.preparado_em || 0) - new Date(a.preparado_em || 0));
}

// Itens + localização de um pedido no Controle EXP -- mesma pergunta feita
// pelo preview do Painel de Docas (itensDosPedidosDigitados em
// js/docas.js), aqui reaproveitada com sua própria fonte (linhasDoSetorAtual).
function itensDoPedidoAvisado(numeroPedido) {
  const chave = chavePedidoCarregamento(numeroPedido);
  return linhasDoSetorAtual().filter(l => chavePedidoCarregamento(l.numero_pedido) === chave);
}

function tabelaItensPedidoHtml(numeroPedido) {
  const itens = itensDoPedidoAvisado(numeroPedido);
  if (!itens.length) {
    return `<div style="padding:8px 0; color:var(--muted); font-size:12.5px;">Nenhum item deste pedido no Controle EXP desta unidade.</div>`;
  }
  return `
  <div class="scroll-area">
    <table>
      <thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Localização</th><th>Status</th></tr></thead>
      <tbody>
        ${itens.map(l => {
          const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
          return `
          <tr>
            <td class="item">${escapeHtml(l.codigo_item)}</td>
            <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
            <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
            <td class="loc">${escapeHtml(l.localizacao || '—')}</td>
            <td>${rotuloStatusExp(l.status).rotulo}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderAvisosPreparo() {
  const pendentes = avisosPendentes();
  const corpo = document.getElementById('avisoPrepBody');
  const vazio = document.getElementById('avisoPrepVazio');
  const contagem = document.getElementById('avisoPrepContagem');

  contagem.textContent = pendentes.length ? `${pendentes.length} pedido(s)` : '';
  vazio.style.display = pendentes.length ? 'none' : 'block';

  corpo.innerHTML = pendentes.map(a => `
    <div style="border:1px solid var(--erro-borda); border-radius:10px; margin-top:12px; overflow:hidden;">
      <div class="cfg-barra" style="background:var(--erro-fundo); flex-wrap:wrap;">
        <span class="loc-chip">Pedido ${escapeHtml(a.numero_pedido)}</span>
        ${seloUrgenciaAviso(a)}
        <span style="font-size:12px; color:var(--erro-texto);" title="${a.avisado_por ? escapeHtml(a.avisado_por) : ''}">
          avisado ${escapeHtml(formatarDataHoraBR(a.avisado_em))}${a.avisado_por ? ' por ' + escapeHtml(a.avisado_por) : ''}
        </span>
        <span style="margin-left:auto; display:flex; gap:6px;">
          <button class="btn avisoprep-imprimir" data-pedido="${escapeHtml(a.numero_pedido)}">🖨️ Imprimir</button>
          <button class="btn btn-primary avisoprep-preparado" data-pedido="${escapeHtml(a.numero_pedido)}">✓ Preparado</button>
          <button class="acao-btn avisoprep-cancelar" data-pedido="${escapeHtml(a.numero_pedido)}"
                  title="Não precisa mais separar -- remove o aviso">↺</button>
        </span>
      </div>
      ${tabelaItensPedidoHtml(a.numero_pedido)}
    </div>`).join('');

  renderAvisosPreparoHistorico();
}

function renderAvisosPreparoHistorico() {
  const corpo = document.getElementById('avisoPrepHistBody');
  const preparados = avisosJaPreparados();
  if (!preparados.length) {
    corpo.innerHTML = '<div style="color:var(--muted); font-size:12.5px; padding:6px 0;">Nenhum pedido preparado ainda.</div>';
    return;
  }
  corpo.innerHTML = `
  <div class="scroll-area">
    <table>
      <thead><tr><th>Pedido</th><th>Avisado</th><th>Preparado</th><th>Ação</th></tr></thead>
      <tbody>
        ${preparados.map(a => `
        <tr>
          <td class="item">${escapeHtml(a.numero_pedido)}</td>
          <td class="loc">${a.avisado_por ? escapeHtml(a.avisado_por) + ' — ' : ''}${escapeHtml(formatarDataHoraBR(a.avisado_em))}</td>
          <td class="loc">${a.preparado_por ? escapeHtml(a.preparado_por) + ' — ' : ''}${a.preparado_em ? escapeHtml(formatarDataHoraBR(a.preparado_em)) : '—'}</td>
          <td class="col-acoes">
            <button class="acao-btn avisoprep-reabrir" data-pedido="${escapeHtml(a.numero_pedido)}" title="Avisar de novo -- volta pra pendente">↺</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

document.getElementById('avisoPrepHistToggle').addEventListener('click', (e) => {
  avisoPrepHistVisivel = !avisoPrepHistVisivel;
  document.getElementById('avisoPrepHistBody').style.display = avisoPrepHistVisivel ? 'block' : 'none';
  e.target.textContent = avisoPrepHistVisivel ? 'Esconder' : 'Mostrar';
});

// Campo de horário só aparece quando a urgência escolhida é "Tem prazo" --
// "imediata" não tem hora nenhuma pra preencher.
document.getElementById('avisoPrepUrgencia').addEventListener('change', (e) => {
  document.getElementById('avisoPrepPrazoHora').style.display = e.target.value === 'prazo' ? 'inline-block' : 'none';
});

// Avisa quem cuida do EXP em tempo real -- popup no canto (js/notificacoes.js:
// iniciarAvisoPreparo), mesmo desenho de dispararAlertaCadastro() (js/auth.js):
// broadcast, e não trava o cadastro se falhar (quem está avisando não pode
// ficar preso porque o popup não saiu -- o Painel do Dia continua contando
// de qualquer jeito, é só a notificação ao vivo que se perde).
//
// ⚠️ Canal POR UNIDADE (`alertas-preparo-<unidade>`), diferente do de
// cadastro (que é global): gente de outra fábrica não pode receber popup de
// um pedido que não é dela -- mesma separação que a RLS já aplica em toda
// tabela deste projeto (`minha_unidade()`).
function dispararAlertaPreparo({ pedidos, avisadoPor, urgente }) {
  try {
    sb.channel(`alertas-preparo-${unidadeAtual}`).send({
      type: 'broadcast', event: 'pedido_preparo',
      payload: { pedidos: pedidos || [], unidade: unidadeAtual, avisadoPor: avisadoPor || null, urgente: !!urgente, quando: new Date().toISOString() }
    });
  } catch (e) {
    console.warn('Não foi possível avisar sobre o pedido pra preparar:', e.message);
  }
}

// "coloca o numero do pedido... abre um aviso" -- upsert por (unidade,
// numero_pedido): avisar de novo um pedido já preparado volta ele pra
// pendente (pode ter chegado item novo, ou foi engano marcar preparado).
document.getElementById('avisoPrepAvisarBtn').addEventListener('click', async () => {
  const msg = document.getElementById('avisoPrepMsg');
  const btn = document.getElementById('avisoPrepAvisarBtn');
  const campo = document.getElementById('avisoPrepPedidos');
  const urgencia = document.getElementById('avisoPrepUrgencia').value;
  const campoHora = document.getElementById('avisoPrepPrazoHora');

  const pedidos = campo.value.split(/[,;\s]+/).map(p => p.trim().toUpperCase()).filter(Boolean);
  if (!pedidos.length) {
    msg.textContent = 'Informe o(s) nº de pedido da lista do PCP.';
    msg.className = 'status-msg status-err';
    return;
  }

  // "ele colloca o tempo estimado que tem que deixar pronto" -- combina o
  // horário digitado com a data de HOJE (é sempre um prazo do próprio
  // turno). Sem hora escolhida com "Tem prazo" marcado, avisa em vez de
  // gravar um prazo vazio que pareceria "imediata" sem realmente ser a
  // escolha feita.
  let prazoEm = null;
  if (urgencia === 'prazo') {
    if (!campoHora.value) {
      msg.textContent = 'Informe o horário do prazo, ou troque pra "Imediata".';
      msg.className = 'status-msg status-err';
      return;
    }
    const [h, m] = campoHora.value.split(':').map(Number);
    const alvo = new Date();
    alvo.setHours(h, m, 0, 0);
    prazoEm = alvo.toISOString();
  }

  btn.disabled = true;
  msg.textContent = 'Avisando a equipe...';
  msg.className = 'status-msg';

  const { error } = await sb.from('exp_pedido_aviso_preparo').upsert(
    pedidos.map(numero_pedido => ({
      unidade: unidadeAtual, numero_pedido, status: 'pendente', prazo_em: prazoEm,
      avisado_por: nomeUsuarioAtual, avisado_em: new Date().toISOString(),
      preparado_por: null, preparado_em: null
    })),
    { onConflict: 'unidade,numero_pedido' }
  );

  btn.disabled = false;

  if (error) {
    msg.textContent = 'Não foi possível avisar: ' + error.message
      + (/does not exist|relation|column/i.test(error.message) ? ' — rode sql/fase45-aviso-preparo-pedido.sql e sql/fase46-aviso-preparo-prazo.sql no Supabase.' : '');
    msg.className = 'status-msg status-err';
    return;
  }

  dispararAlertaPreparo({ pedidos, avisadoPor: nomeUsuarioAtual, urgente: urgencia !== 'prazo' });

  const horaEscolhida = campoHora.value;
  campo.value = '';
  campoHora.value = '';
  await carregarAvisosPreparo();
  renderAvisosPreparo();
  msg.textContent = `${pedidos.length} pedido(s) avisado(s)${prazoEm ? ' -- prazo até ' + horaEscolhida : ' (imediata)'} -- vai aparecer no Painel do Dia pra quem cuida do EXP.`;
  msg.className = 'status-msg status-ok';
});

// "um botao de retornar caso nao precise mais separar" -- diferente de
// "✓ Preparado" (que É fato, fica no histórico): cancelar apaga a linha
// de vez, porque o pedido nunca chegou a ser preparado -- não é
// resultado, é "isso não devia estar na lista".
document.getElementById('avisoPrepBody').addEventListener('click', async (e) => {
  const btnPreparado = e.target.closest('.avisoprep-preparado');
  const btnImprimir = e.target.closest('.avisoprep-imprimir');
  // "um botao de retornar caso nao precise mais separar" -- diferente de
  // "✓ Preparado" (que É fato, fica no histórico): cancelar apaga a linha
  // de vez, porque o pedido nunca chegou a ser preparado -- não é
  // resultado, é "isso não devia estar na lista".
  const btnCancelar = e.target.closest('.avisoprep-cancelar');

  if (btnCancelar) {
    const pedido = btnCancelar.dataset.pedido;
    if (!confirm(`Cancelar o aviso do pedido ${pedido}? Ele some da lista -- use quando não precisar mais separar.`)) return;
    btnCancelar.disabled = true;
    const { error } = await sb.from('exp_pedido_aviso_preparo')
      .delete().eq('unidade', unidadeAtual).eq('numero_pedido', pedido);
    if (error) { alert('Não foi possível cancelar: ' + error.message); btnCancelar.disabled = false; return; }
    await carregarAvisosPreparo();
    renderAvisosPreparo();
    return;
  }

  if (btnPreparado) {
    const pedido = btnPreparado.dataset.pedido;
    btnPreparado.disabled = true;
    const { error } = await sb.from('exp_pedido_aviso_preparo').update({
      status: 'preparado', preparado_por: nomeUsuarioAtual, preparado_em: new Date().toISOString()
    }).eq('unidade', unidadeAtual).eq('numero_pedido', pedido);
    if (error) { alert('Não foi possível marcar como preparado: ' + error.message); btnPreparado.disabled = false; return; }

    // Robson, 15/09/2026: "depois daqui de preparado o pedido vai para aba
    // doca" -- confirmado que é automático: quem prepara o material
    // fisicamente já está confirmando que foi levado pra doca, não faz
    // sentido repetir o mesmo clique no 🚚 DOCA da Entrada/Saída-Conferência
    // logo em seguida. Só move quem ainda está `na_expedicao` -- item já
    // na_doca ou retirado não regride nem duplica carimbo.
    const itensParaDoca = itensDoPedidoAvisado(pedido).filter(l => l.status === 'na_expedicao');
    for (const item of itensParaDoca) {
      await marcarSaidaExpControle(item.id, nomeUsuarioAtual, 'na_doca');
    }
    if (itensParaDoca.length) await carregarProgramacao(); // atualiza a aba DOCA com o que acabou de entrar

    await carregarAvisosPreparo();
    renderAvisosPreparo();
    return;
  }

  if (btnImprimir) {
    const pedido = btnImprimir.dataset.pedido;
    const itens = itensDoPedidoAvisado(pedido);
    if (!itens.length) { alert('Nenhum item deste pedido no Controle EXP.'); return; }

    const aba = window.open('', '_blank');
    if (!aba) { alert('O navegador bloqueou a nova aba. Libere pop-ups pra este site e tente de novo.'); return; }
    const linhas = itens.map(l => {
      const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
      return [l.codigo_item, desc && desc.descricao ? desc.descricao : '',
               l.quantidade != null ? l.quantidade : '', l.localizacao || '', rotuloStatusExp(l.status).rotulo];
    });
    const html = montarHtmlTabelaGenerica({
      titulo: `Separar material — Pedido ${pedido} — ${rotuloUnidade(unidadeAtual)}`,
      cabecalho: ['Item', 'Descrição', 'Qtd', 'Localização', 'Status'],
      linhas,
      imprimir: true
    });
    aba.document.write(html);
    aba.document.close();
  }
});

document.getElementById('avisoPrepHistBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.avisoprep-reabrir');
  if (!btn) return;
  const pedido = btn.dataset.pedido;
  btn.disabled = true;
  const { error } = await sb.from('exp_pedido_aviso_preparo').update({
    status: 'pendente', preparado_por: null, preparado_em: null
  }).eq('unidade', unidadeAtual).eq('numero_pedido', pedido);
  if (error) { alert('Não foi possível reabrir: ' + error.message); btn.disabled = false; return; }
  await carregarAvisosPreparo();
  renderAvisosPreparo();
});

// ---- Aba Auditoria: caminhada física pela expedição --------------------
// Robson, 11/09/2026: "vou lá na expedição, vou ver cada endereço pra ver
// se os itens estão lá, monte uma aba aonde eu possa conferir se está
// tudo certo". Perguntado o formato: só confirma PRESENÇA (sem
// quantidade -- isso já é o Modo Contagem do Almoxarifado, fluxo
// diferente) e fica SALVO (retomar se interrompido, e mostrar "conferido
// há quanto tempo"). O próximo passo -- lançar no Datasul -- é manual do
// Robson, fora do portal; esta aba só registra a conferência em si.
//
// Uma linha por linha FÍSICA (exp_controle_itens.id), não por item: o
// mesmo código pode estar em duas localizações ao mesmo tempo (dois
// pedidos diferentes), e cada uma precisa da própria conferência.
let confFisicaMap = new Map(); // exp_controle_id (string) -> { status, conferido_por, conferido_em }
let buscaAuditoria = '';

async function carregarConfFisica() {
  const { data, error } = await sb.from('exp_conferencia_fisica')
    .select('*').eq('unidade', unidadeAtual).eq('setor', setorExpAtual);
  confFisicaMap = new Map();
  if (error) {
    // Silencioso de propósito (mesmo padrão de carregarConferirExpNotas):
    // se o fase35 ainda não rodou, a aba continua funcionando sem os
    // status salvos em vez de travar.
    console.warn('Não foi possível carregar a auditoria física:', error.message);
    return;
  }
  (data || []).forEach(r => confFisicaMap.set(String(r.exp_controle_id), r));
}

function statusAuditoriaDoItem(id) {
  return confFisicaMap.get(String(id)) || null;
}

// Extraído do render pra ser reaproveitado também pela exportação --
// exportar tem de respeitar a mesma busca que está filtrando a tela
// (mesmo padrão do Entrada: "Exportar/Imprimir respeitam a busca").
function linhasAuditoriaFiltradas() {
  const busca = normalizaBuscaLocal(buscaAuditoria);
  return linhasDoSetorAtual().filter(l => {
    // Item na doca não está mais no endereço -- não tem o que auditar
    // "está lá?" pra ele aqui (ver aindaNoEndereco(), sql/fase36-doca.sql).
    if (!aindaNoEndereco(l.status)) return false;
    if (!busca) return true;
    return normalizaBuscaLocal(l.localizacao).includes(busca)
        || normalizaBuscaLocal(l.numero_pedido).includes(busca)
        || normalizaBuscaLocal(l.codigo_item).includes(busca);
  });
}

function renderAuditoriaFisica() {
  const busca = normalizaBuscaLocal(buscaAuditoria);
  const pendentes = linhasAuditoriaFiltradas();
  const corpo = document.getElementById('auditBody');
  const vazio = document.getElementById('auditVazio');

  vazio.style.display = pendentes.length ? 'none' : 'block';
  if (!pendentes.length) {
    corpo.innerHTML = '';
    vazio.textContent = busca
      ? 'Nenhum item na expedição bate com a busca.'
      : 'Nada na expedição pra conferir.';
    return;
  }

  // Mesmo agrupamento por localização da aba Saída/Conferência -- é assim
  // que a caminhada acontece: chega no endereço, confere tudo que tem ali.
  const porLocal = new Map();
  pendentes.forEach(l => {
    const chave = l.localizacao || '(sem localização)';
    if (!porLocal.has(chave)) porLocal.set(chave, []);
    porLocal.get(chave).push(l);
  });

  // Robson, 11/09/2026: "na auditoria quero filtrar de a-z" / "daí vou
  // conferindo por sequência" -- a ordem em que os endereços aparecem na
  // tela é a ordem em que ele anda no depósito, então tem de bater com a
  // ordem alfabética do endereço físico, não a ordem solta em que os
  // itens foram registrados.
  const gruposOrdenados = [...porLocal.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

  corpo.innerHTML = gruposOrdenados.map(([local, itens]) => {
    const conferidos = itens.filter(l => statusAuditoriaDoItem(l.id)?.status === 'confere').length;
    return `
    <div style="border:1px solid var(--border); border-radius:10px; margin-top:12px; overflow:hidden;">
      <div class="cfg-barra">
        <span class="loc-chip">${escapeHtml(local)}</span>
        <span style="font-size:12px; color:var(--muted);">${conferidos}/${itens.length} conferido(s)</span>
        <button class="btn btn-primary audit-tudo-confere" data-local="${escapeHtml(local)}" style="margin-left:auto;">
          ✓ Tudo confere neste endereço
        </button>
      </div>
      <div class="scroll-area">
        <table>
          <thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Nº Pedido</th><th>Situação</th></tr></thead>
          <tbody>
            ${itens.map(l => {
              const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
              const st = statusAuditoriaDoItem(l.id);
              const quando = st ? formatarDataHoraBR(st.conferido_em) : '';
              const quem = st?.conferido_por ? escapeHtml(st.conferido_por) + ' — ' : '';
              const statusHtml = !st
                ? '<span style="color:var(--muted); font-size:12px;">Ainda não conferido</span>'
                : st.status === 'confere'
                  ? `<span class="cfg-status st-ativo" title="${quem}${escapeHtml(quando)}">✓ Confere</span>`
                  : `<span class="cfg-status st-atrasado" title="${quem}${escapeHtml(quando)}">⚠ Não achei</span>`;
              return `
              <tr>
                <td class="item">${escapeHtml(l.codigo_item)}</td>
                <td>${desc && desc.descricao ? escapeHtml(desc.descricao) : '—'}</td>
                <td class="num">${l.quantidade != null ? escapeHtml(l.quantidade) : '—'}</td>
                <td class="loc">${escapeHtml(l.numero_pedido || '—')}</td>
                <td class="col-acoes">
                  ${statusHtml}
                  <button class="acao-btn audit-confere" data-id="${escapeHtml(l.id)}" title="Confirma que o item está neste endereço">✓</button>
                  <button class="acao-btn audit-nao-achei" data-id="${escapeHtml(l.id)}" title="Avisa que não achou o item neste endereço">⚠</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('auditBusca').addEventListener('input', (e) => {
  buscaAuditoria = e.target.value;
  renderAuditoriaFisica();
});

// Upsert por (unidade, setor, exp_controle_id) -- a conferência de agora
// substitui a de antes pro mesmo item, não acumula histórico de clique.
async function gravarStatusAuditoria(id, status) {
  const { data, error } = await sb.from('exp_conferencia_fisica').upsert({
    exp_controle_id: String(id), unidade: unidadeAtual, setor: setorExpAtual,
    status, conferido_por: nomeUsuarioAtual, conferido_em: new Date().toISOString()
  }, { onConflict: 'unidade,setor,exp_controle_id' }).select();

  if (error) {
    alert('Não foi possível salvar a conferência: ' + error.message
      + ' — se a mensagem falar em tabela inexistente, sql/fase35-exp-conferencia-fisica.sql ainda não foi rodado no Supabase.');
    return;
  }
  const linha = (data && data[0]) || { exp_controle_id: String(id), status, conferido_por: nomeUsuarioAtual, conferido_em: new Date().toISOString() };
  confFisicaMap.set(String(id), linha);
  renderAuditoriaFisica();
}

document.getElementById('auditBody').addEventListener('click', async (e) => {
  const btnConfere = e.target.closest('.audit-confere');
  const btnNaoAchei = e.target.closest('.audit-nao-achei');
  const btnTudo = e.target.closest('.audit-tudo-confere');

  if (btnConfere) { await gravarStatusAuditoria(btnConfere.dataset.id, 'confere'); return; }
  if (btnNaoAchei) { await gravarStatusAuditoria(btnNaoAchei.dataset.id, 'nao_achei'); return; }

  if (btnTudo) {
    const local = btnTudo.dataset.local;
    const itens = linhasDoSetorAtual().filter(l =>
      aindaNoEndereco(l.status) && (l.localizacao || '(sem localização)') === local);
    if (!itens.length) return;

    btnTudo.disabled = true;
    const agora = new Date().toISOString();
    const linhas = itens.map(l => ({
      exp_controle_id: String(l.id), unidade: unidadeAtual, setor: setorExpAtual,
      status: 'confere', conferido_por: nomeUsuarioAtual, conferido_em: agora
    }));
    const { data, error } = await sb.from('exp_conferencia_fisica')
      .upsert(linhas, { onConflict: 'unidade,setor,exp_controle_id' }).select();
    btnTudo.disabled = false;

    if (error) {
      alert('Não foi possível salvar a conferência deste endereço: ' + error.message);
      return;
    }
    (data || linhas).forEach(r => confFisicaMap.set(String(r.exp_controle_id), r));
    renderAuditoriaFisica();
  }
});

// ---- Exportar a Auditoria: HTML/Excel/CSV -------------------------------
// Robson, 11/09/2026: "depois de conferido gere uma aba aonde que eu
// consiga extrair as planilhas em HTM, excel etc, depois daí que vou
// transferir no sistema Datasul" -- mesma ideia do Exportar da aba Entrada
// (reaproveita exportarCsvGenerico/exportarXlsxGenerico/
// montarHtmlTabelaGenerica, cabeçalho e linhas próprios), com a Situação
// da conferência (Confere/Não achei/Ainda não conferido) e quem/quando
// junto -- é isso que ele leva pro Datasul.
const AUDIT_EXPORT_CABECALHO = ['Localização', 'Item', 'Descrição', 'UM', 'Nº Pedido', 'Quantidade', 'Situação', 'Conferido por', 'Conferido em'];

function linhasExportacaoAuditoria() {
  // Mesma ordem A-Z da tela -- exportar fora de ordem desfaria o motivo de
  // ordenar (Robson: "daí vou conferindo por sequência").
  const linhas = [...linhasAuditoriaFiltradas()].sort((a, b) =>
    String(a.localizacao || '').localeCompare(String(b.localizacao || ''), 'pt-BR'));

  return linhas.map(l => {
    const desc = expCtrlDescMap.get(normalizaCodigoItem(l.codigo_item));
    const st = statusAuditoriaDoItem(l.id);
    const situacao = !st ? 'Ainda não conferido' : st.status === 'confere' ? 'Confere' : 'Não achei';
    return [
      l.localizacao || '', l.codigo_item, desc && desc.descricao ? desc.descricao : '', desc && desc.um ? desc.um : '',
      l.numero_pedido || '', l.quantidade != null ? l.quantidade : null,
      situacao,
      st?.conferido_por || '',
      st?.conferido_em ? formatarDataHoraBR(st.conferido_em) : ''
    ];
  });
}

function montarHtmlAuditoriaTabela() {
  const busca = document.getElementById('auditBusca').value.trim();
  return montarHtmlTabelaGenerica({
    titulo: `Auditoria física — Controle EXP — ${rotuloUnidade(unidadeAtual)} — ${new Date().toLocaleDateString('pt-BR')}`,
    cabecalho: AUDIT_EXPORT_CABECALHO,
    linhas: linhasExportacaoAuditoria(),
    subtitulo: busca ? ` — busca: "${escapeHtml(busca)}"` : ''
  });
}

document.getElementById('auditExportarBtn').addEventListener('click', async () => {
  const linhas = linhasExportacaoAuditoria();
  if (!linhas.length) {
    alert('Nenhum item pra exportar -- a expedição está vazia ou a busca não bate com nada.');
    return;
  }

  const formato = document.getElementById('auditExportarFormato').value;
  const busca = document.getElementById('auditBusca').value.trim();
  const sufixoBusca = busca ? '-' + busca.replace(/[^a-z0-9]+/gi, '') : '';
  const nomeBase = `auditoria-exp-${unidadeAtual}${sufixoBusca}-${new Date().toISOString().slice(0, 10)}`;

  if (formato === 'xlsx') {
    const botao = document.getElementById('auditExportarBtn');
    const rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Preparando...';
    try {
      await exportarXlsxGenerico(AUDIT_EXPORT_CABECALHO, linhas, 'Auditoria EXP', nomeBase);
    } catch (err) {
      alert(err.message);
      console.error('Falha ao exportar a auditoria em Excel:', err.message);
    } finally {
      botao.disabled = false;
      botao.textContent = rotulo;
    }
  } else if (formato === 'html') {
    baixarArquivo(new Blob([montarHtmlAuditoriaTabela()], { type: 'text/html;charset=utf-8;' }), nomeBase + '.html');
  } else {
    exportarCsvGenerico(AUDIT_EXPORT_CABECALHO, linhas, nomeBase);
  }
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
//
// ⚠️ Compara NORMALIZADO (normalizaCodigoItem: trim + maiúscula), e não com
// `===` cru como era até 11/09/2026. O Robson digitou "131556i" com o
// catálogo tendo "131556I" e a trava disse "não está no Catálogo EXP" --
// item que existe, barrado por causa da caixa da letra. Pior: a aba
// Conferir SEMPRE comparou normalizado, então os dois lados do portal
// discordavam sobre o que é "o mesmo item". A regra é uma só: se o
// confronto trata dois códigos como o mesmo item, a trava tem de tratar
// também.
function itemExisteNoCatalogoExp(codigo) {
  const chave = normalizaCodigoItem(codigo);
  return catalogoExpItens.some(l => normalizaCodigoItem(l.codigo_item) === chave);
}

// Robson, 11/09/2026: "esses enderecos EXP A-02 EXP CX 02 por exemplo nao
// deixe colocar numero de pedido no mesmo endereço, envie um avis que ja
// tem pedido no mesmo endereço, as vezes esqueço de tirar da localização
// quando expediçao leva para carregamento" -- o esquecimento é marcar a
// SAÍDA (retirado) do pedido anterior antes de guardar um pedido novo na
// mesma prateleira; sem avisar, os dois pedidos ficam misturados na mesma
// localização até alguém notar na conferência.
//
// Só olha linha AINDA na expedição (não retirado) -- pedido que já saiu
// não ocupa mais o endereço de verdade, mesmo que o registro continue no
// histórico. Ignora comparação vazia dos dois lados (não é conflito
// nenhum sem pedido pra comparar) e o PRÓPRIO pedido (reabastecer o mesmo
// pedido na mesma localização não é o erro que este aviso procura).
function pedidoConflitanteNaLocalizacao(localizacao, pedidoAtual) {
  const local = (localizacao || '').trim().toLowerCase();
  const pedido = (pedidoAtual || '').trim();
  if (!local) return null;
  const linha = linhasDoSetorAtual().find(l => {
    if (l.status === 'retirado') return false;
    if ((l.localizacao || '').trim().toLowerCase() !== local) return false;
    const outroPedido = (l.numero_pedido || '').trim();
    return !!outroPedido && outroPedido !== pedido;
  });
  return linha ? (linha.numero_pedido || '').trim() : null;
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
  const descricaoInput = document.getElementById('expManualDescricaoInput');
  const dica = document.getElementById('expManualCatalogoDica');
  if (!codigo) {
    descricaoEl.textContent = ''; dica.textContent = '';
    descricaoInput.style.display = 'none'; descricaoInput.value = '';
    return;
  }

  // Robson, 15/09/2026: "não consigo inserir itens que nao esta na
  // planilha do exp, preciso que libere para eu digitar o que nao caiu
  // ainda no sistema" -- não trava mais o formulário quando o código não
  // está no Catálogo EXP. `itemExisteNoCatalogoExp` vira só uma DICA
  // (pra saber se veio de lá ou de outro catálogo), a busca em cascata
  // completa (buscarDescricoesItens) decide se libera ou pede descrição.
  const semCatalogoExp = !itemExisteNoCatalogoExp(codigo);

  const mapaDescricoes = await buscarDescricoesItens([codigo]);
  const achou = mapaDescricoes.get(normalizaCodigoItem(codigo));

  if (achou && achou.descricao) {
    descricaoEl.textContent = `${achou.descricao}${achou.um ? ' — ' + achou.um : ''}`
      + (semCatalogoExp ? ' (achada em outro catálogo, não no Catálogo EXP)' : '');
    descricaoEl.className = 'status-msg status-ok';
    descricaoInput.style.display = 'none';
    descricaoInput.value = '';
  } else {
    // Nenhum dos catálogos tem esse código -- deixa digitar a descrição na
    // mão em vez de barrar o registro. Ela fica salva (fase48) pra próxima
    // vez que esse código for digitado já vir pronta sozinha.
    descricaoEl.textContent = '⚠ Item não encontrado em nenhum catálogo (EXP, Requisição ALM ou estoque). '
      + 'Digite a descrição abaixo pra registrar mesmo assim -- ela fica salva pras próximas vezes.';
    descricaoEl.className = 'status-msg status-err';
    descricaoInput.style.display = 'block';
  }

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

// Aviso (não trava) de pedido misturado na mesma localização -- Robson,
// 11/09/2026: "as vezes esqueço de tirar da localização quando expediçao
// leva para carregamento". Confere nos dois campos (Localização e Nº
// Pedido), porque a pessoa pode preencher em qualquer ordem.
function atualizarAvisoLocalizacaoManual() {
  const local = document.getElementById('expManualLocal').value;
  const pedido = document.getElementById('expManualPedido').value;
  const aviso = document.getElementById('expManualLocalAviso');
  const conflito = pedidoConflitanteNaLocalizacao(local, pedido);
  aviso.textContent = conflito
    ? `⚠ Já existe o pedido ${conflito} nesta localização (ainda na expedição) — confira se ele já não carregou antes de guardar um pedido diferente aqui.`
    : '';
}
document.getElementById('expManualLocal').addEventListener('blur', atualizarAvisoLocalizacaoManual);
document.getElementById('expManualPedido').addEventListener('blur', atualizarAvisoLocalizacaoManual);
