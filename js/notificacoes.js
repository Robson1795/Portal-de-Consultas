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

// Bipe curto por Web Audio -- sem arquivo de áudio pra hospedar/carregar.
// Precisa de AudioContext NOVO a cada bipe: um contexto já usado uma vez e
// parado (`stop()`) não toca de novo.
function tocarSomAviso() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    // Sobe e desce o volume em vez de ligar/desligar seco -- toc-toc limpo,
    // sem o estalo de clique que um degrau abrupto de volume causa.
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(ganho).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
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

function mostrarNotificacao({ icone, titulo, texto, acaoRotulo, aoClicarAcao, chave }) {
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

  tocarSomAviso();
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
