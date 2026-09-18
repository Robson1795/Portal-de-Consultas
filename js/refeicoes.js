// Portal de Estoque Kingspan Isoeste — Refeições de fim de semana (18/09/2026)
//
// O Robson: *"Estou montando um sistema de controle de refeições de final de
// semana na minha empresa"* -- três partes, na ordem em que ele descreveu:
// o líder informa o setor dele, o gerente vê o consolidado, e sai um texto
// pronto pra mandar pro refeitório. Pedido primeiro como página avulsa,
// depois: *"faça uma aba com essa ideia"*.
//
// UMA TELA SÓ, NÃO TRÊS
//
// As três partes são o MESMO fim de semana visto de três distâncias (um
// setor, todos os setores, o texto de envio). Separar em abas obrigaria a
// pessoa a lembrar em qual delas escolheu a data -- e o erro mais caro aqui
// é mandar pro refeitório o número da semana passada.

const REFEICOES_SETORES = ['Produção', 'Logística', 'Manutenção', 'Qualidade', 'Administrativo'];

// Robson, 18/09/2026: "dai eu vou selecionar as pessoas que vao ter acesso" /
// "por enquanto só eu e o Victor e o Ivair". Mesma trava da Análise de
// Compras (fase21): perfil decide o resto do menu, esta lista decide SÓ esta
// aba. O RPC existe porque a lista é só de admin -- sem ele, quem está
// liberado e não é admin não conseguiria ler nem a própria permissão.
let podeVerRefeicoesCache = false;

async function atualizarPermissaoRefeicoes() {
  const { data, error } = await sb.rpc('pode_ver_refeicoes');
  if (!error) { podeVerRefeicoesCache = data === true; return; }

  // A FUNÇÃO PODE NEM EXISTIR AINDA (antes de rodar a fase67) -- e foi
  // exatamente o que aconteceu no dia em que a aba subiu: Robson, 18/09/2026,
  // com print do menu sem ela, "nao atualizou ainda". A aba sumia calada, sem
  // dizer que faltava rodar a SQL, e justamente pra quem ia rodar.
  //
  // Erro fecha a aba pra todo mundo, MENOS admin. Não é abrir exceção de
  // permissão: admin passa em `eh_admin()` dentro da própria função -- se ela
  // existisse, ele veria a aba de qualquer jeito. O que isto evita é o modo de
  // falha silencioso, porque quem entra por aqui cai na tela e lê "rode
  // sql/faseNN" em vez de ficar procurando um menu que não aparece.
  podeVerRefeicoesCache = !!isAdminAtual;
  console.warn('Refeições: pode_ver_refeicoes() indisponível (sql/fase67-refeicoes-acesso.sql):', error.message);
}

let refeicoesLinhas = [];   // linhas do fim de semana escolhido, desta unidade

// Próximo sábado (hoje, se hoje for sábado). É o palpite certo em quase toda
// vez que a tela abre -- o levantamento é feito na semana do fim de semana
// que vem, não meses antes.
function proximoSabado(base) {
  const d = base ? new Date(base) : new Date();
  d.setHours(12, 0, 0, 0); // meio-dia evita o pulo de fuso na virada do dia
  const diasAteSabado = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diasAteSabado);
  return d.toISOString().slice(0, 10);
}

function domingoDe(sabadoIso) {
  const d = new Date(sabadoIso + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dataCurtaRefeicoes(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function sabadoEscolhido() {
  return document.getElementById('refeicoesSabado').value || proximoSabado();
}

// ---- Banco ------------------------------------------------------------------
async function carregarRefeicoes() {
  const msg = document.getElementById('refeicoesMsg');
  const sabado = sabadoEscolhido();
  document.getElementById('refeicoesDomingoRotulo').textContent = dataCurtaRefeicoes(domingoDe(sabado));

  const { data, error } = await sb.from('refeicoes_fds')
    .select('*').eq('unidade', unidadeAtual).eq('sabado', sabado)
    .order('setor', { ascending: true });

  if (error) {
    refeicoesLinhas = [];
    msg.textContent = 'Não foi possível carregar: ' + error.message
      + ' — se falar em tabela inexistente, sql/fase66-refeicoes-fds.sql ainda não foi rodado no Supabase.';
    msg.className = 'status-msg status-err';
  } else {
    refeicoesLinhas = data || [];
    msg.textContent = '';
    msg.className = 'status-msg';
  }
  renderConsolidadoRefeicoes();
  preencherFormComSetorAtual();
}

// O formulário do líder mostra o que JÁ foi informado pro setor escolhido, em
// vez de campo em branco: corrigir "30 pra 28" tem que ser trocar um número,
// não redigitar tudo e torcer pra não duplicar.
function preencherFormComSetorAtual() {
  const setor = document.getElementById('refeicoesSetor').value;
  const linha = refeicoesLinhas.find(l => l.setor === setor);
  document.getElementById('refeicoesQtdSabado').value  = linha ? linha.qtd_sabado : '';
  document.getElementById('refeicoesQtdDomingo').value = linha ? linha.qtd_domingo : '';
  document.getElementById('refeicoesObs').value        = linha && linha.observacoes ? linha.observacoes : '';

  const info = document.getElementById('refeicoesFormInfo');
  info.textContent = linha
    ? `Já informado por ${linha.preenchido_por || '—'} · ${new Date(linha.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} — salvar substitui.`
    : 'Ainda não informado para este fim de semana.';
}

async function salvarRefeicao() {
  const msg = document.getElementById('refeicoesMsg');
  const setor = document.getElementById('refeicoesSetor').value;
  const sab = document.getElementById('refeicoesQtdSabado').value.trim();
  const dom = document.getElementById('refeicoesQtdDomingo').value.trim();

  // Os dois em branco não é "zero refeições", é formulário não preenchido --
  // gravar isso encheria o consolidado de linha vazia.
  if (sab === '' && dom === '') {
    msg.textContent = 'Informe ao menos uma das quantidades (sábado ou domingo).';
    msg.className = 'status-msg status-err';
    return;
  }

  const btn = document.getElementById('refeicoesSalvarBtn');
  btn.disabled = true;
  const { error } = await sb.from('refeicoes_fds').upsert({
    unidade: unidadeAtual,
    sabado: sabadoEscolhido(),
    setor,
    qtd_sabado: Math.max(0, parseInt(sab || '0', 10) || 0),
    qtd_domingo: Math.max(0, parseInt(dom || '0', 10) || 0),
    observacoes: document.getElementById('refeicoesObs').value.trim() || null,
    preenchido_por: nomeUsuarioAtual,
    atualizado_em: new Date().toISOString()
  }, { onConflict: 'unidade,sabado,setor' });
  btn.disabled = false;

  if (error) {
    msg.textContent = 'Não foi possível salvar: ' + error.message;
    msg.className = 'status-msg status-err';
    return;
  }
  msg.textContent = `${setor} salvo para o fim de semana de ${dataCurtaRefeicoes(sabadoEscolhido())}.`;
  msg.className = 'status-msg status-ok';
  await carregarRefeicoes();
}

async function limparSetorRefeicoes() {
  const setor = document.getElementById('refeicoesSetor').value;
  const linha = refeicoesLinhas.find(l => l.setor === setor);
  if (!linha) return;
  if (!confirm(`Apagar o lançamento de ${setor} neste fim de semana?`)) return;
  const { error } = await sb.from('refeicoes_fds').delete().eq('id', linha.id);
  if (error) { alert('Não foi possível apagar: ' + error.message); return; }
  await carregarRefeicoes();
}

// ---- Consolidado (painel do gerente) ----------------------------------------
function totaisRefeicoes() {
  return refeicoesLinhas.reduce((acc, l) => {
    acc.sabado  += Number(l.qtd_sabado || 0);
    acc.domingo += Number(l.qtd_domingo || 0);
    return acc;
  }, { sabado: 0, domingo: 0 });
}

function renderConsolidadoRefeicoes() {
  const corpo = document.getElementById('refeicoesBody');
  const vazio = document.getElementById('refeicoesVazio');
  const total = totaisRefeicoes();

  // Todos os setores sempre na tabela, mesmo os que ainda não responderam:
  // a informação que o gerente precisa antes de enviar é justamente QUEM
  // ainda não respondeu -- uma tabela só com quem preencheu esconde isso.
  const linhas = REFEICOES_SETORES.map(setor => {
    const l = refeicoesLinhas.find(r => r.setor === setor);
    if (!l) {
      return `<tr class="refeicoes-pendente">
        <td>${escapeHtml(setor)}</td>
        <td class="num">—</td><td class="num">—</td><td class="num">—</td>
        <td></td>
        <td><span class="cfg-status st-pendente">Aguardando</span></td>
      </tr>`;
    }
    const soma = Number(l.qtd_sabado || 0) + Number(l.qtd_domingo || 0);
    return `<tr>
      <td><b>${escapeHtml(setor)}</b></td>
      <td class="num">${l.qtd_sabado}</td>
      <td class="num">${l.qtd_domingo}</td>
      <td class="num">${soma}</td>
      <td>${l.observacoes ? escapeHtml(l.observacoes) : '—'}</td>
      <td><span class="cfg-status st-ativo">${escapeHtml(l.preenchido_por || 'Informado')}</span></td>
    </tr>`;
  }).join('');

  corpo.innerHTML = linhas + `
    <tr class="refeicoes-total">
      <td><b>TOTAL GERAL</b></td>
      <td class="num"><b>${total.sabado}</b></td>
      <td class="num"><b>${total.domingo}</b></td>
      <td class="num"><b>${total.sabado + total.domingo}</b></td>
      <td colspan="2">${refeicoesLinhas.length} de ${REFEICOES_SETORES.length} setor(es) informado(s)</td>
    </tr>`;

  vazio.style.display = refeicoesLinhas.length ? 'none' : 'block';
  document.getElementById('refeicoesResumoTopo').textContent =
    `Sábado ${total.sabado} · Domingo ${total.domingo} · Total ${total.sabado + total.domingo}`;
}

// ---- Relatório pro refeitório -----------------------------------------------
//
// Texto pra colar no WhatsApp/e-mail do refeitório, não um PDF: é assim que
// esse recado anda hoje. Por isso o botão principal é COPIAR.
//
// Setor sem lançamento fica FORA do texto (o refeitório não cozinha
// "aguardando"), mas o rodapé diz quantos responderam -- quem recebe precisa
// saber se o número está fechado ou ainda pode subir.
function montarTextoRefeicoes() {
  const sabado = sabadoEscolhido();
  const total = totaisRefeicoes();
  const comSabado  = refeicoesLinhas.filter(l => Number(l.qtd_sabado) > 0);
  const comDomingo = refeicoesLinhas.filter(l => Number(l.qtd_domingo) > 0);
  const comObs     = refeicoesLinhas.filter(l => (l.observacoes || '').trim());

  const linhasSab = comSabado.map(l => `  • ${l.setor}: ${l.qtd_sabado}`).join('\n') || '  • Nenhum setor informado';
  const linhasDom = comDomingo.map(l => `  • ${l.setor}: ${l.qtd_domingo}`).join('\n') || '  • Nenhum setor informado';
  const obs = comObs.length
    ? `\n\nObservações dietéticas:\n${comObs.map(l => `  • ${l.setor}: ${l.observacoes.trim()}`).join('\n')}`
    : '';

  return `Prezada equipe do refeitório,

Segue o alinhamento de refeições para o fim de semana de ${dataCurtaRefeicoes(sabado)} e ${dataCurtaRefeicoes(domingoDe(sabado))}:

SÁBADO (${dataCurtaRefeicoes(sabado)}) — ${total.sabado} refeição(ões)
${linhasSab}

DOMINGO (${dataCurtaRefeicoes(domingoDe(sabado))}) — ${total.domingo} refeição(ões)
${linhasDom}

TOTAL DO FIM DE SEMANA: ${total.sabado + total.domingo} refeição(ões)${obs}

Levantamento com ${refeicoesLinhas.length} de ${REFEICOES_SETORES.length} setores respondidos.
Enviado por ${nomeUsuarioAtual || '—'} — ${rotuloUnidade(unidadeAtual)}, em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`;
}

function gerarRelatorioRefeicoes() {
  document.getElementById('refeicoesRelatorioTexto').value = montarTextoRefeicoes();
  document.getElementById('refeicoesRelatorioBox').style.display = 'block';
  document.getElementById('refeicoesRelatorioMsg').textContent = '';
}

async function copiarRelatorioRefeicoes() {
  const texto = document.getElementById('refeicoesRelatorioTexto').value;
  const msg = document.getElementById('refeicoesRelatorioMsg');
  try {
    await navigator.clipboard.writeText(texto);
    msg.textContent = 'Copiado — é só colar no WhatsApp ou no e-mail do refeitório.';
    msg.className = 'status-msg status-ok';
  } catch (e) {
    // Alguns navegadores só liberam a área de transferência em HTTPS ou com
    // gesto direto. Selecionar o texto deixa o Ctrl+C a um atalho de
    // distância em vez de virar beco sem saída.
    document.getElementById('refeicoesRelatorioTexto').select();
    msg.textContent = 'O navegador bloqueou a cópia automática — o texto já está selecionado, use Ctrl+C.';
    msg.className = 'status-msg status-err';
  }
}

// ---- Quem ainda não respondeu (usado pelo aviso e pelo Painel do Dia) -------
//
// Robson, 18/09/2026: *"quero tambem que envie alertas em todas as sextas
// feira até o meio dia tem que ter a relaçao"* -- o prazo é sexta ao
// meio-dia, então o que interessa saber é SEMPRE "quais setores ainda
// faltam pro fim de semana que vem", não "quantos já responderam".
const REFEICOES_PRAZO_HORA = 12;

async function setoresFaltandoRefeicoes() {
  const sabado = proximoSabado();
  if (!unidadeAtual) return { faltando: [], sabado };
  const { data, error } = await sb.from('refeicoes_fds')
    .select('setor').eq('unidade', unidadeAtual).eq('sabado', sabado);
  if (error) {
    // Silencioso: é aviso de cortesia e a tabela é nova (fase66). Se ainda
    // não rodou no banco, isto não pode virar erro no meio do trabalho.
    console.warn('Refeições: não foi possível conferir quem falta:', error.message);
    return { faltando: [], sabado, erro: error.message };
  }
  const informados = new Set((data || []).map(l => l.setor));
  return { faltando: REFEICOES_SETORES.filter(s => !informados.has(s)), sabado };
}

// ---- Quem tem acesso (Configurações) ----------------------------------------
//
// A lista é só de admin (RLS da fase67), então esta tela inteira só funciona
// pra admin -- o resto do portal já trata a aba Configurações assim.
async function carregarAcessoRefeicoes() {
  const corpo = document.getElementById('refeicoesAcessoCorpo');
  const msg = document.getElementById('refeicoesAcessoMsg');
  if (!corpo) return;

  const { data, error } = await sb.from('refeicoes_acesso')
    .select('id, email, adicionado_por, adicionado_em').order('email', { ascending: true });

  if (error) {
    corpo.innerHTML = '';
    msg.textContent = 'Não foi possível ler a lista: ' + error.message
      + ' — se falar em tabela inexistente, sql/fase67-refeicoes-acesso.sql ainda não foi rodado.';
    msg.className = 'status-msg status-err';
    return;
  }
  msg.textContent = '';
  msg.className = 'status-msg';
  corpo.innerHTML = (data || []).map(l => `
    <tr>
      <td>${escapeHtml(l.email)}</td>
      <td>${escapeHtml(l.adicionado_por || '—')}</td>
      <td>${new Date(l.adicionado_em).toLocaleDateString('pt-BR')}</td>
      <td class="col-acoes"><button class="acao-btn refeicoes-acesso-remover" data-id="${escapeHtml(l.id)}"
              data-email="${escapeHtml(l.email)}" title="Tirar o acesso desta pessoa">🗑</button></td>
    </tr>`).join('')
    || '<tr><td colspan="4" style="color:var(--muted);">Ninguém liberado ainda — só admin está vendo a aba.</td></tr>';
}

async function adicionarAcessoRefeicoes() {
  const campo = document.getElementById('refeicoesAcessoEmail');
  const msg = document.getElementById('refeicoesAcessoMsg');
  const email = campo.value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    msg.textContent = 'Digite o e-mail de login da pessoa.';
    msg.className = 'status-msg status-err';
    return;
  }
  const { error } = await sb.from('refeicoes_acesso')
    .insert({ email, adicionado_por: nomeUsuarioAtual });
  if (error) {
    // Chave única: já estava liberado. Não é erro pra quem está usando.
    msg.textContent = /duplicate|unique/i.test(error.message)
      ? 'Esse e-mail já tinha acesso.'
      : 'Não foi possível liberar: ' + error.message;
    msg.className = 'status-msg ' + (/duplicate|unique/i.test(error.message) ? 'status-ok' : 'status-err');
    return;
  }
  campo.value = '';
  msg.textContent = `${email} liberado. A aba aparece pra ele no próximo login (ou F5).`;
  msg.className = 'status-msg status-ok';
  carregarAcessoRefeicoes();
}

// ---- Eventos ----------------------------------------------------------------
document.getElementById('refeicoesAcessoAddBtn').addEventListener('click', adicionarAcessoRefeicoes);
document.getElementById('refeicoesAcessoEmail').addEventListener('keydown', e => {
  if (e.key === 'Enter') adicionarAcessoRefeicoes();
});
document.getElementById('refeicoesAcessoCorpo').addEventListener('click', async (e) => {
  const btn = e.target.closest('.refeicoes-acesso-remover');
  if (!btn) return;
  if (!confirm(`Tirar o acesso de ${btn.dataset.email} à aba Refeições FDS?`)) return;
  const { error } = await sb.from('refeicoes_acesso').delete().eq('id', btn.dataset.id);
  if (error) { alert('Não foi possível remover: ' + error.message); return; }
  carregarAcessoRefeicoes();
});

document.getElementById('refeicoesSabado').addEventListener('change', carregarRefeicoes);
document.getElementById('refeicoesSetor').addEventListener('change', preencherFormComSetorAtual);
document.getElementById('refeicoesSalvarBtn').addEventListener('click', salvarRefeicao);
document.getElementById('refeicoesLimparBtn').addEventListener('click', limparSetorRefeicoes);
document.getElementById('refeicoesGerarBtn').addEventListener('click', gerarRelatorioRefeicoes);
document.getElementById('refeicoesCopiarBtn').addEventListener('click', copiarRelatorioRefeicoes);

// Enter nos campos numéricos salva -- o formulário tem 3 campos, tirar a mão
// do teclado pra clicar em Salvar é o passo mais lento do preenchimento.
['refeicoesQtdSabado', 'refeicoesQtdDomingo'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') salvarRefeicao();
  });
});

document.getElementById('refeicoesSetor').innerHTML =
  REFEICOES_SETORES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
document.getElementById('refeicoesSabado').value = proximoSabado();
