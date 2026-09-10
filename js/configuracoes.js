// Portal de Estoque Kingspan Isoeste — aba Configurações (Fase 4)
//
// Administração de usuários: ver quem está cadastrado, aprovar, definir
// perfil, unidade e localização.
//
// ⚠️ A TELA NÃO DECIDE NADA. Toda alteração passa pela função
// definir_acesso() no Postgres (sql/fase1-perfis-e-permissoes.sql), que
// confere quem está chamando antes de agir. Esta tela apenas desabilita o
// que ela sabe que o banco vai recusar, para a pessoa não descobrir por
// mensagem de erro. As três travas que valem de verdade:
//
//   1. Só administrador altera acesso.
//   2. Ninguém altera o próprio acesso — nem super admin.
//   3. Conceder ou remover o perfil `admin` é só de Victor ou Robson.
//
// Um gatilho (trava_escalonamento) barra qualquer UPDATE em `perfil` ou
// `aprovado` feito por fora dessa função, inclusive à mão no painel.

let usuariosCarregados = [];

function ehSuperAdminAtual() {
  return SUPER_ADMINS.includes(emailUsuarioAtual);
}

function statusDoUsuario(u) {
  if (u.aprovado) return { rotulo: 'Ativo', classe: 'st-ativo' };
  return { rotulo: 'Pendente', classe: 'st-pendente' };
}

async function carregarUsuarios() {
  const aviso = document.getElementById('cfgMsg');
  aviso.textContent = 'Carregando...';
  aviso.className = 'status-msg';

  const { data, error } = await sb.from('usuarios_permitidos')
    .select('user_id, email, nome, perfil, unidade, aprovado, solicitado_em')
    .order('aprovado', { ascending: true })
    .order('email', { ascending: true });

  if (error) {
    // Sem isso uma falha de leitura ficaria indistinguível de "nenhum usuário".
    aviso.textContent = 'Não foi possível carregar os usuários: ' + error.message;
    aviso.className = 'status-msg status-err';
    usuariosCarregados = [];
    document.getElementById('cfgCorpo').innerHTML = '';
    return;
  }

  aviso.textContent = '';
  usuariosCarregados = data || [];
  renderUsuarios();
}

function renderUsuarios() {
  const pendentes = usuariosCarregados.filter(u => !u.aprovado).length;
  const admins = usuariosCarregados.filter(u => u.perfil === 'admin').length;
  document.getElementById('cfg-total').textContent = usuariosCarregados.length;
  document.getElementById('cfg-pendentes').textContent = pendentes;
  document.getElementById('cfg-admins').textContent = admins;

  const podeMexerEmAdmin = ehSuperAdminAtual();

  document.getElementById('cfgCorpo').innerHTML = usuariosCarregados.map(u => {
    const ehEuMesmo = u.user_id === userIdAtual;
    const st = statusDoUsuario(u);
    // Linha travada: o próprio usuário, ou um admin quando quem olha não é
    // super admin. Nos dois casos o banco recusaria a alteração.
    const travada = ehEuMesmo || (u.perfil === 'admin' && !podeMexerEmAdmin);

    const opcoesPerfil = Object.entries(PERFIS).map(([id, p]) => {
      const bloqueado = (id === 'admin' && !podeMexerEmAdmin) ? 'disabled' : '';
      return `<option value="${id}" ${u.perfil === id ? 'selected' : ''} ${bloqueado}>${escapeHtml(p.rotulo)}</option>`;
    }).join('');

    const opcoesUnidade = '<option value="">—</option>' + Object.keys(UNIDADES).map(c =>
      `<option value="${c}" ${u.unidade === c ? 'selected' : ''}>${escapeHtml(rotuloUnidade(c))}</option>`
    ).join('');

    const motivo = ehEuMesmo
      ? 'Você não altera o próprio acesso. Peça a outro administrador.'
      : 'Somente Victor ou Robson alteram uma conta admin.';

    return `
    <tr data-id="${escapeHtml(u.user_id)}">
      <td>
        <div class="cfg-nome">${escapeHtml(u.nome || '—')}${ehEuMesmo ? ' <span class="cfg-voce">você</span>' : ''}</div>
        <div class="cfg-email">${escapeHtml(u.email || '')}</div>
      </td>
      <td><span class="cfg-status ${st.classe}">${st.rotulo}</span></td>
      <td><select class="cfg-perfil" ${travada ? 'disabled' : ''}>${opcoesPerfil}</select></td>
      <td><select class="cfg-unidade" ${travada ? 'disabled' : ''}>${opcoesUnidade}</select></td>
      <td class="cfg-acoes">
        ${travada
          ? `<span class="cfg-travada" title="${escapeHtml(motivo)}">🔒</span>`
          : `${!u.aprovado ? `<button class="btn btn-primary cfg-aprovar">Aprovar</button>` : ''}
             <button class="btn cfg-salvar">Salvar</button>`}
      </td>
    </tr>`;
  }).join('');
}

// Uma alteração por linha. `aprovar` manda aprovado = true junto.
async function aplicarLinha(tr, aprovar) {
  const alvo = tr.dataset.id;
  const perfil = tr.querySelector('.cfg-perfil').value;
  const unidade = tr.querySelector('.cfg-unidade').value;
  const aviso = document.getElementById('cfgMsg');

  tr.querySelectorAll('button').forEach(b => b.disabled = true);
  aviso.textContent = 'Salvando...';
  aviso.className = 'status-msg';

  // A função recusa e devolve a razão; `coalesce` no lado do banco trata o
  // nulo, então mandar string vazia como null é intencional.
  const { error } = await sb.rpc('definir_acesso', {
    alvo,
    novo_perfil: perfil,
    nova_unidade: unidade || null,
    novo_aprovado: aprovar ? true : null
  });

  if (error) {
    aviso.textContent = 'Recusado: ' + error.message;
    aviso.className = 'status-msg status-err';
    tr.querySelectorAll('button').forEach(b => b.disabled = false);
    return;
  }

  aviso.textContent = 'Acesso atualizado.';
  aviso.className = 'status-msg status-ok';
  await carregarUsuarios();
  setTimeout(() => {
    const m = document.getElementById('cfgMsg');
    if (m && m.className.includes('status-ok')) m.textContent = '';
  }, 2500);
}

document.getElementById('cfgCorpo').addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  if (e.target.closest('.cfg-aprovar')) aplicarLinha(tr, true);
  else if (e.target.closest('.cfg-salvar')) aplicarLinha(tr, false);
});

document.getElementById('cfgRecarregar').addEventListener('click', carregarUsuarios);


// ===========================================================================
// CONFIGURAÇÃO POR UNIDADE — e-mails do ALM, senha de contagem, PIN de edição
//
// A tabela `config_unidade` é legível só para admin, justamente porque guarda
// as senhas. Esta seção é o único lugar onde elas aparecem, e para quem já
// tem acesso a tudo. O portal em si nunca as recebe: confere por função no
// banco (ver sql/fase7-senhas-na-aba-admin.sql).
// ===========================================================================

let configUnidades = [];

async function carregarConfigUnidades() {
  const aviso = document.getElementById('cfgUniMsg');
  aviso.textContent = 'Carregando...';
  aviso.className = 'status-msg';

  const { data, error } = await sb.from('config_unidade')
    .select('unidade, emails_alm, email_pcp, email_compras, senha_contagem, senha_exp, pin_edicao').order('unidade');

  if (error) {
    aviso.textContent = 'Não foi possível carregar: ' + error.message;
    aviso.className = 'status-msg status-err';
    document.getElementById('cfgUniCorpo').innerHTML = '';
    return;
  }
  aviso.textContent = '';
  configUnidades = data || [];
  renderConfigUnidades();
}

function renderConfigUnidades() {
  document.getElementById('cfgUniCorpo').innerHTML = configUnidades.map(u => {
    const faltaEmail = !u.emails_alm;
    const faltaEmailCompras = !u.email_compras;
    const faltaSenha = !u.senha_contagem;
    const faltaSenhaExp = !u.senha_exp;
    return `
    <tr data-unidade="${escapeHtml(u.unidade)}">
      <td>
        <div class="cfg-nome">${escapeHtml(rotuloUnidade(u.unidade))}</div>
        ${faltaSenha ? '<div class="cfg-email" style="color:var(--aviso-texto);">sem senha — contagem bloqueada</div>' : ''}
        ${faltaSenhaExp ? '<div class="cfg-email" style="color:var(--aviso-texto);">sem senha EXP — página bloqueada</div>' : ''}
        ${faltaEmail ? '<div class="cfg-email" style="color:var(--aviso-texto);">sem e-mail — envio desabilitado</div>' : ''}
        ${faltaEmailCompras ? '<div class="cfg-email" style="color:var(--aviso-texto);">sem e-mail do Compras — solicitação de compra desabilitada</div>' : ''}
      </td>
      <td><input type="text" class="cfgu-emails" placeholder="alm@kingspanisoeste.com.br; outro@..."
                 value="${escapeHtml(u.emails_alm || '')}" style="max-width:320px;"></td>
      <td><input type="text" class="cfgu-email-pcp" placeholder="pcp@kingspanisoeste.com.br"
                 value="${escapeHtml(u.email_pcp || '')}" style="max-width:240px;"></td>
      <td><input type="text" class="cfgu-email-compras" placeholder="compras@kingspanisoeste.com.br"
                 value="${escapeHtml(u.email_compras || '')}" style="max-width:240px;"></td>
      <td><input type="text" class="cfgu-senha" placeholder="ex: INV${escapeHtml(u.unidade)}"
                 value="${escapeHtml(u.senha_contagem || '')}" style="max-width:130px;"></td>
      <td><input type="text" class="cfgu-senha-exp" placeholder="ex: EXP${escapeHtml(u.unidade)}"
                 value="${escapeHtml(u.senha_exp || '')}" style="max-width:130px;"></td>
      <td><input type="text" class="cfgu-pin" placeholder="ex: 2026"
                 value="${escapeHtml(u.pin_edicao || '')}" style="max-width:110px;"></td>
      <td class="cfg-acoes"><button class="btn cfgu-salvar">Salvar</button></td>
    </tr>`;
  }).join('');
}

// ENTER em qualquer campo da linha salva AQUELA linha. Aqui a senha e
// digitada para ser CADASTRADA, e a tabela tem seis campos por unidade --
// e o Salvar da propria linha que e clicado, nao um generico, senao
// gravaria a unidade errada.
document.getElementById('cfgUniCorpo').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  const botao = e.target.closest('tr').querySelector('.cfgu-salvar');
  if (botao) botao.click();
});

document.getElementById('cfgUniCorpo').addEventListener('click', async (e) => {
  if (!e.target.closest('.cfgu-salvar')) return;
  const tr = e.target.closest('tr');
  const unidade = tr.dataset.unidade;
  const aviso = document.getElementById('cfgUniMsg');

  const emails    = tr.querySelector('.cfgu-emails').value.trim();
  const emailPcp  = tr.querySelector('.cfgu-email-pcp').value.trim();
  const emailCompras = tr.querySelector('.cfgu-email-compras').value.trim();
  const senha     = tr.querySelector('.cfgu-senha').value.trim();
  const senhaExp  = tr.querySelector('.cfgu-senha-exp').value.trim();
  const pin       = tr.querySelector('.cfgu-pin').value.trim();

  tr.querySelectorAll('button').forEach(b => b.disabled = true);
  aviso.textContent = 'Salvando...';
  aviso.className = 'status-msg';

  const { error } = await sb.from('config_unidade').update({
    emails_alm: emails || null,
    email_pcp: emailPcp || null,
    email_compras: emailCompras || null,
    senha_contagem: senha || null,
    senha_exp: senhaExp || null,
    pin_edicao: pin || null,
    atualizado_em: new Date().toISOString(),
    atualizado_por: nomeUsuarioAtual
  }).eq('unidade', unidade);

  tr.querySelectorAll('button').forEach(b => b.disabled = false);
  if (error) {
    aviso.textContent = 'Não foi possível salvar a unidade ' + unidade + ': ' + error.message;
    aviso.className = 'status-msg status-err';
    console.error('Falha ao salvar config_unidade:', error.message);
    return;
  }
  aviso.textContent = 'Unidade ' + unidade + ' salva.';
  aviso.className = 'status-msg status-ok';
  await carregarConfigUnidades();
});

document.getElementById('cfgUniRecarregar').addEventListener('click', carregarConfigUnidades);


// ===========================================================================
// ATUALIZAR ESTOQUES EM LOTE — uma planilha, todas as unidades
//
// A pessoa cola a planilha inteira, com o estoque de todas as unidades juntas,
// e o portal separa por unidade sozinho, lendo a coluna de unidade do cabeçalho.
//
// Três coisas fazem isto ser seguro, e nenhuma é opcional:
//
//   1) A gravação é UMA chamada a substituir_estoque() no banco, que roda
//      inteira numa transação. Falha qualquer linha, nada é gravado. Antes o
//      portal fazia delete e insert em duas chamadas separadas, e uma falha no
//      meio deixava a unidade sem estoque, sem volta (AUDITORIA.md, item A2).
//
//   2) Nada é gravado sem a pessoa ver a prévia: quantas linhas caíram em cada
//      unidade, e o que foi ignorado e por quê. Substituir estoque não se faz
//      às cegas.
//
//   3) Unidade que não aparece na planilha não é tocada, e unidade que aparece
//      com zero itens é recusada pelo banco -- "atualizar com nada" é
//      indistinguível de "apagar tudo".
//
// A seção só aparece para admin. Isso é cortesia: a função no banco confere a
// permissão de novo, unidade por unidade, com pode_atualizar_estoque().
// Ver sql/fase12-substituir-estoque-em-lote.sql.
// ===========================================================================

let loteAba = 'alm';          // 'alm' | 'sesmt' | 'aco' | 'exp'
let lotePreparado = null;     // resultado do Conferir, aguardando confirmação

const LOTE_FORMATOS = {
  alm: 'Precisa de cabeçalho, e uma das colunas tem de ser a unidade. Colunas lidas: '
     + 'Unidade (ou Estab), Item, Descrição, UM, Localização, Quantidade — em qualquer ordem.',
  sesmt: 'Precisa de cabeçalho, e uma das colunas tem de ser a unidade — igual à do '
       + 'almoxarifado. Colunas lidas: Unidade (ou Estab), Item, Descrição, UM, Localização, '
       + 'Quantidade. Vai para o depósito SESMT (EPI) de cada unidade.',
  exp: 'Precisa de cabeçalho, e uma das colunas tem de ser a unidade. Colunas lidas: '
     + 'Unidade (ou Estab), Item, Descrição, UM, Depósito, Referência, Lote, '
     + 'Quantidade — em qualquer ordem. Substitui o Catálogo EXP de cada unidade '
     + '(a lista de referência), e não os itens guardados na expedição.',
  aco: 'As oito colunas da planilha de bobinas, nesta ordem: Item, Descrição Item, Est, Dep, '
     + 'Localizacao, Lote, Un, Qtd Liquida. A coluna Est diz a unidade de cada bobina, e '
     + 'só as unidades que aparecerem na planilha são substituídas.'
};

// Nomes que cada coluna pode ter na planilha real. A UM é resolvida ANTES da
// unidade de propósito: em português "unidade" é ambíguo, e sem essa ordem uma
// coluna "Un" de unidade de medida seria lida como estabelecimento.
const LOTE_SINONIMOS = {
  um:          ['um', 'un', 'unid', 'u m', 'unidade de medida', 'unid medida', 'medida'],
  unidade:     ['unidade', 'estab', 'estabelecimento', 'est', 'filial', 'cod estab',
                'codigo estab', 'cod filial', 'unid negocio'],
  item:        ['item', 'codigo', 'cod', 'cod item', 'codigo item', 'produto', 'sku'],
  descricao:   ['descricao', 'desc', 'descricao item', 'descricao do item', 'nome',
                'nome do item'],
  localizacao: ['localizacao', 'local', 'endereco', 'end', 'localizacao item', 'posicao'],
  quantidade:  ['quantidade', 'qtd', 'qtde', 'qtd atual', 'saldo', 'saldo atual',
                'quantidade atual', 'qtd liquida', 'estoque'],
  // Só o Controle EXP usa estas três. Nº do pedido e Nº da OP aparecem
  // com meia dúzia de grafias diferentes na planilha do PCP.
  // `deposito` aqui e o codigo de deposito do Datasul que vem na planilha do
  // sistema (DEP, EXP...), e NAO o deposito do portal (alm/sesmt, secao 15).
  // Sao coisas diferentes com o mesmo nome; a coluna do catalogo e so texto.
  deposito:      ['deposito', 'dep', 'depósito', 'armazem', 'armazém', 'cod deposito'],
  lote:          ['lote', 'lote item', 'n lote', 'nº lote', 'numero lote', 'no lote'],
  numero_pedido: ['numero pedido','n pedido','no pedido','nº pedido','pedido','num pedido','numero do pedido'],
  numero_os_op:  ['numero os','n os','nº os','os','op','n op','nº op','numero op','os op','n os op','nº os/op','os/op'],
  referencia:    ['referencia','ref','referência'],
};

function normalizaCabecalho(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// Aceita tabulação (colado do Excel), ponto e vírgula (CSV brasileiro) e
// vírgula. Escolhe o separador que aparece mais na primeira linha com dados.
function separadorDaPlanilha(texto) {
  const primeira = texto.split(/\r?\n/).find(l => l.trim()) || '';
  const conta = { '\t': (primeira.match(/\t/g) || []).length,
                  ';':  (primeira.match(/;/g)  || []).length,
                  ',':  (primeira.match(/,/g)  || []).length };
  return Object.keys(conta).reduce((a, b) => conta[b] > conta[a] ? b : a, '\t');
}

// Não se apara a linha inteira antes de separar: uma linha que começa com o
// separador perderia o campo vazio da frente e todas as colunas andariam uma
// casa. Separa primeiro, apara depois.
function celulasDaPlanilha(texto) {
  const sep = separadorDaPlanilha(texto);
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  return {
    sep,
    linhas: linhas.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')))
  };
}

// Casa o cabeçalho com os nomes conhecidos. Devolve { campo: indice }.
// A ordem de `campos` importa: o primeiro a achar fica com a coluna.
function mapearColunas(cabecalho, campos) {
  const nomes = cabecalho.map(normalizaCabecalho);
  const mapa = {};
  const usados = new Set();
  for (const campo of campos) {
    const aceitos = LOTE_SINONIMOS[campo] || [];
    let achou = -1;
    for (const aceito of aceitos) {
      const i = nomes.findIndex((n, idx) => n === aceito && !usados.has(idx));
      if (i !== -1) { achou = i; break; }
    }
    if (achou !== -1) { mapa[campo] = achou; usados.add(achou); }
  }
  return mapa;
}

function pareceCabecalho(celulas) {
  const nomes = celulas.map(normalizaCabecalho);
  return nomes.some(n => LOTE_SINONIMOS.item.includes(n))
      || nomes.some(n => LOTE_SINONIMOS.descricao.includes(n));
}

// ---- Conferir: transforma o texto colado em blocos por unidade ------------
function prepararLote(texto) {
  const avisos = [];
  if (!texto || !texto.trim()) {
    return { erro: 'Cole a planilha ou escolha um arquivo CSV primeiro.' };
  }
  const { linhas } = celulasDaPlanilha(texto);
  if (!linhas.length) return { erro: 'Nada foi encontrado no texto colado.' };

  // ---------------------------------------- Aço: posicional, oito colunas
  if (loteAba === 'aco') {
    const registros = [];
    let ignoradas = 0;
    let semEst = 0;
    linhas.forEach((c, i) => {
      if (i === 0 && pareceCabecalho(c)) return;
      if (c.length < 8 || !c[0]) { ignoradas++; return; }
      // Sem Est não há como saber de qual unidade é a bobina, e o banco
      // recusa a planilha inteira se uma linha vier assim. Melhor tirar aqui
      // e dizer quantas, do que a pessoa levar um erro seco na gravação.
      const est = (c[2] || '').trim();
      if (!est) { semEst++; return; }
      registros.push({
        item: c[0], descricao: c[1] || null, est, dep: c[3] || null,
        localizacao: c[4] || null, lote: c[5] || null, um: c[6] || null,
        qtd_liquida: parseNum(c[7])
      });
    });
    if (!registros.length) {
      return { erro: 'Nenhuma linha com as oito colunas da planilha de bobinas.' };
    }
    if (ignoradas) {
      avisos.push(ignoradas + ' linha(s) ignorada(s) por não ter as oito colunas ou estar sem item.');
    }
    if (semEst) {
      avisos.push(semEst + ' linha(s) IGNORADA(S) por estar sem a coluna Est — sem ela não se sabe a unidade da bobina.');
    }

    // Quantas bobinas por unidade: é o que a prévia mostra, e é a informação
    // que diz quais unidades vão ser substituídas e quais nem serão tocadas.
    const porEst = new Map();
    registros.forEach(r => porEst.set(r.est, (porEst.get(r.est) || 0) + 1));
    const naoConhecidas = [...porEst.keys()].filter(u => !UNIDADES[u]);
    if (naoConhecidas.length) {
      avisos.push('Est não reconhecido pelo portal: ' + naoConhecidas.join(', ')
                  + '. As linhas vão ser gravadas assim mesmo, mas não aparecem em nenhuma tela.');
    }

    return { tipo: 'aco', registros, avisos, mapa: null,
             porEst: [...porEst.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
  }

  // ---------------------------------------- Catálogo EXP
  //
  // Fica ANTES do ramo de estoque porque as colunas são outras: o catálogo tem
  // depósito, referência e lote, que o estoque não tem.
  //
  // ⚠️ É o CATÁLOGO (`catalogo_exp_itens`, a lista de referência do sistema), e
  // NÃO `exp_controle_itens`, que é o registro de movimentação da expedição.
  // Confundir os dois foi o meu erro na primeira versão desta aba: a segunda é
  // append-only e guarda quem retirou o quê, então substituí-la apagaria
  // trabalho de gente.
  if (loteAba === 'exp') {
    if (!pareceCabecalho(linhas[0])) {
      return { erro: 'Esta planilha precisa de cabeçalho: é nele que eu encontro a coluna da '
                   + 'unidade. Cole incluindo a primeira linha, com os nomes das colunas.' };
    }
    const cabecalho = linhas[0];
    const mapa = mapearColunas(cabecalho, ['um', 'unidade', 'item', 'descricao', 'deposito',
                                           'referencia', 'lote', 'quantidade']);
    if (mapa.item === undefined) {
      return { erro: 'Não encontrei a coluna do item. Cabeçalho lido: ' + cabecalho.join(' · ') };
    }
    if (mapa.unidade === undefined) {
      return { erro: 'Não encontrei a coluna da unidade. Ela pode se chamar Unidade, Estab, '
                   + 'Estabelecimento, Est ou Filial. Cabeçalho lido: ' + cabecalho.join(' · ') };
    }

    const conhecidas = new Set(Object.keys(UNIDADES));
    const porUnidade = new Map();
    const desconhecidas = new Map();
    let semItem = 0;

    linhas.slice(1).forEach(c => {
      const pega = (campo) => (mapa[campo] !== undefined ? (c[mapa[campo]] || '') : '');
      const item = pega('item').trim();
      const uni = pega('unidade').trim();
      if (!item || !uni) { semItem++; return; }
      if (!conhecidas.has(uni)) {
        desconhecidas.set(uni, (desconhecidas.get(uni) || 0) + 1);
        return;
      }
      if (!porUnidade.has(uni)) porUnidade.set(uni, []);
      // catalogo_exp_itens.quantidade é `numeric` de verdade (ao contrário de
      // estoque.quantidade, que é texto) -- "21,6" colado direto quebra o
      // jsonb_populate_record() do substituir_catalogo_exp() com "invalid
      // input syntax for type numeric". parseQtd() já faz essa conversão
      // (vírgula brasileira -> ponto) em todo o resto do portal.
      const quantidadeTexto = pega('quantidade').trim();
      porUnidade.get(uni).push({
        codigo_item: item,
        descricao: pega('descricao').trim() || null,
        um: pega('um').trim() || null,
        deposito: pega('deposito').trim() || null,
        referencia: pega('referencia').trim() || null,
        lote: pega('lote').trim() || null,
        quantidade: quantidadeTexto ? parseQtd(quantidadeTexto) : null
      });
    });

    if (semItem) {
      avisos.push(semItem + ' linha(s) ignorada(s) por estar sem código de item ou sem unidade.');
    }
    for (const [uni, n] of desconhecidas) {
      avisos.push(n + ' linha(s) ignorada(s) da unidade "' + uni + '", que não existe no portal.');
    }
    if (!porUnidade.size) {
      return { erro: 'Nenhuma linha aproveitável: confira se a coluna da unidade tem os códigos '
                   + '(101, 105, 106...) e se a coluna do item está preenchida.' };
    }

    const blocos = [...porUnidade.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([unidade, itens]) => ({ unidade, itens, atualizado_por: nomeUsuarioAtual }));

    return { tipo: 'exp', blocos, avisos, mapa, cabecalho };
  }


  // ---------------------------------------- Estoque: ALM e SESMT
  // As DUAS precisam da coluna de unidade desde 09/09/2026: o SESMT deixou
  // de ser uma unidade falsa e passou a ser o depósito de EPI de cada
  // unidade. Sem a coluna não há como saber de qual fábrica é cada EPI, e
  // chutar mandaria a luva para o galpão errado.
  const precisaUnidade = true;
  const deposito = (loteAba === 'sesmt') ? 'sesmt' : 'alm';
  const campos = precisaUnidade
    ? ['um', 'unidade', 'item', 'descricao', 'localizacao', 'quantidade']
    : ['um', 'item', 'descricao', 'localizacao', 'quantidade'];

  let mapa = null;
  let corpo = linhas;
  let cabecalho = null;

  if (pareceCabecalho(linhas[0])) {
    cabecalho = linhas[0];
    mapa = mapearColunas(cabecalho, campos);
    corpo = linhas.slice(1);
  } else {
    return { erro: 'Esta planilha precisa de cabeçalho: é nele que eu encontro a coluna da '
                 + 'unidade. Cole incluindo a primeira linha, com os nomes das colunas.' };
  }

  if (mapa.item === undefined) {
    return { erro: 'Não encontrei a coluna do item. Cabeçalho lido: ' + linhas[0].join(' · ') };
  }
  if (precisaUnidade && mapa.unidade === undefined) {
    return { erro: 'Não encontrei a coluna da unidade. Ela pode se chamar Unidade, Estab, '
                 + 'Estabelecimento, Est ou Filial. Cabeçalho lido: ' + linhas[0].join(' · ') };
  }

  const conhecidas = new Set(Object.keys(UNIDADES));
  const porUnidade = new Map();
  const desconhecidas = new Map();
  let semItem = 0;

  corpo.forEach(c => {
    const pega = (campo) => (mapa[campo] !== undefined ? (c[mapa[campo]] || '') : '');
    const item = pega('item').trim();
    const uni = pega('unidade').trim();

    if (!item || !uni) { semItem++; return; }

    if (!conhecidas.has(uni)) {
      desconhecidas.set(uni, (desconhecidas.get(uni) || 0) + 1);
      return;
    }
    if (!porUnidade.has(uni)) porUnidade.set(uni, []);
    porUnidade.get(uni).push({
      item,
      descricao: pega('descricao').trim() || null,
      um: pega('um').trim() || null,
      localizacao: pega('localizacao').trim() || null,
      quantidade: pega('quantidade').trim()
    });
  });

  if (semItem) {
    avisos.push(semItem + ' linha(s) ignorada(s) por estar sem código de item ou sem unidade.');
  }
  for (const [uni, n] of desconhecidas) {
    avisos.push('Unidade "' + uni + '" não é reconhecida pelo portal: ' + n
                + ' linha(s) IGNORADA(S). Confira o código na planilha.');
  }
  if (!porUnidade.size) {
    return { erro: 'Nenhuma linha caiu em uma unidade conhecida. Nada seria atualizado.' };
  }

  const blocos = [...porUnidade.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([unidade, itens]) => ({ unidade, itens, deposito,
                                  atualizado_por: nomeUsuarioAtual }));

  return { tipo: 'estoque', blocos, avisos, mapa, cabecalho };
}

// ---- Prévia ---------------------------------------------------------------
function renderPreviaLote(pronto) {
  const alvo = document.getElementById('lotePrevia');

  const avisosHtml = (pronto.avisos && pronto.avisos.length)
    ? '<div class="cfg-nota" style="margin:0 0 10px; color:var(--aviso-texto);">'
      + pronto.avisos.map(a => '⚠️ ' + escapeHtml(a)).join('<br>') + '</div>'
    : '';

  // Mostrar o mapeamento é o que permite pegar coluna trocada ANTES de gravar:
  // "unidade" em português serve tanto para estabelecimento quanto para unidade
  // de medida, e é aqui que um erro desses aparece.
  let mapaHtml = '';
  if (pronto.mapa && pronto.cabecalho) {
    const partes = Object.keys(pronto.mapa).map(campo =>
      '<b>' + escapeHtml(campo) + '</b> ← ' + escapeHtml(pronto.cabecalho[pronto.mapa[campo]]));
    mapaHtml = '<div class="cfg-email" style="margin-bottom:10px;">Colunas reconhecidas: '
             + partes.join(' · ') + '</div>';
  }

  let corpoHtml;
  if (pronto.tipo === 'aco') {
    corpoHtml =
      '<table class="cfg-tabela" style="margin-bottom:10px;"><thead><tr>'
      + '<th>Unidade (Est)</th><th>Bobinas que entram</th></tr></thead><tbody>'
      + (pronto.porEst || []).map(([est, n]) =>
          '<tr><td><b>' + escapeHtml(UNIDADES[est] ? rotuloUnidade(est) : 'Est ' + est)
          + '</b></td><td>' + n.toLocaleString('pt-BR') + '</td></tr>').join('')
      + '</tbody></table>'
      + '<div style="font-size:13px; color:var(--muted); margin-bottom:10px;">'
      + (pronto.porEst || []).length + ' unidade(s), '
      + pronto.registros.length.toLocaleString('pt-BR')
      + ' bobina(s) no total. As unidades que não aparecem acima <b>não são tocadas</b>.</div>';
  } else {
    const total = pronto.blocos.reduce((s, b) => s + b.itens.length, 0);
    corpoHtml =
      '<table class="cfg-tabela" style="margin-bottom:10px;"><thead><tr>'
      + '<th>Unidade</th><th>Itens que entram</th></tr></thead><tbody>'
      + pronto.blocos.map(b =>
          '<tr><td><b>' + escapeHtml(rotuloUnidade(b.unidade)) + '</b></td><td>'
          + b.itens.length.toLocaleString('pt-BR') + '</td></tr>').join('')
      + '</tbody></table>'
      + '<div style="font-size:13px; color:var(--muted); margin-bottom:10px;">'
      + pronto.blocos.length + ' unidade(s), ' + total.toLocaleString('pt-BR')
      + ' item(ns) no total. As unidades que não aparecem acima <b>não são tocadas</b>.</div>';
  }

  // A ação fica num container próprio para a confirmação trocar só ela,
  // sem remontar a prévia (e sem tirar os avisos da frente da pessoa).
  alvo.innerHTML = avisosHtml + mapaHtml + corpoHtml
    + '<div id="loteAcao">'
    + '<button class="btn btn-primary" id="loteAplicarBtn">Substituir agora</button>'
    + '</div>';
}

// ---- Confirmação DENTRO da página, não no confirm() do navegador -------
//
// O confirm() do navegador é frágil para a ação mais destrutiva do portal:
// o Chrome oferece "impedir que esta página crie novos diálogos" depois de
// alguns avisos e, marcado isso, confirm() devolve false na hora -- o
// clique em "Substituir agora" não faz nada e NÃO aparece mensagem
// nenhuma. Silêncio é o pior modo de falhar. Aconteceu em 08/09/2026.
//
// Aqui a confirmação é um segundo clique na própria tela: não pode ser
// suprimida, funciona no celular, e fica mais visível que um diálogo.
function resumoDoLote(pronto) {
  return (pronto.tipo === 'aco')
    ? (pronto.porEst || []).map(([est, n]) => est + ' (' + n + ')').join(', ')
      + ' — bobinas'
    : pronto.blocos.map(b => b.unidade + ' (' + b.itens.length + ')').join(', ');
}

function pedirConfirmacaoLote() {
  const msg = document.getElementById('loteMsg');
  if (!lotePreparado) {
    msg.textContent = 'A prévia expirou. Clique em Conferir de novo.';
    msg.className = 'status-msg status-err';
    return;
  }
  document.getElementById('loteAcao').innerHTML =
      '<div class="cfg-nota" style="margin:0 0 10px; background:var(--erro-fundo);'
    + ' border:1px solid var(--erro-borda); color:var(--erro-texto);">'
    + '<b>Confirmar substituição.</b> Vai substituir: '
    + escapeHtml(resumoDoLote(lotePreparado)) + '. O estoque anterior dessas '
    + 'unidades é apagado e trocado pelo que veio na planilha. '
    + '<b>Não dá para desfazer.</b></div>'
    + '<button class="btn btn-primary" id="loteConfirmarBtn">Sim, substituir</button>&nbsp;'
    + '<button class="btn" id="loteCancelarBtn">Cancelar</button>';
  msg.textContent = 'Leia o aviso e confirme.';
  msg.className = 'status-msg';
}

function cancelarConfirmacaoLote() {
  const msg = document.getElementById('loteMsg');
  if (lotePreparado) renderPreviaLote(lotePreparado);
  msg.textContent = 'Cancelado. Nada foi alterado.';
  msg.className = 'status-msg';
}

// ---- Gravar ---------------------------------------------------------------
// Diz quantas linhas o catálogo TINHA antes, somando as unidades da planilha.
// Serve de conferência na hora: substituir 4.000 linhas por 12 é quase sempre
// planilha colada pela metade, e o número na frente da pessoa é o que faz ela
// reparar antes de fechar a tela.
function avisoCatalogoAnterior(data) {
  const antes = ((data && data.blocos) || []).reduce((s, b) => s + (b.antes || 0), 0);
  const agora = ((data && data.blocos) || []).reduce((s, b) => s + (b.itens || 0), 0);
  if (!antes) return '';
  return ' O catálogo dessas unidades tinha ' + antes.toLocaleString('pt-BR')
    + ' linha(s) e passou a ter ' + agora.toLocaleString('pt-BR') + '.';
}


async function aplicarLote() {
  const msg = document.getElementById('loteMsg');
  const botao = document.getElementById('loteConfirmarBtn');

  // Não usa confirm(): a confirmação já aconteceu na própria tela, em
  // pedirConfirmacaoLote(). Ver o comentário lá.
  if (!lotePreparado) {
    msg.textContent = 'A prévia expirou. Clique em Conferir de novo.';
    msg.className = 'status-msg status-err';
    return;
  }

  if (botao) botao.disabled = true;
  msg.textContent = 'Substituindo...';
  msg.className = 'status-msg';

  const { data, error } = (lotePreparado.tipo === 'aco')
    ? await sb.rpc('substituir_bobinas', { linhas: lotePreparado.registros, quem: nomeUsuarioAtual })
    : (lotePreparado.tipo === 'exp')
      ? await sb.rpc('substituir_catalogo_exp', { payload: lotePreparado.blocos })
      : await sb.rpc('substituir_estoque', { payload: lotePreparado.blocos });

  if (botao) botao.disabled = false;
  if (error) {
    // A função é transacional: erro aqui significa que NADA foi gravado, e vale
    // dizer isso -- senão a pessoa fica sem saber se ficou pela metade e vai
    // conferir unidade por unidade.
    msg.textContent = 'NÃO GRAVOU: ' + error.message
                    + ' — nada foi alterado, o estoque anterior continua no lugar.';
    msg.className = 'status-msg status-err';
    console.error('Falha ao substituir estoque em lote:', error.message);
    return;
  }

  msg.textContent = (lotePreparado.tipo === 'aco')
    ? 'Bobinas substituídas em '
      + ((data && data.unidades) ? data.unidades.length : '?') + ' unidade(s): '
      + ((data && data.bobinas) || 0) + ' linha(s).'
    : (lotePreparado.tipo === 'exp')
      ? 'Catálogo EXP substituído em '
        + ((data && data.blocos) ? data.blocos.length : '?') + ' unidade(s).'
        + avisoCatalogoAnterior(data)
    : 'Estoque substituído em '
      + ((data && data.unidades) ? data.unidades.length : '?') + ' unidade(s).'
      + avisoEstoqueMinimoNaoPreservado(data);
  msg.className = 'status-msg status-ok';

  lotePreparado = null;
  document.getElementById('lotePrevia').innerHTML = '';
  document.getElementById('loteTexto').value = '';
  document.getElementById('loteArquivoNome').textContent = '';
}

// ---- Abas, arquivo, botões ------------------------------------------------
function trocarAbaLote(aba) {
  loteAba = aba;
  document.querySelectorAll('#loteAbas [data-lote-aba]').forEach(b => {
    b.classList.toggle('btn-primary', b.dataset.loteAba === aba);
  });
  document.getElementById('loteFormato').textContent = LOTE_FORMATOS[aba] || '';
  document.getElementById('loteTexto').value = '';
  document.getElementById('loteArquivoNome').textContent = '';
  document.getElementById('lotePrevia').innerHTML = '';
  document.getElementById('loteMsg').textContent = '';
  lotePreparado = null;
}

document.getElementById('loteAbas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lote-aba]');
  if (b) trocarAbaLote(b.dataset.loteAba);
});

document.getElementById('loteConferirBtn').addEventListener('click', () => {
  const msg = document.getElementById('loteMsg');
  const pronto = prepararLote(document.getElementById('loteTexto').value);
  if (pronto.erro) {
    lotePreparado = null;
    document.getElementById('lotePrevia').innerHTML = '';
    msg.textContent = pronto.erro;
    msg.className = 'status-msg status-err';
    return;
  }
  lotePreparado = pronto;
  msg.textContent = 'Confira a prévia antes de substituir.';
  msg.className = 'status-msg';
  renderPreviaLote(pronto);
});

document.getElementById('lotePrevia').addEventListener('click', (e) => {
  if (e.target.closest('#loteAplicarBtn')) pedirConfirmacaoLote();
  else if (e.target.closest('#loteConfirmarBtn')) aplicarLote();
  else if (e.target.closest('#loteCancelarBtn')) cancelarConfirmacaoLote();
});

document.getElementById('loteLimparBtn').addEventListener('click', () => trocarAbaLote(loteAba));

// O arquivo é lido no navegador e cai na mesma caixa de texto, para a pessoa
// conferir antes de qualquer coisa. Nada é enviado a servidor nenhum.
document.getElementById('loteArquivo').addEventListener('change', (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  const msg = document.getElementById('loteMsg');
  const leitor = new FileReader();
  leitor.onload = () => {
    document.getElementById('loteTexto').value = String(leitor.result || '');
    document.getElementById('loteArquivoNome').textContent = arquivo.name;
    document.getElementById('lotePrevia').innerHTML = '';
    lotePreparado = null;
    msg.textContent = 'Arquivo carregado. Clique em Conferir.';
    msg.className = 'status-msg';
  };
  leitor.onerror = () => {
    msg.textContent = 'Não foi possível ler o arquivo.';
    msg.className = 'status-msg status-err';
  };
  leitor.readAsText(arquivo, 'UTF-8');
  e.target.value = '';
});

// Chamada ao abrir a aba Configurações (js/navegacao.js).
function carregarLote() {
  const mostrar = !!isAdminAtual;
  ['loteSecaoTitulo', 'loteSecao', 'loteNota'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = mostrar ? '' : 'none';
  });
  if (mostrar) trocarAbaLote(loteAba);
}
