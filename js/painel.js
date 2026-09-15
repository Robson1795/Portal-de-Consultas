// Portal de Estoque Kingspan Isoeste — Painel do Dia (14/09/2026)
//
// Lendo os ~40 pedidos registrados no CLAUDE.md, quase todos são a mesma frase
// dita de jeitos diferentes: *"o PCP esquece daquele material"*, *"esqueço de
// tirar da localização"*, *"a fila fica parada sem ninguém saber"*, *"não
// deixar faltar material"*, *"não preciso ficar tirando relatório várias
// vezes"*.
//
// O portal JÁ SABE todas essas coisas. Ele só não conta pra ninguém: espera a
// pessoa abrir a tela certa e reparar. Este painel inverte isso -- é a primeira
// tela depois do login, e traz o que está fora do lugar até você.
//
// ⚠️ ELE NÃO CALCULA NADA NOVO. Cada aviso é uma pergunta que alguma tela já
// sabia fazer; o painel só faz todas de uma vez e junta. Se a régua de um aviso
// mudar, ela muda no lugar de origem (RESERVA_DIAS_CRITICA em js/reservas.js,
// `estoque_minimo` no banco, a view vw_pedidos_prioridade), não aqui.

// Quanto tempo um item pode ficar na doca antes de virar aviso. A doca é
// passagem, não endereço: item parado ali mais de um dia é quase sempre
// carregamento que não aconteceu e ninguém desfez.
const PAINEL_DOCA_HORAS = 24;

// Planilha (estoque, catálogo, aço) sem ser trocada há mais dias que isto vira
// aviso: o portal inteiro passa a responder sobre um retrato velho, e ninguém
// percebe porque a tela continua cheia de dados.
const PAINEL_PLANILHA_DIAS = 3;

let painelCarregando = false;

// ---- Ajudantes de contagem -------------------------------------------------
//
// `head: true` + `count: 'exact'`: o banco devolve só o NÚMERO, nenhuma linha
// trafega. É o mesmo desenho de `iniciarAvisoCadastro()` (js/notificacoes.js),
// e é o que deixa o painel abrir junto com o login sem pesar -- ele roda a cada
// entrada no portal, então cada aviso tem de ser barato por princípio.
async function contarPainel(montarConsulta) {
  const { count, error } = await montarConsulta();
  if (error) throw error;
  return count || 0;
}

function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
}

// Data da última colagem de uma planilha. Consulta rasa (uma coluna, uma
// linha), mesmo padrão de `carregarDatasLote()` em js/configuracoes.js.
async function ultimaAtualizacaoPainel(tabela, filtros) {
  let q = sb.from(tabela).select('atualizado_em').order('atualizado_em', { ascending: false }).limit(1);
  (filtros || []).forEach(f => { q = q.eq(f[0], f[1]); });
  const { data, error } = await q;
  if (error) throw error;
  return data && data.length ? data[0].atualizado_em : null;
}

// ---- Os avisos -------------------------------------------------------------
//
// Cada um declara QUEM vê (mesma lógica de PERFIS: o painel não mostra problema
// de setor que não é da pessoa), COMO conta, e PARA ONDE leva. O clique é parte
// do aviso, não enfeite: avisar sem dar o caminho só transfere o trabalho de
// procurar.
const AVISOS_PAINEL = [
  {
    id: 'pendentes',
    icone: '⏳',
    titulo: 'Cadastros aguardando aprovação',
    nota: 'Ninguém entra no portal até alguém aprovar.',
    perfis: ['admin'],
    unidade: false,   // a fila de aprovação é da empresa, não da unidade
    acaoRotulo: 'Abrir Configurações',
    acao: () => mostrarPagina('config'),
    contar: () => contarPainel(() => sb.from('usuarios_permitidos')
      .select('email', { count: 'exact', head: true }).eq('aprovado', false))
  },
  {
    id: 'reservas',
    icone: '🔒',
    titulo: 'Aços reservados e esquecidos',
    // ⚠️ Função, e não texto pronto: `RESERVA_DIAS_CRITICA` mora em
    // js/reservas.js, e um texto montado aqui no topo do arquivo seria
    // avaliado na CARGA -- antes daquele arquivo existir. Foi assim que este
    // painel quebrou inteiro na primeira tentativa ("Cannot access
    // 'RESERVA_DIAS_CRITICA' before initialization"): o erro derruba a
    // avaliação do arquivo todo, e nem os outros seis avisos nasciam.
    // Como função, só é lida na hora de desenhar -- aí tudo já carregou.
    nota: () => `Parados há mais de ${RESERVA_DIAS_CRITICA} dias para um pedido que não entrou.`,
    perfis: ['estoque_aco', 'admin'],
    acaoRotulo: 'Ver as reservas',
    acao: () => {
      mostrarPagina('bobinas');
      if (typeof trocarAbaAco === 'function') {
        filtrosReserva.nivel = 'critica';
        const sel = document.getElementById('resFiltroNivel');
        if (sel) sel.value = 'critica';
        trocarAbaAco('reservas');
      }
    },
    contar: () => contarPainel(() => sb.from('reservas_aco')
      .select('id', { count: 'exact', head: true })
      .eq('unidade', unidadeAtual)
      .is('liberado_em', null)
      .lt('reservado_em', new Date(Date.now() - RESERVA_DIAS_CRITICA * 864e5).toISOString()))
  },
  {
    id: 'estoquebaixo',
    icone: '📉',
    titulo: 'Itens abaixo do estoque seguro',
    nota: 'Saldo do item somado em todos os endereços, contra o mínimo cadastrado.',
    perfis: ['estoque_alm', 'admin'],
    acaoRotulo: 'Ver no almoxarifado',
    acao: () => {
      filtros.estoqueBaixo = true;
      const card = document.getElementById('statEstoqueBaixoCard');
      if (card) card.classList.add('stat-card-ativo');
      mostrarPagina('estoque');
    },
    // ⚠️ Único aviso que NÃO é count: "abaixo do seguro" é do ITEM somado nos
    // endereços, e essa soma o Postgres não faz de graça aqui. Traz só as três
    // colunas necessárias, e só das linhas que TÊM mínimo cadastrado -- que é
    // um punhado perto da tabela inteira. Depois reusa
    // `itensAbaixoDoEstoqueSeguro()`, a MESMA função do card da Consulta de
    // Itens: dois jeitos de contar a mesma coisa dariam dois números, e o
    // painel perderia a confiança na primeira vez que discordassem.
    contar: async () => {
      const { data, error } = await buscarTudoPaginado((de, ate) => sb.from('estoque')
        .select('item,quantidade,estoque_minimo')
        .eq('unidade', unidadeAtual).eq('deposito', 'alm')
        .not('estoque_minimo', 'is', null)
        .order('id', { ascending: true }).range(de, ate));
      if (error) throw error;
      return itensAbaixoDoEstoqueSeguro(data || []).size;
    }
  },
  {
    id: 'semlocal',
    icone: '📍',
    titulo: 'Itens sem endereço ou em REC',
    nota: 'Chegaram e ainda não foram guardados na prateleira.',
    perfis: ['estoque_alm', 'admin'],
    acaoRotulo: 'Ver a lista',
    acao: () => {
      filtros.semLocal = true;
      const btn = document.getElementById('filtroSemLocalBtn');
      if (btn) btn.className = 'btn btn-primary';
      mostrarPagina('estoque');
    },
    // Mesma regra do botão "Sem local / REC" da Consulta de Itens: nulo, vazio
    // ou REC em qualquer caixa (a planilha já chegou com "REC" e "rec").
    contar: () => contarPainel(() => sb.from('estoque')
      .select('id', { count: 'exact', head: true })
      .eq('unidade', unidadeAtual).eq('deposito', 'alm')
      .or('localizacao.is.null,localizacao.eq.,localizacao.ilike.rec'))
  },
  {
    id: 'pedidos',
    icone: '🚚',
    titulo: 'Pedidos atrasados ou urgentes',
    nota: 'O caminhão já passou da hora, ou sai nas próximas 2 horas.',
    perfis: ['estoque_alm', 'admin'],
    acaoRotulo: 'Abrir a Programação',
    acao: () => mostrarPagina('programacao'),
    // A régua de "atrasado"/"urgente" mora na view `vw_pedidos_prioridade`
    // (sql/programacao-02), calculada no banco com o fuso de São Paulo. O
    // painel só pergunta -- repetir a conta aqui em JS daria dois relógios.
    contar: () => contarPainel(() => sb.from('vw_pedidos_prioridade')
      .select('id', { count: 'exact', head: true })
      .eq('unidade', unidadeAtual)
      .in('prioridade', ['atrasado', 'urgente']))
  },
  {
    // Robson, 15/09/2026: "o encarregado da expedição quando receber a
    // lista do pcp, coloca o numero do pedido... abre um aviso para que
    // a gente entenda que devemos deixar o material preparado ja...
    // quero que envie uma alerta bem chamativo, pode colocar o alerta
    // nesse painel que o victor criou". CSS própria em styles.css faz
    // este cartão pulsar quando tem pendência -- os outros seis só
    // ganham o fundo amarelo estático (.painel-card-alerta); este pediu
    // "bem chamativo" explicitamente, então tem tratamento a mais.
    id: 'avisoprep',
    icone: '🔔',
    titulo: 'Pedidos avisados pra preparar',
    nota: 'O encarregado da expedição avisou -- separe e deixe pronto antes do caminhão chegar.',
    perfis: ['estoque_alm', 'admin'],
    acaoRotulo: 'Abrir Preparar',
    acao: () => {
      mostrarPagina('expacessorios');
      if (typeof trocarAbaExpAcessorios === 'function') trocarAbaExpAcessorios('avisoprep');
    },
    // Tabela nasce em sql/fase45-aviso-preparo-pedido.sql -- se ainda não
    // rodou, contarPainel() joga o erro pra cima e o try/catch de
    // carregarPainel() desenha "—" neste card só, sem derrubar os outros
    // seis (mesmo cuidado de todo aviso desta lista).
    contar: () => contarPainel(() => sb.from('exp_pedido_aviso_preparo')
      .select('id', { count: 'exact', head: true })
      .eq('unidade', unidadeAtual).eq('status', 'pendente'))
  },
  {
    id: 'doca',
    icone: '📦',
    titulo: 'Itens parados na doca',
    nota: () => `Saíram do endereço há mais de ${PAINEL_DOCA_HORAS}h e não foram marcados como carregados.`,
    perfis: ['estoque_alm', 'admin'],
    acaoRotulo: 'Abrir a aba DOCA',
    acao: () => {
      mostrarPagina('expacessorios');
      if (typeof trocarAbaExpAcessorios === 'function') trocarAbaExpAcessorios('doca');
    },
    // A doca é passagem, não endereço: item parado ali é carregamento que não
    // aconteceu (ou aconteceu e ninguém marcou). Nos dois casos, a Conferir vai
    // acusar divergência depois -- este aviso chega antes.
    contar: () => contarPainel(() => sb.from('exp_controle_itens')
      .select('id', { count: 'exact', head: true })
      .eq('unidade', unidadeAtual).eq('setor', 'exp').eq('status', 'na_doca')
      .lt('na_doca_em', new Date(Date.now() - PAINEL_DOCA_HORAS * 36e5).toISOString()))
  },
  {
    id: 'planilha',
    icone: '🗓️',
    titulo: 'Planilha do almoxarifado velha',
    nota: 'Dias desde a última colagem. O portal inteiro responde sobre este retrato.',
    perfis: ['estoque_alm', 'admin'],
    acaoRotulo: 'Atualizar planilha',
    acao: () => mostrarPagina('config'),
    // ⚠️ Este aviso conta DIAS, não itens -- e é o único assim. O número na
    // tela é "há quantos dias", e vira aviso acima de PAINEL_PLANILHA_DIAS.
    // Nunca atualizada conta como problema, não como zero.
    unidadeNoTexto: true,
    contar: async () => {
      const iso = await ultimaAtualizacaoPainel('estoque', [['unidade', unidadeAtual], ['deposito', 'alm']]);
      const dias = diasDesde(iso);
      if (dias === null) return { n: 999, texto: 'nunca', detalhe: 'Nenhuma planilha foi colada para esta unidade ainda.' };
      return {
        n: dias > PAINEL_PLANILHA_DIAS ? dias : 0,
        texto: dias === 0 ? 'hoje' : dias + 'd',
        detalhe: 'Última colagem: ' + formatarDataHoraBR(iso) + '.'
      };
    }
  }
];

function avisosDoPerfil() {
  return AVISOS_PAINEL.filter(a => a.perfis.includes(perfilAtual));
}

// ---- Carga e desenho -------------------------------------------------------
async function carregarPainel() {
  if (painelCarregando) return;
  painelCarregando = true;

  const grade = document.getElementById('painelGrade');
  const avisos = avisosDoPerfil();
  document.getElementById('painelSaudacao').textContent = saudacaoPainel();
  document.getElementById('painelUnidade').textContent = rotuloUnidade(unidadeAtual);

  // Desenha a moldura antes de perguntar ao banco: com sete avisos, esperar
  // todos para mostrar qualquer coisa deixaria a primeira tela do portal em
  // branco por um segundo -- e tela em branco no login parece portal quebrado.
  grade.innerHTML = avisos.map(a => cartaoPainel(a, { carregando: true })).join('');

  // ⚠️ Um aviso que falha NÃO derruba os outros. Cada um é uma pergunta
  // independente, e uma tabela sem permissão (ou um script de fase que ainda
  // não rodou) não pode apagar o painel inteiro -- foi o mesmo cuidado da
  // coluna Reserva na lista de aços.
  await Promise.all(avisos.map(async (a) => {
    try {
      const r = await a.contar();
      desenharCartao(a, typeof r === 'number' ? { n: r } : r);
    } catch (e) {
      console.warn('Painel do Dia — aviso "' + a.id + '" falhou:', e.message);
      desenharCartao(a, { erro: e.message });
    }
  }));

  atualizarResumoPainel();
  painelCarregando = false;
}

function saudacaoPainel() {
  const h = new Date().getHours();
  const parte = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  const nome = String(nomeUsuarioAtual || '').trim().split(/\s+/)[0];
  return nome ? `${parte}, ${nome}` : parte;
}

// A nota pode ser texto ou função -- ver o comentário em AVISOS_PAINEL.
function notaDoAviso(aviso) {
  return typeof aviso.nota === 'function' ? aviso.nota() : aviso.nota;
}

function cartaoPainel(aviso, estado) {
  const e = estado || {};
  const temProblema = !e.erro && !e.carregando && (e.n || 0) > 0;
  const valor = e.carregando ? '…' : (e.erro ? '—' : (e.texto || String(e.n || 0)));
  return `
    <div class="painel-card${temProblema ? ' painel-card-alerta' : ''}${e.carregando ? ' painel-card-carregando' : ''}"
         id="painel-card-${aviso.id}">
      <div class="painel-card-topo">
        <span class="painel-icone">${aviso.icone}</span>
        <span class="painel-valor">${escapeHtml(valor)}</span>
      </div>
      <div class="painel-titulo">${escapeHtml(aviso.titulo)}</div>
      <div class="painel-nota">${e.erro
        ? '<span style="color:var(--erro-borda);">Não deu para conferir: ' + escapeHtml(e.erro) + '</span>'
        : escapeHtml(e.detalhe || notaDoAviso(aviso))}</div>
      ${temProblema
        ? `<button class="btn btn-primary painel-acao" data-aviso="${aviso.id}">${escapeHtml(aviso.acaoRotulo)}</button>`
        : `<button class="btn painel-acao" data-aviso="${aviso.id}">${escapeHtml(aviso.acaoRotulo)}</button>`}
    </div>`;
}

function desenharCartao(aviso, estado) {
  const antigo = document.getElementById('painel-card-' + aviso.id);
  if (!antigo) return;
  antigo.outerHTML = cartaoPainel(aviso, estado);
}

// ⚠️ Card zerado fica APAGADO, mas não some. Sumir faria a pessoa achar que o
// portal não conferiu aquilo -- e "não tem nada atrasado" é justamente a
// informação que ela veio buscar. Some só o que não é do perfil dela.
function atualizarResumoPainel() {
  const alertas = document.querySelectorAll('#painelGrade .painel-card-alerta').length;
  const resumo = document.getElementById('painelResumo');
  if (alertas === 0) {
    resumo.innerHTML = '<span class="painel-ok">✓ Tudo em dia por aqui.</span>';
  } else {
    resumo.innerHTML = `<b>${alertas}</b> ${alertas === 1 ? 'coisa pedindo' : 'coisas pedindo'} atenção agora.`;
  }
}

document.getElementById('painelGrade').addEventListener('click', (e) => {
  const botao = e.target.closest('.painel-acao');
  if (!botao) return;
  const aviso = AVISOS_PAINEL.find(a => a.id === botao.dataset.aviso);
  if (aviso) aviso.acao();
});

document.getElementById('painelRecarregar').addEventListener('click', carregarPainel);
