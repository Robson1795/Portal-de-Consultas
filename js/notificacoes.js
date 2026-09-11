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

function mostrarNotificacao({ icone, titulo, texto, acaoRotulo, aoClicarAcao, chave }) {
  const caixa = caixaNotificacoes();
  if (!caixa) return null;

  // `chave` evita duplicata: o mesmo cadastro chegando pelo aviso ao vivo e
  // pela conferência de quem entrou depois viraria dois cartões iguais.
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
