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
  consultor:   { rotulo: 'Consultor',   paginas: ['painel', 'estoque'] },
  estoque_alm: { rotulo: 'Estoque ALM', paginas: ['painel', 'estoque', 'sesmt', 'requisicao', 'programacao', 'expacessorios', 'docas', 'expbenchmark', 'debitodireto', 'analise', 'mfg'] },
  estoque_aco: { rotulo: 'Estoque Aço', paginas: ['painel', 'bobinas', 'requisicao'] },
  admin:       { rotulo: 'Admin',       paginas: ['painel', 'estoque', 'sesmt', 'bobinas', 'requisicao', 'programacao', 'expacessorios', 'docas', 'expbenchmark', 'debitodireto', 'analise', 'mfg', 'config'] }
};

const PAGINAS = {
  // ⚠️ PRIMEIRO da lista de propósito: `montarMenu()` abre `visiveis[0]`, então
  // é esta a tela que recebe quem acabou de entrar. O portal deixou de esperar
  // a pessoa procurar o problema na tela certa (ver js/painel.js).
  painel: { rotulo: 'Painel do Dia', icone: '🏠', elemento: 'painelContent' },
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
  // Painel de Docas fica LOGO ABAIXO do Controle EXP no menu (Robson,
  // 14/09/2026: "crie uma nova aba debaixo do controle exp") -- a ordem
  // do menu é a ordem desta lista em PERFIS, não a daqui. É a mesma
  // operação, um passo depois: o Controle EXP diz que o item saiu do
  // endereço, o Painel diz em qual doca e em qual caminhão ele entrou.
  docas: { rotulo: 'Painel de Docas', icone: '🚛', elemento: 'docasContent' },
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
  // Material que está fisicamente no almoxarifado mas não tem código
  // nenhum no sistema (Robson, 15/09/2026: "itens que temos no estoque mas
  // nao esta no sistema") -- cadastro livre (nome do material +
  // localização), sem depender de planilha, e com a mesma impressão de
  // etiqueta da Trading (ver js/debitodireto.js). Tabela própria
  // (sql/fase50), não reaproveita `estoque`: aquela é sempre item de
  // código conhecido, substituída em lote a cada importação.
  debitodireto: { rotulo: 'Itens Débito Direto', icone: '🏷️', elemento: 'debitoDiretoContent' },
  // Demanda dos pedidos x saldo do almoxarifado: o que falta comprar.
  // Só lê o estoque -- não mexe em saldo nenhum (ver js/analise.js).
  analise: { rotulo: 'Análise de Compras', icone: '📊', elemento: 'analiseComprasContent' },
  // Análise MFG: consumo teórico x reportado por OP, e o dinheiro que isso
  // custou ou economizou. Vem logo depois da Análise de Compras porque é a
  // outra metade da mesma pergunta -- aquela olha o que falta ENTRAR, esta
  // olha o que saiu a mais do que devia. Não escreve em estoque nenhum: lê
  // um arquivo, calcula e guarda só o resultado (ver js/mfg.js).
  mfg: { rotulo: 'Análise MFG', icone: '📐', elemento: 'mfgContent' },
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
  // 'analise' e 'debitodireto' têm uma segunda trava, além do perfil: acesso
  // restrito por lista de pessoas (podeVerAnaliseCache/podeVerDebitoDiretoCache,
  // atualizadas em js/auth.js antes de chamar montarMenu -- ver
  // atualizarPermissaoAnalise() em js/analise.js e
  // atualizarPermissaoDebitoDireto() em js/debitodireto.js). Perfil decide o
  // SETOR (Estoque ALM vê a página, aço não vê); esta trava decide QUEM
  // dentro do setor. Não mistura as duas.
  const visiveis = (PERFIS[perfilAtual] || PERFIS.consultor).paginas
    .filter(id => id !== 'analise' || podeVerAnaliseCache)
    .filter(id => id !== 'debitodireto' || podeVerDebitoDiretoCache);

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
  if (id === 'debitodireto' && !podeVerDebitoDiretoCache) return; // idem

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
  if (id === 'painel') { carregarPainel(); }
  if (id === 'bobinas') { abrirTelaBobinas(); }
  if (id === 'requisicao') { carregarRequisicao(); }
  if (id === 'mfg') { carregarMfg(); }
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
  // Painel de Docas: o tempo real fica ligado só enquanto a tela está
  // aberta (mesmo padrão da contagem física em js/estoque.js) -- assinatura
  // e cronômetro rodando em página fechada gastam conexão e bateria do
  // celular do conferente sem nada pra mostrar.
  if (id === 'docas') {
    carregarPainelDocas();
    iniciarTempoRealDocas();
    iniciarRelogioDocas();
  } else if (typeof pararTempoRealDocas === 'function') {
    pararTempoRealDocas();
    pararRelogioDocas();
  }
  if (id === 'debitodireto') { carregarDebitoDireto(); }
  if (id === 'analise') { carregarAnalise(); }
  // ⚠️ `carregarAcessos()` vai DEPOIS de `carregarUsuarios()`, encadeado e não
  // solto: ele cruza o log de login com a lista de aprovados, e disparando os
  // dois em paralelo o cruzamento cairia numa lista vazia -- todo mundo
  // apareceria como "nunca entrou". Mesmo motivo do
  // `carregarCatalogoExp().then(carregarProgramacao)` logo acima.
  if (id === 'config')  {
    carregarUsuarios().then(carregarAcessos);
    carregarConfigUnidades(); carregarLote(); carregarSugestoes();
  }
}

document.getElementById('sidebarNav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  // Controle EXP Acessórios abre direto desde 11/09/2026. Antes passava por um
  // modal que escolhia a unidade e pedia a senha dela; a senha saiu inteira
  // (ver o bloco mais abaixo), e a escolha de unidade continua no seletor do
  // cabeçalho, igual a todas as outras telas.
  mostrarPagina(item.dataset.pagina);
});

// ---- A senha do Controle EXP saiu (11/09/2026) --------------------------
//
// O Victor: *"retirar todo sistema de senhas das telas. Manter as restrições
// por cargos e manter a senha de login, mas senhas de acesso a telas e
// contagens, retirar."*
//
// Entrar em "Controle EXP Acessórios" pedia unidade + senha por unidade
// (`abrirGateExp`, `sql/fase9-senha-exp.sql`). O Depósito Benchmark já tinha
// saído desse gate em 10/09, e o registro na conversa daquele dia já dizia o
// que vale aqui: **a senha nunca foi a proteção real** -- quem lê e escreve em
// `exp_controle_itens` é decidido pelo RLS (conta aprovada da unidade, ou
// admin), e quem VÊ a página é decidido por `PERFIS` (só `estoque_alm` e
// `admin`). A senha era um atrito a mais, no meio dos dois.
//
// O gate também escolhia a UNIDADE antes de entrar. Isso não se perdeu: o
// seletor de unidade do cabeçalho continua fazendo exatamente isso, e é o
// mesmo caminho das outras telas.

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
        // Trocar a unidade aqui era um caso especial enquanto o Controle EXP
        // tinha senha: sem o desvio, trocar no seletor pularia a senha daquela
        // unidade. Sem senha, não há o que pular -- segue o caminho de todas as
        // outras telas.
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
