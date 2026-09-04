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
const PERFIS = {
  consultor:   { rotulo: 'Consultor',   paginas: ['estoque', 'requisicao'] },
  estoque_alm: { rotulo: 'Estoque ALM', paginas: ['estoque', 'requisicao'] },
  estoque_aco: { rotulo: 'Estoque Aço', paginas: ['bobinas', 'requisicao'] },
  admin:       { rotulo: 'Admin',       paginas: ['estoque', 'bobinas', 'requisicao', 'config'] }
};

const PAGINAS = {
  estoque: { rotulo: 'Consulta de Itens', icone: '🔎', elemento: 'estoqueContent' },
  bobinas: { rotulo: 'Estoque de Aço',    icone: '📦', elemento: 'bobinasContent' },
  requisicao: { rotulo: 'Requisição ALM', icone: '📝', elemento: 'requisicaoContent' },
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

  Object.values(PAGINAS).forEach(p => {
    const el = document.getElementById(p.elemento);
    if (el) el.style.display = 'none';
  });
  const alvo = document.getElementById(PAGINAS[id].elemento);
  if (alvo) alvo.style.display = 'block';

  paginaAtual = id;
  marcarItemAtivo();
  fecharMenuNoCelular();

  // Cada pagina carrega os proprios dados ao ser aberta.
  if (id === 'estoque') { pararTempoRealBobinas(); loadData(); }
  if (id === 'bobinas') { abrirTelaBobinas(); }
  if (id === 'requisicao') { carregarRequisicao(); }
  if (id === 'config')  { carregarUsuarios(); }
}

document.getElementById('sidebarNav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (item) mostrarPagina(item.dataset.pagina);
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

  // Unidades que a pessoa pode ver: admin ve todas; quem tem unidade
  // definida ve so a dela; quem nao tem, ve todas (nao trava ninguem).
  const permitidas = (perfilAtual === 'admin' || !unidadeDoUsuario)
    ? Object.keys(UNIDADES)
    : [unidadeDoUsuario];

  if (permitidas.includes(unidadeDoUsuario)) unidadeAtual = unidadeDoUsuario;
  else if (!permitidas.includes(unidadeAtual)) unidadeAtual = permitidas[0];

  const caixa = document.getElementById('topbarLocal');
  if (permitidas.length === 1) {
    caixa.innerHTML = `<span class="pin">📍</span><span class="topbar-unidade-fixa">${escapeHtml(rotuloUnidade(permitidas[0]))}</span>`;
  } else {
    caixa.innerHTML = `<span class="pin">📍</span>
      <select id="unitSelect" class="unit-select">${permitidas.map(c =>
        `<option value="${c}" ${c === unidadeAtual ? 'selected' : ''}>${escapeHtml(rotuloUnidade(c))}</option>`
      ).join('')}</select>`;
    document.getElementById('unitSelect').addEventListener('change', (e) => trocarUnidade(e.target.value));
  }
}
