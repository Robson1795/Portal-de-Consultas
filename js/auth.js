// Portal de Estoque Kingspan Isoeste — login, cadastro, aprovacao e troca de tela
// Extraido do index.html na Fase 2a (03/09/2026), sem alteracao de conteudo.
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.

// ---- Autenticação ----
let authMode = 'login'; // ou 'signup'
let nomeCadastroPendente = '';

const authScreen = document.getElementById('authScreen');
const pendingScreen = document.getElementById('pendingScreen');
const portalScreen = document.getElementById('portalScreen');
const tabLoginBtn = document.getElementById('tabLoginBtn');
const tabSignupBtn = document.getElementById('tabSignupBtn');
const authNomeCompleto = document.getElementById('authNomeCompleto');
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
  } else {
    tabLoginBtn.className = 'btn';
    tabSignupBtn.className = 'btn btn-primary';
    authSubmitBtn.textContent = 'Criar conta';
    authNomeCompleto.style.display = 'block';
  }
}
tabLoginBtn.addEventListener('click', () => setAuthMode('login'));
tabSignupBtn.addEventListener('click', () => setAuthMode('signup'));
setAuthMode('login');

authSubmitBtn.addEventListener('click', async () => {
  const valorDigitado = authEmail.value.trim();
  const email = resolverIdentificador(valorDigitado);
  const password = authPassword.value;
  if (!valorDigitado || !password) {
    authMsg.textContent = 'Preencha usuário e senha.';
    authMsg.className = 'status-msg status-err';
    return;
  }
  if (authMode === 'signup' && !authNomeCompleto.value.trim()) {
    authMsg.textContent = 'Preencha seu nome completo.';
    authMsg.className = 'status-msg status-err';
    return;
  }
  authMsg.textContent = authMode === 'login' ? 'Entrando...' : 'Criando conta...';
  authMsg.className = 'status-msg';
  try {
    if (authMode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      nomeCadastroPendente = authNomeCompleto.value.trim();
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

// Garante que existe uma linha em usuarios_permitidos para este usuário,
// e retorna { aprovado, nome }.
async function verificarAprovacao(user) {
  // Tenta criar a solicitação (se já existir, ignora o erro de duplicidade)
  try {
    await sb.from('usuarios_permitidos').insert({ user_id: user.id, email: user.email, nome: nomeCadastroPendente || null });
    nomeCadastroPendente = '';
  } catch (e) {
    // ja existe uma linha para esse usuario - segue normalmente
  }

  // As colunas perfil/unidade/localizacao entraram na Fase 1. Se o banco ainda
  // nao tiver rodado o script, a consulta falha -- entao cai para o formato
  // antigo em vez de deixar a tela em branco.
  let { data, error } = await sb.from('usuarios_permitidos')
    .select('aprovado, nome, perfil, unidade, localizacao').eq('user_id', user.id).maybeSingle();
  if (error) {
    console.warn('Colunas de perfil ausentes, usando o formato antigo:', error.message);
    ({ data, error } = await sb.from('usuarios_permitidos')
      .select('aprovado, nome').eq('user_id', user.id).maybeSingle());
  }
  if (error || !data) return { aprovado: false, nome: null, perfil: null, unidade: null, localizacao: null };
  return {
    aprovado: data.aprovado === true,
    nome: data.nome,
    perfil: data.perfil || null,
    unidade: data.unidade || null,
    localizacao: data.localizacao || null
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

  const { aprovado, nome, perfil, unidade, localizacao } = await verificarAprovacao(user);

  // O perfil guardado manda, com uma excecao: os super admins valem como admin
  // mesmo que a coluna diga outra coisa -- e o que o eh_super_admin() faz no
  // banco. Sem isso a tela mostraria um cargo que o RLS nao aplica.
  const ehSuper = SUPER_ADMINS.includes(emailUsuarioAtual);
  perfilAtual      = ehSuper ? 'admin' : (perfil || 'consultor');
  isAdminAtual     = perfilAtual === 'admin';
  unidadeDoUsuario = unidade || null;
  localizacaoAtual = localizacao || null;
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
    montarMenu();           // ja abre a primeira pagina permitida
    await atualizarBotaoEditar();
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

