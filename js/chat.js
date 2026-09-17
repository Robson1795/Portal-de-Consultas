// Portal de Estoque Kingspan Isoeste — Chat (17/09/2026)
//
// O Robson: *"monte um chat aonde eu possa conversar com os usuarios
// ativos"*. Perguntado o alcance e o formato, escolheu: TODAS as unidades
// (quem está na mesma unidade normalmente está no mesmo prédio -- o valor é
// falar com Anápolis/Cambuí) e mural geral + conversa privada.
//
// A LISTA DE PESSOAS VEM DE `chat_presenca`, NÃO DE `usuarios_permitidos`
//
// Parece o contrário do óbvio, mas o RLS de `usuarios_permitidos` (fase1c)
// só deixa cada um ver a PRÓPRIA linha -- a lista inteira é de admin. Se o
// chat lesse de lá, consultor abriria a tela e não veria ninguém. E abrir
// aquela tabela pra todo mundo só pra montar uma lista de contatos seria
// alargar permissão de cadastro (perfil, unidade, aprovação) por causa de
// chat: caro demais pelo que se ganha.
//
// `chat_presenca` (fase64) resolve os dois de uma vez: é lida por qualquer
// aprovado, tem nome/unidade pra mostrar, e só entra quem realmente abriu o
// portal. O efeito colateral é bom -- a agenda é "quem usa o portal", não
// "todo cadastro que já existiu".
//
// O preço: no primeiro dia a lista começa vazia e vai enchendo conforme cada
// um abre o portal. O mural funciona desde o primeiro minuto de qualquer
// jeito.

// Ping recente = online. 2 minutos cobre com folga o intervalo de 45s do
// ping (uma falha de rede isolada não derruba ninguém da lista) sem deixar
// "online" quem fechou o navegador faz tempo.
const CHAT_JANELA_ONLINE_MS = 2 * 60 * 1000;
const CHAT_PING_MS          = 45 * 1000;
// Rede de segurança do broadcast (que não alcança quem estava com a aba
// suspensa, ou teve o socket derrubado): a cada 20s a conversa aberta é
// relida do banco. Só enquanto a tela do chat está aberta.
const CHAT_ATUALIZA_MS      = 20 * 1000;
const CHAT_LIMITE_MENSAGENS = 200;
const CHAT_MURAL            = 'geral';

let chatPresencaLista = [];      // linhas de chat_presenca (todo mundo que já abriu o portal)
let chatMensagens     = [];      // mensagens da conversa aberta agora
let chatNaoLidasMap   = new Map(); // remetente_id -> quantas mensagens não lidas pra mim
let chatConversaAtual = CHAT_MURAL;
let chatTimerPing     = null;
let chatTimerAtualiza = null;
let canalChat         = null;

function chatEstaOnline(ultimoPing) {
  if (!ultimoPing) return false;
  return (Date.now() - new Date(ultimoPing).getTime()) < CHAT_JANELA_ONLINE_MS;
}

function chatHoraCurta(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// ---- Presença ---------------------------------------------------------------
//
// Roda enquanto o portal está aberto, não só na tela do chat: "usuário ativo"
// é quem está COM O PORTAL ABERTO, não quem está olhando o chat. Quem só
// olha estoque o dia inteiro também precisa aparecer como alcançável.
async function chatPingPresenca() {
  if (!userIdAtual) return;
  const { error } = await sb.from('chat_presenca').upsert({
    user_id: userIdAtual,
    nome: nomeUsuarioAtual || emailUsuarioAtual || 'Sem nome',
    email: emailUsuarioAtual || null,
    unidade: unidadeAtual || null,
    ultimo_ping: new Date().toISOString()
  }, { onConflict: 'user_id' });
  // Falha de ping não pode atrapalhar nada: no pior caso a pessoa aparece
  // offline pros outros por um tempo. Nunca vira alerta na cara de ninguém.
  if (error) console.warn('Chat: não foi possível atualizar a presença:', error.message);
}

async function carregarPresencaChat() {
  const { data, error } = await sb.from('chat_presenca')
    .select('user_id, nome, email, unidade, ultimo_ping')
    .order('ultimo_ping', { ascending: false });
  if (error) {
    chatPresencaLista = [];
    return error.message;
  }
  chatPresencaLista = (data || []).filter(p => p.user_id !== userIdAtual);
  return null;
}

// ---- Não lidas --------------------------------------------------------------
async function carregarNaoLidasChat() {
  chatNaoLidasMap = new Map();
  if (!userIdAtual) return;
  const { data, error } = await sb.from('chat_mensagens')
    .select('remetente_id')
    .eq('destinatario_id', userIdAtual)
    .is('lido_em', null);
  if (error) return;
  (data || []).forEach(m => {
    chatNaoLidasMap.set(m.remetente_id, (chatNaoLidasMap.get(m.remetente_id) || 0) + 1);
  });
}

// O mural não tem "lido por" no banco (seria uma linha por pessoa por
// mensagem, pra um mural que todo mundo lê). O marcador de "até onde eu já
// vi" é local do navegador -- se a pessoa abrir em outro computador, vê o
// mural como novo. Aceitável pra um aviso de "tem mensagem nova"; não seria
// pra mensagem privada, que por isso tem `lido_em` de verdade.
function chatMuralVistoEm() {
  try { return localStorage.getItem('chatMuralVisto') || ''; } catch (e) { return ''; }
}
function marcarMuralVisto() {
  try { localStorage.setItem('chatMuralVisto', new Date().toISOString()); } catch (e) { /* modo privado */ }
}

let chatMuralNaoLidas = 0;
async function carregarNaoLidasMural() {
  chatMuralNaoLidas = 0;
  const visto = chatMuralVistoEm();
  if (!visto) return; // nunca abriu o mural: não fica cobrando o que ele nem sabe que existe
  const { count, error } = await sb.from('chat_mensagens')
    .select('id', { count: 'exact', head: true })
    .is('destinatario_id', null)
    .neq('remetente_id', userIdAtual)
    .gt('criado_em', visto);
  if (!error) chatMuralNaoLidas = count || 0;
}

function chatTotalNaoLidas() {
  let total = chatMuralNaoLidas;
  chatNaoLidasMap.forEach(qtd => { total += qtd; });
  return total;
}

// Bolinha com o número no item do menu lateral. Sem isso, mensagem que chega
// enquanto a pessoa está em outra tela só apareceria no popup -- que ela pode
// ter fechado ou perdido.
function atualizarBadgeChat() {
  const item = document.querySelector('.nav-item[data-pagina="chat"]');
  if (!item) return;
  let badge = item.querySelector('.nav-badge');
  const total = chatTotalNaoLidas();
  if (!total) { if (badge) badge.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'nav-badge';
    item.appendChild(badge);
  }
  badge.textContent = total > 99 ? '99+' : String(total);
}

// ---- Mensagens --------------------------------------------------------------
async function carregarMensagensChat() {
  let q = sb.from('chat_mensagens')
    .select('id, remetente_id, remetente_nome, remetente_unidade, destinatario_id, texto, criado_em')
    .order('criado_em', { ascending: false })
    .limit(CHAT_LIMITE_MENSAGENS);

  if (chatConversaAtual === CHAT_MURAL) {
    q = q.is('destinatario_id', null);
  } else {
    // Os dois sentidos da conversa. O RLS já garante que só volta conversa
    // de quem participa dela -- este filtro é pra pegar A conversa certa,
    // não pra proteger nada.
    q = q.not('destinatario_id', 'is', null)
         .or(`and(remetente_id.eq.${userIdAtual},destinatario_id.eq.${chatConversaAtual}),`
           + `and(remetente_id.eq.${chatConversaAtual},destinatario_id.eq.${userIdAtual})`);
  }

  const { data, error } = await q;
  if (error) { chatMensagens = []; return error.message; }
  chatMensagens = (data || []).reverse(); // mais antiga em cima, como todo chat
  return null;
}

async function marcarConversaLidaChat(outroId) {
  if (!userIdAtual || outroId === CHAT_MURAL) { marcarMuralVisto(); chatMuralNaoLidas = 0; return; }
  if (!chatNaoLidasMap.get(outroId)) return;
  const { error } = await sb.from('chat_mensagens')
    .update({ lido_em: new Date().toISOString() })
    .eq('destinatario_id', userIdAtual)
    .eq('remetente_id', outroId)
    .is('lido_em', null);
  if (!error) chatNaoLidasMap.delete(outroId);
}

// ---- Render -----------------------------------------------------------------
function chatNomeDaConversa(id) {
  if (id === CHAT_MURAL) return 'Geral';
  const p = chatPresencaLista.find(u => u.user_id === id);
  return p ? p.nome : 'Conversa';
}

function renderListaChat() {
  const alvo = document.getElementById('chatLista');
  if (!alvo) return;
  const busca = (document.getElementById('chatBusca').value || '').trim().toLowerCase();
  const filtrados = chatPresencaLista.filter(p =>
    !busca || (p.nome || '').toLowerCase().includes(busca) || (p.unidade || '').includes(busca));

  const online = filtrados.filter(p => chatEstaOnline(p.ultimo_ping));
  const offline = filtrados.filter(p => !chatEstaOnline(p.ultimo_ping));

  const item = (p) => {
    const naoLidas = chatNaoLidasMap.get(p.user_id) || 0;
    const ativo = chatConversaAtual === p.user_id ? ' ativo' : '';
    return `<button class="chat-contato${ativo}" data-conversa="${escapeHtml(p.user_id)}">
              <span class="chat-bolinha ${chatEstaOnline(p.ultimo_ping) ? 'on' : 'off'}"></span>
              <span class="chat-contato-nome">${escapeHtml(p.nome || '—')}</span>
              ${p.unidade ? `<span class="chat-contato-unidade">${escapeHtml(p.unidade)}</span>` : ''}
              ${naoLidas ? `<span class="chat-nao-lidas">${naoLidas}</span>` : ''}
            </button>`;
  };

  alvo.innerHTML = `
    <button class="chat-contato chat-contato-geral${chatConversaAtual === CHAT_MURAL ? ' ativo' : ''}" data-conversa="${CHAT_MURAL}">
      <span class="chat-contato-nome">📢 Geral</span>
      <span class="chat-contato-unidade">todas as unidades</span>
      ${chatMuralNaoLidas ? `<span class="chat-nao-lidas">${chatMuralNaoLidas}</span>` : ''}
    </button>
    <div class="chat-grupo-titulo">Online agora (${online.length})</div>
    ${online.map(item).join('') || '<div class="chat-vazio-mini">Ninguém mais com o portal aberto agora.</div>'}
    <div class="chat-grupo-titulo">Offline (${offline.length})</div>
    ${offline.map(item).join('') || '<div class="chat-vazio-mini">—</div>'}
  `;
}

function renderMensagensChat() {
  const alvo = document.getElementById('chatMensagens');
  const topo = document.getElementById('chatConversaTopo');
  if (!alvo || !topo) return;

  if (chatConversaAtual === CHAT_MURAL) {
    topo.innerHTML = `<b>📢 Geral</b> <span class="chat-topo-info">todo mundo do portal vê estas mensagens</span>`;
  } else {
    const p = chatPresencaLista.find(u => u.user_id === chatConversaAtual);
    const on = p && chatEstaOnline(p.ultimo_ping);
    topo.innerHTML = `<b>${escapeHtml(chatNomeDaConversa(chatConversaAtual))}</b>
      <span class="chat-topo-info">${on ? '🟢 online agora' : '⚪ offline — vai ver quando entrar'}${p && p.unidade ? ' · unidade ' + escapeHtml(p.unidade) : ''}</span>`;
  }

  if (!chatMensagens.length) {
    alvo.innerHTML = `<div class="chat-vazio">Nenhuma mensagem ainda. Escreva a primeira aí embaixo.</div>`;
    return;
  }

  alvo.innerHTML = chatMensagens.map(m => {
    const minha = m.remetente_id === userIdAtual;
    return `<div class="chat-msg ${minha ? 'minha' : 'dele'}">
      <div class="chat-msg-topo">
        ${minha ? 'Você' : escapeHtml(m.remetente_nome || '—')}
        ${(!minha && m.remetente_unidade) ? ` · ${escapeHtml(m.remetente_unidade)}` : ''}
        · ${escapeHtml(chatHoraCurta(m.criado_em))}
        ${minha ? `<button class="chat-apagar" data-msg="${escapeHtml(m.id)}" title="Apagar esta mensagem">🗑</button>` : ''}
      </div>
      <div class="chat-msg-texto">${escapeHtml(m.texto)}</div>
    </div>`;
  }).join('');
  // Conversa abre já no fim, como qualquer chat -- o que importa é a última.
  alvo.scrollTop = alvo.scrollHeight;
}

// ---- Carregamento da tela ---------------------------------------------------
async function carregarChat() {
  const msg = document.getElementById('chatMsg');
  if (msg) { msg.textContent = 'Carregando...'; msg.className = 'status-msg'; }

  await chatPingPresenca(); // entra na lista dos outros antes de tudo
  const erroPresenca = await carregarPresencaChat();
  await carregarNaoLidasChat();
  await carregarNaoLidasMural();
  const erroMensagens = await carregarMensagensChat();

  if (msg) {
    const erro = erroPresenca || erroMensagens;
    if (erro) {
      msg.textContent = 'Não foi possível carregar o chat: ' + erro
        + ' — se falar em tabela inexistente, sql/fase64-chat.sql ainda não foi rodado no Supabase.';
      msg.className = 'status-msg status-err';
    } else {
      msg.textContent = '';
      msg.className = 'status-msg';
    }
  }

  renderListaChat();
  renderMensagensChat();
  atualizarBadgeChat();
}

async function abrirConversaChat(id) {
  chatConversaAtual = id;
  await marcarConversaLidaChat(id);
  await carregarMensagensChat();
  renderListaChat();
  renderMensagensChat();
  atualizarBadgeChat();
  const campo = document.getElementById('chatTexto');
  if (campo) campo.focus();
}

// ---- Enviar -----------------------------------------------------------------
async function enviarMensagemChat() {
  const campo = document.getElementById('chatTexto');
  const msg = document.getElementById('chatMsg');
  const texto = (campo.value || '').trim();
  if (!texto) return;
  if (!userIdAtual) return;

  const btn = document.getElementById('chatEnviarBtn');
  btn.disabled = true;

  const registro = {
    remetente_id: userIdAtual,
    remetente_nome: nomeUsuarioAtual || emailUsuarioAtual || 'Sem nome',
    remetente_unidade: unidadeAtual || null,
    destinatario_id: chatConversaAtual === CHAT_MURAL ? null : chatConversaAtual,
    texto: texto.slice(0, 2000)
  };

  const { error } = await sb.from('chat_mensagens').insert(registro);
  btn.disabled = false;

  if (error) {
    if (msg) {
      msg.textContent = 'Não foi possível enviar: ' + error.message;
      msg.className = 'status-msg status-err';
    }
    return;
  }

  campo.value = '';
  if (msg) { msg.textContent = ''; msg.className = 'status-msg'; }
  dispararAlertaChat(registro);
  await carregarMensagensChat();
  renderMensagensChat();
}

async function apagarMensagemChat(id) {
  if (!confirm('Apagar esta mensagem? Ela some para quem já recebeu também.')) return;
  const { error } = await sb.from('chat_mensagens').delete().eq('id', id);
  if (error) { alert('Não foi possível apagar: ' + error.message); return; }
  await carregarMensagensChat();
  renderMensagensChat();
}

// Mesmo desenho dos outros avisos do portal (js/notificacoes.js): grava
// primeiro, avisa depois, e o aviso nunca derruba o que já foi gravado.
// Canal ÚNICO, sem sufixo de unidade -- este chat é da empresa inteira, ao
// contrário dos alertas de pedido (ver dispararAlertaPreparo).
function dispararAlertaChat({ remetente_nome, destinatario_id, texto }) {
  try {
    sb.channel('chat-portal').send({
      type: 'broadcast', event: 'mensagem',
      payload: {
        remetenteId: userIdAtual,
        remetenteNome: remetente_nome,
        destinatarioId: destinatario_id || null,
        texto: (texto || '').slice(0, 140),
        quando: new Date().toISOString()
      }
    });
  } catch (e) {
    console.warn('Chat: mensagem gravada, mas o aviso ao vivo falhou:', e.message);
  }
}

// ---- Tempo real da TELA (timers) --------------------------------------------
//
// Mesmo padrão do Painel de Docas: só roda enquanto a tela está aberta.
// Relógio e releitura em página fechada gastam conexão e bateria do celular
// sem ter o que mostrar.
function iniciarChatTempoReal() {
  pararChatTempoReal();
  chatTimerAtualiza = setInterval(async () => {
    if (paginaAtual !== 'chat') return;
    await carregarPresencaChat();
    await carregarNaoLidasChat();
    await carregarMensagensChat();
    renderListaChat();
    renderMensagensChat();
    atualizarBadgeChat();
  }, CHAT_ATUALIZA_MS);
}

function pararChatTempoReal() {
  if (chatTimerAtualiza) { clearInterval(chatTimerAtualiza); chatTimerAtualiza = null; }
}

// O ping é do PORTAL, não da tela do chat (ver comentário em
// chatPingPresenca): começa no login e não para ao trocar de página.
function iniciarPresencaChat() {
  if (chatTimerPing) clearInterval(chatTimerPing);
  chatPingPresenca();
  chatTimerPing = setInterval(chatPingPresenca, CHAT_PING_MS);
}

// ---- Eventos da tela --------------------------------------------------------
document.getElementById('chatLista').addEventListener('click', (e) => {
  const btn = e.target.closest('.chat-contato');
  if (!btn) return;
  abrirConversaChat(btn.dataset.conversa);
});

document.getElementById('chatMensagens').addEventListener('click', (e) => {
  const btn = e.target.closest('.chat-apagar');
  if (btn) apagarMensagemChat(btn.dataset.msg);
});

document.getElementById('chatBusca').addEventListener('input', renderListaChat);
document.getElementById('chatEnviarBtn').addEventListener('click', enviarMensagemChat);

// Enter manda, Shift+Enter quebra linha -- é o que a mão já espera de um chat.
document.getElementById('chatTexto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviarMensagemChat();
  }
});
