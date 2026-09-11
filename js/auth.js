// Portal de Estoque Kingspan Isoeste — login, cadastro, aprovacao e troca de tela
// Extraido do index.html na Fase 2a (03/09/2026), sem alteracao de conteudo.
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.

// ---- Autenticação ----
let authMode = 'login'; // ou 'signup'
let nomeCadastroPendente = '';
let unidadeCadastroPendente = '';
let cargoCadastroPendente = '';

const authScreen = document.getElementById('authScreen');
const pendingScreen = document.getElementById('pendingScreen');
const portalScreen = document.getElementById('portalScreen');
const tabLoginBtn = document.getElementById('tabLoginBtn');
const tabSignupBtn = document.getElementById('tabSignupBtn');
const authNomeCompleto = document.getElementById('authNomeCompleto');
const authUnidade = document.getElementById('authUnidade');
const authCargo = document.getElementById('authCargo');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authMsg = document.getElementById('authMsg');
const logoutBtn = document.getElementById('logoutBtn');
const logoutBtnPending = document.getElementById('logoutBtnPending');

function setAuthMode(mode) {
  authMode = mode;
  authMsg.textContent = '';
  if (mode === 'login') {
    tabLoginBtn.className = 'btn btn-primary';
    tabSignupBtn.className = 'btn';
    authSubmitBtn.textContent = 'Entrar';
    authNomeCompleto.style.display = 'none';
    authUnidade.style.display = 'none';
    authCargo.style.display = 'none';
  } else {
    tabLoginBtn.className = 'btn';
    tabSignupBtn.className = 'btn btn-primary';
    authSubmitBtn.textContent = 'Criar conta';
    authNomeCompleto.style.display = 'block';
    authUnidade.style.display = 'block';
    authCargo.style.display = 'block';
    // Preenchido daqui porque a lista de unidades vive em js/estoque.js.
    if (authUnidade.options.length <= 1) {
      authUnidade.innerHTML = '<option value="">Selecione a unidade...</option>' +
        Object.keys(UNIDADES).map(c => `<option value="${c}">${escapeHtml(rotuloUnidade(c))}</option>`).join('');
    }
  }
}
tabLoginBtn.addEventListener('click', () => setAuthMode('login'));
tabSignupBtn.addEventListener('click', () => setAuthMode('signup'));
setAuthMode('login');

// ENTER confirma, em qualquer um dos campos de texto do cartao de acesso
// (usuario, senha e, no cadastro, o nome completo). Digitar a senha e ter
// de ir com o mouse ate o botao e o tipo de atrito que faz a pessoa achar
// que a tela travou. Os <select> de unidade e cargo ficam de fora: ali o
// Enter e do proprio menu do navegador.
[authEmail, authPassword, authNomeCompleto].forEach(campo => {
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authSubmitBtn.click();
  });
});

authSubmitBtn.addEventListener('click', async () => {
  const valorDigitado = authEmail.value.trim();
  const email = resolverIdentificador(valorDigitado);
  const password = authPassword.value;
  if (!valorDigitado || !password) {
    authMsg.textContent = 'Preencha usuário e senha.';
    authMsg.className = 'status-msg status-err';
    return;
  }
  if (authMode === 'signup') {
    // Unidade e cargo sao obrigatorios: sem unidade a pessoa nao consegue
    // contar, e sem cargo o administrador nao sabe o que aprovar.
    if (!authNomeCompleto.value.trim()) {
      authMsg.textContent = 'Preencha seu nome completo.';
      authMsg.className = 'status-msg status-err';
      return;
    }
    if (!authUnidade.value) {
      authMsg.textContent = 'Selecione a sua unidade.';
      authMsg.className = 'status-msg status-err';
      return;
    }
    if (!authCargo.value) {
      authMsg.textContent = 'Selecione o seu cargo.';
      authMsg.className = 'status-msg status-err';
      return;
    }
  }
  authMsg.textContent = authMode === 'login' ? 'Entrando...' : 'Criando conta...';
  authMsg.className = 'status-msg';
  try {
    if (authMode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      nomeCadastroPendente = authNomeCompleto.value.trim();
      unidadeCadastroPendente = authUnidade.value;
      cargoCadastroPendente = authCargo.value;
      const { error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      authMsg.textContent = 'Conta criada! Entrando...';
    }
  } catch (e) {
    authMsg.textContent = 'Erro: ' + e.message;
    authMsg.className = 'status-msg status-err';
  }
});

logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut();
});

logoutBtnPending.addEventListener('click', async () => {
  await sb.auth.signOut();
});

async function registrarAcesso(user) {
  try {
    await sb.from('acessos').insert({ user_id: user.id, email: user.email });
  } catch (e) {
    // não bloqueia o uso do portal se o log falhar
    console.warn('Falha ao registrar acesso:', e.message);
  }
}

// Avisa quem aprova que alguém acabou de se cadastrar. Quem RECEBE fica em
// js/notificacoes.js (iniciarAvisoCadastro) -- desde 11/09/2026 é um popup no
// canto, em qualquer tela, e não mais um banner dentro de Configurações.
// esperar resposta -- só chega em quem estiver com o portal aberto na hora
// (mesmo padrão de dispararAlertaBobina() em js/ocr.js). Não bloqueia o
// cadastro se falhar: quem está se cadastrando não pode ficar preso porque
// o aviso não saiu.
function dispararAlertaCadastro({ nome, email, unidade }) {
  try {
    sb.channel('alertas-cadastro').send({
      type: 'broadcast', event: 'novo_cadastro',
      payload: { nome: nome || null, email, unidade: unidade || null, quando: new Date().toISOString() }
    });
  } catch (e) {
    console.warn('Não foi possível avisar sobre o novo cadastro:', e.message);
  }
}

// Garante que existe uma linha em usuarios_permitidos para este usuário,
// e retorna { aprovado, nome }.
async function verificarAprovacao(user) {
  // Tenta criar a solicitação (se já existir, ignora o erro de duplicidade)
  try {
    // O cargo aqui e um PEDIDO. Um gatilho no banco recusa 'admin' e forca
    // aprovado = false, entao escolher cargo no cadastro nao da acesso a nada
    // -- quem libera e o administrador, na aba Configuracoes.
    // `error` conferido de propósito (e não só o `await` sem checar nada, como
    // este bloco fazia antes): `.insert()` do PostgREST NÃO lança exceção
    // para chave duplicada, só devolve `error` preenchido -- o `catch` deste
    // try só pegaria falha de rede. É o `error` aqui que diz se a linha era
    // NOVA de verdade (sem ele, dispararAlertaCadastro() avisaria Robson e
    // Victor toda vez que qualquer pessoa já cadastrada abrisse o portal).
    const { error: erroInsercao } = await sb.from('usuarios_permitidos').insert({
      user_id: user.id,
      email: user.email,
      nome: nomeCadastroPendente || null,
      unidade: unidadeCadastroPendente || null,
      perfil: cargoCadastroPendente || 'consultor'
    });
    if (!erroInsercao) {
      dispararAlertaCadastro({
        nome: nomeCadastroPendente, email: user.email, unidade: unidadeCadastroPendente
      });
    }
    nomeCadastroPendente = '';
    unidadeCadastroPendente = '';
    cargoCadastroPendente = '';
  } catch (e) {
    // ja existe uma linha para esse usuario - segue normalmente
  }

  // As colunas perfil/unidade/localizacao entraram na Fase 1. Se o banco ainda
  // nao tiver rodado o script, a consulta falha -- entao cai para o formato
  // antigo em vez de deixar a tela em branco.
  let { data, error } = await sb.from('usuarios_permitidos')
    .select('aprovado, nome, perfil, unidade').eq('user_id', user.id).maybeSingle();
  if (error) {
    console.warn('Colunas de perfil ausentes, usando o formato antigo:', error.message);
    ({ data, error } = await sb.from('usuarios_permitidos')
      .select('aprovado, nome').eq('user_id', user.id).maybeSingle());
  }
  if (error || !data) return { aprovado: false, nome: null, perfil: null, unidade: null };
  return {
    aprovado: data.aprovado === true,
    nome: data.nome,
    perfil: data.perfil || null,
    unidade: data.unidade || null
  };
}

function nomeParaExibir(user, nomeSalvo) {
  if (nomeSalvo) return nomeSalvo;
  const email = user.email || '';
  const parteAntes = email.split('@')[0];
  // Deixa mais legível: troca pontos por espaço e capitaliza cada palavra
  return parteAntes
    .replace(/[._]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

let isAdminAtual = false;
let emailUsuarioAtual = '';
let unidadeDoUsuario = null;
let userIdAtual = null;   // usado pela aba Configuracoes para travar a propria linha

async function ehGerenteDaUnidade(email, unidade) {
  if (!email) return false;
  const { data } = await sb.from('gerentes_unidade').select('email').eq('unidade', unidade).eq('email', email.toLowerCase()).maybeSingle();
  return !!data;
}

async function atualizarBotaoEditar() {
  const podeEditar = isAdminAtual || await ehGerenteDaUnidade(emailUsuarioAtual, unidadeAtual);
  document.getElementById('editToggleRow').style.display = podeEditar ? 'flex' : 'none';
}

async function mostrarTelaCorreta(session) {
  const user = session.user;
  emailUsuarioAtual = (user.email || '').toLowerCase();
  userIdAtual = user.id;

  const { aprovado, nome, perfil, unidade } = await verificarAprovacao(user);

  // O perfil guardado manda, com uma excecao: os super admins valem como admin
  // mesmo que a coluna diga outra coisa -- e o que o eh_super_admin() faz no
  // banco. Sem isso a tela mostraria um cargo que o RLS nao aplica.
  const ehSuper = SUPER_ADMINS.includes(emailUsuarioAtual);
  perfilAtual      = ehSuper ? 'admin' : (perfil || 'consultor');
  isAdminAtual     = perfilAtual === 'admin';
  unidadeDoUsuario = unidade || null;
  nomeUsuarioAtual = nomeParaExibir(user, nome);

  // innerHTML para poder colorir so o nome. O nome vem de usuarios_permitidos,
  // digitado pela propria pessoa no cadastro, entao passa por escapeHtml.
  const nomeSeguro = escapeHtml(nomeUsuarioAtual);
  const ehDestaque = nomeUsuarioAtual.trim().toLowerCase() === NOME_DESTAQUE;
  document.getElementById('userNameDisplay').innerHTML = ehDestaque
    ? `<span style="color:${COR_NOME_DESTAQUE};">${nomeSeguro}</span>`
    : nomeSeguro;

  // Super admin entra mesmo sem linha aprovada, para nunca ficar trancado fora.
  const liberado = aprovado || ehSuper;

  if (liberado) {
    authScreen.style.display = 'none';
    pendingScreen.style.display = 'none';
    portalScreen.style.display = 'block';
    montarCabecalho();
    await atualizarPermissaoAnalise(); // precisa rodar antes do menu, pra saber se mostra "Análise de Compras"
    montarMenu();           // ja abre a primeira pagina permitida
    await atualizarBotaoEditar();
    // O botão de contagem virou trava por cargo quando a senha saiu (11/09/2026):
    // sem esta chamada ele apareceria para todo mundo, inclusive para quem o
    // banco recusaria em cada linha digitada.
    atualizarBotaoContagem();
    // Depois do menu: os passos do tour apontam pros itens do menu, que
    // antes de montarMenu() nem existem no DOM (ver js/tour.js).
    iniciarTourSePrimeiraVez();
    // Depois do menu, pelo mesmo motivo do tour: `perfilAtual` só vale a
    // partir daqui, e a notificação é recortada por perfil.
    iniciarAvisoCadastro();
  } else {
    authScreen.style.display = 'none';
    pendingScreen.style.display = 'block';
    portalScreen.style.display = 'none';
  }
  return liberado;
}

sb.auth.onAuthStateChange(async (event, session) => {
  if (session && session.user) {
    const aprovado = await mostrarTelaCorreta(session);
    if (aprovado && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      registrarAcesso(session.user);
      // Os dados sao carregados por mostrarPagina(), chamada em montarMenu().
    }
  } else {
    authScreen.style.display = 'block';
    pendingScreen.style.display = 'none';
    portalScreen.style.display = 'none';
  }
});

