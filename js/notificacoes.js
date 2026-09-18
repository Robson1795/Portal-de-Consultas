// Portal de Estoque Kingspan Isoeste — notificações de canto, em tempo real
//
// O Victor (11/09/2026): *"o Robson implementou uma notificação que avisa
// quando alguém se cadastra e fica pendente de aprovação, mas ela só aparece na
// tela de configurações, o que não ajuda muito pois é meio redundante ali.
// Modifique esse comportamento, faça um sistema de notificação (...) tipo um
// popup no canto inferior direito em tempo real, que aparece em qualquer tela,
// mas somente para admin."*
//
// O aviso do Robson (10/09/2026) era um banner DENTRO da aba Configurações.
// Quem já estava ali não precisava dele — o card "Aguardando aprovação" e a
// própria lista já diziam a mesma coisa, e quem estava em qualquer outra tela
// não recebia nada. A notificação mudou de lugar: sai da tela e vai para o
// canto da janela, onde alcança quem está trabalhando em outra coisa.
//
// ⚠️ O CARD QUE PULSA CONTINUA EM CONFIGURAÇÕES, de propósito. Ele não é a
// notificação: é o estado da fila, e responde "ainda tem alguém esperando?"
// para quem chega na tela depois. É a rede que pega o que a notificação ao vivo
// não alcança.

// ---- O empilhador --------------------------------------------------------
//
// Genérico de propósito: a próxima notificação do portal (uma sugestão nova,
// uma divergência de inventário) entra por aqui em vez de nascer outro canto
// com outro estilo.
//
// ⚠️ NÃO some sozinha, e isso é decisão, não esquecimento. Um aviso de
// "fulano está esperando aprovação" é TAREFA, não recado: sumir em 5 segundos
// enquanto a pessoa olha para outro monitor é exatamente como uma aprovação
// fica esquecida por dois dias. Sai no X, ou no botão de ação.
const MAX_NOTIFICACOES = 4;

function caixaNotificacoes() {
  return document.getElementById('notificacoes');
}

// ---- Som + notificação do sistema (Chrome/Android), 15/09/2026 ------------
//
// O Robson: *"Consegue fazer com que o app envie aviso sonoro e notificação
// do chrome tanto no pc quanto no android"*. Funciona com o portal ABERTO
// numa aba (minimizada, ou noutra aba, PC ou Android) -- sem servidor
// novo, é só Web Notifications API + um bipe curto por Web Audio, os dois
// nativos do navegador. NÃO alcança navegador fechado nem celular
// bloqueado sem o Chrome aberto: isso é push de verdade (service worker +
// servidor de push), obra bem maior, fora do desenho deste projeto
// (sem backend, só Supabase+Vercel) -- avisado antes de começar.
let permissaoNotifPedida = false;

// Pedida uma vez só, proativamente, logo depois do login (iniciarAvisoCadastro
// e iniciarAvisoPreparo chamam) -- pedir só na hora do primeiro aviso de
// verdade deixaria a primeira notificação sem som, porque o navegador não
// resolve a pergunta a tempo.
async function garantirPermissaoNotificacao() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied' || permissaoNotifPedida) return false;
  permissaoNotifPedida = true;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch (e) {
    console.warn('Não foi possível pedir permissão de notificação:', e.message);
    return false;
  }
}

// Jingle de 3 notas por Web Audio -- sem arquivo de áudio pra hospedar/
// carregar. O Robson: "COLOQUE UM SOM CHAMATIVO TIPO DO IPHONE" -- um bipe
// só (versão anterior) passava despercebido no barulho do galpão; um
// arpejo curto (Lá5-Ré6-Sol6, tipo "campainha" de notificação de celular)
// chama mais atenção sem virar sirene. Cada nota é um AudioContext próprio
// porque um contexto já usado uma vez e parado (`stop()`) não toca de novo.
//
// `variante` distingue o aviso de ouvido sem precisar olhar a tela -- Robson,
// 17/09/2026, sobre o aviso de devolução ao almoxarifado: "pode colocar um
// sinal sonoro diferente pra esse esquema". 'devolucao' toca o MESMO trio ao
// contrário (Sol6-Ré6-Lá5, descendo) -- continua chamativo, mas dá pra
// diferenciar "chegou trabalho novo" (sobe) de "algo precisa voltar" (desce)
// sem olhar o canto da tela.
function tocarSomAviso(variante) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notas = variante === 'devolucao'
      ? [1567.98, 1174.66, 880]   // Sol6, Ré6, Lá5 -- descendo
      : [880, 1174.66, 1567.98];  // Lá5, Ré6, Sol6 -- soa "alerta", não "erro"
    const duracaoNota = 0.22;
    const intervaloNota = 0.13; // sobreposição leve: soa "campainha", não staccato
    notas.forEach((freq, i) => {
      const inicio = ctx.currentTime + i * intervaloNota;
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Sobe e desce o volume em vez de ligar/desligar seco -- toc-toc
      // limpo, sem o estalo de clique que um degrau abrupto de volume causa.
      ganho.gain.setValueAtTime(0.0001, inicio);
      ganho.gain.exponentialRampToValueAtTime(0.28, inicio + 0.01);
      ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracaoNota);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + duracaoNota + 0.02);
    });
    const duracaoTotal = (notas.length - 1) * intervaloNota + duracaoNota + 0.05;
    setTimeout(() => ctx.close(), duracaoTotal * 1000);
  } catch (e) {
    console.warn('Não foi possível tocar o aviso sonoro:', e.message);
  }
}

// Tira as tags simples que `texto` costuma trazer (<b>, <br>) -- a notificação
// do sistema é texto puro, não HTML.
function textoPlano(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, ' — ').replace(/<[^>]+>/g, '').trim();
}

// Só quando a aba NÃO está em primeiro plano: quem já está olhando o popup
// no canto não precisa de um segundo aviso empilhado em cima pelo sistema
// operacional -- mesmo padrão do Slack e da maioria dos apps de chat.
function notificarSistema({ titulo, texto, chave }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const n = new Notification(titulo || 'Portal de Estoque', {
      body: textoPlano(texto), icon: 'logo.png', tag: chave || undefined
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {
    console.warn('Não foi possível mostrar a notificação do sistema:', e.message);
  }
}

function mostrarNotificacao({ icone, titulo, texto, acaoRotulo, aoClicarAcao, chave, som }) {
  const caixa = caixaNotificacoes();
  if (!caixa) return null;

  // `chave` evita duplicata: o mesmo cadastro chegando pelo aviso ao vivo e
  // pela conferência de quem entrou depois viraria dois cartões iguais.
  // Duplicata não tem por que tocar som nem reabrir a notificação do
  // sistema de novo -- por isso o `return` sai ANTES do aviso sonoro/SO.
  if (chave) {
    const jaTem = caixa.querySelector(`[data-chave="${CSS.escape(chave)}"]`);
    if (jaTem) return jaTem;
  }

  const cartao = document.createElement('div');
  cartao.className = 'notif';
  if (chave) cartao.dataset.chave = chave;
  cartao.innerHTML = `
    <div class="notif-topo">
      <span class="notif-icone">${icone || '🔔'}</span>
      <span class="notif-titulo">${escapeHtml(titulo || '')}</span>
      <button type="button" class="notif-fechar" aria-label="Dispensar">✕</button>
    </div>
    <div class="notif-texto">${texto || ''}</div>
    ${acaoRotulo ? `<button type="button" class="notif-acao">${escapeHtml(acaoRotulo)}</button>` : ''}`;

  cartao.querySelector('.notif-fechar').addEventListener('click', () => cartao.remove());
  const botaoAcao = cartao.querySelector('.notif-acao');
  if (botaoAcao) {
    botaoAcao.addEventListener('click', () => {
      cartao.remove();
      if (aoClicarAcao) aoClicarAcao();
    });
  }

  // Mais nova em cima: a de baixo é a mais antiga, e é ela que sai quando
  // estoura o teto.
  caixa.prepend(cartao);
  while (caixa.children.length > MAX_NOTIFICACOES) caixa.lastElementChild.remove();

  tocarSomAviso(som);
  notificarSistema({ titulo, texto, chave });

  return cartao;
}

// ---- Cadastro pendente ---------------------------------------------------
//
// ⚠️ SÓ PARA `admin`, e o recorte é conferido NA HORA de notificar, não só na
// hora de assinar: o perfil pode mudar no meio da sessão (um super admin
// tirando o admin de alguém), e quem deixou de ser admin não pode continuar
// recebendo nome e e-mail de quem se cadastrou.
//
// Antes o aviso era só para super admin ("eu e o Victor", o Robson). Agora é
// todo `admin`, porque é o admin quem aprova (seção 5) — notificar quem não
// pode aprovar não resolve nada, e não notificar quem pode deixa a fila parada.
function podeVerAvisoCadastro() {
  return perfilAtual === 'admin';
}

function irParaCadastros() {
  if (typeof mostrarPagina === 'function') mostrarPagina('config');
}

function notificarCadastro({ nome, email, unidade }) {
  const quem = nome || email || 'Alguém';
  const detalhe = [
    nome && email ? escapeHtml(email) : '',
    unidade ? escapeHtml(rotuloUnidade(unidade)) : ''
  ].filter(Boolean).join(' · ');

  mostrarNotificacao({
    icone: '🔔',
    titulo: 'Novo cadastro aguardando aprovação',
    texto: `<b>${escapeHtml(quem)}</b> pediu acesso ao portal.`
      + (detalhe ? `<br><span class="notif-detalhe">${detalhe}</span>` : ''),
    acaoRotulo: 'Ver cadastros',
    aoClicarAcao: irParaCadastros,
    // O e-mail é único por conta, então é a chave natural contra duplicata.
    chave: 'cadastro:' + (email || quem)
  });
}

// Quantos estão na fila AGORA. Serve para quem entrou no portal depois de o
// cadastro acontecer -- ver iniciarAvisoCadastro().
async function contarCadastrosPendentes() {
  const { count, error } = await sb.from('usuarios_permitidos')
    .select('user_id', { count: 'exact', head: true })
    .eq('aprovado', false);
  if (error) {
    // Silencioso de propósito: é um aviso de cortesia, não uma tela que a
    // pessoa pediu. Falhar aqui não pode virar mensagem de erro no meio do
    // trabalho dela -- e o card em Configurações continua contando.
    console.warn('Não foi possível contar os cadastros pendentes:', error.message);
    return 0;
  }
  return count || 0;
}

// Chamado por js/auth.js depois de montarMenu() -- antes disso `perfilAtual`
// ainda não vale, e notificar pelo perfil errado é o defeito que este recorte
// existe para evitar.
async function iniciarAvisoCadastro() {
  if (!podeVerAvisoCadastro()) return;

  // Pedida aqui e não só na hora do primeiro aviso: pedir permissão é
  // assíncrono, e a pessoa pode demorar pra responder -- se só perguntasse
  // na hora H, aquele primeiro aviso sairia sem som/notificação mesmo que
  // ela aceite. Não bloqueia o resto (sem `await`).
  garantirPermissaoNotificacao();

  // --- 1) o que JÁ está esperando ---
  //
  // ⚠️ Sem isto a notificação só funcionaria para quem estivesse com o portal
  // aberto no instante exato do cadastro. O aviso ao vivo é broadcast (ver
  // abaixo): quem estava offline nunca recebe aquele evento, e a fila ficaria
  // parada sem ninguém saber -- que é justamente o problema que a notificação
  // deveria resolver.
  const pendentes = await contarCadastrosPendentes();
  if (pendentes > 0) {
    mostrarNotificacao({
      icone: '⏳',
      titulo: pendentes === 1 ? '1 cadastro aguardando aprovação'
                              : `${pendentes} cadastros aguardando aprovação`,
      texto: 'Ninguém entra no portal antes de ser aprovado.',
      acaoRotulo: 'Ver cadastros',
      aoClicarAcao: irParaCadastros,
      // Chave fixa: entrar de novo na mesma aba não empilha um segundo resumo.
      chave: 'cadastros-pendentes'
    });
  }

  // --- 2) o que chegar daqui pra frente ---
  //
  // Broadcast, e não `postgres_changes` em `usuarios_permitidos` -- decisão do
  // Robson que continua valendo: broadcast não exige ligar o Realtime na tabela
  // (sem `ALTER PUBLICATION`, sem mexer em replica identity -- ver o histórico
  // do fase23 sobre como isso dá errado). Quem dispara é
  // `dispararAlertaCadastro()` em js/auth.js, logo depois do INSERT de verdade.
  //
  // O preço do broadcast é não alcançar quem está offline, e é exatamente esse
  // buraco que o passo 1 tapa.
  sb.channel('alertas-cadastro')
    .on('broadcast', { event: 'novo_cadastro' }, (msg) => {
      if (!podeVerAvisoCadastro()) return;
      notificarCadastro(msg.payload || {});
      // A lista da aba Configurações já estava aberta atrás? Atualiza ela
      // também, pra pessoa não precisar lembrar de clicar em "Recarregar".
      if (typeof carregarUsuarios === 'function' && paginaAtual === 'config') carregarUsuarios();
    })
    .subscribe();
}

// ---- Pedido avisado pra preparar (15/09/2026) -----------------------------
//
// Mesmo desenho de cima, ponta a ponta: conta quem já está esperando (pra
// alcançar quem chegou depois do aviso), assina broadcast pro que vier daqui
// pra frente, dedupe por chave, nunca some sozinha. A diferença é o público
// (quem separa material, não quem aprova cadastro) e o canal, que é POR
// UNIDADE -- ver o comentário em cima de dispararAlertaPreparo()
// (js/programacao.js): gente de outra fábrica não pode saber de um pedido
// que não é da unidade dela.
//
// O Robson, mostrando o card do Painel do Dia (seção 25) que já existia pra
// isso: *"dessa aba que o encarregado da expediçao alimenta"* -- ou seja,
// mesma fonte de dado (exp_pedido_aviso_preparo), só que como popup em
// qualquer tela em vez de só aparecer pra quem está no Painel do Dia.
function podeVerAvisoPreparo() {
  return perfilAtual === 'estoque_alm' || perfilAtual === 'admin';
}

function irParaPreparar() {
  if (typeof mostrarPagina === 'function') mostrarPagina('expacessorios');
  if (typeof trocarAbaExpAcessorios === 'function') trocarAbaExpAcessorios('avisoprep');
}

function notificarPedidoPreparo({ pedidos, avisadoPor, urgente }) {
  const lista = (pedidos || []).filter(Boolean);
  if (!lista.length) return;
  const plural = lista.length > 1;

  mostrarNotificacao({
    icone: urgente ? '🔔' : '⏰',
    titulo: plural ? `${lista.length} pedidos avisados pra preparar` : 'Pedido avisado pra preparar',
    texto: `<b>${escapeHtml(lista.join(', '))}</b> -- separe e deixe pronto antes do caminhão chegar.`
      + (avisadoPor ? `<br><span class="notif-detalhe">Avisado por ${escapeHtml(avisadoPor)}</span>` : ''),
    acaoRotulo: 'Abrir Preparar',
    aoClicarAcao: irParaPreparar,
    // Chave por conjunto de pedidos + instante: reavisar o mesmo pedido mais
    // tarde (ver "↺ Avisar de novo" na tela) é evento novo, não duplicata do
    // primeiro -- diferente do cadastro, que é uma pessoa só, uma vez só.
    chave: 'preparo:' + lista.join(',') + ':' + Date.now()
  });
}

// Quantos pedidos pendentes JÁ estão na fila -- mesma consulta do card
// "avisoprep" em js/painel.js (contarPainel), pra quem entrou no portal
// depois de o aviso ter sido disparado.
async function contarAvisosPreparoPendentes() {
  if (!unidadeAtual) return 0;
  const { count, error } = await sb.from('exp_pedido_aviso_preparo')
    .select('id', { count: 'exact', head: true })
    .eq('unidade', unidadeAtual).eq('status', 'pendente');
  if (error) {
    // Silencioso: aviso de cortesia, e a tabela é nova (fase45) -- se ainda
    // não rodou no banco, isto não pode virar erro no meio do trabalho.
    console.warn('Não foi possível contar os avisos de preparo pendentes:', error.message);
    return 0;
  }
  return count || 0;
}

let canalAvisoPreparo = null;

// Chamado por js/auth.js (junto de iniciarAvisoCadastro) e de novo por
// js/estoque.js (trocarUnidade) sempre que a unidade ativa muda -- o canal é
// por unidade, então trocar de fábrica sem reassinar deixaria a pessoa
// ouvindo o aviso da unidade errada (ou nenhuma).
async function iniciarAvisoPreparo() {
  if (canalAvisoPreparo) { sb.removeChannel(canalAvisoPreparo); canalAvisoPreparo = null; }
  if (!podeVerAvisoPreparo() || !unidadeAtual) return;

  // Mesmo motivo do iniciarAvisoCadastro(): pedir cedo, não só na hora do
  // primeiro aviso. `garantirPermissaoNotificacao()` já se protege contra
  // perguntar duas vezes (esta função roda de novo a cada troca de unidade).
  garantirPermissaoNotificacao();

  const pendentes = await contarAvisosPreparoPendentes();
  if (pendentes > 0) {
    mostrarNotificacao({
      icone: '⏳',
      titulo: pendentes === 1 ? '1 pedido aguardando preparo'
                              : `${pendentes} pedidos aguardando preparo`,
      texto: 'O encarregado da expedição avisou -- separe e deixe pronto antes do caminhão chegar.',
      acaoRotulo: 'Abrir Preparar',
      aoClicarAcao: irParaPreparar,
      // Chave fixa (sem unidade): entrar de novo na mesma aba, ou trocar de
      // unidade e voltar, não empilha um segundo resumo.
      chave: 'avisoprep-pendentes'
    });
  }

  canalAvisoPreparo = sb.channel(`alertas-preparo-${unidadeAtual}`)
    .on('broadcast', { event: 'pedido_preparo' }, (msg) => {
      if (!podeVerAvisoPreparo()) return;
      notificarPedidoPreparo(msg.payload || {});
      // O Painel do Dia já estava aberto atrás? Atualiza o card, pra não
      // precisar lembrar de clicar em "Atualizar".
      if (typeof carregarPainel === 'function' && paginaAtual === 'painel') carregarPainel();
    })
    .subscribe();
}

// ---- Pedido cancelado no EXP: devolver material ao almoxarifado (17/09/2026)
//
// Mesmo desenho de cima, na direção OPOSTA: lá o encarregado da expedição
// avisa o almoxarifado a separar; aqui o almoxarifado (aba ⏰ Parados) avisa
// quem cuida do Controle EXP que um material físico precisa voltar. Robson:
// "quando eu marcar como cancelado abre uma nova aba ou um aviso para gente
// voltar material para o almoxarifado, dai a responsavel pelo exp acessorios
// ja visualiza a notificação".
//
// Mesmo público de quem cuida do EXP -- é o mesmo time que vê o aviso de
// Preparar, só que agora do lado de devolver em vez de separar.
function podeVerAvisoCanceladoAlm() {
  return perfilAtual === 'estoque_alm' || perfilAtual === 'admin';
}

function irParaCanceladoAlm() {
  if (typeof mostrarPagina === 'function') mostrarPagina('expacessorios');
  if (typeof trocarAbaExpAcessorios === 'function') trocarAbaExpAcessorios('canceladoalm');
}

function notificarPedidoCanceladoAlm({ pedido, itens, canceladoPor, observacao }) {
  if (!pedido) return;
  mostrarNotificacao({
    icone: '↩️',
    titulo: 'Pedido cancelado — devolver material',
    texto: `<b>${escapeHtml(pedido)}</b> foi cancelado -- volte o material físico pro endereço do almoxarifado.`
      + (itens ? `<br><span class="notif-detalhe">${itens} item(ns)</span>` : '')
      + (canceladoPor ? `<br><span class="notif-detalhe">Cancelado por ${escapeHtml(canceladoPor)}</span>` : '')
      // O que a pessoa escreveu na observação de Parados é o recado mais
      // direto que existe (ex.: "já estornado, localização ALM B-01-02") --
      // vai sem cortar, pro auxiliar não ter que abrir a aba só pra ler isso.
      + (observacao ? `<br><span class="notif-detalhe">${escapeHtml(observacao)}</span>` : ''),
    acaoRotulo: 'Abrir',
    aoClicarAcao: irParaCanceladoAlm,
    // Chave por pedido + instante: o mesmo pedido pode ser cancelado nesta
    // aba mais de uma vez ao longo do tempo (upsert reabre pendente) -- cada
    // cancelamento é aviso novo, não duplicata do anterior.
    chave: 'canceladoalm:' + pedido + ':' + Date.now(),
    som: 'devolucao'
  });
}

// Quantos já estão esperando devolução AGORA -- mesma ideia de
// contarAvisosPreparoPendentes(), pra quem entra no portal depois do aviso
// ao vivo já ter passado.
async function contarCanceladosAlmPendentes() {
  if (!unidadeAtual) return 0;
  const { count, error } = await sb.from('exp_pedido_cancelado_alm')
    .select('id', { count: 'exact', head: true })
    .eq('unidade', unidadeAtual).eq('status', 'pendente');
  if (error) {
    // Silencioso: aviso de cortesia, e a tabela é nova (fase61) -- se ainda
    // não rodou no banco, isto não pode virar erro no meio do trabalho.
    console.warn('Não foi possível contar os pedidos cancelados aguardando devolução:', error.message);
    return 0;
  }
  return count || 0;
}

let canalAvisoCanceladoAlm = null;

// Chamado nos mesmos lugares de iniciarAvisoPreparo() -- js/auth.js (depois
// de montarMenu()) e js/estoque.js (trocarUnidade) -- pelo mesmo motivo:
// canal por unidade, então trocar de fábrica sem reassinar deixaria a pessoa
// ouvindo o aviso da unidade errada.
async function iniciarAvisoCanceladoAlm() {
  if (canalAvisoCanceladoAlm) { sb.removeChannel(canalAvisoCanceladoAlm); canalAvisoCanceladoAlm = null; }
  if (!podeVerAvisoCanceladoAlm() || !unidadeAtual) return;

  garantirPermissaoNotificacao();

  const pendentes = await contarCanceladosAlmPendentes();
  if (pendentes > 0) {
    mostrarNotificacao({
      icone: '↩️',
      titulo: pendentes === 1 ? '1 pedido cancelado aguardando devolução'
                              : `${pendentes} pedidos cancelados aguardando devolução`,
      texto: 'Material físico precisa voltar pro endereço do almoxarifado.',
      acaoRotulo: 'Abrir',
      aoClicarAcao: irParaCanceladoAlm,
      // Chave fixa (sem unidade): entrar de novo na mesma aba, ou trocar de
      // unidade e voltar, não empilha um segundo resumo.
      chave: 'canceladoalm-pendentes',
      som: 'devolucao'
    });
  }

  canalAvisoCanceladoAlm = sb.channel(`alertas-cancelado-alm-${unidadeAtual}`)
    .on('broadcast', { event: 'pedido_cancelado_alm' }, (msg) => {
      if (!podeVerAvisoCanceladoAlm()) return;
      notificarPedidoCanceladoAlm(msg.payload || {});
      // A aba já estava aberta atrás? Atualiza a lista, pra não precisar
      // lembrar de clicar em "Atualizar".
      if (typeof carregarCanceladosAlm === 'function' && paginaAtual === 'expacessorios' && progExpAbaAtual === 'canceladoalm') {
        carregarCanceladosAlm().then(renderCanceladosAlm);
      }
    })
    .subscribe();
}

// ---- Chat (17/09/2026) ------------------------------------------------------
//
// Robson: "monte um chat aonde eu possa conversar com os usuarios ativos".
// Mensagem que chega com a pessoa em outra tela precisa aparecer em algum
// lugar -- senão um chat só funciona pra quem já está olhando pro chat.
//
// DUAS DIFERENÇAS dos outros avisos daqui:
//
//   1. Canal ÚNICO, sem sufixo de unidade (`chat-portal`): este chat
//      atravessa as fábricas de propósito (escolha do Robson) -- por isso
//      também não precisa reassinar ao trocar de unidade.
//   2. Todo perfil recebe, inclusive consultor. Os outros avisos são de
//      trabalho de um setor; este é gente falando com gente.
function podeVerAvisoChat() {
  return !!userIdAtual;
}

function notificarMensagemChat({ remetenteId, remetenteNome, destinatarioId, texto }) {
  // O próprio eco não vira notificação (o broadcast volta pra quem enviou).
  if (!remetenteId || remetenteId === userIdAtual) return;
  // Privada de OUTRA pessoa não é da minha conta -- o RLS já não deixaria ler
  // o conteúdo, mas o broadcast é solto: sem este filtro, o portal mostraria
  // um aviso sobre conversa alheia.
  if (destinatarioId && destinatarioId !== userIdAtual) return;
  // Sem mural (18/09/2026), mensagem sem destinatário não é mais dirigida a
  // ninguém. Se alguma sobrar no ar vinda de uma aba antiga, ignora.
  if (!destinatarioId) return;

  // Já está com a conversa aberta na tela? Não precisa de popup -- a
  // mensagem aparece sozinha ali (releitura de 20s / envio).
  if (paginaAtual === 'chat' && chatConversaAtual === remetenteId) return;

  mostrarNotificacao({
    icone: '💬',
    titulo: `Mensagem de ${remetenteNome || 'alguém'}`,
    texto: escapeHtml(texto || ''),
    acaoRotulo: 'Responder',
    aoClicarAcao: () => {
      if (typeof mostrarPagina === 'function') mostrarPagina('chat');
      if (typeof abrirConversaChat === 'function') abrirConversaChat(remetenteId);
    },
    // Chave por remetente + instante: cada mensagem é um aviso novo. Duas
    // mensagens seguidas da mesma pessoa são duas coisas pra ler, não uma
    // repetição da mesma (ao contrário de "tem pedido pendente").
    chave: 'chat:' + remetenteId + ':' + Date.now()
  });
}

let canalChatAviso = null;

// Chamado nos mesmos lugares dos outros avisos (js/auth.js depois de
// montarMenu). Não precisa reassinar ao trocar de unidade -- canal único.
async function iniciarAvisoChat() {
  if (canalChatAviso) { sb.removeChannel(canalChatAviso); canalChatAviso = null; }
  if (!podeVerAvisoChat()) return;

  garantirPermissaoNotificacao();

  // Quem chegou depois: conta o que ficou esperando e acende a bolinha do
  // menu. Sem isto, mensagem recebida offline só apareceria se a pessoa
  // abrisse o chat por conta própria.
  if (typeof carregarNaoLidasChat === 'function') {
    await carregarNaoLidasChat();
    atualizarBadgeChat();
    const total = chatTotalNaoLidas();
    if (total > 0) {
      mostrarNotificacao({
        icone: '💬',
        titulo: total === 1 ? '1 mensagem não lida no chat' : `${total} mensagens não lidas no chat`,
        texto: 'Alguém falou com você enquanto o portal estava fechado.',
        acaoRotulo: 'Abrir o chat',
        aoClicarAcao: () => { if (typeof mostrarPagina === 'function') mostrarPagina('chat'); },
        chave: 'chat-nao-lidas'
      });
    }
  }

  canalChatAviso = sb.channel('chat-portal')
    .on('broadcast', { event: 'mensagem' }, async (msg) => {
      const payload = msg.payload || {};
      notificarMensagemChat(payload);
      // Bolinha do menu e, se a tela estiver aberta, a conversa em si.
      if (typeof carregarNaoLidasChat === 'function' && payload.remetenteId !== userIdAtual) {
        await carregarNaoLidasChat();
        atualizarBadgeChat();
        if (paginaAtual === 'chat') {
          await carregarMensagensChat();
          renderListaChat();
          renderMensagensChat();
        }
      }
    })
    .subscribe();
}

// ---- Refeições de fim de semana: cobrança de sexta (18/09/2026) -------------
//
// Robson: "quero tambem que envie alertas em todas as sextas feira até o meio
// dia tem que ter a relaçao". Prazo é sexta ao meio-dia -- então o aviso tem
// duas caras: DE MANHÃ ainda dá tempo ("faltam X setores, fecha meio-dia"),
// DEPOIS DO MEIO-DIA o prazo já venceu e o tom muda ("passou do meio-dia").
//
// Diferente de todos os outros avisos daqui, este não nasce de um broadcast:
// ninguém "dispara" uma sexta-feira. Ele é olhado no login e de novo a cada
// 10 minutos com o portal aberto -- é o que faz a virada do meio-dia
// acontecer pra quem deixou a tela aberta a manhã inteira.
//
// Todo perfil recebe: quem preenche são os líderes de setor (Produção,
// Manutenção, Qualidade), que no portal são consultor.
function podeVerAvisoRefeicoes() {
  return !!unidadeAtual;
}

function irParaRefeicoes() {
  if (typeof mostrarPagina === 'function') mostrarPagina('refeicoes');
}

let refeicoesTimerAviso = null;

async function conferirAvisoRefeicoes() {
  if (!podeVerAvisoRefeicoes() || typeof setoresFaltandoRefeicoes !== 'function') return;

  const agora = new Date();
  if (agora.getDay() !== 5) return;  // só sexta-feira

  const { faltando, sabado, erro } = await setoresFaltandoRefeicoes();
  // Relação fechada não vira aviso -- cobrar quem já respondeu é o jeito mais
  // rápido de ensinar a ignorar a notificação.
  if (erro || !faltando.length) return;

  const passouPrazo = agora.getHours() >= REFEICOES_PRAZO_HORA;
  const lista = faltando.join(', ');

  mostrarNotificacao({
    icone: '🍽️',
    titulo: passouPrazo
      ? `Passou do meio-dia e faltam ${faltando.length} setor(es)`
      : `Refeições do fim de semana: faltam ${faltando.length} setor(es)`,
    texto: (passouPrazo
        ? 'O prazo era hoje ao meio-dia e a relação ainda não fechou.'
        : 'A relação precisa estar fechada hoje até o meio-dia.')
      + `<br><span class="notif-detalhe">Sem informar: ${escapeHtml(lista)}</span>`
      + `<br><span class="notif-detalhe">Fim de semana de ${escapeHtml(dataCurtaRefeicoes(sabado))}</span>`,
    acaoRotulo: 'Preencher',
    aoClicarAcao: irParaRefeicoes,
    // Chave por dia + fase do prazo: a cobrança da manhã e a de depois do
    // meio-dia são dois recados diferentes, mas nenhum dos dois empilha
    // sozinho a cada releitura de 10 minutos.
    chave: 'refeicoes:' + sabado + (passouPrazo ? ':tarde' : ':manha'),
    som: passouPrazo ? 'devolucao' : undefined
  });
}

// Chamado no login (js/auth.js). O intervalo é o que faz o aviso da tarde
// aparecer pra quem entrou de manhã e não recarregou mais.
function iniciarAvisoRefeicoes() {
  if (refeicoesTimerAviso) clearInterval(refeicoesTimerAviso);
  conferirAvisoRefeicoes();
  refeicoesTimerAviso = setInterval(conferirAvisoRefeicoes, 10 * 60 * 1000);
}

// ---- Visitante chegou na portaria (18/09/2026) ------------------------------
//
// Da caixa de sugestões, via Victor: "Portaria recebe as informações e quando
// o visitante chega só formaliza e informa o funcionário". Este é o "informa".
//
// ⚠️ CANAL POR PESSOA, não por unidade -- e é a diferença que importa em
// relação aos dois avisos acima. Preparo e devolução são recados de SETOR:
// filtrar no cliente não esconde de ninguém nada que já não pudesse ver. Aqui
// o payload tem nome e empresa de um visitante, e um canal por unidade
// entregaria isso a TODO mundo com o portal aberto na fábrica -- só a tela é
// que decidiria não desenhar o cartão, com o dado já tendo chegado na máquina
// de quem não é o anfitrião. `alertas-visita-<meu id>` custa o mesmo e não
// vaza. Efeito colateral bom: não precisa reassinar ao trocar de unidade.
let canalAvisoVisita = null;

// Quem recebe visita é qualquer pessoa, então não há recorte de perfil aqui --
// diferente de todos os outros avisos deste arquivo. A trava é o id: só chega
// no canal de quem é o anfitrião.
async function contarVisitantesEsperando() {
  if (!userIdAtual) return 0;
  const { count, error } = await sb.from('portaria_visitas')
    .select('id', { count: 'exact', head: true })
    .eq('anfitriao_id', userIdAtual)
    .eq('status', 'presente');
  if (error) {
    // Silencioso de propósito: é aviso de cortesia, e a fase68 pode não ter
    // rodado ainda. A tela da Portaria é que diz isso em voz alta.
    console.warn('Portaria: não foi possível contar visitantes esperando:', error.message);
    return 0;
  }
  return count || 0;
}

function irParaPortaria() {
  if (typeof mostrarPagina === 'function') mostrarPagina('portaria');
}

function notificarVisitaChegou({ visitanteNome, visitanteEmpresa, porteiro }) {
  if (!visitanteNome) return;
  mostrarNotificacao({
    icone: '🛂',
    titulo: 'Seu visitante chegou',
    texto: `<b>${escapeHtml(visitanteNome)}</b>`
      + (visitanteEmpresa ? ` — ${escapeHtml(visitanteEmpresa)}` : '')
      + ' está na portaria.'
      + (porteiro ? `<br><span class="notif-detalhe">Registrado por ${escapeHtml(porteiro)}</span>` : ''),
    acaoRotulo: 'Abrir Portaria',
    aoClicarAcao: irParaPortaria,
    // Chave por visitante + instante: a mesma pessoa voltando outro dia é
    // evento novo, não duplicata -- mesma decisão do aviso de preparo.
    chave: 'visita:' + visitanteNome + ':' + Date.now()
  });
}

async function iniciarAvisoVisita() {
  if (canalAvisoVisita) { sb.removeChannel(canalAvisoVisita); canalAvisoVisita = null; }
  if (!userIdAtual) return;

  garantirPermissaoNotificacao();

  // Rede para quem não estava com o portal aberto na hora: o broadcast se
  // perde, mas o visitante continua esperando na portaria. Mesmo desenho do
  // resumo de cadastros pendentes (iniciarAvisoCadastro).
  const esperando = await contarVisitantesEsperando();
  if (esperando > 0) {
    mostrarNotificacao({
      icone: '🛂',
      titulo: esperando === 1 ? 'Um visitante seu está na fábrica'
                              : `${esperando} visitantes seus estão na fábrica`,
      texto: 'A portaria já registrou a chegada e ainda não há saída registrada.',
      acaoRotulo: 'Abrir Portaria',
      aoClicarAcao: irParaPortaria,
      chave: 'visita-esperando'
    });
  }

  canalAvisoVisita = sb.channel(`alertas-visita-${userIdAtual}`)
    .on('broadcast', { event: 'visita_chegou' }, (msg) => {
      notificarVisitaChegou(msg.payload || {});
      // A tela da Portaria já estava aberta atrás? Atualiza, pra não precisar
      // clicar em Recarregar.
      if (typeof carregarPortaria === 'function' && paginaAtual === 'portaria') carregarPortaria();
    })
    .subscribe();
}
