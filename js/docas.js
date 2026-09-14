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
  renderFilaDocas();
  renderCarregadosHoje();
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
        <span class="doca-placa">${escapeHtml(c.placa)}</span>
        <span class="doca-sub">${escapeHtml(c.tipo_veiculo || '—')}${c.transportadora ? ' · ' + escapeHtml(c.transportadora) : ''}</span>
        ${c.motorista ? `<span class="doca-sub">Motorista: ${escapeHtml(c.motorista)}</span>` : ''}
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
        </div>
      ` : `
        <div class="doca-livre">
          Encostado ${c.chamado_em ? 'há ' + duracaoHhMm(minutosEntre(c.chamado_em, null)) : ''} — ainda não começou.
        </div>
        <div class="doca-acoes">
          <button class="btn btn-primary doca-iniciar" data-id="${escapeHtml(c.id)}">▶ Iniciar carregamento</button>
          <button class="acao-btn doca-voltar-fila" data-id="${escapeHtml(c.id)}" title="Tirar da doca e devolver pra fila do pátio">↺</button>
        </div>
      `}
    </div>`;
  }).join('') + `</div>`;
}

function renderFilaDocas() {
  const corpo = document.getElementById('docasFilaBody');
  const vazio = document.getElementById('docasFilaVazio');
  const contagem = document.getElementById('docasFilaContagem');

  const fila = docaCarregamentos.filter(c => c.status === 'aguardando' && !c.doca_id);
  contagem.textContent = fila.length ? `${fila.length} veículo(s) esperando` : '';
  vazio.style.display = fila.length ? 'none' : 'block';
  if (!fila.length) { corpo.innerHTML = ''; return; }

  const opcoesDocas = docasCadastro
    .filter(d => !carregamentoDaDoca(d.id))
    .map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.nome)}</option>`).join('');

  corpo.innerHTML = fila.map(c => {
    const pedidos = pedidosDoCarregamento(c.id);
    const espera = duracaoHhMm(minutosEntre(c.chegada_em, null));
    return `
    <div class="doca-fila-linha">
      <span class="doca-placa">${escapeHtml(c.placa)}</span>
      <span class="doca-sub">${escapeHtml(c.tipo_veiculo || '—')}${c.transportadora ? ' · ' + escapeHtml(c.transportadora) : ''}</span>
      <span class="doca-pedidos">${pedidos.length ? escapeHtml(pedidos.join(' + ')) : '—'}</span>
      <span class="doca-sub">esperando ${espera}</span>
      ${opcoesDocas
        ? `<span class="doca-fila-acao">
             <select class="doca-destino" data-id="${escapeHtml(c.id)}">${opcoesDocas}</select>
             <button class="btn btn-primary doca-chamar" data-id="${escapeHtml(c.id)}">Chamar</button>
           </span>`
        : `<span class="doca-sub" style="color:var(--aviso-texto);">todas as docas ocupadas</span>`}
      <button class="acao-btn doca-cancelar" data-id="${escapeHtml(c.id)}" title="Cancelar — o veículo foi embora sem carregar">🗑</button>
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

  const nomeDoca = (id) => (docasCadastro.find(d => d.id === id) || {}).nome || '—';

  corpo.innerHTML = feitos.map(c => `
    <tr>
      <td class="item">${escapeHtml(c.placa)}</td>
      <td>${escapeHtml(c.tipo_veiculo || '—')}</td>
      <td>${escapeHtml(c.transportadora || '—')}</td>
      <td class="loc">${escapeHtml(pedidosDoCarregamento(c.id).join(' + ') || '—')}</td>
      <td class="loc">${escapeHtml(nomeDoca(c.doca_id))}</td>
      <td class="loc">${c.inicio_em ? escapeHtml(formatarDataHoraBR(c.inicio_em)) : '—'}</td>
      <td class="loc">${c.fim_em ? escapeHtml(formatarDataHoraBR(c.fim_em)) : '—'}</td>
      <td class="num" style="font-weight:700;">${duracaoHhMm(minutosEntre(c.inicio_em, c.fim_em))}</td>
      <td>${escapeHtml(c.conferente_fim || '—')}</td>
      <td class="col-acoes">
        <button class="acao-btn doca-reabrir" data-id="${escapeHtml(c.id)}"
                title="Reabrir — fechou por engano, volta a carregar">↺</button>
      </td>
    </tr>`).join('');
}

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

document.getElementById('docaChegadaBtn').addEventListener('click', async () => {
  const msg = document.getElementById('docasMsg');
  const btn = document.getElementById('docaChegadaBtn');
  const placa = document.getElementById('docaPlaca').value.trim().toUpperCase();

  if (!placa) {
    msg.textContent = 'Informe a placa do veículo.';
    msg.className = 'status-msg status-err';
    return;
  }

  // "KV876431, KV855935" ou "KV876431 KV855935" -- o conferente digita do
  // jeito que está no papel; separador não pode ser regra decorada.
  const pedidos = document.getElementById('docaPedidos').value
    .split(/[,;\s]+/).map(p => p.trim().toUpperCase()).filter(Boolean);

  btn.disabled = true;
  msg.textContent = 'Registrando chegada...';
  msg.className = 'status-msg';

  const meta = await calcularMetaItens(pedidos);

  const { data, error } = await sb.from('doca_carregamentos').insert({
    unidade: unidadeAtual,
    setor: typeof setorExpAtual !== 'undefined' ? setorExpAtual : 'exp',
    placa,
    motorista: document.getElementById('docaMotorista').value.trim() || null,
    transportadora: document.getElementById('docaTransportadora').value.trim() || null,
    tipo_veiculo: document.getElementById('docaTipoVeiculo').value,
    meta_itens: meta,
    criado_por: nomeUsuarioAtual
  }).select('id').single();

  btn.disabled = false;

  if (error) {
    msg.textContent = 'Não foi possível registrar: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  if (pedidos.length) {
    const { error: erroPedidos } = await sb.from('doca_carregamento_pedidos')
      .insert(pedidos.map(numero_pedido => ({ carregamento_id: data.id, numero_pedido })));
    if (erroPedidos) console.warn('Não foi possível vincular os pedidos:', erroPedidos.message);
  }
  await registrarEventoDoca(data.id, 'chegou', { placa, pedidos, meta_itens: meta });

  ['docaPlaca', 'docaMotorista', 'docaTransportadora', 'docaPedidos'].forEach(id => {
    document.getElementById(id).value = '';
  });
  // A confirmação vem DEPOIS de recarregar: carregarPainelDocas() limpa a
  // área de mensagem, então escrever antes fazia o aviso piscar e sumir --
  // e o conferente ficava sem saber se a chegada entrou ou não.
  await carregarPainelDocas();
  msg.textContent = `${placa} na fila do pátio${meta ? ` — ${meta} item(ns) previsto(s)` : ''}.`;
  msg.className = 'status-msg status-ok';
});

document.getElementById('docasFilaBody').addEventListener('click', async (e) => {
  const btnChamar = e.target.closest('.doca-chamar');
  const btnCancelar = e.target.closest('.doca-cancelar');

  if (btnChamar) {
    const id = btnChamar.dataset.id;
    const select = document.querySelector(`.doca-destino[data-id="${id}"]`);
    if (!select) return;
    btnChamar.disabled = true;
    const { error } = await sb.from('doca_carregamentos')
      .update({ doca_id: select.value, chamado_em: new Date().toISOString() }).eq('id', id);
    if (error) { alert('Não foi possível chamar: ' + error.message); btnChamar.disabled = false; return; }
    await registrarEventoDoca(id, 'chamou', { doca_id: select.value });
    await carregarPainelDocas();
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
