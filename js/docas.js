// Painel de Docas — monitoramento do carregamento em tempo real (fase39)
//
// Robson, 14/09/2026: "Queremos uma nova aba/painel (Dashboard em Tempo
// Real) focado na gestão das 3 Docas de Carregamento da fábrica... que
// conferentes e o encarregado alimentem o sistema na linha de frente,
// enquanto gerentes e diretores visualizam o status de qualquer lugar."
//
// A REGRA QUE SUSTENTA O MÓDULO: o conferente não digita nada a mais
// durante o carregamento. A barra de progresso sai das baixas que ele JÁ
// faz na aba DOCA do Controle EXP ("✓ Carregou") -- cada baixa carimba o
// item com o carregamento em curso daquele pedido
// (exp_controle_itens.doca_carregamento_id, ver marcarSaidaExpControle()
// em js/programacao.js). Se a alimentação dependesse de digitação extra
// no meio do carregamento, ela não aconteceria e o painel viraria ficção.
//
// Estados de um carregamento (doca_carregamentos.status):
//   aguardando  sem doca_id  -> na fila do pátio
//   aguardando  com doca_id  -> encostado na doca, ainda não começou
//   carregando               -> cronômetro correndo
//   finalizado / cancelado   -> fim de linha, vira histórico
//
// Fase 1 é esta. SLA por tipo de veículo e justificativa travando o
// fechamento são a fase 2 -- não adiantam antes de existir tempo medido.

let docasCadastro = [];        // linhas de `docas` desta unidade
let docaCarregamentos = [];    // abertos + finalizados de hoje
let docaPedidosMap = new Map();     // carregamento_id -> [numero_pedido]
let docaProgressoMap = new Map();   // carregamento_id -> itens já baixados
let canalDocas = null;
let relogioDocas = null;

// ---- Carga -----------------------------------------------------------------
async function carregarPainelDocas() {
  if (!unidadeAtual) return;
  const msg = document.getElementById('docasMsg');

  // Recorte do dia (hora local, não UTC): o quadro é da operação de hoje.
  // "Carregados hoje" com fuso trocado mostraria o turno da noite no dia
  // errado, que é justamente quando alguém confere o painel.
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  const [cadastro, carregamentos] = await Promise.all([
    sb.from('docas').select('*').eq('unidade', unidadeAtual).eq('ativa', true).order('ordem'),
    sb.from('doca_carregamentos').select('*')
      .eq('unidade', unidadeAtual)
      .or(`status.in.(aguardando,carregando),chegada_em.gte.${inicioDoDia.toISOString()}`)
      .order('chegada_em', { ascending: true })
  ]);

  if (cadastro.error || carregamentos.error) {
    const erro = (cadastro.error || carregamentos.error).message;
    msg.textContent = 'Não foi possível carregar o painel: ' + erro
      + (/does not exist|relation/i.test(erro) ? ' — rode sql/fase39-painel-docas.sql no Supabase.' : '');
    msg.className = 'status-msg status-err';
    return;
  }
  msg.textContent = '';
  msg.className = 'status-msg';

  docasCadastro = cadastro.data || [];
  docaCarregamentos = carregamentos.data || [];

  await carregarPedidosEProgresso();
  renderPainelDocas();
}

// Pedidos de cada carregamento + quantos itens já foram baixados nele.
// Duas consultas, não uma por carregamento: com 3 docas seriam poucas
// chamadas, mas "uma consulta por linha da tela" é o padrão que fica
// lento sozinho quando a lista do dia cresce.
async function carregarPedidosEProgresso() {
  docaPedidosMap = new Map();
  docaProgressoMap = new Map();
  const ids = docaCarregamentos.map(c => c.id);
  if (!ids.length) return;

  const [pedidos, itens] = await Promise.all([
    sb.from('doca_carregamento_pedidos').select('carregamento_id, numero_pedido').in('carregamento_id', ids),
    sb.from('exp_controle_itens').select('id, doca_carregamento_id')
      .eq('unidade', unidadeAtual).in('doca_carregamento_id', ids)
  ]);

  (pedidos.data || []).forEach(p => {
    if (!docaPedidosMap.has(p.carregamento_id)) docaPedidosMap.set(p.carregamento_id, []);
    docaPedidosMap.get(p.carregamento_id).push(p.numero_pedido);
  });
  (itens.data || []).forEach(i => {
    docaProgressoMap.set(i.doca_carregamento_id, (docaProgressoMap.get(i.doca_carregamento_id) || 0) + 1);
  });
}

// ---- Helpers ---------------------------------------------------------------
function pedidosDoCarregamento(id) {
  return docaPedidosMap.get(id) || [];
}

// Telefone vira link de ligar -- Robson, 14/09/2026: "preciso que coloque
// tambem destino e numero do telefone do motorista". O caso real do pátio
// é o motorista sumir com o caminhão ocupando a doca: no celular do
// conferente, um toque no número já liga. Só os dígitos vão pro href
// (tel: não aceita parênteses e hífen em todo aparelho); na tela continua
// aparecendo do jeito que foi digitado, que é como se confere se está certo.
// Selo CIF/FOB -- Robson, 14/09/2026: "coloque tambem cif ou fob". Cores
// diferentes de propósito (não é semântica bom/ruim como o resto do
// painel, é só "de quem é o frete"): CIF por conta da Kingspan, FOB por
// conta do cliente/transportadora dele. Frete não informado não mostra
// nada -- inventar "CIF" por padrão seria arriscar responsabilidade
// errada num carregamento que ninguém perguntou.
function freteHtml(frete) {
  if (frete !== 'CIF' && frete !== 'FOB') return '';
  const classe = frete === 'CIF' ? 'doca-frete-cif' : 'doca-frete-fob';
  return `<span class="doca-frete ${classe}">${frete}</span>`;
}

function telefoneHtml(numero) {
  const texto = String(numero || '').trim();
  if (!texto) return '';
  const digitos = texto.replace(/\D/g, '');
  if (!digitos) return `<span class="doca-sub">${escapeHtml(texto)}</span>`;
  return `<a class="doca-telefone" href="tel:${escapeHtml(digitos)}" title="Ligar para o motorista">📞 ${escapeHtml(texto)}</a>`;
}

function minutosEntre(inicioIso, fimIso) {
  if (!inicioIso) return 0;
  const fim = fimIso ? new Date(fimIso).getTime() : Date.now();
  return Math.max(0, Math.floor((fim - new Date(inicioIso).getTime()) / 60000));
}

// "02:41" -- horas:minutos, não relógio com segundos. O carregamento dura
// horas; segundo piscando na TV do galpão é ruído, não informação.
function duracaoHhMm(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Progresso só faz sentido com meta: sem meta (embarque sem pedido
// conhecido) mostra a contagem absoluta em vez de uma barra mentindo 0%.
function progressoDoCarregamento(c) {
  const feitos = docaProgressoMap.get(c.id) || 0;
  const meta = c.meta_itens != null ? Number(c.meta_itens) : null;
  const pct = (meta && meta > 0) ? Math.min(100, Math.round((feitos / meta) * 100)) : null;
  return { feitos, meta, pct };
}

// Verde/amarelo/vermelho. Sem SLA cadastrado (fase 1) o cartão fica
// neutro de propósito -- pintar de vermelho por um limite inventado
// treinaria todo mundo a ignorar a cor antes de o indicador existir.
function corDoTempo(c) {
  if (!c.sla_minutos) return { classe: '', cor: 'var(--ink)' };
  const decorrido = minutosEntre(c.inicio_em, c.fim_em);
  if (decorrido > c.sla_minutos) return { classe: 'st-atrasado', cor: 'var(--erro-texto)' };
  if (decorrido >= c.sla_minutos * 0.8) return { classe: 'st-pendente', cor: 'var(--aviso-texto)' };
  return { classe: 'st-ativo', cor: 'var(--ok-texto)' };
}

function carregamentoDaDoca(docaId) {
  return docaCarregamentos.find(c => c.doca_id === docaId
    && (c.status === 'carregando' || c.status === 'aguardando'));
}

// ---- Render ----------------------------------------------------------------
function renderPainelDocas() {
  renderQuadroDocas();
  renderOpcoesPasso2();
  renderFilaDocas();
  renderCarregadosHoje();
  renderEscolhaVeiculo();
}

// Alimenta o passo 2 (expedição): a lista de quem está no pátio e as docas
// livres. Só docas LIVRES no select -- oferecer uma doca ocupada só pra
// recusar depois é pior que não oferecer.
function renderOpcoesPasso2() {
  const lista = document.getElementById('docaVeiculosPatio');
  lista.innerHTML = veiculosNoPatio()
    .map(c => `<option value="${escapeHtml(rotuloVeiculoPatio(c))}"></option>`).join('');

  const select = document.getElementById('docaDestinoDoca');
  const escolhidaAntes = select.value;
  const livres = docasCadastro.filter(d => !carregamentoDaDoca(d.id));
  select.innerHTML = livres.length
    ? '<option value="">Em qual doca encostou?</option>'
      + livres.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.nome)}</option>`).join('')
    : '<option value="">Todas as docas ocupadas</option>';
  // Mantém a doca já escolhida se ela continuar livre -- o painel se
  // redesenha sozinho em tempo real, e perder a escolha no meio da
  // digitação dos pedidos faria o encarregado recomeçar.
  if (escolhidaAntes && livres.some(d => d.id === escolhidaAntes)) select.value = escolhidaAntes;
}

function renderQuadroDocas() {
  const quadro = document.getElementById('docasQuadro');
  const vazio = document.getElementById('docasVazio');

  vazio.style.display = docasCadastro.length ? 'none' : 'block';
  if (!docasCadastro.length) { quadro.innerHTML = ''; return; }

  quadro.innerHTML = `<div class="docas-grade">` + docasCadastro.map(d => {
    const c = carregamentoDaDoca(d.id);
    if (!c) {
      return `
      <div class="doca-cartao">
        <div class="doca-cartao-topo">
          <span class="doca-nome">${escapeHtml(d.nome)}</span>
          <span class="cfg-status st-ativo">Livre</span>
        </div>
        <div class="doca-livre">Sem veículo. Chame alguém da fila do pátio.</div>
      </div>`;
    }

    const { feitos, meta, pct } = progressoDoCarregamento(c);
    const tempo = corDoTempo(c);
    const carregando = c.status === 'carregando';
    const pedidos = pedidosDoCarregamento(c.id);

    return `
    <div class="doca-cartao">
      <div class="doca-cartao-topo">
        <span class="doca-nome">${escapeHtml(d.nome)}</span>
        <span class="cfg-status ${carregando ? 'st-pendente' : 'st-atrasado'}">
          ${carregando ? 'Carregando' : 'Encostado'}
        </span>
      </div>

      <div class="doca-veiculo">
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="doca-placa">${escapeHtml(c.placa)}</span>
          ${freteHtml(c.frete)}
        </div>
        <span class="doca-sub">${escapeHtml(c.tipo_veiculo || '—')}${c.transportadora ? ' · ' + escapeHtml(c.transportadora) : ''}</span>
        ${c.destino ? `<span class="doca-destino">📍 ${escapeHtml(c.destino)}</span>` : ''}
        ${c.motorista ? `<span class="doca-sub">Motorista: ${escapeHtml(c.motorista)}</span>` : ''}
        ${telefoneHtml(c.telefone_motorista)}
        <span class="doca-pedidos">${pedidos.length ? escapeHtml(pedidos.join(' + ')) : 'sem pedido informado'}</span>
      </div>

      ${carregando ? `
        <div class="doca-barra-area">
          <div class="doca-barra-topo">
            <span>${feitos}${meta ? ' de ' + meta : ''} ite${(meta || feitos) === 1 ? 'm' : 'ns'}</span>
            <span class="doca-pct">${pct != null ? pct + '%' : '—'}</span>
          </div>
          <div class="doca-barra"><i style="width:${pct != null ? pct : 0}%;"></i></div>
        </div>
        <div class="doca-relogio">
          <span class="doca-tempo" data-inicio="${escapeHtml(c.inicio_em || '')}" style="color:${tempo.cor};">
            ${duracaoHhMm(minutosEntre(c.inicio_em, null))}
          </span>
          <span class="doca-sub">${c.conferente_inicio ? escapeHtml(c.conferente_inicio) : ''}</span>
        </div>
        <div class="doca-acoes">
          <button class="btn btn-primary doca-finalizar" data-id="${escapeHtml(c.id)}">✓ Finalizar carregamento</button>
          <button class="acao-btn doca-excluir" data-id="${escapeHtml(c.id)}" data-placa="${escapeHtml(c.placa)}"
                  title="Excluir o registro — criado por engano, não entra em relatório">🗑</button>
        </div>
      ` : `
        <div class="doca-livre">
          Encostado ${c.chamado_em ? 'há ' + duracaoHhMm(minutosEntre(c.chamado_em, null)) : ''} — ainda não começou.
        </div>
        <div class="doca-acoes">
          <button class="btn btn-primary doca-iniciar" data-id="${escapeHtml(c.id)}">▶ Iniciar carregamento</button>
          <button class="acao-btn doca-voltar-fila" data-id="${escapeHtml(c.id)}" title="Tirar da doca e devolver pra fila do pátio">↺</button>
          <button class="acao-btn doca-excluir" data-id="${escapeHtml(c.id)}" data-placa="${escapeHtml(c.placa)}"
                  title="Excluir o registro — criado por engano, não entra em relatório">🗑</button>
        </div>
      `}
    </div>`;
  }).join('') + `</div>`;
}

function renderFilaDocas() {
  const corpo = document.getElementById('docasFilaBody');
  const vazio = document.getElementById('docasFilaVazio');
  const contagem = document.getElementById('docasFilaContagem');

  const fila = veiculosNoPatio();
  contagem.textContent = fila.length ? `${fila.length} veículo(s) esperando` : '';
  vazio.style.display = fila.length ? 'none' : 'block';
  if (!fila.length) { corpo.innerHTML = ''; return; }

  corpo.innerHTML = fila.map(c => {
    const pedidos = pedidosDoCarregamento(c.id);
    const espera = duracaoHhMm(minutosEntre(c.chegada_em, null));
    return `
    <div class="doca-fila-linha">
      <span class="doca-placa">${escapeHtml(c.placa)}</span>
      ${freteHtml(c.frete)}
      <span class="doca-sub">${escapeHtml(c.tipo_veiculo || '—')}${c.transportadora ? ' · ' + escapeHtml(c.transportadora) : ''}</span>
      ${c.destino ? `<span class="doca-destino">📍 ${escapeHtml(c.destino)}</span>` : ''}
      ${telefoneHtml(c.telefone_motorista)}
      <span class="doca-pedidos">${pedidos.length ? escapeHtml(pedidos.join(' + ')) : '—'}</span>
      <span class="doca-sub">esperando ${espera}</span>
      <!-- "Preparar" leva o veículo pro passo 2 em vez de encostar direto:
           encostar exige informar os pedidos, e um botão que encostasse
           daqui pularia justamente a informação que faz o material ser
           separado pra doca. -->
      <span class="doca-fila-acao">
        <button class="btn btn-primary doca-preparar" data-id="${escapeHtml(c.id)}">Preparar carregamento</button>
      </span>
      <button class="acao-btn doca-cancelar" data-id="${escapeHtml(c.id)}"
              title="Cancelar — o veículo existiu e foi embora sem carregar (fica no histórico)">🚫</button>
      <button class="acao-btn doca-excluir" data-id="${escapeHtml(c.id)}" data-placa="${escapeHtml(c.placa)}"
              title="Excluir o registro — criado por engano, não entra em relatório">🗑</button>
    </div>`;
  }).join('');
}

function renderCarregadosHoje() {
  const corpo = document.getElementById('docasHojeBody');
  const vazio = document.getElementById('docasHojeVazio');
  const contagem = document.getElementById('docasHojeContagem');

  const feitos = docaCarregamentos
    .filter(c => c.status === 'finalizado')
    .sort((a, b) => new Date(b.fim_em || 0) - new Date(a.fim_em || 0));

  contagem.textContent = feitos.length ? `${feitos.length} carregamento(s)` : '';
  vazio.style.display = feitos.length ? 'none' : 'block';
  if (!feitos.length) { corpo.innerHTML = ''; return; }

  corpo.innerHTML = feitos.map(c => `
    <tr>
      <td class="item">${escapeHtml(c.placa)}</td>
      <td>${escapeHtml(c.tipo_veiculo || '—')}</td>
      <td>${freteHtml(c.frete) || '—'}</td>
      <td>${escapeHtml(c.transportadora || '—')}</td>
      <td>${escapeHtml(c.destino || '—')}</td>
      <td class="loc">${escapeHtml(pedidosDoCarregamento(c.id).join(' + ') || '—')}</td>
      <td class="loc">${escapeHtml(nomeDaDocaCadastrada(c.doca_id))}</td>
      <td class="loc">${c.inicio_em ? escapeHtml(formatarDataHoraBR(c.inicio_em)) : '—'}</td>
      <td class="loc">${c.fim_em ? escapeHtml(formatarDataHoraBR(c.fim_em)) : '—'}</td>
      <td class="num" style="font-weight:700;">${duracaoHhMm(minutosEntre(c.inicio_em, c.fim_em))}</td>
      <td>${escapeHtml(c.conferente_fim || '—')}</td>
      <td class="col-acoes">
        <button class="acao-btn doca-reabrir" data-id="${escapeHtml(c.id)}"
                title="Reabrir — fechou por engano, volta a carregar">↺</button>
        <button class="acao-btn doca-excluir" data-id="${escapeHtml(c.id)}" data-placa="${escapeHtml(c.placa)}"
                title="Excluir o registro — criado por engano, não entra em relatório">🗑</button>
      </td>
    </tr>`).join('');
}

// ---- Exportar HTML -----------------------------------------------------
// Robson, 14/09/2026: "Depois quero um campo que extrai o relatorio em
// HTM". Mesmo padrão de toda exportação HTML do portal
// (montarHtmlTabelaGenerica(), já usada pela Entrada e pela Auditoria em
// js/programacao.js, carregado antes de docas.js) -- não inventa layout
// novo, reaproveita cabeçalho/linha genéricos e o baixarArquivo() de lá.
//
// Exporta os carregamentos FINALIZADOS de hoje, nas mesmas colunas da
// tabela "Carregados hoje" -- é o que já está na tela, só que pra
// guardar/enviar por e-mail. Fila e docas em andamento não entram: são
// estado do MOMENTO, não fato fechado, e mudam no minuto seguinte.
const DOCAS_EXPORT_CABECALHO = [
  'Placa', 'Veículo', 'Frete', 'Transportadora', 'Destino', 'Pedidos',
  'Doca', 'Início', 'Fim', 'Duração', 'Conferente'
];

function nomeDaDocaCadastrada(docaId) {
  return (docasCadastro.find(d => d.id === docaId) || {}).nome || '—';
}

function linhasExportacaoDocas() {
  return docaCarregamentos
    .filter(c => c.status === 'finalizado')
    .sort((a, b) => new Date(b.fim_em || 0) - new Date(a.fim_em || 0))
    .map(c => [
      c.placa, c.tipo_veiculo || '', c.frete || '', c.transportadora || '', c.destino || '',
      pedidosDoCarregamento(c.id).join(' + '), nomeDaDocaCadastrada(c.doca_id),
      c.inicio_em ? formatarDataHoraBR(c.inicio_em) : '',
      c.fim_em ? formatarDataHoraBR(c.fim_em) : '',
      duracaoHhMm(minutosEntre(c.inicio_em, c.fim_em)),
      c.conferente_fim || ''
    ]);
}

document.getElementById('docasExportarBtn').addEventListener('click', () => {
  const linhas = linhasExportacaoDocas();
  if (!linhas.length) { alert('Nenhum carregamento finalizado hoje ainda para exportar.'); return; }

  const html = montarHtmlTabelaGenerica({
    titulo: `Painel de Docas — Carregados hoje — ${rotuloUnidade(unidadeAtual)}`,
    cabecalho: DOCAS_EXPORT_CABECALHO,
    linhas
  });
  const nomeBase = `painel-docas-${unidadeAtual}-${new Date().toISOString().slice(0, 10)}`;
  baixarArquivo(new Blob([html], { type: 'text/html;charset=utf-8;' }), nomeBase + '.html');
});

// Cronômetro: só reescreve o TEXTO do tempo, não redesenha o quadro.
// Redesenhar de minuto em minuto perderia o que estiver digitado nos
// campos de chegada e piscaria a tela na TV do galpão.
function iniciarRelogioDocas() {
  if (relogioDocas) clearInterval(relogioDocas);
  relogioDocas = setInterval(() => {
    document.querySelectorAll('.doca-tempo[data-inicio]').forEach(el => {
      if (el.dataset.inicio) el.textContent = duracaoHhMm(minutosEntre(el.dataset.inicio, null));
    });
  }, 30000); // 30s: o relógio mostra hh:mm, atualizar a cada segundo não mudaria nada na tela
}

function pararRelogioDocas() {
  if (relogioDocas) { clearInterval(relogioDocas); relogioDocas = null; }
}

// ---- Tempo real ------------------------------------------------------------
// Mesmo mecanismo já usado na contagem física e nas bobinas (Supabase
// Realtime = WebSocket). Duas tabelas: o carregamento em si (outra pessoa
// chamou um veículo pra doca) e a baixa do item (a barra de progresso
// anda enquanto o conferente marca "✓ Carregou" lá no Controle EXP).
function iniciarTempoRealDocas() {
  if (canalDocas) sb.removeChannel(canalDocas);
  canalDocas = sb.channel('docas-' + unidadeAtual)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'doca_carregamentos', filter: `unidade=eq.${unidadeAtual}` },
      () => carregarPainelDocas())
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'exp_controle_itens', filter: `unidade=eq.${unidadeAtual}` },
      (payload) => {
        // Só recarrega se a mudança tem a ver com algum carregamento na
        // tela -- a aba Entrada do Controle EXP atualiza este mesmo
        // registro o tempo todo (localização, quantidade, etiqueta), e
        // recarregar o painel a cada tecla digitada lá seria desperdício.
        const id = payload.new && payload.new.doca_carregamento_id;
        if (id && docaCarregamentos.some(c => c.id === id)) carregarPainelDocas();
      })
    .subscribe();
}

function pararTempoRealDocas() {
  if (canalDocas) { sb.removeChannel(canalDocas); canalDocas = null; }
}

// ---- Ações -----------------------------------------------------------------

// Excluir de vez -- Robson, 14/09/2026: "coloque um botao de excluir caso
// necessario", com um registro de teste travando a Doca 1 na tela dele.
//
// É DIFERENTE de "Cancelar", e os dois continuam existindo:
//   Cancelar  = aconteceu de verdade (o veículo foi embora sem carregar).
//               Vira status, fica no histórico, conta como fato.
//   Excluir   = o registro nunca deveria ter existido (teste, placa
//               digitada errada, chegada registrada em duplicidade).
//               Apagar é justamente pra isso não virar indicador.
//
// Sem esta ação, um registro errado só saía da tela sendo FINALIZADO --
// e aí entrava pra sempre na conta de tempo médio de carregamento,
// estragando o indicador que o módulo existe pra medir.
//
// Os pedidos e os eventos do carregamento somem junto (on delete cascade,
// ver fase39). Os ITENS não: a baixa deles aconteceu de verdade (saíram do
// endereço), então continuam baixados -- só perdem o vínculo com este
// caminhão. Por isso a ordem é apagar primeiro e desvincular depois: se
// desvinculasse antes e o delete falhasse, o carregamento ficaria vivo e
// sem progresso, que é pior que um vínculo órfão (a coluna não tem FK
// justamente pra isso não quebrar nada).
async function excluirCarregamento(id, placa) {
  const confirmado = confirm(
    `Excluir o registro do veículo ${placa}?\n\n`
    + 'Some de vez: não entra em relatório nem em tempo médio. Use quando o registro '
    + 'foi criado por engano (teste, placa errada, chegada duplicada).\n\n'
    + 'Se o veículo existiu de verdade e foi embora sem carregar, cancele em vez de excluir.\n\n'
    + 'Esta ação não pode ser desfeita.');
  if (!confirmado) return false;

  const { error } = await sb.from('doca_carregamentos').delete().eq('id', id);
  if (error) { alert('Não foi possível excluir: ' + error.message); return false; }

  // Itens que já tinham sido carregados neste caminhão voltam a ficar sem
  // caminhão -- a baixa continua valendo, só o vínculo sai.
  const { error: erroItens } = await sb.from('exp_controle_itens')
    .update({ doca_carregamento_id: null }).eq('doca_carregamento_id', id);
  if (erroItens) console.warn('Não foi possível desvincular os itens do carregamento:', erroItens.message);

  await carregarPainelDocas();
  return true;
}
async function registrarEventoDoca(carregamentoId, evento, dados) {
  // Log é rastreabilidade: se falhar, a ação principal (que já
  // aconteceu) não é desfeita por causa disso -- mesmo critério de
  // registrarLogProgramacao() em js/programacao.js.
  const { error } = await sb.from('doca_eventos').insert({
    carregamento_id: carregamentoId, evento, dados: dados || null, por: nomeUsuarioAtual
  });
  if (error) console.warn('Não foi possível registrar o evento da doca:', error.message);
}

// Meta do embarque = itens desses pedidos que ainda não carregaram. Sai
// do próprio Controle EXP, então o conferente não digita meta nenhuma na
// chegada (era a pergunta "meta por item, peso ou cubagem?" -- por item é
// a única que o sistema já sabe sozinho).
async function calcularMetaItens(pedidos) {
  if (!pedidos.length) return null;
  const { data, error } = await sb.from('exp_controle_itens')
    .select('id')
    .eq('unidade', unidadeAtual)
    .in('numero_pedido', pedidos)
    .neq('status', 'retirado');
  if (error) { console.warn('Não foi possível calcular a meta do embarque:', error.message); return null; }
  return (data || []).length || null;
}

// ---- PASSO 1: portaria -----------------------------------------------------
// Robson, 14/09/2026: "esses dados ser preenchidos pela portaria quando o
// veiculo entrar, dai deixa como banco de dados". Sem campo de pedido
// aqui: a portaria não sabe o que o caminhão vai levar -- quem sabe é a
// expedição, no passo 2.

// O "banco de dados" da frase acima, na prática: a MESMA placa costuma
// voltar (transportadora fixa, motorista fixo). Ao digitar a placa, o
// último registro dela preenche o resto -- a portaria confere em vez de
// redigitar. Só preenche campo VAZIO: o que a pessoa já escreveu vale
// mais que o histórico (motorista trocou, telefone novo).
async function puxarUltimoVeiculoPelaPlaca() {
  const campoPlaca = document.getElementById('docaPlaca');
  const placa = campoPlaca.value.trim().toUpperCase();
  const aviso = document.getElementById('docasMsg');
  if (placa.length < 5) return;  // placa incompleta ainda: não vale consultar

  const { data, error } = await sb.from('doca_carregamentos')
    .select('motorista, telefone_motorista, transportadora, destino, tipo_veiculo, frete')
    .eq('unidade', unidadeAtual).eq('placa', placa)
    .order('chegada_em', { ascending: false }).limit(1);
  if (error || !data || !data.length) return;

  const ultimo = data[0];
  const preencher = (id, valor) => {
    const el = document.getElementById(id);
    if (el && !el.value && valor) el.value = valor;
  };
  preencher('docaMotorista', ultimo.motorista);
  preencher('docaTelefone', ultimo.telefone_motorista);
  preencher('docaTransportadora', ultimo.transportadora);
  preencher('docaDestino', ultimo.destino);
  if (ultimo.frete && !document.getElementById('docaFrete').value) {
    document.getElementById('docaFrete').value = ultimo.frete;
  }
  if (ultimo.tipo_veiculo) document.getElementById('docaTipoVeiculo').value = ultimo.tipo_veiculo;

  aviso.textContent = `Dados preenchidos a partir da última entrada de ${placa} — confira antes de registrar.`;
  aviso.className = 'status-msg status-ok';
}

document.getElementById('docaPlaca').addEventListener('blur', puxarUltimoVeiculoPelaPlaca);

document.getElementById('docaChegadaBtn').addEventListener('click', async () => {
  const msg = document.getElementById('docasMsg');
  const btn = document.getElementById('docaChegadaBtn');
  const placa = document.getElementById('docaPlaca').value.trim().toUpperCase();

  if (!placa) {
    msg.textContent = 'Informe a placa do veículo.';
    msg.className = 'status-msg status-err';
    return;
  }

  btn.disabled = true;
  msg.textContent = 'Registrando entrada...';
  msg.className = 'status-msg';

  // Sem meta_itens nem pedidos: os dois só existem depois que a expedição
  // disser o que esse caminhão leva (passo 2).
  const { data, error } = await sb.from('doca_carregamentos').insert({
    unidade: unidadeAtual,
    setor: typeof setorExpAtual !== 'undefined' ? setorExpAtual : 'exp',
    placa,
    motorista: document.getElementById('docaMotorista').value.trim() || null,
    telefone_motorista: document.getElementById('docaTelefone').value.trim() || null,
    transportadora: document.getElementById('docaTransportadora').value.trim() || null,
    destino: document.getElementById('docaDestino').value.trim() || null,
    tipo_veiculo: document.getElementById('docaTipoVeiculo').value,
    frete: document.getElementById('docaFrete').value || null,
    criado_por: nomeUsuarioAtual
  }).select('id').single();

  btn.disabled = false;

  if (error) {
    msg.textContent = 'Não foi possível registrar: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  await registrarEventoDoca(data.id, 'entrou', { placa });

  ['docaPlaca', 'docaMotorista', 'docaTelefone', 'docaTransportadora', 'docaDestino', 'docaFrete'].forEach(id => {
    document.getElementById(id).value = '';
  });
  // A confirmação vem DEPOIS de recarregar: carregarPainelDocas() limpa a
  // área de mensagem, então escrever antes fazia o aviso piscar e sumir --
  // e a portaria ficava sem saber se a entrada foi registrada ou não.
  await carregarPainelDocas();
  msg.textContent = `${placa} entrou — está no pátio, esperando a expedição encostar numa doca.`;
  msg.className = 'status-msg status-ok';
});

// ---- PASSO 2: expedição ----------------------------------------------------
// "o encarregado digita só a placa, ou nome do motorista, que ja vai puxar
// os dados". A busca é só entre quem ESTÁ NO PÁTIO agora (entrou e não
// encostou) -- procurar no histórico inteiro traria caminhão de ontem e
// o encarregado encostaria o veículo errado sem perceber.
function veiculosNoPatio() {
  return docaCarregamentos.filter(c => c.status === 'aguardando' && !c.doca_id);
}

function carregamentoEscolhidoNoPatio() {
  const texto = document.getElementById('docaBuscaVeiculo').value.trim().toLowerCase();
  if (!texto) return null;
  const patio = veiculosNoPatio();
  // Bate primeiro pelo rótulo inteiro do datalist (o encarregado escolheu
  // na lista), depois por pedaço de placa ou de nome -- ele pode ter
  // digitado só "MBA" ou "jonas".
  return patio.find(c => rotuloVeiculoPatio(c).toLowerCase() === texto)
      || patio.find(c => String(c.placa || '').toLowerCase() === texto)
      || patio.find(c => String(c.placa || '').toLowerCase().includes(texto)
                      || String(c.motorista || '').toLowerCase().includes(texto))
      || null;
}

function rotuloVeiculoPatio(c) {
  return [c.placa, c.motorista, c.transportadora].filter(Boolean).join(' — ');
}

function renderEscolhaVeiculo() {
  const caixa = document.getElementById('docaVeiculoEscolhido');
  const c = carregamentoEscolhidoNoPatio();

  if (!c) {
    const digitou = document.getElementById('docaBuscaVeiculo').value.trim();
    caixa.style.display = digitou ? 'block' : 'none';
    caixa.className = 'doca-escolhido doca-escolhido-vazio';
    caixa.innerHTML = digitou
      ? 'Nenhum veículo no pátio com essa placa ou motorista. A portaria já registrou a entrada dele?'
      : '';
    return;
  }

  caixa.style.display = 'block';
  caixa.className = 'doca-escolhido';
  caixa.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <span class="doca-placa">${escapeHtml(c.placa)}</span>
      ${freteHtml(c.frete)}
      <span class="doca-sub">${escapeHtml(c.tipo_veiculo || '—')}${c.transportadora ? ' · ' + escapeHtml(c.transportadora) : ''}</span>
      ${c.destino ? `<span class="doca-destino">📍 ${escapeHtml(c.destino)}</span>` : ''}
      ${c.motorista ? `<span class="doca-sub">Motorista: ${escapeHtml(c.motorista)}</span>` : ''}
      ${telefoneHtml(c.telefone_motorista)}
      <span class="doca-sub" style="margin-left:auto;">no pátio há ${duracaoHhMm(minutosEntre(c.chegada_em, null))}</span>
    </div>`;
}

document.getElementById('docaBuscaVeiculo').addEventListener('input', renderEscolhaVeiculo);

document.getElementById('docaEncostarBtn').addEventListener('click', async () => {
  const msg = document.getElementById('docasMsg');
  const btn = document.getElementById('docaEncostarBtn');
  const c = carregamentoEscolhidoNoPatio();

  if (!c) {
    msg.textContent = 'Escolha o veículo pela placa ou pelo nome do motorista.';
    msg.className = 'status-msg status-err';
    return;
  }

  const docaId = document.getElementById('docaDestinoDoca').value;
  if (!docaId) {
    msg.textContent = 'Escolha em qual doca o veículo encostou.';
    msg.className = 'status-msg status-err';
    return;
  }

  // "KV876431, KV855935" ou "KV876431 KV855935" -- o encarregado digita do
  // jeito que está no papel; separador não pode ser regra decorada.
  const pedidos = document.getElementById('docaPedidos').value
    .split(/[,;\s]+/).map(p => p.trim().toUpperCase()).filter(Boolean);

  if (!pedidos.length) {
    msg.textContent = 'Informe o(s) pedido(s) que este veículo vai carregar — é o que faz o material ser separado pra doca.';
    msg.className = 'status-msg status-err';
    return;
  }

  btn.disabled = true;
  msg.textContent = 'Encostando na doca...';
  msg.className = 'status-msg';

  // A meta só dá pra calcular AGORA: ela sai dos pedidos, e os pedidos só
  // existem neste passo (na portaria ninguém sabia o que o caminhão leva).
  const meta = await calcularMetaItens(pedidos);

  const { error } = await sb.from('doca_carregamentos').update({
    doca_id: docaId, chamado_em: new Date().toISOString(), meta_itens: meta
  }).eq('id', c.id);

  if (error) {
    btn.disabled = false;
    msg.textContent = 'Não foi possível encostar: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  // Upsert com ignoreDuplicates: encostar o mesmo veículo de novo (troca de
  // doca, correção de pedido) não pode estourar na chave única de
  // (carregamento, pedido) -- ver fase39.
  const { error: erroPedidos } = await sb.from('doca_carregamento_pedidos')
    .upsert(pedidos.map(numero_pedido => ({ carregamento_id: c.id, numero_pedido })),
            { onConflict: 'carregamento_id,numero_pedido', ignoreDuplicates: true });
  if (erroPedidos) console.warn('Não foi possível vincular os pedidos:', erroPedidos.message);

  await registrarEventoDoca(c.id, 'encostou', { doca_id: docaId, pedidos, meta_itens: meta });

  btn.disabled = false;
  document.getElementById('docaBuscaVeiculo').value = '';
  document.getElementById('docaPedidos').value = '';
  renderEscolhaVeiculo();

  const nomeDoca = (docasCadastro.find(d => d.id === docaId) || {}).nome || 'doca';
  await carregarPainelDocas();
  msg.textContent = `${c.placa} encostou na ${nomeDoca} — ${pedidos.length} pedido(s)`
    + `${meta ? `, ${meta} item(ns) a carregar` : ''}. O material já aparece chamado no Controle EXP.`;
  msg.className = 'status-msg status-ok';
});

document.getElementById('docasFilaBody').addEventListener('click', async (e) => {
  const btnPreparar = e.target.closest('.doca-preparar');
  const btnCancelar = e.target.closest('.doca-cancelar');
  const btnExcluir = e.target.closest('.doca-excluir');

  if (btnExcluir) {
    await excluirCarregamento(btnExcluir.dataset.id, btnExcluir.dataset.placa);
    return;
  }

  // Preencher o passo 2 com este veículo e levar o foco pros pedidos --
  // que é o único dado que ainda falta nesse momento.
  if (btnPreparar) {
    const c = docaCarregamentos.find(x => x.id === btnPreparar.dataset.id);
    if (!c) return;
    const busca = document.getElementById('docaBuscaVeiculo');
    busca.value = rotuloVeiculoPatio(c);
    renderEscolhaVeiculo();
    const campoPedidos = document.getElementById('docaPedidos');
    campoPedidos.focus();
    campoPedidos.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }

  if (btnCancelar) {
    if (!confirm('Cancelar este veículo? Ele sai da fila e fica no histórico como cancelado.')) return;
    const id = btnCancelar.dataset.id;
    const { error } = await sb.from('doca_carregamentos').update({ status: 'cancelado' }).eq('id', id);
    if (error) { alert('Não foi possível cancelar: ' + error.message); return; }
    await registrarEventoDoca(id, 'cancelou', null);
    await carregarPainelDocas();
  }
});

document.getElementById('docasQuadro').addEventListener('click', async (e) => {
  const btnIniciar = e.target.closest('.doca-iniciar');
  const btnFinalizar = e.target.closest('.doca-finalizar');
  const btnVoltar = e.target.closest('.doca-voltar-fila');
  const btnExcluir = e.target.closest('.doca-excluir');

  if (btnExcluir) {
    await excluirCarregamento(btnExcluir.dataset.id, btnExcluir.dataset.placa);
    return;
  }

  if (btnIniciar) {
    btnIniciar.disabled = true;
    const { error } = await sb.from('doca_carregamentos').update({
      status: 'carregando',
      inicio_em: new Date().toISOString(),
      conferente_inicio: nomeUsuarioAtual
    }).eq('id', btnIniciar.dataset.id);
    if (error) { alert('Não foi possível iniciar: ' + error.message); btnIniciar.disabled = false; return; }
    await registrarEventoDoca(btnIniciar.dataset.id, 'iniciou', null);
    await carregarPainelDocas();
    return;
  }

  if (btnFinalizar) {
    const id = btnFinalizar.dataset.id;
    const c = docaCarregamentos.find(x => x.id === id);
    const { feitos, meta } = progressoDoCarregamento(c || {});

    // Avisa antes de fechar quando sobrou item previsto -- descobrir a
    // falta depois que o caminhão saiu do pátio é o cenário caro.
    const faltando = (meta && meta > feitos) ? meta - feitos : 0;
    const pergunta = faltando
      ? `Ainda faltam ${faltando} item(ns) do previsto (${feitos} de ${meta} carregados).\n\nFinalizar assim mesmo?`
      : 'Finalizar o carregamento e liberar a doca?';
    if (!confirm(pergunta)) return;

    btnFinalizar.disabled = true;
    const { error } = await sb.from('doca_carregamentos').update({
      status: 'finalizado',
      fim_em: new Date().toISOString(),
      conferente_fim: nomeUsuarioAtual
    }).eq('id', id);
    if (error) { alert('Não foi possível finalizar: ' + error.message); btnFinalizar.disabled = false; return; }
    await registrarEventoDoca(id, 'finalizou', { itens_carregados: feitos, meta_itens: meta, faltando });
    await carregarPainelDocas();
    return;
  }

  if (btnVoltar) {
    if (!confirm('Tirar o veículo da doca? Ele volta pra fila do pátio.')) return;
    const { error } = await sb.from('doca_carregamentos')
      .update({ doca_id: null, chamado_em: null }).eq('id', btnVoltar.dataset.id);
    if (error) { alert('Não foi possível devolver pra fila: ' + error.message); return; }
    await registrarEventoDoca(btnVoltar.dataset.id, 'voltou_fila', null);
    await carregarPainelDocas();
  }
});

// Reabrir: fechou por engano. Limpa só o fim -- inicio_em é preservado,
// senão o tempo do carregamento recomeçaria do zero e o indicador
// mentiria a favor da operação.
document.getElementById('docasHojeBody').addEventListener('click', async (e) => {
  const btnExcluir = e.target.closest('.doca-excluir');
  if (btnExcluir) {
    await excluirCarregamento(btnExcluir.dataset.id, btnExcluir.dataset.placa);
    return;
  }

  const btn = e.target.closest('.doca-reabrir');
  if (!btn) return;
  if (!confirm('Reabrir este carregamento? A doca volta a ficar ocupada por ele.')) return;
  const { error } = await sb.from('doca_carregamentos').update({
    status: 'carregando', fim_em: null, conferente_fim: null
  }).eq('id', btn.dataset.id);
  if (error) { alert('Não foi possível reabrir: ' + error.message); return; }
  await registrarEventoDoca(btn.dataset.id, 'reabriu', null);
  await carregarPainelDocas();
});

document.getElementById('docasAtualizarBtn').addEventListener('click', () => carregarPainelDocas());
