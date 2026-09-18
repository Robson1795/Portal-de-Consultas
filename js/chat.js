// Portal de Estoque Kingspan Isoeste — Chat (17/09/2026)
//
// O Robson: *"monte um chat aonde eu possa conversar com os usuarios
// ativos"*. Perguntado o alcance e o formato, escolheu: TODAS as unidades
// (quem está na mesma unidade normalmente está no mesmo prédio -- o valor é
// falar com Anápolis/Cambuí) e mural geral + conversa privada.
//
// DUAS FONTES PRA UMA LISTA SÓ (18/09/2026)
//
// `chat_presenca` (fase64) responde "quem está online": é o ping de quem
// abre o portal. Só ela, porém, deixava de fora quem ainda não tinha entrado
// nenhuma vez desde que o chat existe -- e procurar o nome de um colega não
// achava nada. O Victor: *"quando uma pessoa não estiver online, poder
// pesquisar o nome da pessoa mesmo estando offline"*.
//
// A agenda completa vem de `chat_contatos()` (fase65), função `security
// definer` que devolve id, nome e unidade dos aprovados -- e só isso. Ler
// `usuarios_permitidos` direto não dá: o RLS (fase1c) deixa cada um ver a
// própria linha, e abrir a tabela inteira pra montar uma agenda alargaria
// acesso a perfil, e-mail e situação de aprovação por causa de chat.
//
// As duas se somam em `chatPresencaLista`: a agenda dá QUEM EXISTE, a
// presença dá QUEM ESTÁ ONLINE AGORA. Se a fase65 ainda não tiver rodado, o
// chat continua funcionando com a presença sozinha (e a tela diz isso).
//
// NÃO EXISTE MAIS MURAL GERAL (18/09/2026, pedido do Victor). Toda conversa
// é entre duas pessoas. As mensagens de mural que já existiam continuam no
// banco, apenas sem tela que as leia -- ver CLAUDE.md.

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

let chatPresencaLista = [];      // agenda + presença, já fundidas (ver carregarPresencaChat)
let chatMensagens     = [];      // mensagens da conversa aberta agora
let chatNaoLidasMap   = new Map(); // remetente_id -> quantas mensagens não lidas pra mim
// null = nenhuma conversa aberta. Sem mural, o chat abre pedindo que se
// escolha alguém -- não há mais uma "conversa padrão" pra cair dentro.
let chatConversaAtual = null;
let chatSemAgenda     = false;   // a fase65 ainda não rodou: só quem já abriu o portal aparece
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

// Junta a agenda (quem existe) com a presença (quem está online agora).
//
// A agenda manda no nome e na unidade -- é o cadastro, e a presença guarda
// uma cópia do que era verdade no último ping. Quem trocou de unidade
// apareceria com a antiga se a presença vencesse.
async function carregarPresencaChat() {
  const [presenca, agenda] = await Promise.all([
    sb.from('chat_presenca')
      .select('user_id, nome, email, unidade, ultimo_ping')
      .order('ultimo_ping', { ascending: false }),
    sb.rpc('chat_contatos')
  ]);

  const porId = new Map();

  // A fase65 pode não ter rodado ainda: sem agenda, o chat continua de pé
  // com quem já abriu o portal, e a tela avisa por quê.
  chatSemAgenda = !!agenda.error;
  if (!agenda.error) {
    (agenda.data || []).forEach(c => {
      porId.set(c.user_id, {
        user_id: c.user_id, nome: c.nome, unidade: c.unidade, ultimo_ping: null
      });
    });
  } else {
    console.warn('Chat: agenda indisponível (sql/fase65-chat-contatos.sql):', agenda.error.message);
  }

  if (!presenca.error) {
    (presenca.data || []).forEach(p => {
      const jaTem = porId.get(p.user_id);
      if (jaTem) {
        jaTem.ultimo_ping = p.ultimo_ping;          // só o que a agenda não sabe
      } else {
        porId.set(p.user_id, {
          user_id: p.user_id, nome: p.nome, unidade: p.unidade, ultimo_ping: p.ultimo_ping
        });
      }
    });
  }

  chatPresencaLista = [...porId.values()]
    .filter(p => p.user_id !== userIdAtual)
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

  // Só é erro de verdade se as DUAS falharem: com uma delas ainda há lista.
  if (presenca.error && agenda.error) return presenca.error.message;
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

function chatTotalNaoLidas() {
  let total = 0;
  chatNaoLidasMap.forEach(qtd => { total += qtd; });
  return total;
}

// A contagem aparece em DOIS lugares, e os dois importam:
//
//   * item do menu lateral -- onde já estava;
//   * botão 💬 do cabeçalho (18/09/2026, pedido do Victor) -- que fica
//     visível mesmo com o menu fechado, que é como o portal abre no celular.
//
// Sem o segundo, mensagem que chega com a pessoa em outra tela só apareceria
// no popup, que ela pode ter fechado ou perdido.
function atualizarBadgeChat() {
  const total = chatTotalNaoLidas();
  const rotulo = total > 99 ? '99+' : String(total);

  const item = document.querySelector('.nav-item[data-pagina="chat"]');
  if (item) {
    let badge = item.querySelector('.nav-badge');
    if (!total) {
      if (badge) badge.remove();
    } else {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        item.appendChild(badge);
      }
      badge.textContent = rotulo;
    }
  }

  const bolha = document.getElementById('chatBadge');
  const botao = document.getElementById('chatBtn');
  if (bolha) {
    bolha.textContent = rotulo;
    bolha.style.display = total ? '' : 'none';
  }
  if (botao) {
    botao.title = total
      ? (total === 1 ? '1 mensagem não lida' : total + ' mensagens não lidas')
      : 'Conversar com quem usa o portal';
  }
}

// ---- Mensagens --------------------------------------------------------------
async function carregarMensagensChat() {
  // Sem conversa escolhida não há o que buscar -- e buscar "tudo" traria
  // conversa de outra pessoa pra tela.
  if (!chatConversaAtual) { chatMensagens = []; return null; }

  // Os dois sentidos da conversa. O RLS já garante que só volta conversa
  // de quem participa dela -- este filtro é pra pegar A conversa certa,
  // não pra proteger nada.
  const { data, error } = await sb.from('chat_mensagens')
    .select('id, remetente_id, remetente_nome, remetente_unidade, destinatario_id, texto, criado_em')
    .not('destinatario_id', 'is', null)
    .or(`and(remetente_id.eq.${userIdAtual},destinatario_id.eq.${chatConversaAtual}),`
      + `and(remetente_id.eq.${chatConversaAtual},destinatario_id.eq.${userIdAtual})`)
    .order('criado_em', { ascending: false })
    .limit(CHAT_LIMITE_MENSAGENS);

  if (error) { chatMensagens = []; return error.message; }
  chatMensagens = (data || []).reverse(); // mais antiga em cima, como todo chat
  return null;
}

async function marcarConversaLidaChat(outroId) {
  if (!userIdAtual || !outroId) return;
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

  // Busca sem resultado é diferente de agenda vazia: a primeira é o filtro,
  // a segunda quase sempre é a fase65 não ter rodado. Culpar a causa errada
  // faz a pessoa ficar mexendo na busca atrás de gente que a lista nem tem.
  const nada = !online.length && !offline.length;
  if (nada) {
    alvo.innerHTML = `<div class="chat-vazio-mini">${
      busca ? 'Ninguém com esse nome ou unidade.'
            : (chatSemAgenda
                ? 'A agenda ainda não está disponível — falta rodar sql/fase65-chat-contatos.sql no Supabase. Por enquanto só aparece quem já abriu o portal.'
                : 'Nenhuma outra pessoa cadastrada ainda.')
    }</div>`;
    return;
  }

  alvo.innerHTML = `
    <div class="chat-grupo-titulo">Online agora (${online.length})</div>
    ${online.map(item).join('') || '<div class="chat-vazio-mini">Ninguém mais com o portal aberto agora.</div>'}
    <div class="chat-grupo-titulo">Offline (${offline.length})</div>
    ${offline.map(item).join('') || '<div class="chat-vazio-mini">—</div>'}
    ${chatSemAgenda ? '<div class="chat-vazio-mini">Só aparece quem já abriu o portal — falta rodar sql/fase65-chat-contatos.sql.</div>' : ''}
  `;
}

function renderMensagensChat() {
  const alvo = document.getElementById('chatMensagens');
  const topo = document.getElementById('chatConversaTopo');
  if (!alvo || !topo) return;

  if (!chatConversaAtual) {
    topo.innerHTML = `<b>Nenhuma conversa aberta</b>
      <span class="chat-topo-info">escolha um nome na lista ao lado</span>`;
    alvo.innerHTML = `<div class="chat-vazio">Escolha alguém na lista para conversar.
      Quem está offline recebe assim que entrar no portal.</div>`;
    return;
  }

  const p = chatPresencaLista.find(u => u.user_id === chatConversaAtual);
  const on = p && chatEstaOnline(p.ultimo_ping);
  topo.innerHTML = `<b>${escapeHtml(chatNomeDaConversa(chatConversaAtual))}</b>
    <span class="chat-topo-info">${on ? '🟢 online agora' : '⚪ offline — vai ver quando entrar'}${p && p.unidade ? ' · unidade ' + escapeHtml(p.unidade) : ''}</span>`;

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

  // Sem mural, mensagem sem destinatário não existe mais. Sem esta trava ela
  // entraria no banco com destinatario_id nulo -- ou seja, visível pra todo
  // mundo -- justamente o que o Victor pediu pra tirar.
  if (!chatConversaAtual) {
    if (msg) {
      msg.textContent = 'Escolha na lista com quem você quer falar antes de enviar.';
      msg.className = 'status-msg status-err';
    }
    return;
  }

  const btn = document.getElementById('chatEnviarBtn');
  btn.disabled = true;

  const registro = {
    remetente_id: userIdAtual,
    remetente_nome: nomeUsuarioAtual || emailUsuarioAtual || 'Sem nome',
    remetente_unidade: unidadeAtual || null,
    destinatario_id: chatConversaAtual,
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
    // (a agenda não muda de minuto em minuto, mas vem junto no mesmo
    //  carregarPresencaChat -- é uma chamada a mais e mantém nome/unidade
    //  em dia pra quem foi cadastrado agora há pouco)
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

// Botão do cabeçalho: mesma tela do item do menu, só mais perto da mão.
document.getElementById('chatBtn').addEventListener('click', () => {
  if (typeof mostrarPagina === 'function') mostrarPagina('chat');
});

// Enter manda, Shift+Enter quebra linha -- é o que a mão já espera de um chat.
document.getElementById('chatTexto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviarMensagemChat();
  }
});
