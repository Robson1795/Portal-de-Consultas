// Portal de Estoque Kingspan Isoeste — casca da aplicacao
// Menu lateral retratil, cabecalho e navegacao entre paginas por perfil.
//
// ⚠️ ESTE ARQUIVO NAO E SEGURANCA. Ele decide o que APARECE na tela.
// Quem decide o que a pessoa pode LER e ESCREVER e o RLS do Postgres
// (sql/fase1-perfis-e-permissoes.sql). Mesmo que alguem force a exibicao de
// uma pagina pelo inspetor, o banco recusa os dados. O menu existe para a
// pessoa nao ver o que nao lhe diz respeito, nao para trancar a porta.

// ---- Perfis e o que cada um enxerga ----------------------------------------
// Requisicao ALM aparece para TODOS os perfis: qualquer pessoa aprovada pode
// pedir material. Quem atende o pedido e o ALM da unidade.
// Programacao de Separacao NAO aparece para consultor nem para estoque_aco:
// ela move separacao, enderecamento e saida de material de verdade, diferente
// da Requisicao (que e so pedir). Quem faz esse fluxo e o ALM da unidade.
const PERFIS = {
  consultor:   { rotulo: 'Consultor',   paginas: ['estoque', 'sesmt', 'requisicao'] },
  estoque_alm: { rotulo: 'Estoque ALM', paginas: ['estoque', 'sesmt', 'requisicao', 'programacao', 'expacessorios'] },
  estoque_aco: { rotulo: 'Estoque Aço', paginas: ['bobinas', 'requisicao'] },
  admin:       { rotulo: 'Admin',       paginas: ['estoque', 'sesmt', 'bobinas', 'requisicao', 'programacao', 'expacessorios', 'config'] }
};

const PAGINAS = {
  estoque: { rotulo: 'Consulta de Itens', icone: '🔎', elemento: 'estoqueContent' },
  // Estoque SESMT usa a MESMA tela de Consulta de Itens (mesmo formato de
  // dado: item/descricao/UM/local/qtd, na mesma tabela `estoque`), so que
  // com o codigo de unidade UNIDADE_SESMT em vez de uma fabrica -- por isso
  // aponta pro mesmo elemento. Ver a troca de unidade em mostrarPagina().
  sesmt: { rotulo: 'Estoque SESMT', icone: '⛑️', elemento: 'estoqueContent' },
  bobinas: { rotulo: 'Estoque de Aço',    icone: '📦', elemento: 'bobinasContent' },
  requisicao: { rotulo: 'Requisição ALM', icone: '📝', elemento: 'requisicaoContent' },
  programacao: { rotulo: 'Programação de Separação', icone: '🚚', elemento: 'programacaoContent' },
  // Plataforma própria de entrada/saída dos itens já separados na expedição
  // -- não depende das planilhas da Programação, o item pode ser digitado
  // direto no app (ver "Entrada" em js/programacao.js).
  expacessorios: { rotulo: 'Controle EXP Acessórios', icone: '🔄', elemento: 'expAcessoriosContent' },
  config:  { rotulo: 'Configurações',     icone: '⚙️', elemento: 'configContent' }
};

let perfilAtual = 'consultor';
let paginaAtual = null;

function podeVer(pagina) {
  const p = PERFIS[perfilAtual];
  return !!(p && p.paginas.includes(pagina));
}

function rotuloDoPerfil() {
  return (PERFIS[perfilAtual] || {}).rotulo || perfilAtual;
}

// ---- Menu lateral -----------------------------------------------------------
function montarMenu() {
  const nav = document.getElementById('sidebarNav');
  const visiveis = (PERFIS[perfilAtual] || PERFIS.consultor).paginas;

  nav.innerHTML = visiveis.map(id => {
    const p = PAGINAS[id];
    return `<button class="nav-item" data-pagina="${id}">
              <span class="nav-icone">${p.icone}</span>
              <span class="nav-rotulo">${escapeHtml(p.rotulo)}</span>
            </button>`;
  }).join('');

  // Abre na primeira pagina que a pessoa pode ver.
  if (!paginaAtual || !podeVer(paginaAtual)) mostrarPagina(visiveis[0]);
  else marcarItemAtivo();
}

function marcarItemAtivo() {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('ativo', b.dataset.pagina === paginaAtual);
  });
}

// ---- Troca de pagina --------------------------------------------------------
function mostrarPagina(id) {
  if (!PAGINAS[id] || !podeVer(id)) return;

  const indoParaSesmt = (id === 'sesmt');
  const saindoDoSesmt = (paginaAtual === 'sesmt' && id !== 'sesmt');

  Object.values(PAGINAS).forEach(p => {
    const el = document.getElementById(p.elemento);
    if (el) el.style.display = 'none';
  });
  const alvo = document.getElementById(PAGINAS[id].elemento);
  if (alvo) alvo.style.display = 'block';

  paginaAtual = id;
  marcarItemAtivo();
  fecharMenuNoCelular();

  // SESMT reusa a tela de Consulta de Itens, so que com o codigo de unidade
  // proprio (nao e uma fabrica, entao nao aparece no seletor do topo).
  // Entrando: troca a unidade ativa e fixa o topo. Saindo: reconstroi o
  // cabecalho do jeito normal (unidade fabril da pessoa, com ou sem
  // seletor) -- mais seguro que tentar guardar/restaurar o valor anterior.
  if (indoParaSesmt) {
    unidadeAtual = UNIDADE_SESMT;
    const caixa = document.getElementById('topbarLocal');
    if (caixa) caixa.innerHTML = '<span class="pin">⛑️</span><span class="topbar-unidade-fixa">Estoque SESMT</span>';
  } else if (saindoDoSesmt) {
    montarCabecalho();
  }

  // Cada pagina carrega os proprios dados ao ser aberta.
  if (id === 'estoque' || id === 'sesmt') { pararTempoRealBobinas(); loadData(); }
  if (id === 'bobinas') { abrirTelaBobinas(); }
  if (id === 'requisicao') { carregarRequisicao(); }
  if (id === 'programacao') { carregarProgramacao(); }
  // Catálogo EXP primeiro, DEPOIS a Programação -- buscarDescricoesItens()
  // olha catalogoExpItens em memória (não busca de novo), então se essa
  // promise ainda não tivesse terminado (o catálogo tem centenas de linhas,
  // demora mais que o resto), a Descrição/UM saía em branco mesmo pro item
  // que estava certinho no Catálogo. Ver carregarCatalogoExp() e
  // buscarDescricoesItens() em js/programacao.js.
  if (id === 'expacessorios') { trocarAbaExpAcessorios('entrada'); carregarCatalogoExp().then(carregarProgramacao); }
  if (id === 'config')  { carregarUsuarios(); carregarConfigUnidades(); carregarLote(); }
}

document.getElementById('sidebarNav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  // Controle EXP Acessórios não abre direto: primeiro escolhe a unidade e
  // confere a senha dela (abrirGateExp, mais abaixo). Cada unidade só
  // enxerga o próprio estoque -- nunca mistura com as outras.
  if (item.dataset.pagina === 'expacessorios') { abrirGateExp(); return; }
  mostrarPagina(item.dataset.pagina);
});

// ---- Entrada no Controle EXP Acessórios: unidade + senha --------------------
// Mesmo padrão da senha de Contagem Física (js/estoque.js,
// senha_contagem_confere): a senha nunca chega no navegador, o banco só
// responde sim/não (sql/fase9-senha-exp.sql). Fica desbloqueada só nesta
// sessão do navegador (sessionStorage), por unidade.
function unidadeExpDesbloqueada(cod) {
  try { return sessionStorage.getItem('exp_ok_' + cod) === '1'; } catch (err) { return false; }
}
function marcarUnidadeExpDesbloqueada(cod) {
  try { sessionStorage.setItem('exp_ok_' + cod, '1'); } catch (err) { /* sem sessionStorage, so pede de novo */ }
}

function abrirGateExp() {
  const permitidas = (perfilAtual === 'admin')
    ? Object.keys(UNIDADES)
    : (unidadeDoUsuario ? [unidadeDoUsuario] : []);

  if (!permitidas.length) {
    alert('Sua conta ainda não tem unidade definida. Peça ao administrador.');
    return;
  }

  const select = document.getElementById('expGateUnidade');
  select.innerHTML = permitidas.map(c =>
    `<option value="${c}" ${c === unidadeAtual ? 'selected' : ''}>${escapeHtml(rotuloUnidade(c))}</option>`
  ).join('');
  document.getElementById('expGateSenhaInput').value = '';
  document.getElementById('expGateMsg').textContent = '';
  atualizarCampoSenhaGateExp();
  document.getElementById('expGateModal').classList.add('open');
}

function atualizarCampoSenhaGateExp() {
  const uni = document.getElementById('expGateUnidade').value;
  const jaDesbloqueada = unidadeExpDesbloqueada(uni);
  document.getElementById('expGateSenhaInput').style.display = jaDesbloqueada ? 'none' : 'block';
  document.getElementById('expGateEntrarBtn').textContent = jaDesbloqueada ? 'Entrar' : 'Liberar e entrar';
  document.getElementById('expGateMsg').textContent = '';
}

document.getElementById('expGateUnidade').addEventListener('change', atualizarCampoSenhaGateExp);

async function entrarNoControleExp(uni) {
  unidadeAtual = uni;
  document.getElementById('expGateModal').classList.remove('open');
  const sel = document.getElementById('unitSelect'); // topbar, só existe pra admin (varias unidades)
  if (sel) sel.value = uni;
  mostrarPagina('expacessorios');
}

document.getElementById('expGateEntrarBtn').addEventListener('click', async () => {
  const uni = document.getElementById('expGateUnidade').value;
  const msg = document.getElementById('expGateMsg');
  const btn = document.getElementById('expGateEntrarBtn');

  if (unidadeExpDesbloqueada(uni)) {
    await entrarNoControleExp(uni);
    return;
  }

  const tentativa = document.getElementById('expGateSenhaInput').value;
  if (!tentativa) {
    msg.textContent = 'Digite a senha.';
    return;
  }

  btn.disabled = true;
  msg.textContent = 'Conferindo...';
  const { data, error } = await sb.rpc('senha_exp_confere', { uni, tentativa });
  btn.disabled = false;

  if (error) {
    msg.textContent = 'Não foi possível conferir a senha: ' + error.message;
    console.error('Falha ao conferir a senha do Controle EXP:', error.message);
    return;
  }
  if (data !== true) {
    msg.textContent = 'Senha incorreta.';
    return;
  }

  marcarUnidadeExpDesbloqueada(uni);
  await entrarNoControleExp(uni);
});

document.getElementById('expGateSenhaInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('expGateEntrarBtn').click();
});

document.getElementById('expGateCloseBtn').addEventListener('click', () => {
  document.getElementById('expGateModal').classList.remove('open');
});
document.getElementById('expGateModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('expGateModal')) document.getElementById('expGateModal').classList.remove('open');
});

// ---- Abrir e fechar o menu --------------------------------------------------
function alternarMenu() {
  document.getElementById('appShell').classList.toggle('menu-fechado');
}
function fecharMenuNoCelular() {
  if (window.matchMedia('(max-width: 860px)').matches) {
    document.getElementById('appShell').classList.add('menu-fechado');
  }
}
document.getElementById('menuToggle').addEventListener('click', alternarMenu);
document.getElementById('sidebarOverlay').addEventListener('click', fecharMenuNoCelular);

// No celular o menu comeca fechado, para a tabela ocupar a largura toda.
if (window.matchMedia('(max-width: 860px)').matches) {
  document.getElementById('appShell').classList.add('menu-fechado');
}

// ---- Cabecalho --------------------------------------------------------------
function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

function montarCabecalho() {
  document.getElementById('userRoleDisplay').textContent = rotuloDoPerfil();
  document.getElementById('userAvatar').textContent = iniciais(nomeUsuarioAtual);

  // Cada pessoa fica na própria unidade. Somente admin troca.
  // Quem não tem unidade definida não vê unidade nenhuma -- de propósito: é
  // cadastro incompleto, e o certo é o admin definir a unidade em vez de a
  // pessoa enxergar as oito. O RLS aplica a mesma regra no banco.
  const permitidas = (perfilAtual === 'admin')
    ? Object.keys(UNIDADES)
    : (unidadeDoUsuario ? [unidadeDoUsuario] : []);

  const caixa = document.getElementById('topbarLocal');

  if (permitidas.length === 0) {
    unidadeAtual = null;
    caixa.innerHTML = '<span class="pin">\u{1F4CD}</span>' +
      '<span class="topbar-unidade-fixa topbar-sem-unidade">Unidade não definida \u2014 peça ao administrador</span>';
    return;
  }

  if (permitidas.includes(unidadeDoUsuario)) unidadeAtual = unidadeDoUsuario;
  else if (!permitidas.includes(unidadeAtual)) unidadeAtual = permitidas[0];
  if (permitidas.length === 1) {
    caixa.innerHTML = `<span class="pin">📍</span><span class="topbar-unidade-fixa">${escapeHtml(rotuloUnidade(permitidas[0]))}</span>`;
  } else {
    caixa.innerHTML = `<span class="pin">📍</span>
      <select id="unitSelect" class="unit-select">${permitidas.map(c =>
        `<option value="${c}" ${c === unidadeAtual ? 'selected' : ''}>${escapeHtml(rotuloUnidade(c))}</option>`
      ).join('')}</select>`;
    document.getElementById('unitSelect').addEventListener('change', (e) => {
      // Trocar a unidade pelo seletor do topo enquanto está no Controle EXP
      // Acessórios não pode pular a senha daquela unidade -- senão bastava
      // trocar aqui em vez de usar o botão do menu pra escapar da senha.
      if (paginaAtual === 'expacessorios') {
        const escolhida = e.target.value;
        e.target.value = unidadeAtual; // volta o seletor pra unidade atual até confirmar a senha
        abrirGateExp(); // popula as opções e reseta o modal
        document.getElementById('expGateUnidade').value = escolhida;
        atualizarCampoSenhaGateExp();
        return;
      }
      trocarUnidade(e.target.value);
    });
  }
}
