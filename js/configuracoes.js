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
    .select('unidade, emails_alm, senha_contagem, pin_edicao').order('unidade');

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
    const faltaSenha = !u.senha_contagem;
    return `
    <tr data-unidade="${escapeHtml(u.unidade)}">
      <td>
        <div class="cfg-nome">${escapeHtml(rotuloUnidade(u.unidade))}</div>
        ${faltaSenha ? '<div class="cfg-email" style="color:#92400e;">sem senha — contagem bloqueada</div>' : ''}
        ${faltaEmail ? '<div class="cfg-email" style="color:#92400e;">sem e-mail — envio desabilitado</div>' : ''}
      </td>
      <td><input type="text" class="cfgu-emails" placeholder="alm@kingspanisoeste.com.br; outro@..."
                 value="${escapeHtml(u.emails_alm || '')}" style="max-width:320px;"></td>
      <td><input type="text" class="cfgu-senha" placeholder="ex: INV${escapeHtml(u.unidade)}"
                 value="${escapeHtml(u.senha_contagem || '')}" style="max-width:130px;"></td>
      <td><input type="text" class="cfgu-pin" placeholder="ex: 2026"
                 value="${escapeHtml(u.pin_edicao || '')}" style="max-width:110px;"></td>
      <td class="cfg-acoes"><button class="btn cfgu-salvar">Salvar</button></td>
    </tr>`;
  }).join('');
}

document.getElementById('cfgUniCorpo').addEventListener('click', async (e) => {
  if (!e.target.closest('.cfgu-salvar')) return;
  const tr = e.target.closest('tr');
  const unidade = tr.dataset.unidade;
  const aviso = document.getElementById('cfgUniMsg');

  const emails = tr.querySelector('.cfgu-emails').value.trim();
  const senha  = tr.querySelector('.cfgu-senha').value.trim();
  const pin    = tr.querySelector('.cfgu-pin').value.trim();

  tr.querySelectorAll('button').forEach(b => b.disabled = true);
  aviso.textContent = 'Salvando...';
  aviso.className = 'status-msg';

  const { error } = await sb.from('config_unidade').update({
    emails_alm: emails || null,
    senha_contagem: senha || null,
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
