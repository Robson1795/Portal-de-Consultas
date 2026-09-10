// Portal de Estoque Kingspan Isoeste — tour guiado do primeiro acesso
//
// Pedido do Victor (10/09/2026): "Primeiro login fazer um mini tutorial ou um
// 'tour' pelo portal. Como tem em alguns jogos onde um pop up foca num menu
// especifico com uma breve explicação e ao clicar em próximo foca em outro,
// etc. Mas coloque também uma opção para 'pular tutorial' pra quem quiser."
//
// ⚠️ O tour NAO tem lista fixa de passos. Ele é montado a partir do menu que
// aquela pessoa realmente tem (`PERFIS[perfilAtual].paginas`, já filtrado por
// `podeVerAnaliseCache`), lendo o rótulo e o ícone de `PAGINAS`. Uma lista
// escrita à mão aqui explicaria telas que a pessoa não vê -- um consultor
// receberia a explicação da Análise de Compras e ficaria procurando o menu.
// Quando uma página nova entrar em `PAGINAS`, basta escrever a frase dela em
// `TOUR_EXPLICACAO`; sem frase, o passo usa o rótulo e não quebra nada.

// Uma frase por página: o que ela responde, não o que ela é. "Consulta de
// Itens" já está escrito no menu; o que a pessoa não sabe é para que serve.
const TOUR_EXPLICACAO = {
  estoque: 'Todo o estoque do almoxarifado desta unidade. A busca aceita item, descrição, localização — e formatos especiais como <b>corredor A-B</b> ou <b>CANT A-G</b> para sair um corredor inteiro na impressão.',
  sesmt: 'A mesma tela da Consulta de Itens, mas mostrando o depósito de <b>EPI</b> desta unidade. Depósito é uma coisa, unidade é outra: o seletor de unidade continua valendo aqui.',
  bobinas: 'Auditoria das bobinas de aço no pátio: saldo do sistema, saldo físico e a divergência na hora. Dá para conferir a etiqueta pela foto, no próprio celular.',
  requisicao: 'Monta o pedido de material e abre o e-mail já preenchido para o ALM da unidade lançar no CD1406. <b>Não abre requisição no Datasul</b> — quem lança é o ALM.',
  programacao: 'Cruza as duas planilhas do PCP pelo nº do pedido e ordena os itens pelo caminhão que sai primeiro, não pela ordem em que a planilha foi digitada.',
  expacessorios: 'Entrada e saída dos itens já separados na expedição: onde cada um foi guardado, quem retirou e quando. É daqui que sai a folha que vai colada no pallet.',
  expbenchmark: 'A mesma tela da Consulta de Itens, mas mostrando o <b>Depósito Benchmark</b> desta unidade — separado para o inventário não misturar os dois lugares.',
  analise: 'Somando todos os pedidos que estão entrando, o que não tem saldo e quanto falta comprar. Indica também as outras unidades que têm o item, para pedir transferência em vez de comprar.',
  config: 'Aprovar contas, definir perfis, cadastrar os e-mails e as senhas de cada unidade, e atualizar o estoque de todas as unidades de uma vez.'
};

let tourPassos = [];
let tourIndice = 0;
// O menu do celular começa fechado. O tour abre pra poder apontar pros itens,
// e tem de devolver como estava -- senão o "pular tutorial" deixa a tela
// diferente de como a pessoa a encontrou.
let tourFechouMenu = false;

// A marca de "já viu" é por PESSOA e por navegador (localStorage com o e-mail
// na chave). Poderia ser uma coluna em `usuarios_permitidos`, e aí seguiria a
// pessoa entre computadores -- mas isso pediria mais um script de SQL pra
// rodar no painel, e o custo de errar aqui é ver o tour uma segunda vez num
// computador novo, com o "pular" à mão. Se um dia incomodar, a coluna é a
// correção certa.
function tourChave() {
  return 'portal_tour_visto:' + (emailUsuarioAtual || 'anonimo');
}

function tourJaVisto() {
  try { return localStorage.getItem(tourChave()) === '1'; }
  catch (e) { return true; }   // sem localStorage, não insiste a cada carga
}

function marcarTourVisto() {
  try { localStorage.setItem(tourChave(), '1'); } catch (e) { /* vale só nesta sessão */ }
}

// ---- Os passos -------------------------------------------------------------
// `alvo` é um seletor CSS; passo sem alvo é um cartão no meio da tela.
// Passo cujo alvo não existe (ou está escondido) é PULADO na hora de andar --
// é o que cobre o perfil que não tem aquele botão e o celular, onde parte do
// cabeçalho não aparece.
function montarPassosTour() {
  const visiveis = (PERFIS[perfilAtual] || PERFIS.consultor).paginas
    .filter(id => id !== 'analise' || podeVerAnaliseCache)
    .filter(id => PAGINAS[id]);

  const passos = [{
    titulo: 'Bem-vindo ao portal, ' + (nomeUsuarioAtual || '').split(' ')[0] + '!',
    texto: 'São ' + visiveis.length + ' tela' + (visiveis.length === 1 ? '' : 's') +
           ' liberadas para o seu perfil (<b>' + escapeHtml(rotuloDoPerfil()) + '</b>). ' +
           'Em menos de um minuto eu mostro para que serve cada uma. ' +
           'Dá para sair a qualquer momento em <b>Pular tutorial</b>.'
  }];

  passos.push({
    alvo: '#sidebarNav',
    titulo: 'O menu',
    texto: 'Tudo o que você pode abrir está aqui. O que não aparece é porque o seu perfil não usa — e o banco recusaria o dado mesmo se a tela fosse forçada.'
  });

  visiveis.forEach(id => {
    const p = PAGINAS[id];
    passos.push({
      alvo: '.nav-item[data-pagina="' + id + '"]',
      titulo: p.icone + ' ' + p.rotulo,
      texto: TOUR_EXPLICACAO[id] || 'Abre a tela <b>' + escapeHtml(p.rotulo) + '</b>.'
    });
  });

  passos.push({
    alvo: '#topbarLocal',
    titulo: 'A unidade',
    texto: 'Tudo o que você vê e grava é desta unidade. Só o administrador troca de unidade aqui; as outras aparecem no comparativo <b>⇄</b> de cada item. Quando um depósito diferente do almoxarifado está aberto, um crachá ao lado avisa.'
  });

  passos.push({
    alvo: '#temaToggle',
    titulo: 'Claro ou escuro',
    texto: 'Troca o portal entre o modo claro e o escuro, e fica guardado neste navegador. A impressão sai sempre clara, para não gastar tinta.'
  });

  passos.push({
    alvo: '#tourBtn',
    titulo: 'Para rever',
    texto: 'Este botão abre o tour de novo, quando você quiser. Ele não aparece mais sozinho depois de hoje.'
  });

  passos.push({
    alvo: '#logoutBtn',
    titulo: 'E é isso',
    texto: 'Bom trabalho. Qualquer coisa que a tela não explicar, fale com o Robson ou com o Victor.'
  });

  return passos;
}

// ---- Desenho ---------------------------------------------------------------
function tourElementos() {
  return {
    fundo: document.getElementById('tourFundo'),
    foco: document.getElementById('tourFoco'),
    caixa: document.getElementById('tourCaixa'),
    titulo: document.getElementById('tourTitulo'),
    texto: document.getElementById('tourTexto'),
    contagem: document.getElementById('tourContagem'),
    voltar: document.getElementById('tourVoltar'),
    proximo: document.getElementById('tourProximo')
  };
}

// Elemento que existe mas está escondido tem retângulo de tamanho zero. Sem
// esta checagem o tour apontaria o buraco onde o botão estaria.
function tourAlvoUtil(passo) {
  if (!passo.alvo) return null;
  const el = document.querySelector(passo.alvo);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return (r.width > 0 && r.height > 0) ? el : null;
}

function tourDesenharPasso() {
  const e = tourElementos();
  const passo = tourPassos[tourIndice];
  const alvo = tourAlvoUtil(passo);

  e.titulo.innerHTML = passo.titulo;
  e.texto.innerHTML = passo.texto;
  e.contagem.textContent = (tourIndice + 1) + ' de ' + tourPassos.length;
  e.voltar.style.visibility = tourIndice === 0 ? 'hidden' : 'visible';
  e.proximo.textContent = tourIndice === tourPassos.length - 1 ? 'Concluir' : 'Próximo →';

  if (!alvo) {
    // Passo sem alvo: cartão no meio, e o recorte do foco encolhe pra nada NO
    // CENTRO da tela -- e não fora dela. O escuro é o box-shadow DESTE
    // retângulo: jogado pra -9999px, a sombra de 9999px acabava justo na borda
    // e a tela ficava sem escurecer nenhum (visto no navegador). Sem borda,
    // senão sobra um ponto claro no meio.
    e.foco.style.cssText = 'top:50%; left:50%; width:0; height:0; border-width:0;';
    e.caixa.style.top = '50%';
    e.caixa.style.left = '50%';
    e.caixa.style.transform = 'translate(-50%, -50%)';
    return;
  }

  alvo.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  const r = alvo.getBoundingClientRect();
  const folga = 6;
  e.foco.style.cssText =
    'top:' + (r.top - folga) + 'px; left:' + (r.left - folga) + 'px;' +
    'width:' + (r.width + folga * 2) + 'px; height:' + (r.height + folga * 2) + 'px;' +
    'border-width:2px;';

  // A caixa vai abaixo do alvo; se não couber, vai acima. Depois é presa
  // dentro da janela nos dois eixos -- alvo no canto (o Sair, por exemplo)
  // jogaria metade da explicação fora da tela.
  e.caixa.style.transform = 'none';
  const largura = Math.min(360, window.innerWidth - 24);
  e.caixa.style.width = largura + 'px';
  const altura = e.caixa.offsetHeight || 180;

  let topo = r.bottom + 14;
  if (topo + altura > window.innerHeight - 12) topo = r.top - altura - 14;
  topo = Math.max(12, Math.min(topo, window.innerHeight - altura - 12));

  let esquerda = r.left + r.width / 2 - largura / 2;
  esquerda = Math.max(12, Math.min(esquerda, window.innerWidth - largura - 12));

  e.caixa.style.top = topo + 'px';
  e.caixa.style.left = esquerda + 'px';
}

// Anda `passo` posições (+1 ou -1), pulando os alvos que não existem nesta
// tela. Sem o laço, um perfil sem aquele botão veria um passo apontando pro
// vazio -- e o "Próximo" pareceria não fazer nada.
function tourAndar(passo) {
  let i = tourIndice + passo;
  while (i > 0 && i < tourPassos.length && tourPassos[i].alvo && !tourAlvoUtil(tourPassos[i])) {
    i += passo;
  }
  if (i >= tourPassos.length) { encerrarTour(); return; }
  tourIndice = Math.max(0, i);
  tourDesenharPasso();
}

function abrirTour() {
  tourPassos = montarPassosTour();
  tourIndice = 0;

  // No celular o menu começa fechado, e metade do tour aponta pra ele.
  const casca = document.getElementById('appShell');
  tourFechouMenu = casca.classList.contains('menu-fechado');
  if (tourFechouMenu) casca.classList.remove('menu-fechado');

  document.getElementById('tourFundo').classList.add('aberto');
  tourDesenharPasso();
}

function encerrarTour() {
  marcarTourVisto();
  document.getElementById('tourFundo').classList.remove('aberto');
  if (tourFechouMenu) {
    document.getElementById('appShell').classList.add('menu-fechado');
    tourFechouMenu = false;
  }
}

// Chamado por js/auth.js depois de o menu estar montado -- os passos apontam
// pros itens do menu, que antes disso não existem no DOM.
function iniciarTourSePrimeiraVez() {
  if (tourJaVisto()) return;
  // Espera a primeira pintura: `montarMenu()` acabou de escrever o `nav`, e o
  // getBoundingClientRect() de um elemento recém-inserido ainda vem zerado.
  requestAnimationFrame(() => requestAnimationFrame(abrirTour));
}

document.getElementById('tourProximo').addEventListener('click', () => tourAndar(1));
document.getElementById('tourVoltar').addEventListener('click', () => tourAndar(-1));
document.getElementById('tourPular').addEventListener('click', encerrarTour);
document.getElementById('tourBtn').addEventListener('click', abrirTour);

// Clicar no escuro em volta NÃO fecha: o tour tem de sete a quinze passos
// (depende do perfil), e perder tudo num clique ao lado da caixa seria pior
// que um botão a mais. Fecha pelo Esc, pelo "Pular tutorial" e pelo
// "Concluir".
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('tourFundo').classList.contains('aberto')) return;
  if (e.key === 'Escape') encerrarTour();
  else if (e.key === 'ArrowRight' || e.key === 'Enter') tourAndar(1);
  else if (e.key === 'ArrowLeft') tourAndar(-1);
});

// O recorte do foco é calculado em pixels da janela: girar o celular ou
// redimensionar sem isto deixaria o buraco iluminando o lugar errado.
window.addEventListener('resize', () => {
  if (document.getElementById('tourFundo').classList.contains('aberto')) tourDesenharPasso();
});
