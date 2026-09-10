// Portal de Estoque Kingspan Isoeste — casca da aplicacao
// Menu lateral retratil, cabecalho e navegacao entre paginas por perfil.
//
// ⚠️ ESTE ARQUIVO NAO E SEGURANCA. Ele decide o que APARECE na tela.
// Quem decide o que a pessoa pode LER e ESCREVER e o RLS do Postgres
// (sql/fase1-perfis-e-permissoes.sql). Mesmo que alguem force a exibicao de
// uma pagina pelo inspetor, o banco recusa os dados. O menu existe para a
// pessoa nao ver o que nao lhe diz respeito, nao para trancar a porta.

// ---- Perfis e o que cada um enxerga ----------------------------------------
// ⚠️ CONSULTOR SO CONSULTA (10/09/2026, pedido do Victor: "Consultor apenas
// consulta de itens, restringir deposito SESMT e requisicao ALM"). Ele perdeu
// o Deposito SESMT e a Requisicao ALM -- e uma REVERSAO da decisao anterior,
// que abria a Requisicao para todo perfil ("qualquer pessoa aprovada pode
// pedir material"). Se a Requisicao voltar a ser de todos, mexa TAMBEM no
// RLS: sql/fase31-consultor-so-consulta.sql fechou a criacao no banco, e so
// devolver a pagina no menu nao devolveria a permissao.
// Programacao de Separacao NAO aparece para consultor nem para estoque_aco:
// ela move separacao, enderecamento e saida de material de verdade, diferente
// da Requisicao (que e so pedir). Quem faz esse fluxo e o ALM da unidade.
const PERFIS = {
  consultor:   { rotulo: 'Consultor',   paginas: ['estoque'] },
  estoque_alm: { rotulo: 'Estoque ALM', paginas: ['estoque', 'sesmt', 'requisicao', 'programacao', 'expacessorios', 'expbenchmark', 'analise'] },
  estoque_aco: { rotulo: 'Estoque Aço', paginas: ['bobinas', 'requisicao'] },
  admin:       { rotulo: 'Admin',       paginas: ['estoque', 'sesmt', 'bobinas', 'requisicao', 'programacao', 'expacessorios', 'expbenchmark', 'analise', 'config'] }
};

const PAGINAS = {
  estoque: { rotulo: 'Consulta de Itens', icone: '🔎', elemento: 'estoqueContent' },
  // Depósito SESMT usa a MESMA tela de Consulta de Itens (mesmo formato de
  // dado: item, descrição, UM, localização, quantidade), só que recortada
  // pelo depósito 'sesmt' em vez de 'alm' -- ver DEPOSITOS em js/estoque.js.
  sesmt: { rotulo: 'Depósito SESMT', icone: '⛑️', elemento: 'estoqueContent' },
  bobinas: { rotulo: 'Estoque de Aço',    icone: '📦', elemento: 'bobinasContent' },
  requisicao: { rotulo: 'Requisição ALM', icone: '📝', elemento: 'requisicaoContent' },
  programacao: { rotulo: 'Programação de Separação', icone: '🚚', elemento: 'programacaoContent' },
  // Plataforma própria de entrada/saída dos itens já separados na expedição
  // -- não depende das planilhas da Programação, o item pode ser digitado
  // direto no app (ver "Entrada" em js/programacao.js).
  expacessorios: { rotulo: 'Controle EXP Acessórios', icone: '🔄', elemento: 'expAcessoriosContent' },
  // Depósito Benchmark usava a MESMA tela do Controle EXP Acessórios
  // (exp_controle_itens, filtrada por `setor` -- ver sql/fase18-deposito-
  // benchmark.sql), com pedido/etiqueta/status. O Robson pediu pra trocar
  // isso por saldo simples, igual ao Almoxarifado/SESMT (10/09/2026): "quero
  // que mude a estrutura igual como é do almoxarifado". Agora usa a MESMA
  // tela de Consulta de Itens, só que recortada pelo depósito 'benchmark'
  // em vez de 'alm' -- ver DEPOSITOS em js/estoque.js, mesmo padrão do
  // Depósito SESMT logo acima. O `id` da página continua 'expbenchmark' de
  // propósito, pra não precisar mexer nas listas de PERFIS abaixo.
  expbenchmark: { rotulo: 'Depósito Benchmark', icone: '🏭', elemento: 'estoqueContent' },
  // Demanda dos pedidos x saldo do almoxarifado: o que falta comprar.
  // Só lê o estoque -- não mexe em saldo nenhum (ver js/analise.js).
  analise: { rotulo: 'Análise de Compras', icone: '📊', elemento: 'analiseComprasContent' },
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
  // 'analise' tem uma segunda trava, além do perfil: acesso restrito por
  // pessoa/responsável de unidade (podeVerAnaliseCache, atualizada em
  // js/auth.js antes de chamar montarMenu -- ver atualizarPermissaoAnalise()
  // em js/analise.js). Perfil decide o SETOR (Estoque ALM vê a página, aço
  // não vê); esta trava decide QUEM dentro do setor. Não mistura as duas.
  const visiveis = (PERFIS[perfilAtual] || PERFIS.consultor).paginas
    .filter(id => id !== 'analise' || podeVerAnaliseCache);

  nav.innerHTML = visiveis.map(id => {
    const p = PAGINAS[id];
    return `<button class="nav-item" data-pagina="${id}">
              <span class="nav-icone">${p.icone}</span>
              <span class="nav-rotulo">${escapeHtml(p.rotulo)}</span>
            </button>`;
  }).join('');

  // ⚠️ O botão de sugestão apareceu primeiro SÓ para consultor (o Robson,
  // 10/09/2026: "quero que crie um botão para que os consultores coloquem
  // sugestões de melhorias" -- é quem tem menos tela e nenhum outro canal
  // dentro do portal). No mesmo dia o Victor pediu a caixa de sugestões no
  // "tutorial de TODOS os cargos", e um passo de tutorial apontando um botão
  // que a pessoa não tem é pior que não ter o passo: ela procura e não acha.
  //
  // Então o botão passou a aparecer para todo perfil. Quem RECEBE não mudou --
  // continua sendo `eh_super_admin()` no RLS (Robson e Victor), e a leitura da
  // lista continua só para eles. Para voltar ao desenho original, é esta linha:
  // `(perfilAtual === 'consultor') ? '' : 'none'`.
  const btnSugestao = document.getElementById('sugestaoBtn');
  if (btnSugestao) btnSugestao.style.display = '';

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
  if (id === 'analise' && !podeVerAnaliseCache) return; // mesma trava do menu, ver montarMenu()

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

  // SESMT e Benchmark reusam a tela de Consulta de Itens, e o que muda entre
  // as três é o DEPÓSITO -- não a unidade. Até 09/09/2026 o SESMT trocava
  // `unidadeAtual` por um código falso ('SESMT') e escondia o seletor do
  // topo: existia um estoque de EPI para a empresa inteira. Agora a unidade
  // continua a mesma (o seletor segue funcionando, para admin) e só o
  // depósito muda. Benchmark seguiu o mesmo caminho em 10/09/2026 (ver
  // comentário em PAGINAS.expbenchmark). Ver DEPOSITOS em js/estoque.js.
  const PAGINA_PARA_DEPOSITO = { estoque: 'alm', sesmt: 'sesmt', expbenchmark: 'benchmark' };
  if (PAGINA_PARA_DEPOSITO[id]) {
    depositoAtual = PAGINA_PARA_DEPOSITO[id];
    montarCabecalho();   // redesenha o crachá do depósito ao lado da unidade
  }

  // Cada pagina carrega os proprios dados ao ser aberta.
  if (PAGINA_PARA_DEPOSITO[id]) { pararTempoRealBobinas(); loadData(); }
  if (id === 'bobinas') { abrirTelaBobinas(); }
  if (id === 'requisicao') { carregarRequisicao(); }
  if (id === 'programacao') { carregarProgramacao(); }
  // Catálogo EXP primeiro, DEPOIS a Programação -- buscarDescricoesItens()
  // olha catalogoExpItens em memória (não busca de novo), então se essa
  // promise ainda não tivesse terminado (o catálogo tem centenas de linhas,
  // demora mais que o resto), a Descrição/UM saía em branco mesmo pro item
  // que estava certinho no Catálogo. Ver carregarCatalogoExp() e
  // buscarDescricoesItens() em js/programacao.js.
  //
  // 'expbenchmark' NÃO entra mais aqui (10/09/2026): parou de ser a mesma
  // tela do Controle EXP Acessórios, virou a mesma tela de Consulta de
  // Itens (tratada acima, junto com estoque/sesmt).
  if (id === 'expacessorios') {
    setorExpAtual = 'exp';
    atualizarTituloSetorExp();
    trocarAbaExpAcessorios('entrada');
    carregarCatalogoExp().then(carregarProgramacao);
  }
  if (id === 'analise') { carregarAnalise(); }
  if (id === 'config')  { carregarUsuarios(); carregarConfigUnidades(); carregarLote(); carregarSugestoes(); }
}

document.getElementById('sidebarNav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  // Controle EXP Acessórios não abre direto: primeiro escolhe a unidade e
  // confere a senha dela (abrirGateExp, mais abaixo). Cada unidade só
  // enxerga o próprio estoque -- nunca mistura com as outras.
  //
  // Depósito Benchmark NÃO entra mais aqui (10/09/2026): virou a mesma tela
  // de Consulta de Itens (Almoxarifado/SESMT), que nunca pediu senha própria
  // -- a senha existia para proteger o registro de pedido/etiqueta do
  // modelo antigo, que não existe mais nesta tela. A permissão de verdade
  // continua sendo o RLS por unidade/perfil, igual ao Almoxarifado/SESMT.
  if (item.dataset.pagina === 'expacessorios') {
    abrirGateExp(item.dataset.pagina);
    return;
  }
  mostrarPagina(item.dataset.pagina);
});

// ---- Entrada no Controle EXP Acessórios / Depósito Benchmark: unidade + senha
// Mesmo padrão da senha de Contagem Física (js/estoque.js,
// senha_contagem_confere): a senha nunca chega no navegador, o banco só
// responde sim/não (sql/fase9-senha-exp.sql). Fica desbloqueada só nesta
// sessão do navegador (sessionStorage), por unidade -- vale pras duas telas
// (mesma senha, mesma área física de expedição, só o setor muda).
function unidadeExpDesbloqueada(cod) {
  try { return sessionStorage.getItem('exp_ok_' + cod) === '1'; } catch (err) { return false; }
}
function marcarUnidadeExpDesbloqueada(cod) {
  try { sessionStorage.setItem('exp_ok_' + cod, '1'); } catch (err) { /* sem sessionStorage, so pede de novo */ }
}

// Qual página abrir depois da senha confirmada -- guardado aqui porque o
// clique no botão "Entrar" do modal não sabe de onde veio. Só
// 'expacessorios' usa o gate desde 10/09/2026 (Depósito Benchmark deixou de
// pedir senha, ver PAGINAS.expbenchmark), mas o parâmetro continua genérico
// caso outra página precise um dia.
let gateAlvoPagina = 'expacessorios';

function abrirGateExp(alvoPagina) {
  gateAlvoPagina = alvoPagina || 'expacessorios';
  document.getElementById('expGateTitulo').textContent = PAGINAS[gateAlvoPagina].rotulo;
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
  mostrarPagina(gateAlvoPagina);
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
  // Crachá do depósito, ao lado da unidade: as duas telas são a MESMA, e sem
  // isto não há nada dizendo se o que está listado é o almoxarifado ou o EPI.
  const cracha = (depositoAtual && depositoAtual !== 'alm')
    ? `<span class="topbar-deposito">${DEPOSITOS[depositoAtual].icone} ${escapeHtml(rotuloDeposito())}</span>`
    : '';

  if (permitidas.length === 1) {
    caixa.innerHTML = `<span class="pin">📍</span><span class="topbar-unidade-fixa">${escapeHtml(rotuloUnidade(permitidas[0]))}</span>` + cracha;
  } else {
    caixa.innerHTML = `<span class="pin">📍</span>
      <select id="unitSelect" class="unit-select">${permitidas.map(c =>
        `<option value="${c}" ${c === unidadeAtual ? 'selected' : ''}>${escapeHtml(rotuloUnidade(c))}</option>`
      ).join('')}</select>` + cracha;
    document.getElementById('unitSelect').addEventListener('change', (e) => {
      // Trocar a unidade pelo seletor do topo enquanto está no Controle EXP
      // Acessórios não pode pular a senha daquela unidade -- senão bastava
      // trocar aqui em vez de usar o botão do menu pra escapar da senha.
      // Depósito Benchmark NÃO entra mais aqui (10/09/2026): não tem senha
      // pra pular, igual ao Almoxarifado/SESMT logo abaixo.
      if (paginaAtual === 'expacessorios') {
        const escolhida = e.target.value;
        e.target.value = unidadeAtual; // volta o seletor pra unidade atual até confirmar a senha
        abrirGateExp(paginaAtual); // popula as opções e reseta o modal, mantendo a mesma tela de destino
        document.getElementById('expGateUnidade').value = escolhida;
        atualizarCampoSenhaGateExp();
        return;
      }
      trocarUnidade(e.target.value);
    });
  }
}

// ---- Alternar claro/escuro ------------------------------------------------
//
// O tema em si e aplicado por um script no <head> do index.html, antes de a
// tela ser pintada (ver o comentario de la). Aqui fica so o clique e o icone.
//
// O icone mostra PARA ONDE vai, nao onde esta: no claro aparece a lua (clique
// pra escurecer), no escuro aparece o sol. Mostrar o estado atual e a fonte
// classica de confusao nesse botao.
function aplicarTema(tema) {
  const escuro = tema === 'escuro';
  document.documentElement.setAttribute('data-tema', escuro ? 'escuro' : 'claro');
  // Os DOIS botoes recebem o icone: o do cabecalho do portal e o do hero
  // do login. So um deles esta na tela em cada momento, mas quem troca o
  // tema no login ja entra no portal com o botao certo.
  ['temaToggle', 'temaToggleLogin'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.textContent = escuro ? '\u2600\uFE0F' : '\u{1F319}';
    b.title = escuro ? 'Voltar para o modo claro' : 'Alternar para o modo escuro';
  });
  try { localStorage.setItem('portal_tema', escuro ? 'escuro' : 'claro'); }
  catch (e) { /* sem localStorage: vale so nesta aba */ }
}

['temaToggle', 'temaToggleLogin'].forEach(id => {
  const b = document.getElementById(id);
  if (b) b.addEventListener('click', () => {
    const escuroAgora = document.documentElement.getAttribute('data-tema') === 'escuro';
    aplicarTema(escuroAgora ? 'claro' : 'escuro');
  });
});

// Acerta o icone na carga: o <head> ja aplicou o tema, mas o botao ainda nao
// existia naquele momento.
aplicarTema(document.documentElement.getAttribute('data-tema') === 'escuro' ? 'escuro' : 'claro');
