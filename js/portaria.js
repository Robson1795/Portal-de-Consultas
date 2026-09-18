// Portal de Estoque Kingspan Isoeste — Portaria: visitas agendadas e recepção
//
// Da caixa de sugestões, trazida pelo Victor (18/09/2026): "funcionários que
// vão receber visita, cadastrar as informações das pessoas que virão, com
// nome, dcto, empresa, horario. Portaria recebe as informações e quando o
// visitante chega só formaliza e informa o funcionário".
//
// Tabela: portaria_visitas (sql/fase68-portaria-visitas.sql).
//
// ⚠️ A PEÇA QUE PARECIA DIFÍCIL JÁ EXISTIA. "informa o funcionário" é o
// mecanismo de notificação que o portal já tem desde 11/09/2026 (popup de
// canto + som + notificação do sistema, js/notificacoes.js). Esta tela não
// inventou canal nenhum: ela dispara um broadcast e o empilhador genérico
// desenha o cartão, igual ao aviso de preparo e ao de devolução.
//
// ⚠️ MAS O CANAL AQUI É POR PESSOA, e não por unidade como os outros dois.
// `alertas-visita-<id do anfitrião>`: cada um assina o próprio. Os avisos de
// preparo e de devolução são recados de SETOR -- quem os recebe é uma equipe
// inteira, e filtrar no cliente não esconde nada de ninguém que já não
// pudesse ver. Aqui não: um broadcast por unidade entregaria nome, documento
// e empresa do visitante a TODO mundo com o portal aberto naquela fábrica,
// e só o cliente é que decidiria não desenhar o cartão. O dado continuaria
// tendo passado pela máquina de quem não é o anfitrião. Canal por pessoa
// custa o mesmo e não vaza.
//
// Três abas, dois públicos:
//   Minhas visitas -> todo perfil: agenda quem vem, acompanha e cancela
//   Recepção       -> só `portaria` e `admin`: formaliza chegada e saída
//   Histórico      -> o que já encerrou
//
// A SAÍDA não estava no pedido e entrou de propósito: sem ela a tela responde
// "quem era esperado hoje", mas não "quem está dentro da fábrica agora" --
// a única lista que importa numa emergência.

let portariaVisitas = [];
let portariaAbaAtual = 'minhas';
let portariaCancelarPendente = null;   // id aguardando o 2º clique de confirmação

// A Recepção é o lado da portaria: ver visita de todo mundo e carimbar
// chegada/saída. Quem não é portaria nem admin só enxerga o que agendou --
// e o RLS recusaria o resto de qualquer forma (fase68).
function podeVerRecepcao() {
  return perfilAtual === 'portaria' || perfilAtual === 'admin';
}

// ---- Leitura ---------------------------------------------------------------
//
// ⚠️ DUAS consultas, e a segunda não é redundância. A primeira traz o período
// recente (é o que a operação olha); a segunda traz TODAS as que estão com
// visitante dentro da fábrica, sem corte de data. Sem ela, um visitante que
// entrou e ninguém deu baixa sairia da lista quando envelhecesse além do
// limite -- e "quem está dentro agora" passaria a mentir justamente sobre o
// caso que mais importa, o visitante esquecido lá dentro.
async function carregarPortaria() {
  const msg = document.getElementById('portariaMsg');
  if (msg) { msg.textContent = ''; msg.className = 'status-msg'; }

  if (!unidadeAtual) { portariaVisitas = []; renderPortaria(); return; }

  const [recentes, presentes] = await Promise.all([
    sb.from('portaria_visitas').select('*')
      .eq('unidade', unidadeAtual)
      .order('previsto_em', { ascending: false })
      .limit(300),
    sb.from('portaria_visitas').select('*')
      .eq('unidade', unidadeAtual)
      .eq('status', 'presente')
  ]);

  const erro = recentes.error || presentes.error;
  if (erro) {
    if (msg) {
      msg.textContent = 'Não foi possível carregar: ' + erro.message
        + (/does not exist|relation|column|function/i.test(erro.message)
            ? ' — rode sql/fase68-portaria-visitas.sql no Supabase.' : '');
      msg.className = 'status-msg status-err';
    }
    portariaVisitas = [];
    renderPortaria();
    return;
  }

  const porId = new Map();
  (recentes.data || []).forEach(v => porId.set(v.id, v));
  (presentes.data || []).forEach(v => porId.set(v.id, v));
  portariaVisitas = [...porId.values()]
    .sort((a, b) => new Date(b.previsto_em) - new Date(a.previsto_em));

  renderPortaria();
}

// ---- Formato ---------------------------------------------------------------
function dataHoraVisita(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function horaVisita(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function ehHoje(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const hoje = new Date();
  return d.getFullYear() === hoje.getFullYear()
      && d.getMonth() === hoje.getMonth()
      && d.getDate() === hoje.getDate();
}

// Reaproveita as classes `.cfg-status` que já existem (mesma decisão da tela
// de Devolução): zero CSS novo, e as cores já significam a mesma coisa no
// resto do portal.
const STATUS_VISITA = {
  prevista:  { rotulo: 'Prevista',  classe: 'st-pendente' },
  presente:  { rotulo: 'Na fábrica', classe: 'st-ativo' },
  encerrada: { rotulo: 'Encerrada', classe: 'st-pendente' },
  cancelada: { rotulo: 'Cancelada', classe: 'st-atrasado' }
};

function selo(status) {
  const s = STATUS_VISITA[status] || { rotulo: status || '—', classe: 'st-pendente' };
  return `<span class="cfg-status ${s.classe}">${escapeHtml(s.rotulo)}</span>`;
}

// Visita atrasada é a que passou do horário e ninguém chegou. Não é erro --
// visitante atrasa --, mas é o que a portaria precisa enxergar sem procurar.
function visitaAtrasada(v) {
  return v.status === 'prevista' && new Date(v.previsto_em) < new Date();
}

// ---- Render ----------------------------------------------------------------
function renderPortaria() {
  document.getElementById('portariaAbaRecepcaoBtn').style.display =
    podeVerRecepcao() ? '' : 'none';

  renderMinhasVisitas();
  if (podeVerRecepcao()) renderRecepcao();
  renderHistoricoVisitas();
  atualizarContadoresPortaria();
}

function atualizarContadoresPortaria() {
  const dentro = portariaVisitas.filter(v => v.status === 'presente');
  const hoje = portariaVisitas.filter(v => v.status === 'prevista' && ehHoje(v.previsto_em));

  const elDentro = document.getElementById('portariaDentro');
  const elHoje = document.getElementById('portariaHoje');
  if (elDentro) elDentro.textContent = dentro.length;
  if (elHoje) elHoje.textContent = hoje.length;

  // A aba Recepção mostra no próprio botão quantos estão dentro -- mesmo
  // padrão do contador de Pendências/Painel do Separador: não obriga a
  // entrar na aba pra saber se tem algo lá.
  const btn = document.getElementById('portariaAbaRecepcaoBtn');
  if (btn) btn.textContent = dentro.length ? `Recepção (${dentro.length} na fábrica)` : 'Recepção';
}

function renderMinhasVisitas() {
  const corpo = document.getElementById('portariaMinhasBody');
  const vazio = document.getElementById('portariaMinhasVazio');
  if (!corpo) return;

  // Só as minhas, e sem as já encerradas -- essas moram no Histórico.
  const minhas = portariaVisitas
    .filter(v => v.anfitriao_id === userIdAtual)
    .filter(v => v.status === 'prevista' || v.status === 'presente')
    .sort((a, b) => new Date(a.previsto_em) - new Date(b.previsto_em));

  vazio.style.display = minhas.length ? 'none' : 'block';
  corpo.innerHTML = minhas.map(v => {
    const cancelando = portariaCancelarPendente === v.id;
    return `<tr${visitaAtrasada(v) ? ' class="visita-atrasada"' : ''}>
      <td>${escapeHtml(dataHoraVisita(v.previsto_em))}</td>
      <td><b>${escapeHtml(v.visitante_nome || '')}</b></td>
      <td>${escapeHtml(v.visitante_empresa || '—')}</td>
      <td>${selo(v.status)}${visitaAtrasada(v) ? ' <span class="visita-aviso">passou do horário</span>' : ''}</td>
      <td>${v.chegada_em ? escapeHtml(horaVisita(v.chegada_em)) : '—'}</td>
      <td>${v.status === 'prevista'
            ? `<button class="btn btn-mini${cancelando ? ' btn-primary' : ''}" data-cancelar="${v.id}">${
                 cancelando ? '⚠️ Confirmar' : 'Cancelar'}</button>`
            : ''}</td>
    </tr>`;
  }).join('');
}

function renderRecepcao() {
  const corpo = document.getElementById('portariaRecepcaoBody');
  const vazio = document.getElementById('portariaRecepcaoVazio');
  if (!corpo) return;

  const busca = (document.getElementById('portariaBusca').value || '').trim().toLowerCase();
  const soHoje = document.getElementById('portariaSoHoje').checked;

  // A ordem é a da ação: quem está dentro primeiro (é quem ainda tem uma
  // saída pendente), depois os previstos por horário. Ordem alfabética
  // esconderia o que precisa de atenção -- mesma decisão da lista de
  // reservas e da aba Conferir.
  const lista = portariaVisitas
    .filter(v => v.status === 'prevista' || v.status === 'presente')
    .filter(v => !soHoje || ehHoje(v.previsto_em) || v.status === 'presente')
    .filter(v => !busca
      || (v.visitante_nome || '').toLowerCase().includes(busca)
      || (v.visitante_empresa || '').toLowerCase().includes(busca)
      || (v.visitante_documento || '').toLowerCase().includes(busca)
      || (v.anfitriao_nome || '').toLowerCase().includes(busca))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'presente' ? -1 : 1;
      return new Date(a.previsto_em) - new Date(b.previsto_em);
    });

  vazio.style.display = lista.length ? 'none' : 'block';
  vazio.textContent = busca || soHoje
    ? 'Nenhuma visita bate com o filtro.'
    : 'Nenhuma visita prevista nem em andamento.';

  corpo.innerHTML = lista.map(v => `<tr${visitaAtrasada(v) ? ' class="visita-atrasada"' : ''}>
    <td>${escapeHtml(dataHoraVisita(v.previsto_em))}</td>
    <td><b>${escapeHtml(v.visitante_nome || '')}</b>${
      visitaAtrasada(v) ? '<br><span class="visita-aviso">passou do horário</span>' : ''}</td>
    <td>${escapeHtml(v.visitante_documento || '—')}</td>
    <td>${escapeHtml(v.visitante_empresa || '—')}</td>
    <td>${escapeHtml(v.anfitriao_nome || '—')}</td>
    <td>${selo(v.status)}</td>
    <td><input type="text" class="visita-campo" data-cracha="${v.id}"
               value="${escapeHtml(v.cracha || '')}" placeholder="crachá" size="7"></td>
    <td><input type="text" class="visita-campo" data-placa="${v.id}"
               value="${escapeHtml(v.visitante_placa || '')}" placeholder="placa" size="8"></td>
    <td>${v.status === 'prevista'
          ? `<button class="btn btn-mini btn-primary" data-chegou="${v.id}">✓ Chegou</button>`
          : `<button class="btn btn-mini" data-saiu="${v.id}">↩ Registrar saída</button>
             <div class="visita-detalhe">entrou ${escapeHtml(horaVisita(v.chegada_em))}</div>`}</td>
  </tr>`).join('');
}

function renderHistoricoVisitas() {
  const corpo = document.getElementById('portariaHistBody');
  const vazio = document.getElementById('portariaHistVazio');
  if (!corpo) return;

  const busca = (document.getElementById('portariaHistBusca').value || '').trim().toLowerCase();

  const lista = portariaVisitas
    .filter(v => v.status === 'encerrada' || v.status === 'cancelada')
    // Quem não é portaria nem admin só vê o próprio histórico -- o RLS já
    // recorta, isto é só para a tela não prometer o que o banco não entrega.
    .filter(v => podeVerRecepcao() || v.anfitriao_id === userIdAtual)
    .filter(v => !busca
      || (v.visitante_nome || '').toLowerCase().includes(busca)
      || (v.visitante_empresa || '').toLowerCase().includes(busca)
      || (v.anfitriao_nome || '').toLowerCase().includes(busca))
    .slice(0, 200);

  vazio.style.display = lista.length ? 'none' : 'block';
  corpo.innerHTML = lista.map(v => `<tr>
    <td>${escapeHtml(dataHoraVisita(v.previsto_em))}</td>
    <td>${escapeHtml(v.visitante_nome || '')}</td>
    <td>${escapeHtml(v.visitante_empresa || '—')}</td>
    <td>${escapeHtml(v.anfitriao_nome || '—')}</td>
    <td>${selo(v.status)}</td>
    <td>${v.chegada_em ? escapeHtml(horaVisita(v.chegada_em)) : '—'}</td>
    <td>${v.saida_em ? escapeHtml(horaVisita(v.saida_em)) : '—'}</td>
    <td>${escapeHtml(v.chegada_por || '—')}</td>
  </tr>`).join('');
}

// ---- Abas ------------------------------------------------------------------
function trocarAbaPortaria(aba) {
  if (aba === 'recepcao' && !podeVerRecepcao()) aba = 'minhas';
  portariaAbaAtual = aba;
  document.querySelectorAll('#portariaAbas [data-portaria-aba]').forEach(b => {
    b.className = b.dataset.portariaAba === aba ? 'btn btn-primary' : 'btn';
  });
  document.getElementById('portariaMinhas').style.display   = aba === 'minhas' ? 'block' : 'none';
  document.getElementById('portariaRecepcao').style.display = aba === 'recepcao' ? 'block' : 'none';
  document.getElementById('portariaHistorico').style.display = aba === 'historico' ? 'block' : 'none';
}

document.getElementById('portariaAbas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-portaria-aba]');
  if (b) trocarAbaPortaria(b.dataset.portariaAba);
});

// ---- Agendar ---------------------------------------------------------------
document.getElementById('portariaAgendarBtn').addEventListener('click', async () => {
  const msg = document.getElementById('portariaAgendarMsg');
  const nome = document.getElementById('portariaVisitanteNome').value.trim();
  const quando = document.getElementById('portariaPrevistoEm').value;

  // As duas únicas obrigatórias, e por motivos diferentes: sem NOME não há
  // quem anunciar na portaria; sem HORÁRIO a visita não entra na lista do
  // dia e o porteiro volta a descobrir o visitante quando ele chega -- que é
  // exatamente o que esta tela existe para acabar. O resto é opcional de
  // propósito: exigir documento de antemão faria o funcionário deixar de
  // cadastrar, e meia informação na hora certa vale mais que nenhuma.
  if (!nome) {
    msg.textContent = 'Informe ao menos o nome de quem vem.';
    msg.className = 'status-msg status-err';
    return;
  }
  if (!quando) {
    msg.textContent = 'Informe a data e a hora previstas.';
    msg.className = 'status-msg status-err';
    return;
  }

  const linha = {
    unidade: unidadeAtual,
    visitante_nome: nome,
    visitante_documento: document.getElementById('portariaVisitanteDoc').value.trim() || null,
    visitante_empresa: document.getElementById('portariaVisitanteEmpresa').value.trim() || null,
    visitante_placa: (document.getElementById('portariaVisitantePlaca').value.trim() || '').toUpperCase() || null,
    previsto_em: new Date(quando).toISOString(),
    motivo: document.getElementById('portariaMotivo').value.trim() || null,
    anfitriao_id: userIdAtual,
    anfitriao_nome: nomeUsuarioAtual,
    status: 'prevista'
  };

  // `.select()` como recibo: sem ele um insert barrado pelo RLS volta com
  // `error null` e a tela diria "agendada" com o F5 desmentindo (item A1 da
  // AUDITORIA.md).
  const { data, error } = await sb.from('portaria_visitas').insert(linha).select('id');
  if (error || !data || !data.length) {
    msg.textContent = 'NÃO SALVOU: ' + (error ? error.message : 'nenhuma linha gravada — seu acesso pode não permitir.')
      + (error && /does not exist|relation|column/i.test(error.message)
          ? ' — rode sql/fase68-portaria-visitas.sql no Supabase.' : '');
    msg.className = 'status-msg status-err';
    return;
  }

  msg.textContent = `Visita de ${nome} agendada. A portaria já vê na lista.`;
  msg.className = 'status-msg status-ok';

  ['portariaVisitanteNome', 'portariaVisitanteDoc', 'portariaVisitanteEmpresa',
   'portariaVisitantePlaca', 'portariaMotivo'].forEach(id => {
    document.getElementById(id).value = '';
  });
  // A data/hora fica: quem cadastra três visitantes da mesma reunião não
  // redigita o horário três vezes -- mesma ideia do "Nº do pedido e
  // localização continuam preenchidos" do Controle EXP.
  await carregarPortaria();
});

// ---- Cancelar (2º clique confirma) -----------------------------------------
//
// Sem `confirm()`: com "impedir que esta página crie novos diálogos" marcado,
// o Chrome devolve `false` na hora e o clique vira botão quebrado (seção 7 do
// CLAUDE.md). O rótulo do próprio botão faz a confirmação.
document.getElementById('portariaMinhasBody').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cancelar]');
  if (!b) return;
  const id = b.dataset.cancelar;

  if (portariaCancelarPendente !== id) {
    portariaCancelarPendente = id;
    renderMinhasVisitas();
    return;
  }
  portariaCancelarPendente = null;

  const msg = document.getElementById('portariaMsg');
  const { data, error } = await sb.from('portaria_visitas')
    .update({ status: 'cancelada' })
    .eq('id', id).eq('status', 'prevista')
    .select('id');

  if (error || !data || !data.length) {
    msg.textContent = 'NÃO CANCELOU: ' + (error ? error.message : 'a visita já foi atendida ou seu acesso não permite.');
    msg.className = 'status-msg status-err';
  }
  await carregarPortaria();
});

// ---- Recepção: chegada e saída ---------------------------------------------
document.getElementById('portariaRecepcaoBody').addEventListener('click', async (e) => {
  const chegou = e.target.closest('[data-chegou]');
  const saiu = e.target.closest('[data-saiu]');
  if (!chegou && !saiu) return;

  const id = (chegou || saiu).dataset[chegou ? 'chegou' : 'saiu'];
  const visita = portariaVisitas.find(v => v.id === id);
  const msg = document.getElementById('portariaRecepcaoMsg');

  const campos = chegou
    ? { status: 'presente', chegada_em: new Date().toISOString(), chegada_por: nomeUsuarioAtual }
    : { status: 'encerrada', saida_em: new Date().toISOString(), saida_por: nomeUsuarioAtual };

  // `.eq('status', ...)` além do id: duas pessoas na portaria clicando quase
  // junto não carimbam a chegada duas vezes, e a segunda recebe o aviso em
  // vez de sobrescrever a hora da primeira.
  const { data, error } = await sb.from('portaria_visitas')
    .update(campos)
    .eq('id', id).eq('status', chegou ? 'prevista' : 'presente')
    .select('id');

  if (error || !data || !data.length) {
    msg.textContent = 'NÃO SALVOU: ' + (error ? error.message : 'outra pessoa já registrou isso — recarregue a lista.');
    msg.className = 'status-msg status-err';
    await carregarPortaria();
    return;
  }

  if (chegou && visita) {
    msg.textContent = `Chegada de ${visita.visitante_nome} registrada. ${visita.anfitriao_nome || 'O anfitrião'} foi avisado.`;
    msg.className = 'status-msg status-ok';
    dispararAlertaVisita(visita);
  } else {
    msg.textContent = 'Saída registrada.';
    msg.className = 'status-msg status-ok';
  }
  await carregarPortaria();
});

// Crachá e placa gravam ao sair do campo -- mesmo padrão do resto do portal.
// Ficam FORA do clique de "Chegou" de propósito: o visitante está na frente
// do porteiro, e o que não pode travar é o registro da chegada. Quem precisa
// anotar o crachá anota depois, com o visitante já liberado.
document.getElementById('portariaRecepcaoBody').addEventListener('focusout', async (e) => {
  const campo = e.target.closest('[data-cracha], [data-placa]');
  if (!campo) return;

  const id = campo.dataset.cracha || campo.dataset.placa;
  const ehCracha = !!campo.dataset.cracha;
  const visita = portariaVisitas.find(v => v.id === id);
  if (!visita) return;

  let valor = campo.value.trim();
  if (!ehCracha) valor = valor.toUpperCase();   // placa em maiúscula, como no Painel de Docas
  const atual = (ehCracha ? visita.cracha : visita.visitante_placa) || '';
  if (valor === atual) return;                  // não gera requisição à toa

  const { data, error } = await sb.from('portaria_visitas')
    .update(ehCracha ? { cracha: valor || null } : { visitante_placa: valor || null })
    .eq('id', id).select('id');

  if (error || !data || !data.length) {
    // Mesmo tratamento de marcarFalhaContagem() (js/estoque.js): campo
    // vermelho, motivo no tooltip, e o que a pessoa digitou PRESERVADO --
    // devolver o valor antigo obrigaria a redigitar só pra tentar de novo.
    campo.style.borderColor = 'var(--erro-borda)';
    campo.style.background = 'var(--erro-fundo)';
    campo.title = 'NÃO SALVOU: ' + (error ? error.message : 'seu acesso pode não permitir.');
    return;
  }
  campo.style.borderColor = '';
  campo.style.background = '';
  campo.title = '';
  if (ehCracha) visita.cracha = valor || null; else visita.visitante_placa = valor || null;
});

// ---- Aviso ao anfitrião ----------------------------------------------------
//
// Broadcast no canal DA PESSOA (ver o cabeçalho deste arquivo). Falhar aqui
// não desfaz a chegada: o carimbo já está no banco, e quem não recebeu o
// popup ainda vê a contagem ao abrir o portal (iniciarAvisoVisita()).
function dispararAlertaVisita(visita) {
  if (!visita || !visita.anfitriao_id) return;
  try {
    const canal = sb.channel(`alertas-visita-${visita.anfitriao_id}`);
    canal.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      canal.send({
        type: 'broadcast',
        event: 'visita_chegou',
        payload: {
          visitanteNome: visita.visitante_nome,
          visitanteEmpresa: visita.visitante_empresa,
          porteiro: nomeUsuarioAtual
        }
      }).then(() => sb.removeChannel(canal));
    });
  } catch (e) {
    console.warn('Portaria: não foi possível avisar o anfitrião ao vivo:', e);
  }
}

// ---- Filtros ---------------------------------------------------------------
document.getElementById('portariaBusca').addEventListener('input', renderRecepcao);
document.getElementById('portariaSoHoje').addEventListener('change', renderRecepcao);
document.getElementById('portariaHistBusca').addEventListener('input', renderHistoricoVisitas);
document.getElementById('portariaRecarregarBtn').addEventListener('click', carregarPortaria);
