// Portal de Estoque Kingspan Isoeste — Busca global (14/09/2026)
//
// O mesmo código de item vive hoje em seis lugares diferentes do portal:
// `estoque` (três depósitos × oito unidades), `catalogo_exp_itens`,
// `exp_controle_itens` (expedição e doca), `bobinas_aco` e `reservas_aco`.
// **Ninguém conseguia perguntar "onde está o 996613I?" uma vez só** -- tinha de
// abrir tela por tela e lembrar de todas. O ⇄ já fazia uma fatia disso, mas só
// do almoxarifado.
//
// ⚠️ Esta tela é SÓ LEITURA. Não edita, não reserva, não conta -- ela responde
// onde está e manda a pessoa pra tela que resolve.
//
// ⚠️ Toda comparação de código passa por `normalizaCodigoItem()` no JS e por
// `ilike` no banco. O `in`/`eq` do Postgres diferencia maiúscula de minúscula, e
// este projeto já perdeu uma tarde com `996613I` gravado dos dois jeitos (seção
// 14). Numa busca, o efeito seria pior que um número errado: o portal diria "não
// achei" sobre material que está lá.

let buscaGlobalEmCurso = false;

// Cada fonte diz: o rótulo, a tabela, a coluna do código, e como virar linha
// legível. Acrescentar uma tela nova ao portal é acrescentar uma entrada aqui.
const FONTES_BUSCA = [
  {
    id: 'alm', icone: '📦', rotulo: 'Almoxarifado',
    tabela: 'estoque', coluna: 'item',
    filtro: (q) => q.eq('deposito', 'alm'),
    linha: (r) => ({
      unidade: r.unidade,
      onde: r.localizacao || '(sem endereço)',
      qtd: r.quantidade, um: r.um,
      extra: ''
    })
  },
  {
    id: 'sesmt', icone: '⛑️', rotulo: 'SESMT (EPI)',
    tabela: 'estoque', coluna: 'item',
    filtro: (q) => q.eq('deposito', 'sesmt'),
    linha: (r) => ({ unidade: r.unidade, onde: r.localizacao || '(sem endereço)', qtd: r.quantidade, um: r.um, extra: '' })
  },
  {
    id: 'benchmark', icone: '🏭', rotulo: 'Depósito Benchmark',
    tabela: 'estoque', coluna: 'item',
    filtro: (q) => q.eq('deposito', 'benchmark'),
    linha: (r) => ({ unidade: r.unidade, onde: r.localizacao || '(sem endereço)', qtd: r.quantidade, um: r.um, extra: r.lote ? 'lote ' + r.lote : '' })
  },
  {
    id: 'expedicao', icone: '🔄', rotulo: 'Expedição (guardado)',
    tabela: 'exp_controle_itens', coluna: 'codigo_item',
    filtro: (q) => q.eq('status', 'na_expedicao'),
    linha: (r) => ({ unidade: r.unidade, onde: r.localizacao || '—', qtd: r.quantidade, um: r.um,
                     extra: r.numero_pedido ? 'pedido ' + r.numero_pedido : '' })
  },
  {
    id: 'doca', icone: '🚛', rotulo: 'Na doca (esperando caminhão)',
    tabela: 'exp_controle_itens', coluna: 'codigo_item',
    filtro: (q) => q.eq('status', 'na_doca'),
    linha: (r) => ({ unidade: r.unidade, onde: 'veio de ' + (r.localizacao || '—'), qtd: r.quantidade, um: r.um,
                     extra: r.numero_pedido ? 'pedido ' + r.numero_pedido : '' })
  },
  {
    id: 'catalogo', icone: '🗃️', rotulo: 'Catálogo EXP (o que o sistema diz)',
    tabela: 'catalogo_exp_itens', coluna: 'codigo_item',
    linha: (r) => ({ unidade: r.unidade, onde: r.deposito || '—', qtd: r.quantidade, um: r.um,
                     extra: r.lote ? 'lote ' + r.lote : '' })
  },
  {
    id: 'aco', icone: '🧱', rotulo: 'Aço (bobinas)',
    tabela: 'bobinas_aco', coluna: 'item',
    linha: (r) => ({ unidade: r.est, onde: r.localizacao || '—', qtd: r.qtd_liquida, um: r.um,
                     extra: r.lote ? 'lote ' + r.lote : '' })
  },
  {
    id: 'reserva', icone: '🔒', rotulo: 'Aço reservado',
    tabela: 'reservas_aco', coluna: 'codigo_item',
    filtro: (q) => q.is('liberado_em', null),
    linha: (r) => ({ unidade: r.unidade, onde: r.localizacao_na_reserva || '—', qtd: r.quantidade, um: r.um,
                     extra: 'pedido ' + r.pedido + ' · há ' + tempoReservadoTexto(r.reservado_em) })
  }
];

// Teto por fonte. Um item comum tem uma linha por endereço e por unidade; sem
// teto, um código muito espalhado encheria o modal de linha repetida e a
// resposta ("onde está?") ficaria mais difícil de ler, não mais fácil.
const BUSCA_TETO = 40;

function abrirBuscaGlobal(textoInicial) {
  const modal = document.getElementById('buscaGlobalModal');
  const campo = document.getElementById('buscaGlobalInput');
  modal.classList.add('open');
  if (textoInicial != null) campo.value = textoInicial;
  campo.focus();
  campo.select();
  if (campo.value.trim()) executarBuscaGlobal();
}

function fecharBuscaGlobal() {
  document.getElementById('buscaGlobalModal').classList.remove('open');
}

async function executarBuscaGlobal() {
  const termo = document.getElementById('buscaGlobalInput').value.trim();
  const saida = document.getElementById('buscaGlobalResultado');
  if (!termo) { saida.innerHTML = ''; return; }
  if (buscaGlobalEmCurso) return;
  buscaGlobalEmCurso = true;

  saida.innerHTML = '<div class="busca-vazio">Procurando em todas as telas...</div>';

  const codigo = normalizaCodigoItem(termo);
  // Item terminado em "I" tem código próprio dentro da Trading (sufixo "T") --
  // a mesma regra que o comparativo entre unidades já usava. Sem isto, buscar o
  // código "normal" diria que a Trading não tem, tendo.
  const codigoTrading = typeof codigoTradingDoItem === 'function' ? codigoTradingDoItem(codigo) : null;
  const codigos = codigoTrading ? [codigo, codigoTrading] : [codigo];

  const blocos = await Promise.all(FONTES_BUSCA.map(async (f) => {
    try {
      // Uma consulta por código (são no máximo dois) -- `ilike` sem curinga é
      // comparação exata que ignora a caixa da letra.
      const partes = await Promise.all(codigos.map(async (cod) => {
        let q = sb.from(f.tabela).select('*').ilike(f.coluna, escapeIlike(cod)).limit(BUSCA_TETO);
        if (f.filtro) q = f.filtro(q);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      }));
      return { fonte: f, linhas: [].concat.apply([], partes) };
    } catch (e) {
      console.warn('Busca global — fonte "' + f.id + '" falhou:', e.message);
      return { fonte: f, erro: e.message, linhas: [] };
    }
  }));

  buscaGlobalEmCurso = false;
  renderBuscaGlobal(termo, codigo, blocos);
}

function renderBuscaGlobal(termo, codigo, blocos) {
  const saida = document.getElementById('buscaGlobalResultado');
  const comAlgo = blocos.filter(b => b.linhas.length);
  const comErro = blocos.filter(b => b.erro);

  // Nada em lugar nenhum: em vez de "não encontrado" e ponto final, procura o
  // texto na DESCRIÇÃO e devolve os códigos candidatos. Quem não sabe o código
  // de cabeça é justamente quem mais precisa desta tela.
  if (!comAlgo.length) {
    buscarPorDescricaoGlobal(termo);
    return;
  }

  // A descrição sai da primeira fonte que tiver uma -- `exp_controle_itens` não
  // guarda descrição (ela vem do catálogo), então nem toda linha tem.
  let descricao = '';
  blocos.forEach(b => b.linhas.forEach(l => { if (!descricao && l.descricao) descricao = l.descricao; }));

  const partes = comAlgo.map(b => {
    const linhas = b.linhas.map(r => {
      const d = b.fonte.linha(r);
      const qtd = (d.qtd === null || d.qtd === undefined || d.qtd === '') ? '—' : d.qtd;
      return `
        <tr>
          <td class="loc"><b>${escapeHtml(String(d.unidade || '—'))}</b></td>
          <td class="loc">${escapeHtml(String(d.onde))}</td>
          <td class="num">${escapeHtml(String(qtd))} ${escapeHtml(d.um || '')}</td>
          <td>${escapeHtml(d.extra || '')}</td>
        </tr>`;
    }).join('');
    const cortou = b.linhas.length >= BUSCA_TETO
      ? `<div class="busca-corte">Mostrando as primeiras ${BUSCA_TETO} — abra a tela para ver o resto.</div>` : '';
    return `
      <div class="busca-bloco">
        <div class="busca-bloco-titulo">${b.fonte.icone} ${escapeHtml(b.fonte.rotulo)}
          <span class="busca-conta">${b.linhas.length}</span></div>
        <table class="busca-tabela"><tbody>${linhas}</tbody></table>
        ${cortou}
      </div>`;
  }).join('');

  const avisoErro = comErro.length
    ? `<div class="busca-erro">Não deu para consultar: ${escapeHtml(comErro.map(b => b.fonte.rotulo).join(', '))}.
       O resto da busca continua valendo.</div>`
    : '';

  saida.innerHTML = `
    <div class="busca-cabeca">
      <div class="busca-codigo">${escapeHtml(codigo)}</div>
      ${descricao ? `<div class="busca-descricao">${escapeHtml(descricao)}</div>` : ''}
    </div>
    ${avisoErro}
    ${partes}`;
}

// Segunda tentativa: o texto não era um código, então procura na descrição e
// oferece os códigos achados. Duas fontes bastam -- `estoque` e o Catálogo EXP
// são onde a descrição de verdade mora.
async function buscarPorDescricaoGlobal(termo) {
  const saida = document.getElementById('buscaGlobalResultado');
  saida.innerHTML = '<div class="busca-vazio">Não achei esse código. Procurando na descrição...</div>';

  const padrao = '%' + escapeIlike(termo) + '%';
  const consultas = [
    sb.from('estoque').select('item,descricao').ilike('descricao', padrao).limit(30),
    sb.from('catalogo_exp_itens').select('codigo_item,descricao').ilike('descricao', padrao).limit(30)
  ];
  const respostas = await Promise.all(consultas.map(q => q.then(r => r).catch(e => ({ error: e }))));

  const achados = new Map();
  respostas.forEach(r => (r.data || []).forEach(l => {
    const cod = normalizaCodigoItem(l.item || l.codigo_item);
    if (cod && !achados.has(cod)) achados.set(cod, l.descricao || '');
  }));

  if (!achados.size) {
    saida.innerHTML = `<div class="busca-vazio">
      Nada encontrado para <b>${escapeHtml(termo)}</b> — nem como código, nem na descrição.
      <br><span style="font-size:12px;">A busca cobre almoxarifado, EPI, Benchmark, expedição, doca, catálogo, aço e reservas.</span>
    </div>`;
    return;
  }

  saida.innerHTML = `
    <div class="busca-vazio" style="text-align:left;">
      <b>${escapeHtml(termo)}</b> não é um código que eu conheça, mas aparece na descrição destes:
    </div>
    <div class="busca-sugestoes">
      ${[...achados].map(([cod, desc]) => `
        <button class="btn busca-sugestao" data-codigo="${escapeHtml(cod)}">
          <b>${escapeHtml(cod)}</b> <span style="color:var(--muted);">${escapeHtml(desc)}</span>
        </button>`).join('')}
    </div>`;
}

// ---- Ligações --------------------------------------------------------------
document.getElementById('buscaGlobalBtn').addEventListener('click', () => abrirBuscaGlobal(''));
document.getElementById('buscaGlobalFechar').addEventListener('click', fecharBuscaGlobal);
document.getElementById('buscaGlobalModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('buscaGlobalModal')) fecharBuscaGlobal();
});
document.getElementById('buscaGlobalIr').addEventListener('click', executarBuscaGlobal);
document.getElementById('buscaGlobalInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') executarBuscaGlobal();
});
document.getElementById('buscaGlobalResultado').addEventListener('click', (e) => {
  const botao = e.target.closest('.busca-sugestao');
  if (botao) abrirBuscaGlobal(botao.dataset.codigo);
});

// Ctrl+K (Cmd+K no Mac) abre de qualquer tela, e Esc fecha. É o atalho que todo
// mundo já conhece de outros aplicativos -- não vale inventar um.
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    abrirBuscaGlobal(null);
    return;
  }
  if (e.key === 'Escape' && document.getElementById('buscaGlobalModal').classList.contains('open')) {
    fecharBuscaGlobal();
  }
});
