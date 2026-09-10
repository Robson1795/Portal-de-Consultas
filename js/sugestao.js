// Portal de Estoque Kingspan Isoeste — sugestões de melhoria
//
// O Robson (10/09/2026): *"quero que crie um botão para que os consultores
// coloquem sugestões de melhorias, aí essa sugestão é enviada para o meu
// usuário e o do Victor"*.
//
// ⚠️ "Para o meu USUÁRIO", e não "para o meu e-mail" -- é o que decidiu o
// desenho. As outras telas que "mandam" alguma coisa (Requisição ALM,
// Solicitação de compra) usam `mailto`, que depende de a pessoa clicar em
// enviar no Outlook: some sem avisar se ela fechar a janela. Ali o custo
// disso é baixo (tem alguém esperando o material e vai cobrar); aqui é o
// contrário -- ninguém está esperando uma sugestão, então uma que se perde
// nunca é cobrada por ninguém. Gravada na tabela, ela chega inteira aos dois
// e continua lá depois de lida.
//
// Quem lê é `eh_super_admin()` no RLS (sql/fase32-sugestoes-melhoria.sql):
// já era exatamente o Robson (nos dois logins) e o Victor, sem precisar de
// lista nova pra manter em sincronia.

const sugestaoModal = document.getElementById('sugestaoModal');

function abrirSugestaoModal() {
  document.getElementById('sugestaoTexto').value = '';
  const msg = document.getElementById('sugestaoMsg');
  msg.textContent = '';
  msg.className = 'status-msg';
  document.getElementById('sugestaoEnviarBtn').disabled = false;
  sugestaoModal.classList.add('open');
  document.getElementById('sugestaoTexto').focus();
}

function fecharSugestaoModal() {
  sugestaoModal.classList.remove('open');
}

document.getElementById('sugestaoBtn').addEventListener('click', abrirSugestaoModal);
document.getElementById('sugestaoCloseBtn').addEventListener('click', fecharSugestaoModal);
sugestaoModal.addEventListener('click', (e) => {
  if (e.target === sugestaoModal) fecharSugestaoModal();
});

document.getElementById('sugestaoEnviarBtn').addEventListener('click', async () => {
  const campo = document.getElementById('sugestaoTexto');
  const msg = document.getElementById('sugestaoMsg');
  const botao = document.getElementById('sugestaoEnviarBtn');
  const mensagem = campo.value.trim();

  if (!mensagem) {
    msg.textContent = 'Escreva a sugestão antes de enviar.';
    msg.className = 'status-msg status-err';
    campo.focus();
    return;
  }

  botao.disabled = true;
  msg.textContent = 'Enviando...';
  msg.className = 'status-msg';

  // Quem mandou vai junto: sugestão anônima vira caixa de reclamação sem
  // resposta possível -- sem saber quem é, não dá nem pra perguntar "como
  // assim?" nem pra avisar que foi feito.
  const { error } = await sb.from('sugestoes_melhoria').insert([{
    mensagem,
    nome_usuario: nomeUsuarioAtual || null,
    email_usuario: emailUsuarioAtual || null,
    unidade: unidadeAtual || null,
    perfil: perfilAtual || null
  }]);

  botao.disabled = false;

  if (error) {
    msg.textContent = 'Não foi possível enviar: ' + error.message
      + ' — se falar em tabela inexistente, sql/fase32-sugestoes-melhoria.sql ainda não foi rodado no Supabase.';
    msg.className = 'status-msg status-err';
    console.error('Falha ao enviar sugestão:', error.message);
    return;
  }

  msg.textContent = 'Enviado! O Robson e o Victor recebem no portal deles. Obrigado.';
  msg.className = 'status-msg status-ok';
  campo.value = '';
  setTimeout(() => { if (sugestaoModal.classList.contains('open')) fecharSugestaoModal(); }, 1800);
});


// ---- Do outro lado: a lista, só pro Robson e pro Victor --------------------
//
// A seção inteira some para quem não é super admin. Isso é cortesia: quem
// manda no acesso é o RLS -- para os outros, o `select` volta vazio de
// qualquer forma.
let sugestoesCarregadas = [];

function ehSuperAdminNaTela() {
  return typeof SUPER_ADMINS !== 'undefined'
    && SUPER_ADMINS.includes(emailUsuarioAtual);
}

async function carregarSugestoes() {
  const titulo = document.getElementById('sugestoesSecaoTitulo');
  const secao = document.getElementById('sugestoesSecao');
  const mostrar = ehSuperAdminNaTela();
  titulo.style.display = mostrar ? '' : 'none';
  secao.style.display = mostrar ? '' : 'none';
  if (!mostrar) return;

  const { data, error } = await sb.from('sugestoes_melhoria')
    .select('*').order('criado_em', { ascending: false });

  if (error) {
    document.getElementById('sugestoesLista').innerHTML = '';
    document.getElementById('sugestoesVazio').style.display = 'block';
    document.getElementById('sugestoesVazio').textContent =
      'Não foi possível carregar: ' + error.message
      + ' — se falar em tabela inexistente, sql/fase32-sugestoes-melhoria.sql ainda não foi rodado.';
    console.error('Falha ao carregar sugestões:', error.message);
    return;
  }

  sugestoesCarregadas = data || [];
  renderSugestoes();
}

function renderSugestoes() {
  const lista = document.getElementById('sugestoesLista');
  const vazio = document.getElementById('sugestoesVazio');
  const naoLidas = sugestoesCarregadas.filter(s => !s.lida_em).length;

  document.getElementById('sugestoesResumo').textContent = sugestoesCarregadas.length
    ? `${sugestoesCarregadas.length} sugestão(ões) · ${naoLidas} não lida(s)`
    : '';

  vazio.style.display = sugestoesCarregadas.length ? 'none' : 'block';
  if (!sugestoesCarregadas.length) { lista.innerHTML = ''; return; }

  lista.innerHTML = sugestoesCarregadas.map(s => {
    const quando = s.criado_em
      ? new Date(s.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : '—';
    const lida = !!s.lida_em;
    return `
    <div style="border:1px solid var(--border); border-left:4px solid ${lida ? 'var(--border)' : 'var(--blue)'};
                border-radius:8px; padding:10px 12px; margin-top:10px; ${lida ? 'opacity:0.65;' : ''}">
      <div style="white-space:pre-wrap; font-size:14px; color:var(--ink);">${escapeHtml(s.mensagem)}</div>
      <div style="display:flex; flex-wrap:wrap; gap:4px 12px; margin-top:8px; font-size:11.5px; color:var(--muted);">
        <span><b>${escapeHtml(s.nome_usuario || '—')}</b></span>
        <span>${escapeHtml(s.email_usuario || '')}</span>
        <span>${escapeHtml(s.unidade ? rotuloUnidade(s.unidade) : '—')}</span>
        <span>${escapeHtml(s.perfil || '—')}</span>
        <span>${escapeHtml(quando)}</span>
        ${lida ? `<span>✓ lida por ${escapeHtml(s.lida_por || '—')}</span>` : ''}
      </div>
      ${lida ? '' : `<div style="margin-top:8px;">
        <button class="btn sugestao-marcar-lida" data-id="${escapeHtml(s.id)}">Marcar como lida</button>
      </div>`}
    </div>`;
  }).join('');
}

document.getElementById('sugestoesLista').addEventListener('click', async (e) => {
  const btn = e.target.closest('.sugestao-marcar-lida');
  if (!btn) return;
  btn.disabled = true;

  // `.select('id')` como recibo: sem ele, um update barrado pelo RLS volta
  // com error null e zero linha, e a tela diria "lida" com o F5 desmentindo.
  const { data, error } = await sb.from('sugestoes_melhoria')
    .update({ lida_em: new Date().toISOString(), lida_por: nomeUsuarioAtual || emailUsuarioAtual })
    .eq('id', btn.dataset.id).select('id');

  if (error || !data || !data.length) {
    btn.disabled = false;
    alert('Não foi possível marcar como lida' + (error ? ': ' + error.message : '.'));
    return;
  }
  await carregarSugestoes();
});

document.getElementById('sugestoesRecarregarBtn').addEventListener('click', carregarSugestoes);
