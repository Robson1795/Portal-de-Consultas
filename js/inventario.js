// Portal de Estoque Kingspan Isoeste — Fechar inventário e acuracidade
// (14/09/2026, sql/fase41-inventario-fechado.sql)
//
// Até aqui o fim de um inventário era o botão "Limpar tudo": um `delete` em
// `contagem_fisica`. Sumia o que foi contado, quem contou, o que divergiu e
// quanto -- e **o portal nunca conseguiu responder "qual é a nossa acuracidade
// de inventário?"**, que é o número que um gestor de estoque leva pra diretoria
// e o único que mostra se contar está melhorando ou piorando.
//
// "Fechar inventário" congela a contagem primeiro e só então limpa.
// "Limpar tudo" virou "Descartar contagem" e continua existindo, porque
// contagem de teste ou começada errada não pode virar histórico.

let inventarioConfirmar = false;      // segundo clique (o portal não usa confirm())
let inventariosCarregados = [];

// ---- Montar o retrato a partir do que está na tela -------------------------
//
// ⚠️ O sistema e o físico moram em tabelas diferentes: a quantidade do sistema
// está em `estoque` (já em memória, em `currentData`) e a contagem em
// `contagem_fisica` (em `contagemMap`). O cruzamento é aqui, e é o mesmo que a
// coluna de divergência da tela já faz -- por isso o número do inventário nunca
// discorda do que a pessoa viu enquanto contava.
function montarLinhasInventario() {
  const linhas = [];
  currentData.forEach(r => {
    const fisicoTexto = contagemMap[chaveContagem(r.item, r.localizacao)];
    // Só o que foi CONTADO entra. Item que ninguém contou não está errado --
    // está não contado, e incluí-lo como divergência de "menos tudo" faria a
    // acuracidade despencar só porque o inventário não terminou.
    if (fisicoTexto === undefined || fisicoTexto === null || fisicoTexto === '') return;
    const sistema = parseQtd(r.quantidade);
    const fisico = parseQtd(fisicoTexto);
    linhas.push({
      codigo_item: r.item,
      descricao: r.descricao || null,
      localizacao: r.localizacao || null,
      um: r.um || null,
      quantidade_sistema: sistema,
      quantidade_fisica: fisico,
      diferenca: fisico - sistema
    });
  });
  return linhas;
}

function resumoInventario(linhas) {
  const conferem = linhas.filter(l => l.diferenca === 0).length;
  return {
    itens_contados: linhas.length,
    itens_conferem: conferem,
    itens_divergentes: linhas.length - conferem,
    // Denominador = contados, não o que existe na unidade. Ver o cabeçalho do
    // sql/fase41 -- a tela repete isso em letras, pro número não ser lido como
    // outra coisa.
    acuracidade: linhas.length ? Math.round((conferem / linhas.length) * 1000) / 10 : null
  };
}

function atualizarBotaoFecharInventario() {
  const botao = document.getElementById('fecharInventarioBtn');
  if (!botao) return;
  const linhas = montarLinhasInventario();
  if (inventarioConfirmar) {
    const r = resumoInventario(linhas);
    botao.textContent = `⚠️ Confirmar: ${r.itens_contados} itens, ${r.acuracidade}%`;
    return;
  }
  botao.textContent = linhas.length
    ? `✅ Fechar inventário (${linhas.length})`
    : '✅ Fechar inventário';
}

function cancelarConfirmacaoInventario() {
  if (!inventarioConfirmar) return;
  inventarioConfirmar = false;
  atualizarBotaoFecharInventario();
  const msg = document.getElementById('inventarioMsg');
  if (msg) msg.textContent = '';
}

// ---- Fechar ---------------------------------------------------------------
async function fecharInventario() {
  const msg = document.getElementById('inventarioMsg');
  const botao = document.getElementById('fecharInventarioBtn');
  const linhas = montarLinhasInventario();

  if (!linhas.length) {
    msg.textContent = 'Não há nenhuma contagem digitada para fechar.';
    msg.className = 'status-msg status-err';
    return;
  }
  if (!(await podeLimparContagem())) {
    msg.textContent = 'Fechar o inventário da unidade é do administrador ou do gerente da unidade. Nada foi gravado.';
    msg.className = 'status-msg status-err';
    return;
  }

  // ⚠️ Segundo clique no próprio botão, e NÃO `confirm()` (seção 7): marcado
  // "impedir que esta página crie novos diálogos", o confirm devolve `false` na
  // hora e o clique vira botão quebrado. O rótulo passa a mostrar o que vai ser
  // gravado -- quantos itens e com que acuracidade -- porque é isso que a pessoa
  // precisa conferir antes de a contagem ser apagada.
  if (!inventarioConfirmar) {
    inventarioConfirmar = true;
    atualizarBotaoFecharInventario();
    const r = resumoInventario(linhas);
    msg.textContent = `Isto grava o inventário (${r.itens_contados} itens contados, `
      + `${r.itens_divergentes} com diferença) e depois limpa a contagem da tela. Clique de novo para confirmar.`;
    msg.className = 'status-msg';
    return;
  }
  inventarioConfirmar = false;

  botao.disabled = true;
  msg.textContent = 'Gravando o inventário...';
  msg.className = 'status-msg';

  const resumo = resumoInventario(linhas);
  const { data: cabecalho, error: erroCabecalho } = await sb.from('inventarios').insert({
    unidade: unidadeAtual,
    deposito: depositoAtual,
    fechado_por: nomeUsuarioAtual || emailUsuarioAtual || null,
    itens_contados: resumo.itens_contados,
    itens_conferem: resumo.itens_conferem,
    itens_divergentes: resumo.itens_divergentes,
    acuracidade: resumo.acuracidade
  }).select().single();   // recibo: sem ele um insert barrado pelo RLS volta com
                          // error null, e a tela apagaria a contagem achando que
                          // tinha salvado (item A1 da AUDITORIA.md)

  if (erroCabecalho || !cabecalho) {
    botao.disabled = false;
    atualizarBotaoFecharInventario();
    msg.textContent = 'NÃO FECHOU: ' + (erroCabecalho ? erroCabecalho.message : 'o banco não devolveu o inventário')
      + (erroCabecalho && /inventarios/.test(erroCabecalho.message)
         ? ' — se falar em tabela inexistente, sql/fase41-inventario-fechado.sql ainda não foi rodado.' : '')
      + ' A contagem continua na tela, intacta.';
    msg.className = 'status-msg status-err';
    return;
  }

  // Em blocos de 100: o insert viaja no corpo, mas um inventário grande são
  // milhares de linhas, e mandar tudo de uma vez arrisca estourar limite de
  // tamanho da requisição. Mesmo bloco de `gravarEtiquetaEmLote()`.
  const BLOCO = 100;
  let erroItens = null;
  let gravadas = 0;
  for (let de = 0; de < linhas.length && !erroItens; de += BLOCO) {
    const pedaco = linhas.slice(de, de + BLOCO).map(l => Object.assign({ inventario_id: cabecalho.id }, l, {
      contado_por: nomeUsuarioAtual || null,
      contado_em: new Date().toISOString()
    }));
    const { data, error } = await sb.from('inventario_itens').insert(pedaco).select('id');
    if (error) { erroItens = error; break; }
    gravadas += (data || []).length;
  }

  // ⚠️ SÓ LIMPA SE O RETRATO INTEIRO FOI GRAVADO. Isto aqui não é transação (o
  // portal não tem servidor nem função RPC pra isso), então a ordem é a defesa:
  // grava primeiro, confere, e só então apaga. Falhando no meio, sobra um
  // inventário parcial no histórico -- e a CONTAGEM CONTINUA NA TELA, que é o
  // lado certo de errar. O contrário (apagar e descobrir que não gravou) não
  // teria volta.
  if (erroItens || gravadas !== linhas.length) {
    botao.disabled = false;
    atualizarBotaoFecharInventario();
    msg.textContent = 'O inventário foi criado mas as linhas não gravaram por inteiro ('
      + gravadas + ' de ' + linhas.length + ')'
      + (erroItens ? ': ' + erroItens.message : '')
      + '. A contagem NÃO foi apagada — tente de novo.';
    msg.className = 'status-msg status-err';
    return;
  }

  const { error: erroLimpeza } = await sb.from('contagem_fisica')
    .delete().eq('unidade', unidadeAtual).eq('deposito', depositoAtual);

  botao.disabled = false;

  if (erroLimpeza) {
    msg.textContent = `Inventário fechado e guardado (${resumo.itens_contados} itens, `
      + `${resumo.acuracidade}% de acuracidade), mas a contagem não foi apagada da tela: `
      + erroLimpeza.message;
    msg.className = 'status-msg status-err';
    return;
  }

  contagemMap = {};
  document.querySelectorAll('.contagem-input').forEach(input => {
    input.value = '';
    const diffSlot = input.parentElement.querySelector('.diff-slot');
    const clearBtn = input.parentElement.querySelector('.contagem-clear-btn');
    if (diffSlot) diffSlot.innerHTML = '';
    if (clearBtn) clearBtn.style.display = 'none';
  });
  atualizarBotaoFecharInventario();

  msg.textContent = `Inventário fechado: ${resumo.itens_contados} itens contados, `
    + `${resumo.itens_divergentes} com diferença, ${resumo.acuracidade}% de acuracidade. `
    + 'Está no histórico — a contagem da tela foi limpa.';
  msg.className = 'status-msg status-ok';
}

// ---- Histórico e acuracidade ----------------------------------------------
async function abrirHistoricoInventarios() {
  const modal = document.getElementById('inventarioModal');
  const caixa = document.getElementById('inventarioModalBox');
  modal.classList.add('open');
  caixa.innerHTML = '<button class="modal-close" id="inventarioFechar">✕</button>'
    + '<h3 style="margin-top:0;">📊 Inventários fechados</h3>'
    + '<div class="busca-vazio">Carregando...</div>';

  const { data, error } = await sb.from('inventarios').select('*')
    .eq('unidade', unidadeAtual)
    .order('fechado_em', { ascending: false })
    .limit(50);

  if (error) {
    caixa.innerHTML = '<button class="modal-close" id="inventarioFechar">✕</button>'
      + '<h3 style="margin-top:0;">📊 Inventários fechados</h3>'
      + '<div class="busca-erro">Não foi possível ler o histórico: ' + escapeHtml(error.message)
      + (/inventarios/.test(error.message)
         ? ' — se falar em tabela inexistente, sql/fase41-inventario-fechado.sql ainda não foi rodado.' : '')
      + '</div>';
    return;
  }

  inventariosCarregados = data || [];
  renderHistoricoInventarios();
}

function renderHistoricoInventarios() {
  const caixa = document.getElementById('inventarioModalBox');
  const lista = inventariosCarregados;

  if (!lista.length) {
    caixa.innerHTML = '<button class="modal-close" id="inventarioFechar">✕</button>'
      + '<h3 style="margin-top:0;">📊 Inventários fechados</h3>'
      + '<div class="busca-vazio">Nenhum inventário fechado nesta unidade ainda.<br>'
      + '<span style="font-size:12px;">Ao terminar uma contagem, use <b>Fechar inventário</b> em vez de descartar — '
      + 'é isso que cria o histórico de acuracidade.</span></div>';
    return;
  }

  // A média é das acuracidades, não do total de itens: um inventário de 12 itens
  // e um de 3.000 pesariam igual numa média simples, mas cada um é um evento de
  // qualidade daquele dia, e é a TENDÊNCIA que esta linha quer mostrar.
  const comNumero = lista.filter(i => i.acuracidade != null);
  const media = comNumero.length
    ? Math.round((comNumero.reduce((s, i) => s + Number(i.acuracidade), 0) / comNumero.length) * 10) / 10
    : null;

  caixa.innerHTML = `
    <button class="modal-close" id="inventarioFechar">✕</button>
    <h3 style="margin-top:0;">📊 Inventários fechados — ${escapeHtml(rotuloUnidade(unidadeAtual))}</h3>
    <div class="modal-text" style="font-size:12px; color:var(--muted); margin-bottom:10px;">
      <b>Acuracidade = itens que conferem ÷ itens contados.</b> Item que ninguém contou não entra na
      conta — não está errado, está não contado.
      ${media != null ? `<br>Média dos ${comNumero.length} fechamentos listados: <b>${media}%</b>.` : ''}
    </div>
    <div class="scroll-area" style="max-height:52vh;">
      <table class="busca-tabela">
        <thead><tr>
          <th>Fechado em</th><th>Depósito</th><th>Por</th>
          <th style="text-align:right;">Contados</th>
          <th style="text-align:right;">Divergem</th>
          <th style="text-align:right;">Acuracidade</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${lista.map(i => `
            <tr>
              <td class="loc">${escapeHtml(formatarDataHoraBR(i.fechado_em))}</td>
              <td class="loc">${escapeHtml(rotuloDeposito(i.deposito))}</td>
              <td>${escapeHtml(i.fechado_por || '—')}</td>
              <td class="num">${i.itens_contados}</td>
              <td class="num">${i.itens_divergentes}</td>
              <td class="num">${i.acuracidade != null ? escapeHtml(String(i.acuracidade)) + '%' : '—'}</td>
              <td><button class="acao-btn inv-detalhe" data-id="${escapeHtml(i.id)}"
                          title="Ver os itens deste inventário">🔍</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function abrirDetalheInventario(id) {
  const caixa = document.getElementById('inventarioModalBox');
  const inv = inventariosCarregados.find(i => String(i.id) === String(id));
  caixa.innerHTML = '<button class="modal-close" id="inventarioFechar">✕</button>'
    + '<h3 style="margin-top:0;">Carregando itens...</h3>';

  // Paginado: um inventário do almoxarifado inteiro passa de mil linhas fácil, e
  // o corte silencioso do PostgREST mostraria um retrato pela metade -- numa
  // tela que existe justamente para ser a prova do que foi contado.
  const { data, error } = await buscarTudoPaginado((de, ate) => sb.from('inventario_itens')
    .select('*').eq('inventario_id', id)
    .order('id', { ascending: true }).range(de, ate));

  if (error) {
    caixa.innerHTML = '<button class="modal-close" id="inventarioFechar">✕</button>'
      + '<div class="busca-erro">Não foi possível ler os itens: ' + escapeHtml(error.message) + '</div>';
    return;
  }

  // Divergência primeiro, e a maior em módulo no topo: é a ordem do que precisa
  // ser investigado. O que confere não tem o que fazer -- vai no fim.
  const linhas = (data || []).slice().sort((a, b) =>
    Math.abs(Number(b.diferenca) || 0) - Math.abs(Number(a.diferenca) || 0));

  caixa.innerHTML = `
    <button class="modal-close" id="inventarioFechar">✕</button>
    <h3 style="margin-top:0;">Inventário de ${escapeHtml(inv ? formatarDataHoraBR(inv.fechado_em) : '')}</h3>
    <div class="modal-text" style="font-size:12px; color:var(--muted); margin-bottom:8px;">
      ${inv ? `${inv.itens_contados} itens contados · ${inv.itens_divergentes} com diferença · <b>${inv.acuracidade}%</b>` : ''}
      <button class="btn" id="invVoltar" style="margin-left:10px; padding:3px 10px; font-size:12px;">← Voltar à lista</button>
    </div>
    <div class="scroll-area" style="max-height:52vh;">
      <table class="busca-tabela">
        <thead><tr>
          <th>Item</th><th>Descrição</th><th>Endereço</th>
          <th style="text-align:right;">Sistema</th>
          <th style="text-align:right;">Físico</th>
          <th style="text-align:right;">Diferença</th>
        </tr></thead>
        <tbody>
          ${linhas.map(l => {
            const d = Number(l.diferenca) || 0;
            const cor = d === 0 ? '' : ' style="background:var(--aviso-fundo);"';
            const sinal = d > 0 ? '+' : '';
            return `
            <tr${cor}>
              <td class="item">${escapeHtml(l.codigo_item)}</td>
              <td>${escapeHtml(l.descricao || '—')}</td>
              <td class="loc">${escapeHtml(l.localizacao || '—')}</td>
              <td class="num">${escapeHtml(String(l.quantidade_sistema))}</td>
              <td class="num">${escapeHtml(String(l.quantidade_fisica))}</td>
              <td class="num">${d === 0 ? '✓' : sinal + d.toLocaleString('pt-BR')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ---- Ligações --------------------------------------------------------------
document.getElementById('fecharInventarioBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  fecharInventario();
});
document.getElementById('inventarioHistoricoBtn').addEventListener('click', abrirHistoricoInventarios);

document.getElementById('inventarioModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('inventarioModal')) {
    document.getElementById('inventarioModal').classList.remove('open');
    return;
  }
  if (e.target.closest('#inventarioFechar')) {
    document.getElementById('inventarioModal').classList.remove('open');
    return;
  }
  if (e.target.closest('#invVoltar')) { renderHistoricoInventarios(); return; }
  const detalhe = e.target.closest('.inv-detalhe');
  if (detalhe) abrirDetalheInventario(detalhe.dataset.id);
});
