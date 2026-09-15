// Portal de Estoque Kingspan Isoeste — Análise MFG (15/09/2026)
//
// O Victor: *"preciso que vc faça uma analise pesada nesse arquivo do MFG e
// desenvolva uma tela MFG. Quero basicamente poder jogar as OPs, talvez subindo
// um arquivo de Excel e o sistema fazer uma analise bem semelhante ao MFG da
// empresa só que melhor. Preciso TAMBÉM que ele mostre quais OPs estao com
// divergencias, tanto pra mais quanto pra menos no consumo. Se puder também
// detalhar quanto a unidade ta perdendo ou ganhando, valores, etc."*
//
// ============================================================================
// ⚠️ O MODELO NÃO FOI DEDUZIDO, FOI EXTRAÍDO — E DEPOIS CONFERIDO
// ============================================================================
//
// As fórmulas literais foram lidas de dentro do .xlsx (o arquivo é um zip, e
// `xl/worksheets/sheetN.xml` traz cada fórmula em texto). Depois o cálculo foi
// reimplementado do zero a partir das abas de origem e comparado com os números
// que a própria planilha já tinha calculado: **958 de 958 OPs batem, nas dez
// métricas** (consumo teórico, report, aço/filme/alumínio teórico e real, e as
// cinco de R$). Não é "parecido com o MFG": é o MFG.
//
// Dois detalhes que teriam saído errados se eu tivesse deduzido em vez de ler:
//   1. A LARGURA ÚTIL depende da MÁQUINA (PM ou RB), não da classe sozinha —
//      e a máquina vem da unidade (101/103/104 = PM, 105/106 = RB).
//   2. O TRAPÉZIO (+5 mm na espessura) só entra quando a classe começa com
//      "ISOT". Painel não tem trapézio.
//
// ⚠️ E um terceiro, que é o mais fácil de errar de todos: o REPORT TOTAL do
// químico soma POLIOL + MDI + CATALIZADOR + PENTANO e **deixa o ADESIVO de
// fora**. O adesivo é consumido e aparece no Consumo, mas não entra no total
// que vira densidade realizada — ele cola faces, não forma espuma. Somá-lo
// faria toda OP parecer que consumiu a mais. A tela mostra o adesivo à parte,
// justamente para ninguém achar que ele sumiu.
//
// ============================================================================
// A CONTA, POR OP
// ============================================================================
//
//   m²             = soma de Acabado.Quantidade daquela OP
//   espessura (m)  = Base de Dados."Espessura ACA" ÷ 1000
//   trapézio (m)   = 0,005 se a classe começa com ISOT, senão 0
//   largura (m)    = Densidades.(PM|RB) da classe, conforme a máquina da unidade
//   CONSUMO TEÓRICO (kg) = m² × (espessura + trapézio) × densidade × 1,01
//   REPORTADO (kg)       = POLIOL + MDI + CATALIZADOR + PENTANO do Consumo
//   DIFERENÇA            = teórico − reportado   (negativo = consumiu a MAIS = perda)
//   DENSIDADE REALIZADA  = reportado ÷ (m² × (espessura + trapézio))   [sem o 1,01]
//
//   AÇO/FILME/ALUMÍNIO TEÓRICO = índice da Base de Dados × m² × 1,01
//   AÇO/FILME/ALUMÍNIO REAL    = Consumo daquela família, daquela OP
//
//   R$ = diferença × preço unitário da família NAQUELA UNIDADE
//
// ⚠️ O preço é por família **e por unidade**, não um preço global: o mesmo aço
// custa diferente em Anápolis e em Araquari, e usar a média da empresa jogaria
// o erro de preço dentro do resultado de produção. Para aço/filme/alumínio o
// preço é ponderado (Σ valor ÷ Σ quantidade); para o químico, o MFG usa a média
// simples dos unitários (AVERAGEIFS). São contas diferentes, e eu mantive cada
// uma como está — mudar faria os números divergirem do MFG da empresa, que é
// justamente contra o que esta tela vai ser conferida.
//
// ============================================================================
// O QUE ESTA TELA FAZ QUE O MFG DA EMPRESA NÃO FAZ
// ============================================================================
//
//  1. ⚠️ **OP com consumo e sem apontamento de produção.** A planilha da
//     empresa analisa as OPs que aparecem no Acabado. No arquivo real de
//     setembro havia 974 OPs no Consumo e 959 no Acabado: **16 OPs baixaram
//     matéria-prima e nunca apontaram produção** — material que saiu do estoque
//     e não virou m² nenhum. No MFG elas simplesmente não existem.
//  2. **Soma o dinheiro por unidade.** O MFG dá a variação OP a OP; a pergunta
//     "quanto esta fábrica ganhou ou perdeu na semana" ninguém respondia sem
//     montar uma tabela dinâmica por fora.
//  3. **Diz a direção em letras** — "consumiu a mais" / "consumiu a menos" —
//     em vez de deixar a pessoa deduzir pelo sinal.
//  4. **Faixa de tolerância ajustável**: abaixo dela a OP não é divergência, é
//     ruído de balança. Fixar isso em zero faria 100% das OPs "divergirem".
//  5. **Separa o que não dá para calcular do que está errado.** Item fora da
//     Base de Dados, classe sem largura ou densidade zerada dão teórico 0 — e
//     no MFG isso vira uma "perda" gigante e falsa. Aqui vira "Sem cadastro",
//     fora da conta de perda/ganho, com o motivo escrito.

// ---- Régua ------------------------------------------------------------------
// Fora deste percentual a OP é divergência. 2% é onde a balança e o
// arredondamento do apontamento já não explicam a diferença. Fica no topo
// porque é o que se mexe quando a régua estiver errada.
const MFG_TOLERANCIA_PADRAO = 2;

// Os quatro que formam a espuma. Ver a nota do ADESIVO lá em cima.
const MFG_GRUPOS_ESPUMA = ['POLIOL', 'MDI', 'CATALIZADOR', 'PENTANO'];

// Os nomes de família vêm escritos assim no Consumo, com o código na frente.
const MFG_FAMILIA_ACO = '3001 - MATERIA-PRIMA AÇO';
const MFG_FAMILIA_FILME = '2997 - FILMES - ALUMINIO/ PVC';
const MFG_FAMILIA_ALUMINIO = '2998 - MATERIA-PRIMA BOBINA ALUMINIO';
const MFG_FAMILIA_QUIMICO = '2999 - MATERIA PRIMA QUIMICO PIR/EPS';

const MFG_TETO_LINHAS = 300;

let mfgLinhas = [];          // uma por OP analisada
let mfgSemApontamento = [];  // OPs que consumiram e não apontaram produção
let mfgArquivo = '';
let mfgFiltros = { est: '', classe: '', situacao: '', busca: '', tolerancia: MFG_TOLERANCIA_PADRAO };
let mfgVendoSemApontamento = false;

// ---- Ajudantes de número e texto -------------------------------------------
function mfgNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function mfgFmt(n, casas) {
  return (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas == null ? 2 : casas,
    maximumFractionDigits: casas == null ? 2 : casas
  });
}

function mfgRS(n) {
  return 'R$ ' + mfgFmt(n, 2);
}

// Cabeçalho comparável: sem acento, sem caixa, sem espaço sobrando. A planilha
// do Datasul troca acentuação entre exportações, e "Família" / "Familia" não
// podem ser duas colunas diferentes.
function mfgChaveCabecalho(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Data: o SheetJS devolve número de série quando a célula é data de verdade, e
// texto quando veio como texto. Os dois precisam virar DD/MM/AAAA -- e nunca
// por `new Date()` em cima da string brasileira, que o navegador lê como
// mês/dia (mesma regra de parseDataHoraBR no Controle EXP).
function mfgData(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const base = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
    const d = new Date(base);
    return String(d.getUTCDate()).padStart(2, '0') + '/'
         + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  }
  const m = String(v).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return String(v);
  return m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/'
       + (m[3].length === 2 ? '20' + m[3] : m[3]);
}

// Data em AAAA-MM-DD, para ordenar e para gravar no banco.
function mfgDataISO(br) {
  const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
}

// ---- Leitura do arquivo -----------------------------------------------------
//
// ⚠️ TUDO POR NOME DE COLUNA, nunca por letra. O MFG referencia coluna fixa
// ("Consumo!$N:$N"), e por isso uma coluna a mais no export do Datasul quebra a
// planilha inteira em silêncio -- a conta continua saindo, só que de outra
// coluna. Aqui a coluna é achada pelo nome do cabeçalho, então a ordem pode
// mudar à vontade.

// Onde está o cabeçalho de verdade. Não é sempre a primeira linha: em
// "Base de Dados" e "Densidades" a linha 1 é um título e o cabeçalho é a 2.
// Em vez de fixar o número, procuro nas primeiras linhas a que mais reconhece.
function mfgAcharCabecalho(matriz, esperados) {
  let melhor = { linha: -1, acertos: 0 };
  for (let i = 0; i < Math.min(8, matriz.length); i++) {
    const chaves = (matriz[i] || []).map(mfgChaveCabecalho);
    const acertos = esperados.filter(e => chaves.includes(e)).length;
    if (acertos > melhor.acertos) melhor = { linha: i, acertos };
  }
  return melhor;
}

// Devolve { chave: índice da coluna }. Cada chave lista sinônimos aceitos.
function mfgMapearColunas(cabecalho, definicao) {
  const chaves = (cabecalho || []).map(mfgChaveCabecalho);
  const mapa = {};
  Object.keys(definicao).forEach(campo => {
    for (const nome of definicao[campo]) {
      const i = chaves.indexOf(mfgChaveCabecalho(nome));
      if (i >= 0) { mapa[campo] = i; return; }
    }
  });
  return mapa;
}

function mfgAcharAba(livro, pedaco) {
  const alvo = mfgChaveCabecalho(pedaco);
  return livro.SheetNames.find(n => mfgChaveCabecalho(n) === alvo)
      || livro.SheetNames.find(n => mfgChaveCabecalho(n).indexOf(alvo) >= 0);
}

function mfgMatriz(livro, nomeAba) {
  const ws = livro.Sheets[nomeAba];
  return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false }) : [];
}

// ---- As tabelas de cadastro (aba "Base de Dados" e "Densidades") ------------
//
// ⚠️ A aba "Base de Dados" guarda TRÊS tabelas lado a lado, com o mesmo
// cabeçalho: produtos acabados (Item...Face Inf), produtos químicos (Item,
// Descrição, Químico) e o de-para unidade→máquina, que não tem cabeçalho
// nenhum. As duas primeiras se distinguem por nome de coluna; a terceira é
// achada pelo CONTEÚDO -- a coluna cujos valores são PM/RB, e a de código de
// unidade ao lado dela. Procurar por posição fixa quebraria no dia em que
// alguém inserir uma coluna no meio.
function mfgLerBaseDeDados(matriz) {
  const cab = mfgAcharCabecalho(matriz, ['item', 'familia mfg', 'espessura aca', 'densidade', 'quimico']);
  if (cab.linha < 0) return null;
  const linhaCab = matriz[cab.linha] || [];
  const chaves = linhaCab.map(mfgChaveCabecalho);

  const acab = mfgMapearColunas(linhaCab, {
    item:      ['Item'],
    descricao: ['Descrição Item', 'Descricao Item'],
    classe:    ['Família MFG', 'Familia MFG'],
    espessura: ['Espessura ACA'],
    densidade: ['Densidade'],
    aco:       ['AÇO 3001', 'ACO 3001'],
    filme:     ['FILME 2997'],
    aluminio:  ['ALUMÍNIO 2998', 'ALUMINIO 2998']
  });

  // A tabela de químicos: a coluna "Químico" é única, e o código do item dela é
  // a coluna "Item" mais próxima à ESQUERDA (a outra "Item" é a dos acabados).
  const iQuimico = chaves.indexOf('quimico');
  let iItemQuimico = -1;
  for (let i = iQuimico - 1; i >= 0 && i >= iQuimico - 4; i--) {
    if (chaves[i] === 'item') { iItemQuimico = i; break; }
  }

  const produtos = {}, quimicos = {};
  for (let i = cab.linha + 1; i < matriz.length; i++) {
    const L = matriz[i] || [];
    const cod = acab.item != null ? L[acab.item] : null;
    if (cod != null && cod !== '') {
      produtos[normalizaCodigoItem(cod)] = {
        descricao: L[acab.descricao],
        classe:    String(L[acab.classe] == null ? '' : L[acab.classe]).trim(),
        espessura: mfgNum(L[acab.espessura]),
        densidade: mfgNum(L[acab.densidade]),
        aco:       mfgNum(L[acab.aco]),
        filme:     mfgNum(L[acab.filme]),
        aluminio:  mfgNum(L[acab.aluminio])
      };
    }
    if (iItemQuimico >= 0 && L[iItemQuimico] != null && L[iItemQuimico] !== '') {
      quimicos[normalizaCodigoItem(L[iItemQuimico])] =
        String(L[iQuimico] == null ? '' : L[iQuimico]).trim().toUpperCase();
    }
  }

  // Unidade → máquina, pelo conteúdo: acha a coluna que só tem PM/RB.
  const maquinas = {};
  let iMaq = -1;
  for (let c = 0; c < 60 && iMaq < 0; c++) {
    let pmrb = 0, outros = 0;
    for (let i = cab.linha + 1; i < Math.min(matriz.length, cab.linha + 40); i++) {
      const v = String(((matriz[i] || [])[c]) == null ? '' : (matriz[i] || [])[c]).trim().toUpperCase();
      if (!v) continue;
      if (v === 'PM' || v === 'RB') pmrb++; else outros++;
    }
    if (pmrb >= 2 && outros === 0) iMaq = c;
  }
  if (iMaq > 0) {
    for (let i = cab.linha + 1; i < matriz.length; i++) {
      const L = matriz[i] || [];
      const est = String(L[iMaq - 1] == null ? '' : L[iMaq - 1]).trim();
      const maq = String(L[iMaq] == null ? '' : L[iMaq]).trim().toUpperCase();
      if (est && (maq === 'PM' || maq === 'RB')) maquinas[est] = maq;
    }
  }

  return { produtos, quimicos, maquinas };
}

// Densidades: classe → largura útil na PM e na RB.
function mfgLerDensidades(matriz) {
  const cab = mfgAcharCabecalho(matriz, ['pm', 'rb', 'densidade']);
  if (cab.linha < 0) return {};
  const chaves = (matriz[cab.linha] || []).map(mfgChaveCabecalho);
  const iPM = chaves.indexOf('pm'), iRB = chaves.indexOf('rb');
  const larguras = {};
  for (let i = cab.linha + 1; i < matriz.length; i++) {
    const L = matriz[i] || [];
    const classe = String(L[0] == null ? '' : L[0]).trim();
    if (!classe) continue;
    larguras[classe.toUpperCase()] = { PM: mfgNum(L[iPM]), RB: mfgNum(L[iRB]) };
  }
  return larguras;
}

// ---- O cálculo --------------------------------------------------------------
function mfgCalcular(livro) {
  const nomes = {
    consumo:   mfgAcharAba(livro, 'Consumo'),
    acabado:   mfgAcharAba(livro, 'Acabado'),
    base:      mfgAcharAba(livro, 'Base de Dados'),
    densidade: mfgAcharAba(livro, 'Densidades')
  };
  const faltando = Object.keys(nomes).filter(k => !nomes[k]);
  if (faltando.length) {
    throw new Error('O arquivo não tem a(s) aba(s): ' + faltando.join(', ')
      + '. Esperado: Consumo, Acabado, Base de Dados e Densidades.');
  }

  const base = mfgLerBaseDeDados(mfgMatriz(livro, nomes.base));
  if (!base) throw new Error('Não reconheci o cabeçalho da aba "Base de Dados".');
  const larguras = mfgLerDensidades(mfgMatriz(livro, nomes.densidade));

  // ---- Acabado: o que foi produzido -----------------------------------------
  const mAcab = mfgMatriz(livro, nomes.acabado);
  const cabAcab = mfgAcharCabecalho(mAcab, ['item', 'quantidade', 'nr ord prod', 'estab']);
  const cA = mfgMapearColunas(mAcab[cabAcab.linha] || [], {
    item:      ['Item'],
    descricao: ['Descrição Item', 'Descricao Item'],
    um:        ['UN'],
    est:       ['Estab'],
    data:      ['Dt Transação', 'Dt Transacao'],
    qtd:       ['Quantidade'],
    documento: ['Nro Documento'],
    op:        ['Nr Ord Prod']
  });
  if (cA.op == null || cA.qtd == null) throw new Error('A aba "Acabado" não tem as colunas Nr Ord Prod e Quantidade.');

  // ⚠️ Os m² são somados pelo **Nro Documento**, não pelo Nr Ord Prod -- é o que
  // a fórmula do MFG faz (SUMIF(Acabado!V:V; OP; Acabado!N:N)). Na prática os
  // dois números são iguais, mas trocar a coluna faria a conferência contra a
  // planilha da empresa parar de bater, e é justamente contra ela que esta tela
  // vai ser checada na primeira semana.
  const m2PorDocumento = {}, infoPorOp = {};
  for (let i = cabAcab.linha + 1; i < mAcab.length; i++) {
    const L = mAcab[i] || [];
    const op = String(L[cA.op] == null ? '' : L[cA.op]).trim();
    if (!op) continue;
    const doc = String((cA.documento != null ? L[cA.documento] : '') || '').trim() || op;
    m2PorDocumento[doc] = (m2PorDocumento[doc] || 0) + mfgNum(L[cA.qtd]);
    if (!infoPorOp[op]) {
      infoPorOp[op] = {
        est: String(L[cA.est] == null ? '' : L[cA.est]).trim(),
        data: mfgData(L[cA.data]),
        item: normalizaCodigoItem(L[cA.item]),
        descricao: L[cA.descricao],
        um: L[cA.um],
        documento: doc,
        linhas: 0
      };
    }
    infoPorOp[op].linhas++;
  }

  // ---- Consumo: o que foi baixado -------------------------------------------
  const mCons = mfgMatriz(livro, nomes.consumo);
  const cabCons = mfgAcharCabecalho(mCons, ['item', 'familia', 'quantidade', 'nr ord prod']);
  const cC = mfgMapearColunas(mCons[cabCons.linha] || [], {
    item:    ['Item'],
    familia: ['Família', 'Familia'],
    est:     ['Estab'],
    qtd:     ['Quantidade'],
    valor:   ['Vl Materiais'],
    op:      ['Nr Ord Prod']
  });
  if (cC.op == null || cC.qtd == null || cC.familia == null) {
    throw new Error('A aba "Consumo" não tem as colunas Nr Ord Prod, Quantidade e Família.');
  }

  const consumoPorOp = {};
  const precoFamilia = {};   // família|est -> { valor, qtd }   (média ponderada)
  const unitarioQuimico = {}; // est -> { soma, n }             (média simples)
  for (let i = cabCons.linha + 1; i < mCons.length; i++) {
    const L = mCons[i] || [];
    const op = String(L[cC.op] == null ? '' : L[cC.op]).trim();
    const familia = String(L[cC.familia] == null ? '' : L[cC.familia]).trim();
    const est = String((cC.est != null ? L[cC.est] : '') == null ? '' : L[cC.est]).trim();
    const qtd = mfgNum(L[cC.qtd]);
    const valor = cC.valor != null ? mfgNum(L[cC.valor]) : 0;

    if (op) {
      const c = consumoPorOp[op] || (consumoPorOp[op] = { grupos: {}, aco: 0, filme: 0, aluminio: 0 });
      const grupo = base.quimicos[normalizaCodigoItem(L[cC.item])];
      if (grupo) c.grupos[grupo] = (c.grupos[grupo] || 0) + qtd;
      if (familia === MFG_FAMILIA_ACO) c.aco += qtd;
      else if (familia === MFG_FAMILIA_FILME) c.filme += qtd;
      else if (familia === MFG_FAMILIA_ALUMINIO) c.aluminio += qtd;
    }

    const chave = familia + '|' + est;
    const p = precoFamilia[chave] || (precoFamilia[chave] = { valor: 0, qtd: 0 });
    p.valor += valor; p.qtd += qtd;

    if (familia === MFG_FAMILIA_QUIMICO && qtd) {
      const u = unitarioQuimico[est] || (unitarioQuimico[est] = { soma: 0, n: 0 });
      u.soma += valor / qtd; u.n++;
    }
  }

  const preco = (familia, est) => {
    const p = precoFamilia[familia + '|' + est];
    return (p && p.qtd) ? p.valor / p.qtd : 0;
  };
  const precoQuimico = (est) => {
    const u = unitarioQuimico[est];
    return (u && u.n) ? u.soma / u.n : 0;
  };

  // ---- Uma linha por OP ------------------------------------------------------
  const linhas = [];
  Object.keys(infoPorOp).forEach(op => {
    const inf = infoPorOp[op];
    const prod = base.produtos[inf.item] || null;
    const maquina = base.maquinas[inf.est] || 'PM';
    const classe = prod ? prod.classe : '';
    const larg = larguras[classe.toUpperCase()] || null;
    const largura = larg ? larg[maquina] : 0;

    const m2 = m2PorDocumento[inf.documento] || 0;
    const espessura = prod ? prod.espessura / 1000 : 0;
    // Só a isotelha tem trapézio (o perfil trapezoidal cria volume a mais que a
    // espessura nominal não conta). Painel liso, não.
    const trapezio = classe.slice(0, 4).toUpperCase() === 'ISOT' ? 0.005 : 0;
    const altura = espessura + trapezio;

    // ⚠️ Por que uma OP pode não ter teórico -- e por que ela NÃO pode entrar
    // na conta de perda. Sem cadastro o teórico dá 0, e aí "diferença" vira o
    // consumo inteiro da OP: uma perda gigante e falsa. No MFG da empresa isso
    // entra na soma sem avisar.
    const motivos = [];
    if (!prod) motivos.push('o item não está na Base de Dados');
    else {
      if (!classe) motivos.push('o item está sem Família MFG');
      if (!prod.densidade) motivos.push('o item está sem densidade');
      if (!prod.espessura) motivos.push('o item está sem espessura');
      if (classe && !largura) motivos.push('a classe "' + classe + '" não tem largura útil cadastrada para a ' + maquina);
    }
    if (!m2) motivos.push('a OP não tem m² apontado');

    const teorico = motivos.length ? 0 : m2 * altura * prod.densidade * 1.01;

    const c = consumoPorOp[op] || { grupos: {}, aco: 0, filme: 0, aluminio: 0 };
    const grupos = {};
    Object.keys(c.grupos).forEach(g => { grupos[g] = -c.grupos[g]; });
    const reportado = MFG_GRUPOS_ESPUMA.reduce((s, g) => s + (grupos[g] || 0), 0);
    const adesivo = grupos.ADESIVO || 0;

    const denominador = m2 * altura;
    const densidadeRealizada = denominador ? reportado / denominador : 0;
    const mdiPorPoliol = grupos.POLIOL ? (grupos.MDI || 0) / grupos.POLIOL : 0;

    const acoTeorico = motivos.length ? 0 : prod.aco * m2 * 1.01;
    const filmeTeorico = motivos.length ? 0 : prod.filme * m2 * 1.01;
    const aluTeorico = motivos.length ? 0 : prod.aluminio * m2 * 1.01;
    const acoReal = -c.aco, filmeReal = -c.filme, aluReal = -c.aluminio;

    const pAco = preco(MFG_FAMILIA_ACO, inf.est);
    const pFilme = preco(MFG_FAMILIA_FILME, inf.est);
    const pAlu = preco(MFG_FAMILIA_ALUMINIO, inf.est);
    const pQuim = precoQuimico(inf.est);

    const rsQuimico = (teorico - reportado) * pQuim;
    const rsAco = (acoTeorico - acoReal) * pAco;
    const rsFilme = (filmeTeorico - filmeReal) * pFilme;
    const rsAlu = (aluTeorico - aluReal) * pAlu;

    const diferenca = teorico - reportado;
    const percentual = teorico ? (diferenca / teorico) * 100 : 0;

    // ⚠️ O MATERIAL TEM DIVERGÊNCIA PRÓPRIA, e ela precisa ser medida à parte.
    // A primeira versão desta tela classificava a OP só pelo químico -- e a
    // maior perda do arquivo real (R$ 58.819 numa OP da 103) aparecia como
    // "Dentro da faixa", porque o químico dela estava a 1,1% e quem estourou
    // foi o AÇO. Perder aço é divergência de consumo igual, e vale muito mais
    // dinheiro: o químico é o que explica a densidade, o aço é o que pesa na
    // conta. Classificar por um só faria a tela esconder justamente a linha
    // que ela existe para achar.
    const totalTeoricoMat = acoTeorico + filmeTeorico + aluTeorico;
    const diferencaMaterial = totalTeoricoMat - (acoReal + filmeReal + aluReal);
    const percentualMaterial = totalTeoricoMat ? (diferencaMaterial / totalTeoricoMat) * 100 : 0;

    linhas.push({
      op, est: inf.est, maquina, data: inf.data, classe,
      item: inf.item, descricao: inf.descricao, um: inf.um,
      m2, espessura, trapezio, largura,
      densidadeTeorica: prod ? prod.densidade : 0,
      densidadeRealizada, mdiPorPoliol,
      teorico, reportado, adesivo, grupos, diferenca, percentual,
      diferencaMaterial, percentualMaterial,
      acoTeorico, acoReal, filmeTeorico, filmeReal, aluTeorico, aluReal,
      totalTeorico: acoTeorico + filmeTeorico + aluTeorico,
      totalReal: acoReal + filmeReal + aluReal,
      rsQuimico, rsAco, rsFilme, rsAlu,
      rsMaterial: rsAco + rsFilme + rsAlu,
      rsTotal: rsQuimico + rsAco + rsFilme + rsAlu,
      precoQuimico: pQuim, precoAco: pAco,
      motivos,
      // Uma OP que aparece em mais de um documento no Acabado — o MFG detecta
      // isso com um COUNTIF e não faz nada com o resultado.
      duplicada: false
    });
  });

  // ⚠️ As OPs que consumiram e nunca apontaram produção. É o furo do MFG da
  // empresa: elas não estão no Acabado, então a análise dele nem as enxerga --
  // material que saiu do estoque e não virou m² nenhum.
  const semApontamento = [];
  Object.keys(consumoPorOp).forEach(op => {
    if (infoPorOp[op]) return;
    const c = consumoPorOp[op];
    const grupos = {};
    Object.keys(c.grupos).forEach(g => { grupos[g] = -c.grupos[g]; });
    const espuma = MFG_GRUPOS_ESPUMA.reduce((s, g) => s + (grupos[g] || 0), 0);
    semApontamento.push({
      op, grupos, espuma,
      aco: -c.aco, filme: -c.filme, aluminio: -c.aluminio
    });
  });

  return { linhas, semApontamento, larguras, base };
}

// ---- Situação de cada OP ----------------------------------------------------
//
// ⚠️ A OP é olhada por DOIS lados: o químico (que explica a densidade da espuma)
// e o material — aço, filme e alumínio (que é onde mora o dinheiro). Basta um
// dos dois estourar a faixa para a OP ser divergência. Ver a nota em
// `percentualMaterial`, no cálculo: classificar só pelo químico escondia a
// maior perda do arquivo inteiro.
//
// A DIREÇÃO ("a mais" ou "a menos") segue o **dinheiro**, não o químico: é a
// pergunta que foi feita ("quanto a unidade tá perdendo ou ganhando"). Uma OP
// que economizou químico e desperdiçou aço perdeu dinheiro, e é isso que ela
// precisa dizer. Qual dos dois lados estourou vai escrito ao lado do selo.
function mfgDivergencias(l, tolerancia) {
  return {
    quimico:  !!l.teorico && Math.abs(l.percentual) > tolerancia,
    material: !!(l.acoTeorico + l.filmeTeorico + l.aluTeorico)
              && Math.abs(l.percentualMaterial) > tolerancia
  };
}

function mfgSituacao(l, tolerancia) {
  if (l.motivos.length) return 'sem_cadastro';
  const d = mfgDivergencias(l, tolerancia);
  if (!d.quimico && !d.material) return 'ok';
  return l.rsTotal < 0 ? 'a_mais' : 'a_menos';
}

// Onde a divergência está — some quando a OP está dentro da faixa.
function mfgOndeDiverge(l, tolerancia) {
  if (l.motivos.length) return '';
  const d = mfgDivergencias(l, tolerancia);
  if (d.quimico && d.material) return 'químico e material';
  if (d.quimico) return 'no químico';
  if (d.material) return 'no aço/filme';
  return '';
}

const MFG_SITUACOES = {
  a_mais:       { rotulo: 'Custou a MAIS',    classe: 'mfg-bad',  ajuda: 'Gastou mais material do que a receita previa — a OP custou dinheiro.' },
  a_menos:      { rotulo: 'Custou a menos',   classe: 'mfg-good', ajuda: 'Gastou menos que a receita. Pode ser ganho real ou apontamento de produção a mais.' },
  ok:           { rotulo: 'Dentro da faixa',  classe: 'mfg-ok',   ajuda: 'Químico e material estão dentro da tolerância — é ruído de balança, não divergência.' },
  sem_cadastro: { rotulo: 'Sem cadastro',     classe: 'mfg-gray', ajuda: 'Não dá para calcular o teórico: falta cadastro. Fora da conta de perda e ganho.' }
};

// ---- Abrir o arquivo --------------------------------------------------------
async function mfgAbrirArquivo(arquivo) {
  const msg = document.getElementById('mfgMsg');
  if (!arquivo) return;
  mfgArquivo = arquivo.name;
  msg.className = 'status-msg';
  msg.textContent = 'Lendo ' + arquivo.name + '...';

  try {
    await carregarBiblioteca('o leitor de Excel', CDN_XLSX, () => typeof XLSX !== 'undefined');
  } catch (e) {
    msg.className = 'status-msg erro';
    msg.textContent = e.message;
    return;
  }

  try {
    const buffer = await arquivo.arrayBuffer();
    msg.textContent = 'Calculando as OPs...';
    // Deixa o navegador pintar o "Calculando" antes de travar no cálculo: são
    // 30 mil linhas de consumo, e sem isto a mensagem só apareceria no fim.
    await new Promise(r => setTimeout(r, 30));

    const livro = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const r = mfgCalcular(livro);
    mfgLinhas = r.linhas;
    mfgSemApontamento = r.semApontamento;
    mfgVendoSemApontamento = false;

    mfgMontarFiltros();
    mfgRender();
    msg.className = 'status-msg ok';
    msg.textContent = '✓ ' + mfgLinhas.length + ' OP(s) analisada(s) de ' + arquivo.name
      + (mfgSemApontamento.length ? ' — e ' + mfgSemApontamento.length + ' OP(s) com consumo sem apontamento.' : '.');
    document.getElementById('mfgSalvarBtn').style.display = '';
  } catch (e) {
    console.error('Análise MFG:', e);
    msg.className = 'status-msg erro';
    msg.textContent = 'Não consegui ler o arquivo: ' + e.message;
  }
}

// ---- Filtros ----------------------------------------------------------------
function mfgMontarFiltros() {
  const ests = [...new Set(mfgLinhas.map(l => l.est).filter(Boolean))].sort();
  const classes = [...new Set(mfgLinhas.map(l => l.classe).filter(Boolean))].sort();
  const selEst = document.getElementById('mfgFiltroEst');
  const selClasse = document.getElementById('mfgFiltroClasse');
  selEst.innerHTML = '<option value="">Todas as unidades</option>'
    + ests.map(e => '<option value="' + escapeHtml(e) + '">' + escapeHtml(rotuloUnidade(e) || e) + '</option>').join('');
  selClasse.innerHTML = '<option value="">Todas as classes</option>'
    + classes.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
}

function mfgFiltradas() {
  const busca = mfgFiltros.busca.trim().toLowerCase();
  return mfgLinhas.filter(l => {
    if (mfgFiltros.est && l.est !== mfgFiltros.est) return false;
    if (mfgFiltros.classe && l.classe !== mfgFiltros.classe) return false;
    if (mfgFiltros.situacao && mfgSituacao(l, mfgFiltros.tolerancia) !== mfgFiltros.situacao) return false;
    if (busca) {
      const alvo = (l.op + ' ' + l.item + ' ' + (l.descricao || '') + ' ' + l.classe).toLowerCase();
      if (alvo.indexOf(busca) < 0) return false;
    }
    return true;
  });
}

// ---- Desenho ----------------------------------------------------------------
function mfgRender() {
  const corpo = document.getElementById('mfgBody');
  const vazio = document.getElementById('mfgVazio');
  const cards = document.getElementById('mfgCards');
  const resumo = document.getElementById('mfgResumo');
  const porUnidade = document.getElementById('mfgPorUnidade');

  if (!mfgLinhas.length) {
    cards.innerHTML = ''; porUnidade.innerHTML = ''; corpo.innerHTML = '';
    resumo.textContent = '';
    vazio.style.display = '';
    vazio.textContent = 'Escolha o arquivo do MFG acima para começar.';
    return;
  }

  const linhas = mfgFiltradas();
  const tol = mfgFiltros.tolerancia;

  // ---- Cards --------------------------------------------------------------
  // ⚠️ Os cards contam o que o FILTRO deixou, para o dinheiro bater com a
  // tabela que está na frente da pessoa. "Quantas OPs existem no total" fica na
  // linha de resumo ao lado -- misturar os dois faria o número parecer errado.
  let perda = 0, ganho = 0, semCadastro = 0, divergentes = 0;
  linhas.forEach(l => {
    const s = mfgSituacao(l, tol);
    if (s === 'sem_cadastro') { semCadastro++; return; }
    if (s !== 'ok') divergentes++;
    if (l.rsTotal < 0) perda += l.rsTotal; else ganho += l.rsTotal;
  });
  const liquido = perda + ganho;

  const card = (icone, cor, rotulo, valor, nota) =>
    '<div class="stat-card" title="' + escapeHtml(nota) + '">'
    + '<div class="stat-icone ' + cor + '">' + icone + '</div>'
    + '<div class="stat-texto"><div class="stat-rotulo">' + escapeHtml(rotulo) + '</div>'
    + '<div class="stat-valor">' + valor + '</div>'
    + '<div class="stat-nota">' + escapeHtml(nota) + '</div></div></div>';

  cards.innerHTML =
      card('🏭', 'azul', 'OPs analisadas', linhas.length, 'com produção apontada')
    + card('⚖️', divergentes ? 'laranja' : 'verde', 'Com divergência', divergentes,
           'fora da faixa de ' + mfgFmt(tol, 1) + '%')
    + card('📉', 'vermelho', 'Perda', '<span class="mfg-bad">' + mfgRS(perda) + '</span>',
           'consumiram a mais que a receita')
    + card('📈', 'verde', 'Ganho', '<span class="mfg-good">' + mfgRS(ganho) + '</span>',
           'consumiram a menos que a receita')
    + card('💰', liquido < 0 ? 'vermelho' : 'verde', 'Resultado',
           '<span class="' + (liquido < 0 ? 'mfg-bad' : 'mfg-good') + '">' + mfgRS(liquido) + '</span>',
           liquido < 0 ? 'a operação perdeu no período' : 'a operação ganhou no período')
    + card('❓', semCadastro ? 'laranja' : 'roxo', 'Sem cadastro', semCadastro,
           'fora da conta de perda e ganho')
    + (mfgSemApontamento.length
        ? card('🚨', 'laranja', 'Consumo sem OP', mfgSemApontamento.length,
               'baixaram material e não produziram')
        : '');

  // ---- Quadro por unidade --------------------------------------------------
  const porEst = {};
  linhas.forEach(l => {
    if (mfgSituacao(l, tol) === 'sem_cadastro') return;
    const u = porEst[l.est] || (porEst[l.est] = { ops: 0, m2: 0, perda: 0, ganho: 0 });
    u.ops++; u.m2 += l.m2;
    if (l.rsTotal < 0) u.perda += l.rsTotal; else u.ganho += l.rsTotal;
  });
  const ests = Object.keys(porEst).sort();
  porUnidade.innerHTML = ests.length <= 1 ? '' :
    '<table class="mfg-tabela-unidade"><thead><tr>'
    + '<th>Unidade</th><th>OPs</th><th>m²</th><th>Ganho</th><th>Perda</th><th>Resultado</th>'
    + '</tr></thead><tbody>'
    + ests.map(e => {
        const u = porEst[e];
        const liq = u.ganho + u.perda;
        return '<tr><td>' + escapeHtml(rotuloUnidade(e) || e) + '</td>'
          + '<td>' + u.ops + '</td>'
          + '<td>' + mfgFmt(u.m2, 0) + '</td>'
          + '<td class="mfg-good">' + mfgRS(u.ganho) + '</td>'
          + '<td class="mfg-bad">' + mfgRS(u.perda) + '</td>'
          + '<td class="' + (liq < 0 ? 'mfg-bad' : 'mfg-good') + '"><b>' + mfgRS(liq) + '</b></td></tr>';
      }).join('')
    + '</tbody></table>';

  // ---- A lista -------------------------------------------------------------
  if (mfgVendoSemApontamento) {
    resumo.textContent = mfgSemApontamento.length + ' OP(s) baixaram material e não apontaram produção nenhuma.';
    if (!mfgSemApontamento.length) {
      corpo.innerHTML = ''; vazio.style.display = '';
      vazio.textContent = 'Nenhuma OP com consumo sem apontamento — todas as OPs que consumiram também produziram.';
      return;
    }
    vazio.style.display = 'none';
    document.getElementById('mfgTabela').className = 'mfg-modo-sem-apontamento';
    corpo.innerHTML = mfgSemApontamento.map(s =>
      '<tr><td><b>' + escapeHtml(s.op) + '</b></td>'
      + '<td colspan="4" class="mfg-gray">sem apontamento de produção</td>'
      + '<td class="mfg-num">' + mfgFmt(s.espuma, 1) + ' kg</td>'
      + '<td class="mfg-num">' + mfgFmt(s.aco, 1) + ' kg</td>'
      + '<td class="mfg-num">' + mfgFmt(s.filme + s.aluminio, 1) + ' kg</td>'
      + '<td colspan="2" class="mfg-bad">material baixado sem produção</td></tr>'
    ).join('');
    return;
  }

  document.getElementById('mfgTabela').className = '';
  // A ordem é a do dinheiro: a maior perda em cima. É a OP que precisa ser
  // investigada primeiro — ordem alfabética esconderia o problema.
  const ordenadas = linhas.slice().sort((a, b) => a.rsTotal - b.rsTotal);
  const mostradas = ordenadas.slice(0, MFG_TETO_LINHAS);

  resumo.textContent = 'Mostrando ' + mostradas.length + ' de ' + linhas.length + ' OP(s)'
    + (linhas.length > MFG_TETO_LINHAS ? ' — use os filtros para estreitar.' : '')
    + (linhas.length !== mfgLinhas.length ? ' (de ' + mfgLinhas.length + ' no arquivo)' : '');

  if (!mostradas.length) {
    corpo.innerHTML = ''; vazio.style.display = '';
    vazio.textContent = 'Nenhuma OP bate com os filtros.';
    return;
  }
  vazio.style.display = 'none';

  corpo.innerHTML = mostradas.map(l => {
    const s = mfgSituacao(l, tol);
    const info = MFG_SITUACOES[s];
    const onde = mfgOndeDiverge(l, tol);
    return '<tr>'
      + '<td><b>' + escapeHtml(l.op) + '</b><div class="mfg-sub">' + escapeHtml(l.data || '') + '</div></td>'
      + '<td>' + escapeHtml(l.est) + '<div class="mfg-sub">' + escapeHtml(l.maquina) + '</div></td>'
      + '<td>' + escapeHtml(l.classe || '—') + '</td>'
      + '<td>' + escapeHtml(l.item) + '<div class="mfg-sub">' + escapeHtml(String(l.descricao || '').slice(0, 38)) + '</div></td>'
      + '<td class="mfg-num">' + mfgFmt(l.m2, 1) + '</td>'
      + '<td class="mfg-num">' + mfgFmt(l.teorico, 1) + '</td>'
      + '<td class="mfg-num">' + mfgFmt(l.reportado, 1) + '</td>'
      + '<td class="mfg-num ' + (l.diferenca < 0 ? 'mfg-bad' : 'mfg-good') + '">'
        + (l.motivos.length ? '—' : (l.diferenca > 0 ? '+' : '') + mfgFmt(l.diferenca, 1)
           + '<div class="mfg-sub">' + (l.percentual > 0 ? '+' : '') + mfgFmt(l.percentual, 1) + '%</div>') + '</td>'
      + '<td class="mfg-num ' + (l.rsTotal < 0 ? 'mfg-bad' : 'mfg-good') + '"><b>'
        + (l.motivos.length ? '—' : mfgRS(l.rsTotal)) + '</b></td>'
      + '<td><span class="mfg-badge ' + info.classe + '" title="' + escapeHtml(info.ajuda) + '">'
        + escapeHtml(info.rotulo) + '</span>'
        + (onde ? '<div class="mfg-sub">' + escapeHtml(onde) + '</div>' : '') + '</td>'
      + '<td><button class="btn btn-mini mfg-detalhe-btn" data-op="' + escapeHtml(l.op) + '">🔍</button></td>'
      + '</tr>';
  }).join('');
}

// ---- Detalhe de uma OP ------------------------------------------------------
function mfgAbrirDetalhe(op) {
  const l = mfgLinhas.find(x => x.op === op);
  if (!l) return;
  const tol = mfgFiltros.tolerancia;
  const info = MFG_SITUACOES[mfgSituacao(l, tol)];
  const onde = mfgOndeDiverge(l, tol);

  const par = (rotulo, valor, cor) =>
    '<tr><td>' + escapeHtml(rotulo) + '</td><td class="mfg-num ' + (cor || '') + '">' + valor + '</td></tr>';

  const tri = (rotulo, teor, real, rs) => {
    const dif = teor - real;
    return '<tr><td>' + escapeHtml(rotulo) + '</td>'
      + '<td class="mfg-num">' + mfgFmt(teor, 1) + '</td>'
      + '<td class="mfg-num">' + mfgFmt(real, 1) + '</td>'
      + '<td class="mfg-num ' + (dif < 0 ? 'mfg-bad' : 'mfg-good') + '">' + (dif > 0 ? '+' : '') + mfgFmt(dif, 1) + '</td>'
      + '<td class="mfg-num ' + (rs < 0 ? 'mfg-bad' : 'mfg-good') + '">' + mfgRS(rs) + '</td></tr>';
  };

  let html = '<h3 style="margin:0 0 2px;">OP ' + escapeHtml(l.op) + '</h3>'
    + '<div class="modal-text" style="margin-bottom:10px;">'
    + escapeHtml(l.item) + ' · ' + escapeHtml(String(l.descricao || '')) + '<br>'
    + escapeHtml(rotuloUnidade(l.est) || l.est) + ' · máquina ' + escapeHtml(l.maquina)
    + ' · ' + escapeHtml(l.classe || 'sem classe') + ' · ' + escapeHtml(l.data || '') + '</div>'
    + '<div><span class="mfg-badge ' + info.classe + '">' + escapeHtml(info.rotulo) + '</span> '
    + (onde ? '<b class="mfg-sub">divergência ' + escapeHtml(onde) + '.</b> ' : '')
    + '<span class="mfg-sub">' + escapeHtml(info.ajuda) + '</span></div>';

  if (l.motivos.length) {
    html += '<div class="busca-erro" style="margin-top:10px;">Não dá para calcular o teórico desta OP porque '
      + escapeHtml(l.motivos.join('; ')) + '. Ela fica fora da conta de perda e ganho — corrija o cadastro '
      + 'e rode de novo.</div>';
  }

  html += '<h4 class="mfg-h4">Como o teórico foi calculado</h4>'
    + '<table class="mfg-tabela-detalhe"><tbody>'
    + par('Produzido (m²)', mfgFmt(l.m2, 2))
    + par('Espessura', mfgFmt(l.espessura * 1000, 0) + ' mm')
    + par('Trapézio', l.trapezio ? '+5 mm (classe ISOT)' : 'não se aplica')
    + par('Largura útil (' + escapeHtml(l.maquina) + ')', mfgFmt(l.largura, 3) + ' m')
    + par('Densidade teórica', mfgFmt(l.densidadeTeorica, 1) + ' kg/m³')
    + par('Densidade realizada', mfgFmt(l.densidadeRealizada, 2) + ' kg/m³',
          l.densidadeRealizada > l.densidadeTeorica ? 'mfg-bad' : 'mfg-good')
    + par('MDI ÷ POLIOL', mfgFmt(l.mdiPorPoliol, 3))
    + '</tbody></table>';

  html += '<h4 class="mfg-h4">Químico (kg)</h4>'
    + '<table class="mfg-tabela-detalhe"><tbody>'
    + MFG_GRUPOS_ESPUMA.map(g => par(g, mfgFmt(l.grupos[g] || 0, 2))).join('')
    + par('Reportado (soma dos quatro)', '<b>' + mfgFmt(l.reportado, 2) + '</b>')
    + par('Teórico', '<b>' + mfgFmt(l.teorico, 2) + '</b>')
    + par('Diferença', '<b>' + (l.diferenca > 0 ? '+' : '') + mfgFmt(l.diferenca, 2) + '</b>',
          l.diferenca < 0 ? 'mfg-bad' : 'mfg-good')
    + par('Em dinheiro', '<b>' + mfgRS(l.rsQuimico) + '</b>', l.rsQuimico < 0 ? 'mfg-bad' : 'mfg-good')
    + '</tbody></table>'
    // ⚠️ O adesivo fica FORA do total de propósito -- ver a nota no topo do
    // arquivo. Ele aparece aqui para ninguém achar que o portal o perdeu.
    + '<div class="mfg-sub" style="margin-top:6px;">Adesivo consumido: <b>' + mfgFmt(l.adesivo, 2) + ' kg</b>'
    + ' — fora do total de propósito: ele cola as faces, não forma a espuma, e é assim que o MFG calcula.</div>';

  html += '<h4 class="mfg-h4">Aço, filme e alumínio (kg)</h4>'
    + '<table class="mfg-tabela-detalhe"><thead><tr><th></th><th>Teórico</th><th>Real</th><th>Diferença</th><th>Em R$</th></tr></thead><tbody>'
    + tri('Aço', l.acoTeorico, l.acoReal, l.rsAco)
    + tri('Filme', l.filmeTeorico, l.filmeReal, l.rsFilme)
    + tri('Alumínio', l.aluTeorico, l.aluReal, l.rsAlu)
    + '<tr class="mfg-linha-total"><td><b>Total</b></td>'
    + '<td class="mfg-num"><b>' + mfgFmt(l.totalTeorico, 1) + '</b></td>'
    + '<td class="mfg-num"><b>' + mfgFmt(l.totalReal, 1) + '</b></td>'
    + '<td class="mfg-num"><b>' + mfgFmt(l.totalTeorico - l.totalReal, 1) + '</b></td>'
    + '<td class="mfg-num ' + (l.rsMaterial < 0 ? 'mfg-bad' : 'mfg-good') + '"><b>' + mfgRS(l.rsMaterial) + '</b></td></tr>'
    + '</tbody></table>'
    + '<div class="mfg-sub">Diferença de material: <b class="'
    + (l.diferencaMaterial < 0 ? 'mfg-bad' : 'mfg-good') + '">'
    + (l.percentualMaterial > 0 ? '+' : '') + mfgFmt(l.percentualMaterial, 1) + '%</b>'
    + ' — contra ' + (l.percentual > 0 ? '+' : '') + mfgFmt(l.percentual, 1) + '% no químico.'
    + ' Os dois são medidos contra a mesma tolerância, e basta um estourar para a OP ser divergência.</div>';

  html += '<h4 class="mfg-h4">Resultado da OP</h4>'
    + '<table class="mfg-tabela-detalhe"><tbody>'
    + par('Químico', mfgRS(l.rsQuimico), l.rsQuimico < 0 ? 'mfg-bad' : 'mfg-good')
    + par('Aço, filme e alumínio', mfgRS(l.rsMaterial), l.rsMaterial < 0 ? 'mfg-bad' : 'mfg-good')
    + par('Total', '<b>' + mfgRS(l.rsTotal) + '</b>', l.rsTotal < 0 ? 'mfg-bad' : 'mfg-good')
    + '</tbody></table>'
    + '<div class="mfg-sub" style="margin-top:6px;">Preços desta unidade: aço ' + mfgRS(l.precoAco)
    + '/kg · químico ' + mfgRS(l.precoQuimico) + '/kg. O preço é por família <b>e por unidade</b> — '
    + 'usar a média da empresa jogaria diferença de preço dentro do resultado de produção.</div>';

  document.getElementById('mfgDetalheBox').innerHTML =
    '<button class="modal-close" id="mfgDetalheFechar">✕</button>' + html;
  document.getElementById('mfgDetalheModal').classList.add('open');
  document.getElementById('mfgDetalheFechar').addEventListener('click', mfgFecharDetalhe);
}

function mfgFecharDetalhe() {
  document.getElementById('mfgDetalheModal').classList.remove('open');
}

// ---- Exportar ---------------------------------------------------------------
const MFG_EXPORT_CABECALHO = [
  'OP', 'Unidade', 'Máquina', 'Data', 'Classe', 'Item', 'Descrição', 'UM',
  'm²', 'Espessura (mm)', 'Largura (m)', 'Densidade teórica', 'Densidade realizada',
  'POLIOL', 'MDI', 'CATALIZADOR', 'PENTANO', 'ADESIVO (fora do total)',
  'Químico teórico (kg)', 'Químico reportado (kg)', 'Diferença (kg)', 'Diferença (%)',
  'Aço teórico', 'Aço real', 'Filme teórico', 'Filme real', 'Alumínio teórico', 'Alumínio real',
  'Diferença material (kg)', 'Diferença material (%)',
  'R$ químico', 'R$ material', 'R$ total', 'Situação', 'Onde diverge', 'Motivo (sem cadastro)'
];

function mfgLinhasExportacao() {
  const tol = mfgFiltros.tolerancia;
  return mfgFiltradas().slice().sort((a, b) => a.rsTotal - b.rsTotal).map(l => [
    l.op, l.est, l.maquina, l.data, l.classe, l.item, l.descricao || '', l.um || '',
    l.m2, l.espessura * 1000, l.largura, l.densidadeTeorica, l.densidadeRealizada,
    l.grupos.POLIOL || 0, l.grupos.MDI || 0, l.grupos.CATALIZADOR || 0, l.grupos.PENTANO || 0, l.adesivo,
    l.teorico, l.reportado, l.diferenca, l.percentual,
    l.acoTeorico, l.acoReal, l.filmeTeorico, l.filmeReal, l.aluTeorico, l.aluReal,
    l.diferencaMaterial, l.percentualMaterial,
    l.rsQuimico, l.rsMaterial, l.rsTotal,
    MFG_SITUACOES[mfgSituacao(l, tol)].rotulo, mfgOndeDiverge(l, tol), l.motivos.join('; ')
  ]);
}

async function mfgExportar(formato) {
  const linhas = mfgLinhasExportacao();
  if (!linhas.length) { alert('Nenhuma OP para exportar — confira os filtros.'); return; }
  const nome = 'analise-mfg-' + new Date().toISOString().slice(0, 10);
  if (formato === 'csv') exportarCsvGenerico(MFG_EXPORT_CABECALHO, linhas, nome);
  else await exportarXlsxGenerico(MFG_EXPORT_CABECALHO, linhas, 'Análise MFG', nome);
}

// ---- Guardar a análise ------------------------------------------------------
//
// ⚠️ Guarda o RESULTADO por OP (umas 960 linhas por semana), não as 30 mil
// linhas de consumo que entraram. O consumo é insumo: cabe no arquivo, e
// regravá-lo toda semana encheria o banco com 1,5 milhão de linhas por ano para
// responder perguntas que a própria planilha já responde. O resultado é o que
// se compara entre semanas -- é dele que sai "a unidade está melhorando?".
async function mfgSalvarAnalise() {
  const btn = document.getElementById('mfgSalvarBtn');
  const msg = document.getElementById('mfgMsg');
  if (!mfgLinhas.length) return;

  if (!mfgSalvarConfirmar) {
    mfgSalvarConfirmar = true;
    btn.textContent = '⚠️ Confirmar: guardar ' + mfgLinhas.length + ' OP(s)';
    msg.className = 'status-msg';
    msg.textContent = 'Isto guarda o resultado desta análise no histórico, para comparar com as próximas semanas.';
    return;
  }
  mfgSalvarConfirmar = false;
  btn.textContent = '💾 Guardar esta análise';
  btn.disabled = true;
  msg.className = 'status-msg';
  msg.textContent = 'Guardando...';

  const tol = mfgFiltros.tolerancia;
  let perda = 0, ganho = 0, divergentes = 0, semCadastro = 0;
  mfgLinhas.forEach(l => {
    const s = mfgSituacao(l, tol);
    if (s === 'sem_cadastro') { semCadastro++; return; }
    if (s !== 'ok') divergentes++;
    if (l.rsTotal < 0) perda += l.rsTotal; else ganho += l.rsTotal;
  });
  const datas = mfgLinhas.map(l => mfgDataISO(l.data)).filter(Boolean).sort();

  // Recibo obrigatório (.select()): um insert barrado pelo RLS volta com
  // `error: null` e zero linha, e a tela diria "guardado" com o F5 desmentindo
  // (item A1 da AUDITORIA.md).
  const { data: cab, error: e1 } = await sb.from('mfg_analises').insert({
    arquivo: mfgArquivo,
    periodo_inicio: datas[0] || null,
    periodo_fim: datas[datas.length - 1] || null,
    tolerancia: tol,
    ops_analisadas: mfgLinhas.length,
    ops_divergentes: divergentes,
    ops_sem_cadastro: semCadastro,
    ops_sem_apontamento: mfgSemApontamento.length,
    valor_perda: perda,
    valor_ganho: ganho,
    valor_liquido: perda + ganho,
    importado_por: nomeUsuarioAtual || emailUsuarioAtual
  }).select('id').single();

  if (e1 || !cab) {
    btn.disabled = false;
    msg.className = 'status-msg erro';
    msg.textContent = (e1 && /relation .* does not exist|mfg_analises/i.test(e1.message || ''))
      ? 'A tabela do histórico ainda não existe. Rode sql/fase42-analise-mfg.sql no painel do Supabase. '
        + 'A análise na tela continua valendo — só não fica guardada.'
      : 'Não consegui guardar: ' + ((e1 && e1.message) || 'o banco não confirmou a gravação.');
    return;
  }

  // Em blocos: 960 linhas numa requisição só estouram o limite de tamanho.
  const blocos = [];
  for (let i = 0; i < mfgLinhas.length; i += 200) {
    blocos.push(mfgLinhas.slice(i, i + 200).map(l => ({
      analise_id: cab.id,
      op: l.op, unidade: l.est, maquina: l.maquina, data_op: mfgDataISO(l.data),
      classe: l.classe, codigo_item: l.item, descricao: l.descricao || null,
      metros_quadrados: l.m2,
      densidade_teorica: l.densidadeTeorica, densidade_realizada: l.densidadeRealizada,
      quimico_teorico: l.teorico, quimico_reportado: l.reportado,
      diferenca_kg: l.diferenca, diferenca_pct: l.percentual,
      aco_teorico: l.acoTeorico, aco_real: l.acoReal,
      filme_teorico: l.filmeTeorico, filme_real: l.filmeReal,
      aluminio_teorico: l.aluTeorico, aluminio_real: l.aluReal,
      valor_quimico: l.rsQuimico, valor_material: l.rsMaterial, valor_total: l.rsTotal,
      situacao: mfgSituacao(l, tol),
      motivo: l.motivos.join('; ') || null
    })));
  }
  for (const bloco of blocos) {
    const { error } = await sb.from('mfg_ops').insert(bloco).select('id');
    if (error) {
      btn.disabled = false;
      msg.className = 'status-msg erro';
      msg.textContent = 'O cabeçalho foi guardado, mas as OPs falharam no meio: ' + error.message;
      return;
    }
  }

  btn.disabled = false;
  msg.className = 'status-msg ok';
  msg.textContent = '✓ Análise guardada no histórico (' + mfgLinhas.length + ' OPs).';
  carregarHistoricoMfg();
}

let mfgSalvarConfirmar = false;

async function carregarHistoricoMfg() {
  const alvo = document.getElementById('mfgHistorico');
  if (!alvo) return;
  const { data, error } = await sb.from('mfg_analises')
    .select('id, arquivo, periodo_inicio, periodo_fim, ops_analisadas, ops_divergentes, valor_liquido, importado_por, criado_em')
    .order('criado_em', { ascending: false }).limit(20);
  if (error) {
    // Histórico é cortesia: o fase42 pode não ter rodado ainda, e a tela
    // principal não pode deixar de funcionar por causa disso.
    console.warn('Análise MFG: histórico indisponível.', error.message);
    alvo.innerHTML = '';
    return;
  }
  if (!data || !data.length) { alvo.innerHTML = ''; return; }
  alvo.innerHTML = '<h4 class="mfg-h4">Análises guardadas</h4>'
    + '<table class="mfg-tabela-unidade"><thead><tr><th>Período</th><th>Arquivo</th><th>OPs</th>'
    + '<th>Divergentes</th><th>Resultado</th><th>Quem</th></tr></thead><tbody>'
    + data.map(a => '<tr>'
        + '<td>' + escapeHtml([a.periodo_inicio, a.periodo_fim].filter(Boolean).join(' a ') || '—') + '</td>'
        + '<td>' + escapeHtml(a.arquivo || '—') + '</td>'
        + '<td>' + (a.ops_analisadas || 0) + '</td>'
        + '<td>' + (a.ops_divergentes || 0) + '</td>'
        + '<td class="' + (Number(a.valor_liquido) < 0 ? 'mfg-bad' : 'mfg-good') + '">'
          + mfgRS(a.valor_liquido || 0) + '</td>'
        + '<td>' + escapeHtml(a.importado_por || '—') + '</td></tr>').join('')
    + '</tbody></table>';
}

function carregarMfg() {
  mfgRender();
  carregarHistoricoMfg();
}

// ---- Ligações ---------------------------------------------------------------
document.getElementById('mfgArquivoInput').addEventListener('change', (e) => {
  mfgAbrirArquivo(e.target.files && e.target.files[0]);
  e.target.value = '';   // permite reescolher o MESMO arquivo depois de corrigir
});
document.getElementById('mfgFiltroEst').addEventListener('change', (e) => {
  mfgFiltros.est = e.target.value; mfgRender();
});
document.getElementById('mfgFiltroClasse').addEventListener('change', (e) => {
  mfgFiltros.classe = e.target.value; mfgRender();
});
document.getElementById('mfgFiltroSituacao').addEventListener('change', (e) => {
  mfgFiltros.situacao = e.target.value; mfgRender();
});
document.getElementById('mfgBusca').addEventListener('input', (e) => {
  mfgFiltros.busca = e.target.value; mfgRender();
});
document.getElementById('mfgTolerancia').addEventListener('input', (e) => {
  const v = parseFloat(String(e.target.value).replace(',', '.'));
  mfgFiltros.tolerancia = isFinite(v) && v >= 0 ? v : 0;
  document.getElementById('mfgToleranciaValor').textContent = mfgFmt(mfgFiltros.tolerancia, 1) + '%';
  mfgRender();
});
document.getElementById('mfgSemApontamentoBtn').addEventListener('click', () => {
  mfgVendoSemApontamento = !mfgVendoSemApontamento;
  document.getElementById('mfgSemApontamentoBtn').className =
    'btn' + (mfgVendoSemApontamento ? ' btn-primary' : '');
  mfgRender();
});
document.getElementById('mfgExportarBtn').addEventListener('click', () => {
  mfgExportar(document.getElementById('mfgExportarFormato').value);
});
document.getElementById('mfgSalvarBtn').addEventListener('click', mfgSalvarAnalise);
document.getElementById('mfgBody').addEventListener('click', (e) => {
  const btn = e.target.closest('.mfg-detalhe-btn');
  if (btn) mfgAbrirDetalhe(btn.dataset.op);
});
document.getElementById('mfgDetalheModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('mfgDetalheModal')) mfgFecharDetalhe();
});
