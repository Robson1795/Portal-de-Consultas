// Portal de Estoque Kingspan Isoeste — Requisição ALM (Fase 6)
//
// Rascunho para lançamento no CD1406 do Datasul. NÃO abre requisição no
// Datasul: a pessoa monta o pedido aqui, ele fica registrado no portal, e um
// botão abre o e-mail já preenchido para o ALM da unidade, que lança lá.
//
// Por que o e-mail sai pelo Outlook da pessoa, e não pelo portal: não existe
// servidor neste projeto -- é HTML e JavaScript falando direto com o
// Supabase. Enviar por conta própria exigiria uma Edge Function mais um
// provedor de e-mail com chave de API. O caminho atual tem uma vantagem
// real: o pedido sai do e-mail de quem pediu, então o ALM responde direto e
// fica registrado na caixa de saída dela.
//
// Centro de custo e item vêm de lista cadastrada, não de texto livre. Texto
// livre gera "1406", "CC1406", "1.406" e "cd1406" para a mesma coisa. Quem
// cadastra é o admin (`centros_custo` e `itens_requisicao` só aceitam
// escrita de admin, no RLS); todos os outros escolhem da lista.

let catalogoItens = new Map();    // codigo -> { descricao, um, origem }
let centrosCusto = [];
let emailsAlmUnidade = '';
let minhasRequisicoes = [];
let requisicaoEmEdicao = null;
let cadastroAba = 'cc';           // 'cc' | 'item'

// ---- Carga da tela ---------------------------------------------------------
async function carregarRequisicao() {
  const msg = document.getElementById('reqMsg');
  msg.textContent = '';
  msg.className = 'status-msg';

  document.getElementById('reqUnidade').textContent =
    unidadeAtual ? rotuloUnidade(unidadeAtual) : 'Unidade não definida';
  document.getElementById('reqSolicitante').textContent = nomeUsuarioAtual || '—';

  // Só admin cadastra centro de custo e item.
  document.getElementById('reqCadastrosBtn').style.display = isAdminAtual ? 'inline-block' : 'none';

  if (!unidadeAtual) {
    // Sem unidade não há para quem mandar nem de qual estoque escolher item.
    document.getElementById('reqFormArea').style.display = 'none';
    msg.textContent = 'Sua conta ainda não tem unidade definida. Peça ao administrador antes de fazer uma requisição.';
    msg.className = 'status-msg status-err';
    return;
  }
  document.getElementById('reqFormArea').style.display = 'block';

  await Promise.all([
    carregarCentrosCusto(),
    carregarCatalogoItens(),
    carregarEmailsAlm(),
    carregarMinhasRequisicoes()
  ]);
  if (!document.querySelectorAll('#reqItens .req-linha').length) adicionarLinhaItem();
}

async function carregarCentrosCusto() {
  const { data, error } = await sb.from('centros_custo')
    .select('codigo, descricao, ativo').order('codigo');
  const sel = document.getElementById('reqCentroCusto');
  if (error) {
    console.error('Falha ao carregar centros de custo:', error.message);
    sel.innerHTML = '<option value="">(não foi possível carregar)</option>';
    centrosCusto = [];
    return;
  }
  centrosCusto = data || [];
  const ativos = centrosCusto.filter(c => c.ativo);
  sel.innerHTML = '<option value="">Selecione o centro de custo...</option>' +
    ativos.map(c => `<option value="${escapeHtml(c.codigo)}">${escapeHtml(c.codigo)}${c.descricao ? ' · ' + escapeHtml(c.descricao) : ''}</option>`).join('');
  document.getElementById('reqSemCentroCusto').style.display = ativos.length ? 'none' : 'block';
}

// O catálogo (`itens_requisicao`) MAIS os itens do estoque da unidade. O
// catálogo existe para pedir item que a unidade ainda não tem, e vence em
// caso de código repetido, porque é o cadastro curado.
async function carregarCatalogoItens() {
  catalogoItens = new Map();

  const [cat, est] = await Promise.all([
    sb.from('itens_requisicao').select('codigo, descricao, um, ativo'),
    sb.from('estoque').select('item, descricao, um').eq('unidade', unidadeAtual)
  ]);

  if (est.error) console.error('Falha ao carregar itens do estoque:', est.error.message);
  (est.data || []).forEach(r => {
    if (!catalogoItens.has(r.item)) {
      catalogoItens.set(r.item, { descricao: r.descricao, um: r.um, origem: 'estoque' });
    }
  });

  if (cat.error) console.error('Falha ao carregar o catálogo de itens:', cat.error.message);
  (cat.data || []).filter(r => r.ativo).forEach(r => {
    catalogoItens.set(r.codigo, { descricao: r.descricao, um: r.um, origem: 'catalogo' });
  });

  document.getElementById('reqItensDatalist').innerHTML =
    [...catalogoItens.keys()].sort().map(c => `<option value="${escapeHtml(c)}">`).join('');
}

async function carregarEmailsAlm() {
  // Por funcao, nao pela tabela: `config_unidade` passou a ser legivel so
  // para admin, porque guarda as senhas. A funcao devolve apenas o e-mail.
  const { data, error } = await sb.rpc('emails_alm_da_unidade', { uni: unidadeAtual });
  if (error) console.error('Falha ao carregar os e-mails do ALM:', error.message);
  emailsAlmUnidade = (!error && data) ? String(data).trim() : '';
  document.getElementById('reqSemEmail').style.display = emailsAlmUnidade ? 'none' : 'block';
  document.getElementById('reqEnviarBtn').disabled = !emailsAlmUnidade;
}

async function carregarMinhasRequisicoes() {
  const { data, error } = await sb.from('requisicoes_alm')
    .select('id, unidade, centro_custo, status, criado_em, requisicoes_alm_itens(id)')
    .order('criado_em', { ascending: false }).limit(50);
  if (error) {
    console.error('Falha ao carregar as requisições:', error.message);
    document.getElementById('reqLista').innerHTML =
      `<div class="empty-msg" style="display:block;">Não foi possível carregar as requisições: ${escapeHtml(error.message)}</div>`;
    return;
  }
  minhasRequisicoes = data || [];
  renderMinhasRequisicoes();
}

function renderMinhasRequisicoes() {
  const alvo = document.getElementById('reqLista');
  if (!minhasRequisicoes.length) {
    alvo.innerHTML = '<div class="empty-msg" style="display:block;">Nenhuma requisição ainda.</div>';
    return;
  }
  alvo.innerHTML = minhasRequisicoes.map(r => {
    const qtd = (r.requisicoes_alm_itens || []).length;
    const quando = new Date(r.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const enviada = r.status === 'enviada';
    return `
    <div class="req-card" data-id="${r.id}">
      <div class="req-card-info">
        <div class="req-card-topo">
          <b>#${r.id}</b>
          <span class="cfg-status ${enviada ? 'st-ativo' : 'st-pendente'}">${enviada ? 'Enviada' : 'Rascunho'}</span>
        </div>
        <div class="req-card-sub">
          ${quando} · ${qtd} ${qtd === 1 ? 'item' : 'itens'}${r.centro_custo ? ' · CC ' + escapeHtml(r.centro_custo) : ''}
        </div>
      </div>
      <div class="req-card-acoes">
        <button class="btn req-abrir">Abrir</button>
        <button class="btn req-excluir">Excluir</button>
      </div>
    </div>`;
  }).join('');
}

// ---- Linhas de item --------------------------------------------------------
function adicionarLinhaItem(preenchido) {
  const p = preenchido || {};
  const div = document.createElement('div');
  div.className = 'req-linha';
  div.innerHTML = `
    <input type="text" class="req-item" list="reqItensDatalist" placeholder="Código do item"
           value="${escapeHtml(p.item || '')}">
    <input type="text" class="req-desc" placeholder="Descrição" readonly
           value="${escapeHtml(p.descricao || '')}">
    <input type="text" class="req-um" placeholder="UM" readonly
           value="${escapeHtml(p.um || '')}">
    <input type="text" class="req-qtd" inputmode="decimal" placeholder="Qtd"
           value="${escapeHtml(p.quantidade != null ? String(p.quantidade) : '')}">
    <button class="btn req-remover" title="Remover este item" type="button">✕</button>`;
  document.getElementById('reqItens').appendChild(div);
}

document.getElementById('reqAddItemBtn').addEventListener('click', () => adicionarLinhaItem());

document.getElementById('reqItens').addEventListener('input', (e) => {
  if (!e.target.classList.contains('req-item')) return;
  const linha = e.target.closest('.req-linha');
  const codigo = e.target.value.trim();
  const info = catalogoItens.get(codigo);
  linha.querySelector('.req-desc').value = info ? (info.descricao || '') : '';
  linha.querySelector('.req-um').value  = info ? (info.um || '') : '';
  // Código fora da lista fica marcado em laranja e é recusado no envio:
  // requisição com item inexistente só gera retrabalho para o ALM.
  e.target.style.borderColor = (codigo && !info) ? '#d97706' : '';
});

document.getElementById('reqItens').addEventListener('click', (e) => {
  if (!e.target.closest('.req-remover')) return;
  e.target.closest('.req-linha').remove();
  if (!document.querySelectorAll('#reqItens .req-linha').length) adicionarLinhaItem();
});

// ---- Ler e validar ---------------------------------------------------------
function lerFormulario() {
  const itens = [...document.querySelectorAll('#reqItens .req-linha')].map(l => ({
    item: l.querySelector('.req-item').value.trim(),
    descricao: l.querySelector('.req-desc').value.trim(),
    um: l.querySelector('.req-um').value.trim(),
    quantidade: parseQtd(l.querySelector('.req-qtd').value.trim())
  })).filter(i => i.item);

  return {
    centro_custo: document.getElementById('reqCentroCusto').value,
    narrativa: document.getElementById('reqNarrativa').value.trim(),
    itens
  };
}

function validar(f) {
  const msg = document.getElementById('reqMsg');
  const erro = (t) => { msg.textContent = t; msg.className = 'status-msg status-err'; return false; };

  if (!f.centro_custo) {
    return erro('Selecione o centro de custo — sem ele o ALM não consegue lançar no CD1406.');
  }
  if (!f.itens.length) return erro('Inclua pelo menos um item.');

  const semQtd = f.itens.filter(i => !(i.quantidade > 0)).map(i => i.item);
  if (semQtd.length) return erro('Informe a quantidade do item ' + semQtd.join(', ') + '.');

  const foraDaLista = f.itens.filter(i => !catalogoItens.has(i.item)).map(i => i.item);
  if (foraDaLista.length) {
    return erro('Item não cadastrado: ' + foraDaLista.join(', ')
      + '. Escolha da lista, ou peça ao administrador para cadastrar.');
  }
  return true;
}

// ---- Gravar ----------------------------------------------------------------
async function gravarRequisicao(status) {
  const f = lerFormulario();
  if (!validar(f)) return null;

  const msg = document.getElementById('reqMsg');
  msg.textContent = 'Salvando...';
  msg.className = 'status-msg';

  const cabecalho = {
    unidade: unidadeAtual,
    criado_por: userIdAtual,
    solicitante_nome: nomeUsuarioAtual,
    solicitante_email: emailUsuarioAtual,
    centro_custo: f.centro_custo,
    narrativa: f.narrativa || null,
    status
  };
  if (status === 'enviada') cabecalho.enviado_em = new Date().toISOString();

  let id = requisicaoEmEdicao;

  if (id) {
    const { error } = await sb.from('requisicoes_alm').update(cabecalho).eq('id', id);
    if (error) return falharGravacao(error.message);
    // Substitui os itens: mais simples e previsível que casar linha por linha.
    const { error: erroDel } = await sb.from('requisicoes_alm_itens').delete().eq('requisicao_id', id);
    if (erroDel) return falharGravacao(erroDel.message);
  } else {
    const { data, error } = await sb.from('requisicoes_alm').insert(cabecalho).select('id').single();
    if (error) return falharGravacao(error.message);
    id = data.id;
  }

  const { error: erroItens } = await sb.from('requisicoes_alm_itens')
    .insert(f.itens.map(i => ({ requisicao_id: id, ...i })));
  if (erroItens) {
    // O cabeçalho já entrou; avisa em vez de deixar meia requisição em silêncio.
    return falharGravacao('Cabeçalho salvo, mas os itens falharam: ' + erroItens.message
      + ' — abra a requisição #' + id + ' e tente de novo.');
  }

  requisicaoEmEdicao = id;
  await carregarMinhasRequisicoes();
  msg.textContent = 'Requisição #' + id + ' salva.';
  msg.className = 'status-msg status-ok';
  return id;
}

function falharGravacao(mensagem) {
  const msg = document.getElementById('reqMsg');
  msg.textContent = 'Não foi possível salvar: ' + mensagem;
  msg.className = 'status-msg status-err';
  console.error('Falha ao salvar requisição:', mensagem);
  return null;
}

document.getElementById('reqSalvarBtn').addEventListener('click', () => gravarRequisicao('rascunho'));

// ---- Enviar por e-mail -----------------------------------------------------
function montarCorpoEmail(id, f) {
  const L = 40;
  const cc = centrosCusto.find(c => c.codigo === f.centro_custo);
  return [
    `REQUISIÇÃO ALM #${id}`,
    rotuloUnidade(unidadeAtual),
    '',
    `Solicitante: ${nomeUsuarioAtual} (${emailUsuarioAtual})`,
    `Centro de custo: ${f.centro_custo}${cc && cc.descricao ? ' - ' + cc.descricao : ''}`,
    `Data: ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`,
    '',
    'ITENS',
    `${'Codigo'.padEnd(12)} ${'Descricao'.padEnd(L)} ${'UM'.padEnd(5)} Qtd`,
    '-'.repeat(12 + L + 5 + 8),
    ...f.itens.map(i =>
      `${i.item.padEnd(12)} ${(i.descricao || '').slice(0, L).padEnd(L)} ${(i.um || '').padEnd(5)} ${i.quantidade}`),
    '',
    ...(f.narrativa ? ['NARRATIVA', f.narrativa, ''] : []),
    '--',
    'Rascunho gerado pelo Portal de Estoque, para lancamento no CD1406.',
    'A requisicao tambem esta registrada no portal.'
  ].join('\n');
}

document.getElementById('reqEnviarBtn').addEventListener('click', async () => {
  const f = lerFormulario();
  if (!validar(f)) return;

  // Grava ANTES de abrir o e-mail: se o Outlook não abrir ou a pessoa
  // desistir, o pedido não se perde.
  const id = await gravarRequisicao('enviada');
  if (!id) return;

  const assunto = `Requisicao ALM #${id} - ${rotuloUnidade(unidadeAtual)} - CC ${f.centro_custo}`;
  const href = 'mailto:' + encodeURIComponent(emailsAlmUnidade.replace(/;/g, ','))
             + '?subject=' + encodeURIComponent(assunto)
             + '&body=' + encodeURIComponent(montarCorpoEmail(id, f));

  const msg = document.getElementById('reqMsg');
  if (href.length > 1900) {
    // Alguns clientes cortam mailto muito longo. Avisa em vez de deixar a
    // pessoa mandar um pedido truncado sem saber.
    msg.textContent = 'Requisição #' + id + ' salva. ATENÇÃO: são muitos itens e o e-mail pode sair '
      + 'cortado — confira antes de enviar, ou avise o ALM para abrir a requisição no portal.';
    msg.className = 'status-msg status-err';
  } else {
    msg.textContent = 'Requisição #' + id + ' salva. Abrindo o e-mail — confira e clique em enviar.';
    msg.className = 'status-msg status-ok';
  }
  window.location.href = href;
});

// ---- Abrir, excluir, limpar ------------------------------------------------
document.getElementById('reqLista').addEventListener('click', async (e) => {
  const card = e.target.closest('.req-card');
  if (!card) return;
  const id = parseInt(card.dataset.id, 10);
  const msg = document.getElementById('reqMsg');

  if (e.target.closest('.req-abrir')) {
    const { data, error } = await sb.from('requisicoes_alm')
      .select('centro_custo, narrativa, requisicoes_alm_itens(item, descricao, um, quantidade)')
      .eq('id', id).single();
    if (error) {
      msg.textContent = 'Não foi possível abrir a requisição: ' + error.message;
      msg.className = 'status-msg status-err';
      return;
    }
    requisicaoEmEdicao = id;
    document.getElementById('reqCentroCusto').value = data.centro_custo || '';
    document.getElementById('reqNarrativa').value = data.narrativa || '';
    document.getElementById('reqItens').innerHTML = '';
    (data.requisicoes_alm_itens || []).forEach(i => adicionarLinhaItem(i));
    if (!document.querySelectorAll('#reqItens .req-linha').length) adicionarLinhaItem();
    const marca = document.getElementById('reqEmEdicao');
    marca.textContent = 'Editando a requisição #' + id;
    marca.style.display = 'inline-block';
    msg.textContent = '';
    msg.className = 'status-msg';
    return;
  }

  if (e.target.closest('.req-excluir')) {
    if (!confirm('Excluir a requisição #' + id + '? Isso não pode ser desfeito.')) return;
    const { error } = await sb.from('requisicoes_alm').delete().eq('id', id);
    if (error) {
      msg.textContent = 'Não foi possível excluir: ' + error.message;
      msg.className = 'status-msg status-err';
      return;
    }
    if (requisicaoEmEdicao === id) limparFormulario();
    await carregarMinhasRequisicoes();
    msg.textContent = 'Requisição #' + id + ' excluída.';
    msg.className = 'status-msg status-ok';
  }
});

function limparFormulario() {
  requisicaoEmEdicao = null;
  document.getElementById('reqCentroCusto').value = '';
  document.getElementById('reqNarrativa').value = '';
  document.getElementById('reqItens').innerHTML = '';
  adicionarLinhaItem();
  document.getElementById('reqEmEdicao').style.display = 'none';
  const msg = document.getElementById('reqMsg');
  msg.textContent = '';
  msg.className = 'status-msg';
}

document.getElementById('reqNovaBtn').addEventListener('click', limparFormulario);


// ===========================================================================
// CADASTROS — centro de custo e item. Só admin; o RLS recusa os outros.
// ===========================================================================
const cadastroModal = document.getElementById('cadastroModal');

document.getElementById('reqCadastrosBtn').addEventListener('click', () => {
  cadastroModal.classList.add('open');
  trocarAbaCadastro('cc');
});
document.getElementById('cadastroCloseBtn').addEventListener('click', () => cadastroModal.classList.remove('open'));
cadastroModal.addEventListener('click', (e) => {
  if (e.target === cadastroModal) cadastroModal.classList.remove('open');
});

document.getElementById('cadastroAbas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-aba]');
  if (b) trocarAbaCadastro(b.dataset.aba);
});

function trocarAbaCadastro(aba) {
  cadastroAba = aba;
  document.querySelectorAll('#cadastroAbas [data-aba]').forEach(b => {
    b.className = b.dataset.aba === aba ? 'btn btn-primary' : 'btn';
  });
  // A coluna UM só existe para item.
  document.getElementById('cadUm').style.display = aba === 'item' ? 'block' : 'none';
  document.getElementById('cadCodigo').placeholder = aba === 'cc' ? 'Código do centro de custo' : 'Código do item';
  renderCadastros();
}

function renderCadastros() {
  const lista = cadastroAba === 'cc'
    ? centrosCusto.map(c => ({ codigo: c.codigo, descricao: c.descricao, um: null, ativo: c.ativo }))
    : [...catalogoItens.entries()]
        .filter(([, v]) => v.origem === 'catalogo')
        .map(([k, v]) => ({ codigo: k, descricao: v.descricao, um: v.um, ativo: true }));

  const alvo = document.getElementById('cadastroLista');
  if (!lista.length) {
    alvo.innerHTML = '<div class="empty-msg" style="display:block;">Nada cadastrado ainda.</div>';
    return;
  }
  alvo.innerHTML = lista.map(r => `
    <div class="cad-linha" data-codigo="${escapeHtml(r.codigo)}">
      <div>
        <b>${escapeHtml(r.codigo)}</b>
        ${r.descricao ? '<span class="cad-desc">' + escapeHtml(r.descricao) + '</span>' : ''}
        ${r.um ? '<span class="cad-um">' + escapeHtml(r.um) + '</span>' : ''}
      </div>
      <button class="btn cad-remover">Remover</button>
    </div>`).join('');
}

document.getElementById('cadAdicionarBtn').addEventListener('click', async () => {
  const codigo = document.getElementById('cadCodigo').value.trim();
  const descricao = document.getElementById('cadDescricao').value.trim();
  const um = document.getElementById('cadUm').value.trim();
  const msg = document.getElementById('cadastroMsg');

  if (!codigo) {
    msg.textContent = 'Informe o código.';
    msg.className = 'status-msg status-err';
    return;
  }
  msg.textContent = 'Salvando...';
  msg.className = 'status-msg';

  const { error } = cadastroAba === 'cc'
    ? await sb.from('centros_custo').upsert({ codigo, descricao: descricao || null, ativo: true })
    : await sb.from('itens_requisicao').upsert({ codigo, descricao: descricao || null, um: um || null, ativo: true });

  if (error) {
    msg.textContent = 'Não foi possível salvar: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }
  document.getElementById('cadCodigo').value = '';
  document.getElementById('cadDescricao').value = '';
  document.getElementById('cadUm').value = '';
  msg.textContent = 'Cadastrado.';
  msg.className = 'status-msg status-ok';
  await recarregarCadastros();
});

document.getElementById('cadastroLista').addEventListener('click', async (e) => {
  if (!e.target.closest('.cad-remover')) return;
  const codigo = e.target.closest('.cad-linha').dataset.codigo;
  const msg = document.getElementById('cadastroMsg');
  if (!confirm('Remover ' + codigo + '? Requisições já feitas não são afetadas.')) return;

  const { error } = cadastroAba === 'cc'
    ? await sb.from('centros_custo').delete().eq('codigo', codigo)
    : await sb.from('itens_requisicao').delete().eq('codigo', codigo);

  if (error) {
    msg.textContent = 'Não foi possível remover: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }
  msg.textContent = codigo + ' removido.';
  msg.className = 'status-msg status-ok';
  await recarregarCadastros();
});

// Recarrega as listas e o que a tela de requisição usa, para o cadastro novo
// aparecer no seletor sem precisar recarregar a página.
async function recarregarCadastros() {
  await Promise.all([carregarCentrosCusto(), carregarCatalogoItens()]);
  renderCadastros();
}
