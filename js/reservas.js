// Portal de Estoque Kingspan Isoeste — Reserva de bobinas de aço (Fase 38)
//
// O Victor (14/09/2026): *"O PCP frequentemente identifica um aço que está
// disponível no estoque e solicita que ele seja reservado para um pedido que
// ainda vai entrar. (...) O problema é que, depois de reservado, muitas vezes o
// PCP esquece daquele material."*
//
// A tela existe para transformar a reserva num processo RASTREÁVEL. Hoje ela é
// só física: muda-se a bobina de lugar e cola-se uma etiqueta. Ninguém sabe há
// quanto tempo ela está parada nem para qual pedido.
//
// ⚠️ NADA AQUI ESCREVE EM `bobinas_aco`. `substituir_bobinas()` apaga e repõe a
// planilha inteira da unidade a cada colagem (fase15), então marcar a bobina lá
// duraria até a próxima planilha do Datasul -- e, pior, deixaria a bobina sem o
// endereço real enquanto durasse. A reserva mora em `reservas_aco`, chaveada por
// unidade + item + lote (ver o cabeçalho do sql/fase38-reservas-aco.sql).
//
// Arquivo próprio, e não dentro de js/bobinas.js: aquele arquivo tem 345 linhas
// e trata de contagem; reserva é outro assunto, com tabela, tela e etiqueta
// próprias. O que fica em js/bobinas.js é só o gancho do indicador 🟠 na lista.

// ---- Quando uma reserva vira problema ------------------------------------
//
// Estes dois números são a resposta ao "PCP esquece do material". Ficam aqui, no
// topo e juntos, porque é o que se mexe quando a régua estiver errada -- e não
// espalhados por três lugares na hora de pintar a tabela.
//
// 3 e 7 dias não são chute: a reserva existe para um pedido "que ainda vai
// entrar", e um pedido que não entrou em uma semana quase sempre é um pedido que
// mudou. Se a régua de vocês for outra, é aqui.
const RESERVA_DIAS_ATENCAO = 3;
const RESERVA_DIAS_CRITICA = 7;

const NIVEIS_RESERVA = {
  normal:  { rotulo: 'Recente',  classe: 'st-ativo'    },
  atencao: { rotulo: 'Atenção',  classe: 'st-atencao'  },
  critica: { rotulo: 'Atrasada', classe: 'st-atrasado' }
};

let reservasAco = [];            // ativas + liberadas desta unidade
let reservaAbaAtual = 'acos';    // 'acos' | 'reservas' | 'historico'
let bobinaParaReservar = null;   // a bobina escolhida no modal
let reservaParaLiberar = null;
const filtrosReserva = { busca: '', nivel: '', responsavel: '' };

// ---- A chave, num lugar só ------------------------------------------------
//
// ⚠️ Normalizada dos DOIS lados (aqui e no que vem do banco). O projeto já
// perdeu uma tarde com `996613I` gravado minúsculo numa planilha e maiúsculo na
// outra (CLAUDE.md, seção 14). Aqui o sintoma seria pior que um número errado:
// a bobina ficaria reservada no banco e a lista continuaria mostrando ela como
// livre, então alguém a cortaria.
function chaveReservaAco(item, lote) {
  return normalizaCodigoItem(item) + '||' + String(lote == null ? '' : lote).trim().toUpperCase();
}

// Reservas ATIVAS desta unidade, por chave -- é o que a lista de aços consulta
// para decidir entre 🟢 e 🟠.
function mapaReservasAtivas() {
  const mapa = new Map();
  reservasAco.forEach(r => {
    if (r.liberado_em) return;
    mapa.set(chaveReservaAco(r.codigo_item, r.lote), r);
  });
  return mapa;
}

function reservaDaBobina(r) {
  return mapaReservasAtivas().get(chaveReservaAco(r.item, r.lote)) || null;
}

// ---- Tempo reservado ------------------------------------------------------
//
// Em horas enquanto for menos de um dia: "reservado há 0 dias" numa reserva da
// manhã pareceria que a tela não está contando.
function horasDesde(iso) {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

function tempoReservadoTexto(iso) {
  const h = horasDesde(iso);
  if (h < 1) return 'menos de 1 hora';
  if (h < 24) { const n = Math.floor(h); return n + (n === 1 ? ' hora' : ' horas'); }
  const d = Math.floor(h / 24);
  return d + (d === 1 ? ' dia' : ' dias');
}

function nivelReserva(iso) {
  const dias = horasDesde(iso) / 24;
  if (dias >= RESERVA_DIAS_CRITICA) return 'critica';
  if (dias >= RESERVA_DIAS_ATENCAO) return 'atencao';
  return 'normal';
}

// ---- Carga ----------------------------------------------------------------
//
// Traz ativas E liberadas da unidade numa consulta só: a aba Histórico é um
// FILTRO da mesma lista, não outra fonte -- reserva ativa e reserva encerrada
// são a mesma linha, com `liberado_em` nulo ou preenchido (mesmo desenho do
// `status` da Requisição ALM). Duas consultas dariam duas verdades sobre o
// mesmo fato.
async function carregarReservasAco() {
  if (!unidadeAtual) { reservasAco = []; return; }
  const { data, error } = await sb.from('reservas_aco')
    .select('*')
    .eq('unidade', unidadeAtual)
    .order('reservado_em', { ascending: false })
    .limit(1000);

  if (error) {
    // Silencioso na tela de aços e barulhento no console: a lista de bobinas
    // tem de continuar aparecendo mesmo que o fase38 ainda não tenha rodado --
    // sem isto, um script que falta derrubaria a tela inteira de contagem.
    console.warn('Não foi possível carregar as reservas de aço:', error.message);
    reservasAco = [];
    return;
  }
  reservasAco = data || [];
  // Redesenha a aba que estiver na frente: `loadBobinas()` chama esta função e
  // depois só `renderBobinas()`, então sem isto trocar de unidade com a aba
  // Reservas aberta deixaria na tela a lista da unidade anterior.
  if (reservaAbaAtual === 'reservas') renderReservas();
  if (reservaAbaAtual === 'historico') renderHistoricoReservas();
}

// ---- Abas -----------------------------------------------------------------
function trocarAbaAco(aba) {
  reservaAbaAtual = aba;
  document.querySelectorAll('#acoAbas [data-aco-aba]').forEach(b => {
    b.className = b.dataset.acoAba === aba ? 'btn btn-primary' : 'btn';
  });
  document.getElementById('acoListaAba').style.display    = aba === 'acos' ? 'block' : 'none';
  document.getElementById('acoReservasAba').style.display = aba === 'reservas' ? 'block' : 'none';
  document.getElementById('acoHistoricoAba').style.display = aba === 'historico' ? 'block' : 'none';
  if (aba === 'reservas') renderReservas();
  if (aba === 'historico') renderHistoricoReservas();
}

// ---- Criar a reserva ------------------------------------------------------
function abrirModalReserva(item, lote) {
  const bobina = bobinasData.find(b =>
    chaveReservaAco(b.item, b.lote) === chaveReservaAco(item, lote));
  if (!bobina) return;

  // Trava na tela, além da do banco: a mensagem aqui explica PARA QUAL pedido
  // ela já está, que é o que a pessoa precisa saber para decidir. O índice
  // parcial do fase38 é o que garante de verdade (duas pessoas com o portal
  // aberto passariam as duas por esta checagem).
  const jaReservada = reservaDaBobina(bobina);
  if (jaReservada) {
    // ⚠️ Sem `alert()`: a mesma opção do Chrome que faz `confirm()` devolver
    // `false` em silêncio (CLAUDE.md, seção 7) também engole o alert -- o
    // clique não abriria nada e pareceria botão quebrado. A notificação de
    // canto (js/notificacoes.js) já existe, não some sozinha, e ainda leva o
    // atalho para a reserva que está no caminho.
    mostrarNotificacao({
      icone: '🟠',
      titulo: 'Este aço já está reservado',
      texto: 'Pedido <b>' + escapeHtml(jaReservada.pedido) + '</b>, por '
        + escapeHtml(jaReservada.reservado_por || '—') + ', há '
        + escapeHtml(tempoReservadoTexto(jaReservada.reservado_em))
        + '. Para usá-lo em outro pedido, libere a reserva atual.',
      acaoRotulo: 'Ver na aba Reservas',
      aoClicarAcao: () => verReservaDoPedido(jaReservada.pedido),
      chave: 'reserva-ativa:' + jaReservada.id
    });
    return;
  }

  bobinaParaReservar = bobina;
  document.getElementById('reservaResumo').innerHTML = `
    <div><b>Aço:</b> ${escapeHtml(bobina.item)}</div>
    <div><b>Descrição:</b> ${escapeHtml(bobina.descricao || '—')}</div>
    <div><b>Lote:</b> ${escapeHtml(bobina.lote || '—')}</div>
    <div><b>Peso / Qtd:</b> ${escapeHtml(String(bobina.qtd_liquida ?? '—'))} ${escapeHtml(bobina.um || '')}</div>
    <div><b>Localização atual:</b> ${escapeHtml(bobina.localizacao || '—')}</div>`;
  document.getElementById('reservaPedido').value = '';
  document.getElementById('reservaObs').value = '';
  document.getElementById('reservaMsg').textContent = '';
  document.getElementById('reservaMsg').className = 'status-msg';
  document.getElementById('reservaModal').classList.add('open');
  document.getElementById('reservaPedido').focus();
}

function fecharModalReserva() {
  document.getElementById('reservaModal').classList.remove('open');
  bobinaParaReservar = null;
}

async function salvarReserva() {
  const pedido = document.getElementById('reservaPedido').value.trim();
  const msg = document.getElementById('reservaMsg');
  const botao = document.getElementById('reservaSalvarBtn');
  if (!bobinaParaReservar) return;

  // Pedido é obrigatório, e a razão não é burocrática: uma reserva sem pedido
  // é exatamente o material esquecido que esta tela existe para acabar.
  if (!pedido) {
    msg.textContent = 'Informe o pedido — é ele que diz para que a bobina está guardada.';
    msg.className = 'status-msg status-err';
    document.getElementById('reservaPedido').focus();
    return;
  }

  botao.disabled = true;
  msg.textContent = 'Reservando...';
  msg.className = 'status-msg';

  const b = bobinaParaReservar;
  const { data, error } = await sb.from('reservas_aco').insert({
    unidade: unidadeAtual,
    codigo_item: normalizaCodigoItem(b.item),
    lote: String(b.lote || '').trim().toUpperCase(),
    // Retrato da bobina: a planilha é trocada todo dia, e o histórico é lido
    // meses depois. Sem isto, a reserva de março mostraria o dado de hoje.
    descricao: b.descricao || null,
    dep: b.dep || null,
    localizacao_na_reserva: b.localizacao || null,
    um: b.um || null,
    quantidade: b.qtd_liquida ?? null,
    pedido,
    observacao: document.getElementById('reservaObs').value.trim() || null,
    reservado_por: nomeUsuarioAtual || emailUsuarioAtual || null
  }).select().single();   // recibo: sem ele, um insert barrado pelo RLS volta
                          // com error null e a tela diria "reservado" (item A1)

  botao.disabled = false;

  if (error) {
    // 23505 = o índice parcial "uma reserva ativa por bobina". Traduzir aqui
    // importa: a mensagem crua do Postgres não diz o que a pessoa deve fazer.
    msg.textContent = (error.code === '23505')
      ? 'Alguém reservou esta bobina agora há pouco. Recarregue a lista para ver para qual pedido.'
      : 'NÃO RESERVOU: ' + error.message
        + (/reservas_aco/.test(error.message) ? ' — se falar em tabela inexistente, sql/fase38-reservas-aco.sql ainda não foi rodado.' : '');
    msg.className = 'status-msg status-err';
    console.error('Falha ao reservar a bobina:', error.message);
    return;
  }

  reservasAco.unshift(data);
  fecharModalReserva();
  renderBobinas();      // a lista principal já mostra o 🟠 na hora
  renderReservas();
  // Imprimir logo depois de reservar é o fluxo real: a etiqueta vai na bobina
  // agora, não numa segunda visita à tela.
  imprimirEtiquetaReserva(data.id);
}

// ---- Liberar --------------------------------------------------------------
function abrirModalLiberar(id) {
  const r = reservasAco.find(x => x.id === id);
  if (!r) return;
  reservaParaLiberar = r;
  document.getElementById('liberarResumo').innerHTML = `
    <div><b>Aço:</b> ${escapeHtml(r.codigo_item)}${r.lote ? ' · lote ' + escapeHtml(r.lote) : ''}</div>
    <div><b>Pedido:</b> ${escapeHtml(r.pedido)}</div>
    <div><b>Reservado por:</b> ${escapeHtml(r.reservado_por || '—')}, há ${escapeHtml(tempoReservadoTexto(r.reservado_em))}</div>`;
  document.getElementById('liberarMotivo').value = '';
  document.getElementById('liberarMsg').textContent = '';
  document.getElementById('liberarMsg').className = 'status-msg';
  document.getElementById('liberarModal').classList.add('open');
}

function fecharModalLiberar() {
  document.getElementById('liberarModal').classList.remove('open');
  reservaParaLiberar = null;
}

async function confirmarLiberacao() {
  if (!reservaParaLiberar) return;
  const msg = document.getElementById('liberarMsg');
  const botao = document.getElementById('liberarConfirmarBtn');
  botao.disabled = true;
  msg.textContent = 'Liberando...';
  msg.className = 'status-msg';

  // ⚠️ UPDATE, nunca DELETE. O pedido era manter o histórico: qual aço, para
  // qual pedido, quem reservou, quando, quando foi liberado e por quem. Apagar
  // a linha jogaria fora exatamente a informação que a tela existe para dar.
  const { data, error } = await sb.from('reservas_aco')
    .update({
      liberado_em: new Date().toISOString(),
      liberado_por: nomeUsuarioAtual || emailUsuarioAtual || null,
      motivo_liberacao: document.getElementById('liberarMotivo').value.trim() || null
    })
    .eq('id', reservaParaLiberar.id)
    .is('liberado_em', null)   // não reescreve a data de quem já foi liberado
    .select('id');             // recibo (item A1): update barrado pelo RLS volta
                               // com error null e zero linha

  botao.disabled = false;

  if (error || !data || !data.length) {
    msg.textContent = error
      ? 'NÃO LIBEROU: ' + error.message
      : 'Nada foi liberado — ou a reserva já tinha sido liberada por outra pessoa, ou seu acesso não permite. Recarregue a lista.';
    msg.className = 'status-msg status-err';
    if (error) console.error('Falha ao liberar a reserva:', error.message);
    return;
  }

  await carregarReservasAco();
  fecharModalLiberar();
  renderBobinas();       // a bobina volta a 🟢 na lista principal
  renderReservas();
  renderHistoricoReservas();
}

// ---- A lista de reservas --------------------------------------------------
function reservasFiltradas(ativas) {
  const busca = filtrosReserva.busca.trim().toLowerCase();
  return reservasAco
    .filter(r => ativas ? !r.liberado_em : !!r.liberado_em)
    .filter(r => {
      if (filtrosReserva.nivel && nivelReserva(r.reservado_em) !== filtrosReserva.nivel) return false;
      if (filtrosReserva.responsavel && (r.reservado_por || '') !== filtrosReserva.responsavel) return false;
      if (busca
          && !String(r.codigo_item).toLowerCase().includes(busca)
          && !String(r.pedido).toLowerCase().includes(busca)
          && !String(r.lote || '').toLowerCase().includes(busca)
          && !String(r.descricao || '').toLowerCase().includes(busca)) return false;
      return true;
    });
}

function renderReservas() {
  const corpo = document.getElementById('reservasCorpo');
  if (!corpo) return;

  const ativas = reservasAco.filter(r => !r.liberado_em);
  const conta = n => ativas.filter(r => nivelReserva(r.reservado_em) === n).length;
  document.getElementById('res-total').textContent = ativas.length;
  document.getElementById('res-recentes').textContent = conta('normal');
  document.getElementById('res-atencao').textContent = conta('atencao');
  document.getElementById('res-atrasadas').textContent = conta('critica');

  // O select de responsável sai de quem realmente reservou, não de uma lista
  // escrita à mão: nome novo entraria no banco e ficaria fora do filtro.
  const sel = document.getElementById('resFiltroResponsavel');
  if (sel) {
    const nomes = [...new Set(ativas.map(r => r.reservado_por).filter(Boolean))].sort();
    const antes = sel.value;
    sel.innerHTML = '<option value="">Responsável: todos</option>'
      + nomes.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    sel.value = nomes.includes(antes) ? antes : '';
  }

  // Mais antiga primeiro: a tela existe para achar reserva esquecida, e a
  // esquecida é a de cima. Ordem alfabética esconderia justamente o problema.
  const lista = reservasFiltradas(true)
    .sort((a, b) => new Date(a.reservado_em) - new Date(b.reservado_em));

  document.getElementById('resContagem').textContent = lista.length === ativas.length
    ? `${ativas.length} reserva(s) ativa(s)`
    : `Mostrando ${lista.length} de ${ativas.length}`;

  const vazio = document.getElementById('reservasVazio');
  vazio.style.display = lista.length ? 'none' : 'block';
  vazio.textContent = ativas.length
    ? 'Nenhuma reserva bate com o filtro.'
    : 'Nenhum aço reservado nesta unidade. Reserve pela aba Aços, no botão 🔒 da linha.';

  corpo.innerHTML = lista.map(r => {
    const n = nivelReserva(r.reservado_em);
    const nv = NIVEIS_RESERVA[n];
    return `
    <tr${n === 'critica' ? ' style="background:var(--erro-fundo);"' : ''}>
      <td><span class="cfg-status ${nv.classe}">${nv.rotulo}</span></td>
      <td class="item">${escapeHtml(r.codigo_item)}</td>
      <td>${escapeHtml(r.descricao || '—')}</td>
      <td class="loc">${escapeHtml(r.lote || '—')}</td>
      <td class="num">${escapeHtml(String(r.quantidade ?? '—'))} ${escapeHtml(r.um || '')}</td>
      <td class="loc">${escapeHtml(r.localizacao_na_reserva || '—')}</td>
      <td><b>${escapeHtml(r.pedido)}</b></td>
      <td>${escapeHtml(r.reservado_por || '—')}</td>
      <td class="loc">${escapeHtml(formatarDataHoraBR(r.reservado_em))}</td>
      <td class="loc"${n === 'normal' ? '' : ' style="font-weight:800;"'}>${escapeHtml(tempoReservadoTexto(r.reservado_em))}</td>
      <td class="col-acoes">
        <button class="acao-btn res-etiqueta" data-id="${escapeHtml(r.id)}" title="Imprimir a etiqueta desta reserva">🖨️</button>
        <button class="acao-btn res-liberar" data-id="${escapeHtml(r.id)}" title="Liberar a reserva e devolver a bobina ao estoque">🔓</button>
      </td>
    </tr>`;
  }).join('');
}

function renderHistoricoReservas() {
  const corpo = document.getElementById('histCorpo');
  if (!corpo) return;
  const busca = document.getElementById('histBusca').value.trim().toLowerCase();
  const lista = reservasAco
    .filter(r => !!r.liberado_em)
    .filter(r => !busca
      || String(r.codigo_item).toLowerCase().includes(busca)
      || String(r.pedido).toLowerCase().includes(busca)
      || String(r.lote || '').toLowerCase().includes(busca))
    .sort((a, b) => new Date(b.liberado_em) - new Date(a.liberado_em));

  const vazio = document.getElementById('histVazio');
  vazio.style.display = lista.length ? 'none' : 'block';
  vazio.textContent = busca
    ? 'Nenhuma reserva encerrada bate com a busca.'
    : 'Nenhuma reserva foi liberada ainda nesta unidade.';
  document.getElementById('histContagem').textContent = `${lista.length} reserva(s) encerrada(s)`;

  corpo.innerHTML = lista.map(r => `
    <tr>
      <td class="item">${escapeHtml(r.codigo_item)}</td>
      <td class="loc">${escapeHtml(r.lote || '—')}</td>
      <td>${escapeHtml(r.pedido)}</td>
      <td>${escapeHtml(r.reservado_por || '—')}</td>
      <td class="loc">${escapeHtml(formatarDataHoraBR(r.reservado_em))}</td>
      <td class="loc">${escapeHtml(formatarDataHoraBR(r.liberado_em))}</td>
      <td>${escapeHtml(r.liberado_por || '—')}</td>
      <td class="loc">${escapeHtml(tempoReservadoEntre(r.reservado_em, r.liberado_em))}</td>
      <td>${escapeHtml(r.motivo_liberacao || '—')}</td>
    </tr>`).join('');
}

// Quanto tempo a reserva DUROU -- diferente de `tempoReservadoTexto()`, que
// conta até agora. No histórico, contar até agora daria um número que cresce
// sozinho numa reserva que já acabou.
function tempoReservadoEntre(inicio, fim) {
  if (!inicio || !fim) return '—';
  const h = (new Date(fim) - new Date(inicio)) / 36e5;
  if (h < 1) return 'menos de 1 hora';
  if (h < 24) { const n = Math.floor(h); return n + (n === 1 ? ' hora' : ' horas'); }
  const d = Math.floor(h / 24);
  return d + (d === 1 ? ' dia' : ' dias');
}

// ---- A etiqueta -----------------------------------------------------------
//
// Mesmo princípio das outras folhas do portal (Trading, Controle EXP): tamanhos
// em MILÍMETROS, não em px -- aqui o papel é a medida, e a etiqueta é lida de
// perto, na bobina, mas precisa ser identificável de longe na pilha.
//
// A palavra RESERVADO vem primeiro e maior que tudo: é ela que impede alguém de
// cortar a bobina. O pedido vem em segundo, porque é a pergunta seguinte ("de
// quem é?"). O resto é conferência de perto.
//
// ⚠️ SEM QR CODE, e é decisão, não esquecimento: não existe leitor no portal
// nem rota de link profundo que abra uma reserva a partir de um código. Um QR
// que ninguém escaneia é tinta gasta e uma promessa falsa na etiqueta. Se um
// dia a câmera do módulo de OCR virar leitor de reserva, o campo natural para
// codificar é o `id` desta linha.
// ⚠️ O QR é gerado ANTES de abrir a aba, e entra na folha como `data:` URL.
// A etiqueta é um documento à parte, que vai pra impressora e às vezes pra um
// computador sem internet -- pendurar um <script> de CDN lá dentro deixaria a
// folha depender da rede no pior momento possível. Aqui o desenho já vai pronto.
//
// Se o gerador não baixar, a etiqueta sai IGUAL, só sem o QR: a folha sempre
// funcionou sem ele, e deixar de imprimir por causa de um enfeite seria trocar
// um problema pequeno por um grande.
async function imprimirEtiquetaReserva(id) {
  const r = reservasAco.find(x => x.id === id);
  if (!r) return;

  let qrSrc = null;
  try {
    qrSrc = await qrDataURL(normalizaCodigoItem(r.codigo_item));
  } catch (e) {
    console.warn('Etiqueta de reserva: o QR não foi gerado, a folha sai sem ele.', e.message);
  }

  const aba = window.open('', '_blank');
  if (!aba) { alert('O navegador bloqueou a nova aba. Libere pop-ups pra este site e tente de novo.'); return; }
  aba.document.write(montarHtmlEtiquetaReserva(r, qrSrc));
  aba.document.close();
}

function montarHtmlEtiquetaReserva(r, qrSrc) {
  const linha = (rotulo, valor) => (valor !== null && valor !== undefined && String(valor).trim())
    ? `<div class="et-linha"><span class="et-rot">${rotulo}</span> ${escapeHtml(String(valor))}</div>` : '';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Reserva ${escapeHtml(r.codigo_item)} — pedido ${escapeHtml(r.pedido)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  /* color-scheme: light + preto no branco explicito. A aba da etiqueta abre no
     navegador de quem esta com o portal no tema ESCURO, e sem isto o navegador
     escurece a folha por conta propria: a etiqueta aparece preto no preto, e a
     pessoa so descobre se olhar a previa antes de mandar imprimir. Nao e o
     @media print do portal (CLAUDE.md, secao 16) -- esta folha e outro
     documento, sem os tokens de tema. */
  :root { color-scheme: light; }
  body { font-family: Arial, sans-serif; margin: 0; background: #fff; color: #000; }
  .etiqueta {
    border: 1.2mm solid #000; border-radius: 3mm; padding: 8mm 10mm;
    page-break-inside: avoid; break-inside: avoid;
  }
  /* RESERVADO em 26mm: e a unica coisa que precisa ser lida de longe, porque e
     ela que impede alguem de cortar a bobina. */
  /* O QR fica ao LADO do RESERVADO, não em cima nem embaixo: a palavra continua
     sendo o que se lê de longe, e o QR só precisa ser alcançável pela câmera de
     perto. 22mm lê bem num celular a um palmo, e não rouba altura da folha. */
  .et-cabeca { display: flex; align-items: center; gap: 6mm; }
  .et-titulo { font-size: 26mm; font-weight: 900; line-height: 1; letter-spacing: 0.04em; text-align: center; flex: 1; }
  .et-qr { width: 22mm; height: 22mm; flex: none; }
  .et-pedido {
    font-size: 16mm; font-weight: 900; line-height: 1.1; text-align: center;
    margin-top: 4mm; padding-top: 4mm; border-top: 0.6mm solid #000;
  }
  .et-pedido small { display: block; font-size: 4.5mm; font-weight: 700; letter-spacing: 0.1em; }
  .et-corpo { margin-top: 6mm; padding-top: 4mm; border-top: 0.4mm solid #666; }
  .et-item { font-size: 12mm; font-weight: 900; line-height: 1.1; }
  .et-desc { font-size: 6mm; font-weight: 700; margin-top: 1mm; }
  .et-linha { font-size: 4.5mm; margin-top: 2mm; }
  .et-rot { font-weight: 700; color: #444; }
  .et-rodape { margin-top: 6mm; padding-top: 3mm; border-top: 0.4mm solid #666; font-size: 4mm; color: #333; }
</style></head><body>
<div class="etiqueta">
  <div class="et-cabeca">
    <div class="et-titulo">RESERVADO</div>
    ${qrSrc ? `<img class="et-qr" src="${qrSrc}" alt="">` : ''}
  </div>
  <div class="et-pedido"><small>PEDIDO</small>${escapeHtml(r.pedido)}</div>
  <div class="et-corpo">
    <div class="et-item">${escapeHtml(r.codigo_item)}</div>
    <div class="et-desc">${escapeHtml(r.descricao || '')}</div>
    ${linha('Lote:', r.lote)}
    ${linha('Peso / Qtd:', (r.quantidade != null ? r.quantidade : '') + ' ' + (r.um || ''))}
    ${linha('Local na reserva:', r.localizacao_na_reserva)}
    ${linha('Observação:', r.observacao)}
  </div>
  <div class="et-rodape">
    Reservado por <b>${escapeHtml(r.reservado_por || '—')}</b>
    em ${escapeHtml(formatarDataHoraBR(r.reservado_em))}
    &middot; ${escapeHtml(rotuloUnidade(r.unidade))}
  </div>
</div>
<script>window.onload = () => window.print();<` + `/script>
</body></html>`;
}

// ---- Ligações da tela -----------------------------------------------------
document.querySelectorAll('#acoAbas [data-aco-aba]').forEach(b => {
  b.addEventListener('click', () => trocarAbaAco(b.dataset.acoAba));
});

document.getElementById('reservaSalvarBtn').addEventListener('click', salvarReserva);
document.getElementById('reservaCancelarBtn').addEventListener('click', fecharModalReserva);
document.getElementById('reservaCloseBtn').addEventListener('click', fecharModalReserva);
document.getElementById('reservaModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('reservaModal')) fecharModalReserva();
});
// Enter no campo do pedido confirma, igual ao resto do portal.
document.getElementById('reservaPedido').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('reservaSalvarBtn').click();
});

document.getElementById('liberarConfirmarBtn').addEventListener('click', confirmarLiberacao);
document.getElementById('liberarCancelarBtn').addEventListener('click', fecharModalLiberar);
document.getElementById('liberarCloseBtn').addEventListener('click', fecharModalLiberar);
document.getElementById('liberarModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('liberarModal')) fecharModalLiberar();
});

document.getElementById('reservasCorpo').addEventListener('click', (e) => {
  const et = e.target.closest('.res-etiqueta');
  if (et) { imprimirEtiquetaReserva(et.dataset.id); return; }
  const lib = e.target.closest('.res-liberar');
  if (lib) abrirModalLiberar(lib.dataset.id);
});

// Filtram ao digitar, sem botão de aplicar -- mesmo padrão do resto do portal.
document.getElementById('resBusca').addEventListener('input', (e) => {
  filtrosReserva.busca = e.target.value; renderReservas();
});
document.getElementById('resFiltroNivel').addEventListener('change', (e) => {
  filtrosReserva.nivel = e.target.value; renderReservas();
});
document.getElementById('resFiltroResponsavel').addEventListener('change', (e) => {
  filtrosReserva.responsavel = e.target.value; renderReservas();
});
document.getElementById('histBusca').addEventListener('input', renderHistoricoReservas);


// ---- A coluna Reserva da lista de aços ------------------------------------
//
// Os dois cliques moram aqui, e não em js/bobinas.js: é um listener a mais no
// mesmo `tbody` (não conflita com os de contagem), e assim o arquivo da
// contagem não passa a saber o que é uma reserva. O que ficou lá é só a
// célula, em `celulaReservaBobina()`.
document.getElementById('bobinasTableBody').addEventListener('click', (e) => {
  const reservar = e.target.closest('.bobina-reservar');
  if (reservar) { abrirModalReserva(reservar.dataset.item, reservar.dataset.lote); return; }
  // O 🟠 é clicável de propósito (pedido do Victor: "indicador clicável na
  // lista"): a pergunta logo depois de ver a marca é sempre "de qual pedido é,
  // e desde quando?", e a resposta inteira está na aba Reservas.
  const marca = e.target.closest('.reserva-marca');
  if (marca) verReservaDoPedido(marca.dataset.pedido);
});

function verReservaDoPedido(pedido) {
  filtrosReserva.busca = pedido || '';
  filtrosReserva.nivel = '';
  filtrosReserva.responsavel = '';
  document.getElementById('resBusca').value = filtrosReserva.busca;
  document.getElementById('resFiltroNivel').value = '';
  trocarAbaAco('reservas');
}


document.getElementById('resRecarregarBtn').addEventListener('click', async (e) => {
  const botao = e.currentTarget;
  botao.disabled = true;
  await carregarReservasAco();
  renderBobinas();   // a marca 🟠 da lista de aços vem da mesma carga
  renderReservas();
  botao.disabled = false;
});
