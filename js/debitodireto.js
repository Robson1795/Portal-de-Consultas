// Portal de Estoque Kingspan Isoeste — Itens Débito Direto (15/09/2026)
//
// O Robson: "quero criar uma aba ITENS DEBITO DIRETO, são itens que temos
// no estoque mas nao esta no sistema, a ideia é colocar a localização
// nesses itens também, dai vou colocar o nome do material que esta
// guardado, isso para eu identificar facil material que nao tem via
// sistema, os itens estao no almoxarifado, quero também uma aba de
// impressao da folha que nem fiz da trading, dai vou colocar o nome do
// material e nela fica escrita item debito direto e a localização".
// Depois: "ai eu escrevo os itens na propria plataforma" (cadastro manual
// aqui na tela, sem planilha nenhuma) e "usuario permitido para visualizar
// eu Maiko, Joel e Victor" (acesso restrito por lista, ver
// sql/fase51-itens-debito-direto.sql).
//
// POR QUE NÃO REAPROVEITAR A TELA DE CONSULTA DE ITENS (`estoque`)
//
// Aquela tela é sempre item de CÓDIGO conhecido (planilha do Datasul,
// substituída em lote a cada importação) -- o oposto do que isto resolve:
// material sem código nenhum, só um nome digitado à mão. Por isso é página
// própria, tabela própria (itens_debito_direto), sem quantidade nem UM --
// o Robson só pediu nome do material + localização.

let debitoDiretoItens = [];
let podeVerDebitoDiretoCache = false;
let debitoDiretoSelecionados = new Set();
let debitoDiretoConfirmarImpressao = false;

// Chamada por js/auth.js antes de montarMenu() -- mesmo motivo de
// atualizarPermissaoAnalise() (js/analise.js): sem isso, a página apareceria
// no menu pra qualquer estoque_alm/admin, não só pra quem está na lista.
async function atualizarPermissaoDebitoDireto() {
  const { data, error } = await sb.rpc('pode_ver_debito_direto');
  podeVerDebitoDiretoCache = !error && data === true;
  if (error) {
    // Silencioso: função nova (fase50) -- se ainda não rodou no banco, a
    // página só fica escondida do menu, sem travar o resto do login.
    console.warn('Não foi possível checar o acesso a Itens Débito Direto:', error.message);
  }
}

async function carregarDebitoDireto() {
  const msg = document.getElementById('debitoDiretoMsg');
  if (!unidadeAtual) { debitoDiretoItens = []; renderDebitoDireto(); return; }

  const { data, error } = await sb.from('itens_debito_direto')
    .select('*').eq('unidade', unidadeAtual).order('descricao', { ascending: true });

  if (error) {
    msg.textContent = 'Não foi possível carregar: ' + error.message
      + (/does not exist|relation|column|function/i.test(error.message) ? ' — rode sql/fase51-itens-debito-direto.sql no Supabase.' : '');
    msg.className = 'status-msg status-err';
    debitoDiretoItens = [];
  } else {
    debitoDiretoItens = data || [];
  }
  // Troca de unidade/recarga zera a seleção -- imprimir com itens de outra
  // unidade marcados por engano seria a folha errada saindo na impressora.
  debitoDiretoSelecionados.clear();
  renderDebitoDireto();
}

function linhasFiltradasDebitoDireto() {
  const busca = document.getElementById('debitoDiretoBusca').value.trim().toLowerCase();
  if (!busca) return debitoDiretoItens;
  return debitoDiretoItens.filter(i =>
    String(i.descricao || '').toLowerCase().includes(busca) ||
    String(i.localizacao || '').toLowerCase().includes(busca));
}

// Mesmo padrão do botão de etiquetas da Trading (js/estoque.js): o rótulo
// diz quantas folhas vão sair ANTES de sair, e qualquer mudança na marcação
// cancela uma confirmação de "mais de 10 folhas" pendente -- o número que a
// pessoa leu na tela deixou de valer.
function atualizarBotaoEtiquetasDebitoDireto() {
  const btn = document.getElementById('debitoDiretoEtiquetasBtn');
  if (!btn) return;
  debitoDiretoConfirmarImpressao = false;
  btn.textContent = `🖨️ Etiquetas (${debitoDiretoSelecionados.size})`;
  btn.disabled = debitoDiretoSelecionados.size === 0;
}

function renderDebitoDireto() {
  const linhas = linhasFiltradasDebitoDireto();
  const corpo = document.getElementById('debitoDiretoBody');
  const vazio = document.getElementById('debitoDiretoVazio');
  document.getElementById('debitoDiretoTabela').style.display = linhas.length ? 'table' : 'none';
  vazio.style.display = linhas.length ? 'none' : 'block';
  atualizarBotaoEtiquetasDebitoDireto();

  if (!linhas.length) {
    vazio.textContent = debitoDiretoItens.length
      ? 'Nenhum item bate com a busca.'
      : 'Nenhum item cadastrado ainda.';
    corpo.innerHTML = '';
    return;
  }

  corpo.innerHTML = linhas.map(i => `
    <tr>
      <td><input type="checkbox" class="debito-check" data-id="${escapeHtml(i.id)}" ${debitoDiretoSelecionados.has(String(i.id)) ? 'checked' : ''}></td>
      <td>${escapeHtml(i.descricao)}</td>
      <td class="loc">${escapeHtml(i.localizacao || '—')}</td>
      <td class="cad-desc">${i.registrado_por ? escapeHtml(i.registrado_por) + ' — ' : ''}${escapeHtml(formatarDataHoraBR(i.criado_em))}</td>
      <td class="col-acoes">
        <button class="acao-btn debito-editar" data-id="${escapeHtml(i.id)}" title="Editar">✏️</button>
        <button class="acao-btn debito-excluir" data-id="${escapeHtml(i.id)}" title="Excluir">🗑</button>
      </td>
    </tr>`).join('');
}

document.getElementById('debitoDiretoBusca').addEventListener('input', renderDebitoDireto);

document.getElementById('debitoDiretoAdicionarBtn').addEventListener('click', async () => {
  const msg = document.getElementById('debitoDiretoMsg');
  const campoNome = document.getElementById('debitoDiretoNome');
  const campoLocal = document.getElementById('debitoDiretoLocal');
  const nome = campoNome.value.trim();
  // Maiúscula na gravação -- mesmo padrão da Localização do Controle EXP
  // (12/09/2026): endereço digitado de jeito diferente por pessoas
  // diferentes vira duas "localizações" na busca/agrupamento.
  const local = campoLocal.value.trim().toUpperCase();

  if (!nome) {
    msg.textContent = 'Informe o nome do material.';
    msg.className = 'status-msg status-err';
    return;
  }
  if (!unidadeAtual) {
    msg.textContent = 'Selecione uma unidade antes de cadastrar.';
    msg.className = 'status-msg status-err';
    return;
  }

  const btn = document.getElementById('debitoDiretoAdicionarBtn');
  btn.disabled = true;
  const { error } = await sb.from('itens_debito_direto').insert({
    unidade: unidadeAtual, descricao: nome, localizacao: local || null,
    registrado_por: nomeUsuarioAtual || null
  });
  btn.disabled = false;

  if (error) {
    msg.textContent = 'NÃO SALVOU: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }

  campoNome.value = '';
  campoLocal.value = '';
  campoNome.focus();
  msg.textContent = 'Item cadastrado.';
  msg.className = 'status-msg status-ok';
  await carregarDebitoDireto();
});

// Enter em qualquer um dos dois campos cadastra, igual a clicar "+
// Adicionar" -- pra digitar item após item sem tirar a mão do teclado.
['debitoDiretoNome', 'debitoDiretoLocal'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('debitoDiretoAdicionarBtn').click();
  });
});

document.getElementById('debitoDiretoBody').addEventListener('click', async (e) => {
  const btnEditar = e.target.closest('.debito-editar');
  const btnExcluir = e.target.closest('.debito-excluir');

  if (btnExcluir) {
    const id = btnExcluir.dataset.id;
    const item = debitoDiretoItens.find(i => String(i.id) === String(id));
    if (!item) return;
    if (!confirm(`Excluir "${item.descricao}"? Não tem como desfazer.`)) return;
    btnExcluir.disabled = true;
    const { error } = await sb.from('itens_debito_direto').delete().eq('id', id);
    if (error) { alert('Não foi possível excluir: ' + error.message); btnExcluir.disabled = false; return; }
    debitoDiretoSelecionados.delete(String(id));
    await carregarDebitoDireto();
    return;
  }

  if (btnEditar) {
    const id = btnEditar.dataset.id;
    const item = debitoDiretoItens.find(i => String(i.id) === String(id));
    if (!item) return;
    const novoNome = prompt('Nome do material:', item.descricao);
    if (novoNome === null) return;
    if (!novoNome.trim()) { alert('O nome do material não pode ficar em branco.'); return; }
    const novoLocal = prompt('Localização:', item.localizacao || '');
    if (novoLocal === null) return;

    btnEditar.disabled = true;
    const { error } = await sb.from('itens_debito_direto').update({
      descricao: novoNome.trim(), localizacao: novoLocal.trim().toUpperCase() || null
    }).eq('id', id);
    btnEditar.disabled = false;
    if (error) { alert('NÃO SALVOU: ' + error.message); return; }
    await carregarDebitoDireto();
  }
});

document.getElementById('debitoDiretoBody').addEventListener('change', (e) => {
  const check = e.target.closest('.debito-check');
  if (!check) return;
  if (check.checked) debitoDiretoSelecionados.add(check.dataset.id);
  else debitoDiretoSelecionados.delete(check.dataset.id);
  atualizarBotaoEtiquetasDebitoDireto();
  const todos = document.getElementById('debitoDiretoTodos');
  const filtradas = linhasFiltradasDebitoDireto();
  todos.checked = filtradas.length > 0 && filtradas.every(i => debitoDiretoSelecionados.has(String(i.id)));
});

document.querySelector('#debitoDiretoTabela thead').addEventListener('change', (e) => {
  if (e.target.id !== 'debitoDiretoTodos') return;
  const filtradas = linhasFiltradasDebitoDireto();
  if (e.target.checked) filtradas.forEach(i => debitoDiretoSelecionados.add(String(i.id)));
  else filtradas.forEach(i => debitoDiretoSelecionados.delete(String(i.id)));
  renderDebitoDireto();
});

// ===========================================================================
// Impressão -- "a folha que nem fiz da trading" (mesmo desenho de
// montarHtmlEtiquetasTrading/imprimirEtiquetasTrading, js/estoque.js): uma
// etiqueta por folha, A4 paisagem, texto grande, sem depender de rede.
//
// Diferença de tamanho: na Trading o texto grande é o CÓDIGO do item (curto,
// tipo "AB1234"), então cabe em 32mm. Aqui é o NOME do material, texto
// livre que pode ser uma frase inteira -- por isso corpo menor (18mm) e
// quebra de linha liberada, em vez do item raso e travado da Trading.
// A localização continua a maior de todas (40mm): é o que se procura de
// longe na estante, igual na Trading.
// ===========================================================================

function montarHtmlEtiquetasDebitoDireto(linhas) {
  const impressoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const quem = nomeUsuarioAtual || emailUsuarioAtual || '—';
  const etiquetas = linhas.map(i => `
    <section class="etiqueta">
      <div class="etq-topo">
        <span class="etq-marca">ITEM DÉBITO DIRETO</span>
        <span class="etq-unidade">${escapeHtml(rotuloUnidade(unidadeAtual))}</span>
      </div>
      <div class="etq-item">${escapeHtml(i.descricao)}</div>
      <div class="etq-local">${escapeHtml(i.localizacao || '—')}</div>
      <div class="etq-rodape">Impresso por ${escapeHtml(quem)} — ${escapeHtml(impressoEm)}</div>
    </section>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Itens Débito Direto — ${new Date().toLocaleDateString('pt-BR')}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  /* color-scheme: light explícito -- esta folha abre numa aba separada e
     pode ser vista com o portal no tema escuro; sem isto o navegador
     escurece a folha sozinho (mesma correção da etiqueta da Trading). */
  :root { color-scheme: light; }
  body { font-family: Arial, sans-serif; margin: 0; background: #fff; color: #000; }
  .etiqueta {
    box-sizing: border-box; padding: 5mm 6mm; text-align: center;
    page-break-after: always; break-after: page;
  }
  .etiqueta:last-child { page-break-after: auto; break-after: auto; }
  .etq-topo {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 0.8mm solid #000; padding-bottom: 2mm; margin-bottom: 4mm;
  }
  .etq-marca { font-size: 9mm; font-weight: 900; letter-spacing: 0.05em; }
  .etq-unidade { font-size: 4mm; color: #333; }
  .etq-item { font-size: 18mm; font-weight: 900; line-height: 1.1; overflow-wrap: anywhere; margin: 4mm 0; }
  /* Mesma régua da Trading: nos 265mm úteis da paisagem, corpo de 40mm é o
     limite onde um endereço tipo "B-01-01-01" ainda cabe numa linha só. */
  .etq-local {
    font-size: 40mm; font-weight: 900; line-height: 1.05; letter-spacing: 0.02em;
    margin-top: 4mm; padding: 3mm 0; border-top: 0.8mm solid #000;
    border-bottom: 0.8mm solid #000; overflow-wrap: anywhere;
  }
  .etq-rodape { font-size: 3.5mm; color: #333; margin-top: 3mm; }
</style></head><body>
${etiquetas}
${'<script>window.onload = () => window.print();<' + '/script>'}
</body></html>`;
}

// ⚠️ A aba é aberta ANTES do `await` -- não há QR nesta folha (não há
// código pra codificar), mas a ordem continua importando por causa da
// ativação transitória do clique (mesma regra da Trading e da reserva de
// aço): abrir depois de qualquer espera async arrisca o navegador bloquear
// a aba como pop-up.
async function imprimirEtiquetasDebitoDireto(linhas) {
  if (!linhas.length) return;
  const aba = window.open('', '_blank');
  if (!aba) { alert('O navegador bloqueou a nova aba. Libere pop-ups pra este site e tente de novo.'); return; }
  aba.document.write(montarHtmlEtiquetasDebitoDireto(linhas));
  aba.document.close();
}

document.getElementById('debitoDiretoEtiquetasBtn').addEventListener('click', () => {
  const linhas = debitoDiretoItens.filter(i => debitoDiretoSelecionados.has(String(i.id)));
  if (!linhas.length) return;

  // Mais de 10 folhas pede confirmação -- mesmo limite e mesmo motivo da
  // Trading (LIMITE_FOLHAS_IMPRESSAO, js/estoque.js): quem clicou merece
  // saber que vai sair uma resma antes de a impressora começar a cuspir.
  if (linhas.length > LIMITE_FOLHAS_IMPRESSAO && !debitoDiretoConfirmarImpressao) {
    debitoDiretoConfirmarImpressao = true;
    const botao = document.getElementById('debitoDiretoEtiquetasBtn');
    botao.textContent = `Imprimir ${linhas.length} folhas mesmo assim?`;
    return;
  }
  debitoDiretoConfirmarImpressao = false;
  imprimirEtiquetasDebitoDireto(linhas);
});
