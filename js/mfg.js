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

// ---- Fornecedor do sistema químico, pelo código do POLIOL -------------------
//
// O Victor: *"divida também por 'grupo de quimico'. Se baseie no Poliol usado"*,
// com os quatro códigos abaixo.
//
// ⚠️ É o POLIOL que identifica o sistema, não o MDI nem o catalisador -- foi o
// critério dado, e faz sentido: o poliol é a parte formulada, o resto acompanha.
//
// Conferido no arquivo real: **nenhuma OP mistura dois códigos de poliol** (964
// OPs, zero mistas), então um código por OP identifica o fornecedor sem ambiguidade.
//
// ⚠️ A Base de Dados tem 18 itens classificados como POLIOL, e só estes quatro
// estão mapeados. Código fora do mapa NÃO vira "sem fornecedor" em silêncio:
// aparece como `Outro (código)`, porque é assim que o próximo código a cadastrar
// se anuncia. No arquivo de setembro são 6 OPs com `141831I`.
// ⚠️ Repare que existe `123469` (BASF) **e** `123469I` -- códigos diferentes, e o
// segundo NÃO foi mapeado de propósito: adivinhar que o sufixo "I" é o mesmo
// fornecedor importado é chute, e chute aqui vira número errado num comparativo
// de fornecedor. Quando ele aparecer, a tela pede o cadastro pelo nome.
const MFG_POLIOL_FORNECEDOR = {
  '123469':  'BASF',
  '141828I': 'WANHUA',
  '123488':  'NANOPIR',
  '141830I': 'SYNTHESIA'
};

const MFG_SEM_FORNECEDOR = 'Sem poliol no consumo';

const MFG_TETO_LINHAS = 300;

let mfgLinhas = [];          // uma por OP analisada
let mfgSemApontamento = [];  // OPs que consumiram e não apontaram produção
let mfgArquivo = '';
let mfgFiltros = {
  est: '', classe: '', fornecedor: '', situacao: '', busca: '', tolerancia: MFG_TOLERANCIA_PADRAO,
  // Só da aba Comparar unidades: qual índice e agrupado por quê.
  indice: 'quimico', compararPor: 'classe', m2Minimo: 0,
  // Com as DUAS preenchidas e diferentes, a aba vira confronto cara a cara
  // (mfgRenderDuelo). Vazias, fica o panorama de todas as fábricas.
  unidadeA: '', unidadeB: ''
};
// resumo | quimico | material | comparar | semop
let mfgAba = 'resumo';

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

// ---- Que aba é esta? --------------------------------------------------------
//
// O Victor: *"Seria interessante ter um botão para carregar as planilhas de
// entrada de material e consumo de material... Elas são exatamente como a aba
// Acabado e consumo da planilha que eu anexei do MFG."*
//
// ⚠️ O NOME DA ABA NÃO SERVE DE CRITÉRIO quando os arquivos vêm soltos: um
// export do Datasul salvo à parte chega com a aba chamada "Planilha1". Então a
// classificação é por CONTEÚDO, e o nome só entra como atalho quando bate.
//
// ⚠️ E Acabado e Consumo têm o cabeçalho quase IDÊNTICO — as duas são o mesmo
// relatório de movimentação, só que de pontas opostas. Conferido no arquivo
// real, o que de fato separa as duas:
//
//   | | Acabado | Consumo |
//   | Grupo de Estoque | 25 - PRODUTOS ACABADOS | 10 - MATERIAS-PRIMAS |
//   | Esp Docto        | ACA (apontamento)      | REQ / RRQ (requisição) |
//   | Quantidade       | positiva (entrou)      | negativa (baixou) |
//
// Os três votam, e o vencedor leva — um só erraria na linha atípica (o Acabado
// tem 1 quantidade negativa em 3.000, o Consumo tem 158 positivas).
//
// ⚠️ As colunas "Químico", "Unitário" e "Médio Total" do Consumo NÃO existem no
// export cru: são fórmulas que a planilha do MFG acrescenta. Por isso elas não
// entram na classificação nem na conta — o portal recalcula as três a partir de
// Item, Vl Materiais e Quantidade, que vêm do Datasul.
function mfgClassificarAba(matriz, nomeAba) {
  const nome = mfgChaveCabecalho(nomeAba);
  if (nome.indexOf('densidade') >= 0) return 'densidades';
  if (nome.indexOf('base de dados') >= 0) return 'base';

  const cab = mfgAcharCabecalho(matriz, ['item', 'quantidade', 'familia', 'pm', 'rb',
                                         'densidade', 'familia mfg', 'nr ord prod']);
  if (cab.linha < 0) return null;
  const chaves = (matriz[cab.linha] || []).map(mfgChaveCabecalho);
  const tem = n => chaves.indexOf(n) >= 0;

  if (tem('familia mfg') || tem('espessura aca')) return 'base';
  if (tem('pm') && tem('rb') && tem('densidade')) return 'densidades';
  if (!tem('nr ord prod') || !tem('quantidade')) return null;
  if (nome === 'consumo') return 'consumo';
  if (nome === 'acabado') return 'acabado';

  const iGrupo = chaves.indexOf('grupo de estoque');
  const iEsp = chaves.indexOf('esp docto');
  const iQtd = chaves.indexOf('quantidade');
  let acabado = 0, consumo = 0;
  for (let i = cab.linha + 1, vistas = 0; i < matriz.length && vistas < 400; i++) {
    const L = matriz[i] || [];
    if (!L.length) continue;
    vistas++;
    const g = String(L[iGrupo] == null ? '' : L[iGrupo]).toUpperCase();
    if (g.indexOf('ACABADO') >= 0) acabado++;
    else if (g.indexOf('MATERIA') >= 0) consumo++;
    const e = String(L[iEsp] == null ? '' : L[iEsp]).toUpperCase().trim();
    if (e === 'ACA' || e === 'EAC') acabado++;
    else if (e === 'REQ' || e === 'RRQ' || e === 'DEV') consumo++;
    const q = mfgNum(L[iQtd]);
    if (q > 0) acabado++; else if (q < 0) consumo++;
  }
  if (!acabado && !consumo) return null;
  return acabado >= consumo ? 'acabado' : 'consumo';
}

// ---- O cadastro fica guardado entre importações -----------------------------
//
// ⚠️ Sem "Base de Dados" e "Densidades" NÃO DÁ para calcular teórico nenhum:
// são elas que dizem a espessura, a densidade, a largura útil e os índices de
// aço/filme/alumínio de cada produto. Mas elas mudam raramente, e o que chega
// toda semana é só Acabado + Consumo — foi exatamente isso que o pedido do
// Victor descreveu.
//
// Então o cadastro do último arquivo completo fica guardado no navegador, e as
// importações seguintes podem trazer só as duas planilhas do período. Se o
// cadastro mudar, é só subir o arquivo completo de novo uma vez.
//
// ⚠️ localStorage, e não banco: é dado de referência público (espessura e
// densidade de produto), cabe em ~300 KB, e guardá-lo no Supabase exigiria mais
// uma tabela e mais um script para rodar, para resolver uma conveniência. O
// preço é ser por navegador — e a tela diz isso, com a data de quando veio.
const MFG_CHAVE_CADASTRO = 'portal_mfg_cadastro';
let mfgCadastro = null;

function mfgGuardarCadastro(base, larguras, arquivo) {
  mfgCadastro = { base, larguras, arquivo, quando: new Date().toISOString() };
  try {
    localStorage.setItem(MFG_CHAVE_CADASTRO, JSON.stringify(mfgCadastro));
  } catch (e) {
    // Cota estourada ou navegador anônimo: o cadastro continua valendo NESTA
    // sessão (está em memória), só não sobrevive ao F5. Não é motivo para
    // atrapalhar a análise que a pessoa acabou de pedir.
    console.warn('Análise MFG: não consegui guardar o cadastro no navegador.', e.message);
  }
}

function mfgLerCadastroGuardado() {
  if (mfgCadastro) return mfgCadastro;
  try {
    const cru = localStorage.getItem(MFG_CHAVE_CADASTRO);
    if (cru) mfgCadastro = JSON.parse(cru);
  } catch (e) {
    console.warn('Análise MFG: o cadastro guardado não pôde ser lido.', e.message);
  }
  return mfgCadastro;
}

// ---- O cálculo --------------------------------------------------------------
function mfgCalcular(fontes) {
  const base = fontes.base;
  const larguras = fontes.larguras;

  // ---- Acabado: o que foi produzido -----------------------------------------
  const mAcab = fontes.acabado;
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
  const mCons = fontes.consumo;
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
      const c = consumoPorOp[op] || (consumoPorOp[op] = { grupos: {}, poliois: {}, aco: 0, filme: 0, aluminio: 0 });
      const grupo = base.quimicos[normalizaCodigoItem(L[cC.item])];
      if (grupo) c.grupos[grupo] = (c.grupos[grupo] || 0) + qtd;
      // O CÓDIGO do poliol, não só o grupo: é ele que diz o fornecedor.
      if (grupo === 'POLIOL') {
        const cod = normalizaCodigoItem(L[cC.item]);
        c.poliois[cod] = (c.poliois[cod] || 0) + qtd;
      }
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

    const c = consumoPorOp[op] || { grupos: {}, poliois: {}, aco: 0, filme: 0, aluminio: 0 };
    const grupos = {};
    Object.keys(c.grupos).forEach(g => { grupos[g] = -c.grupos[g]; });
    const reportado = MFG_GRUPOS_ESPUMA.reduce((s, g) => s + (grupos[g] || 0), 0);
    const adesivo = grupos.ADESIVO || 0;

    // ---- Qual sistema químico esta OP usou ---------------------------------
    // O código com MAIOR consumo em módulo, e não o primeiro que aparecer: se um
    // dia uma OP misturar (não acontece no arquivo real, mas troca de lote no
    // meio do turno pode), o que define o sistema é o que formou a espuma, não
    // um resíduo de 2 kg. `poliolCodigo` fica na linha para a tela poder pedir o
    // cadastro do código quando ele não estiver no mapa.
    const codigosPoliol = Object.keys(c.poliois || {})
      .filter(k => Math.abs(c.poliois[k]) > 0.0001)
      .sort((x, y) => Math.abs(c.poliois[y]) - Math.abs(c.poliois[x]));
    const poliolCodigo = codigosPoliol[0] || '';
    const fornecedor = !poliolCodigo ? MFG_SEM_FORNECEDOR
      : (MFG_POLIOL_FORNECEDOR[poliolCodigo] || ('Outro (' + poliolCodigo + ')'));
    // Mais de um código na mesma OP é fato digno de nota, não de silêncio.
    const poliolMisturado = codigosPoliol.length > 1;

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
      fornecedor, poliolCodigo, poliolMisturado,
      diferencaMaterial, percentualMaterial,
      acoTeorico, acoReal, filmeTeorico, filmeReal, aluTeorico, aluReal,
      totalTeorico: acoTeorico + filmeTeorico + aluTeorico,
      totalReal: acoReal + filmeReal + aluReal,
      rsQuimico, rsAco, rsFilme, rsAlu,
      rsMaterial: rsAco + rsFilme + rsAlu,
      rsTotal: rsQuimico + rsAco + rsFilme + rsAlu,
      precoQuimico: pQuim, precoAco: pAco, precoFilme: pFilme,
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

// ---- Aço e químico, olhados separado ---------------------------------------
//
// O Victor: *"Separar aço e quimico. Pode manter o valor em reais de perca e
// ganho somando os dois, porém para analises, separe o aço e o quimico."*
//
// ⚠️ São problemas de naturezas diferentes, e misturá-los esconde os dois. O
// químico é PROCESSO: densidade da espuma, proporção MDI/poliol, temperatura —
// quem resolve é a produção. O aço é CORTE e SOBRA: largura de bobina, refile,
// ponta perdida — quem resolve é o planejamento. Uma OP pode estar ótima num e
// péssima no outro, e a régua de tolerância que faz sentido para um não faz
// para o outro.
//
// O DINHEIRO continua somado (é o que a unidade ganhou ou perdeu, e a fábrica
// não tem dois caixas), mas cada aba mede a SUA divergência.
const MFG_DIMENSOES = {
  resumo:   { rotulo: 'Resumo',       dif: l => l.rsTotal },
  quimico:  { rotulo: 'Químico',      dif: l => l.rsQuimico },
  material: { rotulo: 'Aço e filme',  dif: l => l.rsMaterial }
};

// Percentual de divergência daquela dimensão. `resumo` fica com o pior dos dois
// em módulo -- é o que decide se a OP aparece como divergente na visão geral.
function mfgPercentual(l, dim) {
  if (dim === 'quimico') return l.percentual;
  if (dim === 'material') return l.percentualMaterial;
  return Math.abs(l.percentualMaterial) > Math.abs(l.percentual) ? l.percentualMaterial : l.percentual;
}

// Se aquela dimensão sequer tem teórico para comparar (produto sem filme, por
// exemplo, não tem divergência de filme -- tem ausência de filme).
function mfgTemBase(l, dim) {
  if (dim === 'quimico') return !!l.teorico;
  if (dim === 'material') return !!(l.acoTeorico + l.filmeTeorico + l.aluTeorico);
  return !!l.teorico || !!(l.acoTeorico + l.filmeTeorico + l.aluTeorico);
}

function mfgSituacaoDim(l, tolerancia, dim) {
  if (l.motivos.length) return 'sem_cadastro';
  if (dim === 'resumo') return mfgSituacao(l, tolerancia);
  if (!mfgTemBase(l, dim)) return 'ok';
  if (Math.abs(mfgPercentual(l, dim)) <= tolerancia) return 'ok';
  return MFG_DIMENSOES[dim].dif(l) < 0 ? 'a_mais' : 'a_menos';
}

// ---- Abrir os arquivos ------------------------------------------------------
//
// Aceita, na mesma seleção: o arquivo completo do MFG (quatro abas), OU só as
// planilhas de Acabado e Consumo do período, OU uma mistura — cada aba de cada
// arquivo é classificada por conteúdo, e a última encontrada de cada tipo vale.
async function mfgAbrirArquivos(arquivos) {
  const msg = document.getElementById('mfgMsg');
  const lista = Array.from(arquivos || []);
  if (!lista.length) return;
  mfgArquivo = lista.map(a => a.name).join(' + ');
  msg.className = 'status-msg';
  msg.textContent = 'Lendo ' + lista.length + ' arquivo(s)...';

  try {
    await carregarBiblioteca('o leitor de Excel', CDN_XLSX, () => typeof XLSX !== 'undefined');
  } catch (e) {
    msg.className = 'status-msg erro';
    msg.textContent = e.message;
    return;
  }

  try {
    const achadas = {};
    const relato = [];
    for (const arquivo of lista) {
      msg.textContent = 'Lendo ' + arquivo.name + '...';
      await new Promise(r => setTimeout(r, 20));
      const livro = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: 'array' });
      for (const nomeAba of livro.SheetNames) {
        const matriz = mfgMatriz(livro, nomeAba);
        if (matriz.length < 2) continue;
        const tipo = mfgClassificarAba(matriz, nomeAba);
        if (!tipo) continue;
        achadas[tipo] = matriz;
        relato.push(nomeAba + ' → ' + tipo);
      }
    }

    if (!achadas.acabado || !achadas.consumo) {
      const faltam = [!achadas.acabado && 'Acabado (produção apontada)',
                      !achadas.consumo && 'Consumo (material baixado)'].filter(Boolean);
      throw new Error('Não achei a(s) planilha(s) de ' + faltam.join(' e ')
        + '. Reconheci: ' + (relato.join(', ') || 'nenhuma aba conhecida') + '.');
    }

    // ---- O cadastro: do próprio arquivo, ou do que ficou guardado -----------
    let base = achadas.base ? mfgLerBaseDeDados(achadas.base) : null;
    let larguras = achadas.densidades ? mfgLerDensidades(achadas.densidades) : null;
    let deOndeVeioOCadastro = 'deste arquivo';

    if (base && larguras) {
      mfgGuardarCadastro(base, larguras, mfgArquivo);
    } else {
      const guardado = mfgLerCadastroGuardado();
      if (!guardado) {
        throw new Error('Estas planilhas não trazem "Base de Dados" e "Densidades", e ainda não há '
          + 'cadastro guardado neste navegador. Suba UMA VEZ o arquivo completo do MFG — depois disso '
          + 'só Acabado e Consumo bastam.');
      }
      // ⚠️ Só o que faltou vem do guardado. Subir o arquivo completo e uma
      // planilha solta junto tem de usar a Base de Dados do arquivo completo,
      // que é a mais nova.
      base = base || guardado.base;
      larguras = larguras || guardado.larguras;
      const d = new Date(guardado.quando);
      deOndeVeioOCadastro = 'guardado em ' + d.toLocaleDateString('pt-BR')
        + ' (' + guardado.arquivo + ')';
    }

    msg.textContent = 'Calculando as OPs...';
    // Deixa o navegador pintar o "Calculando" antes de travar no cálculo: são
    // 30 mil linhas de consumo, e sem isto a mensagem só apareceria no fim.
    await new Promise(r => setTimeout(r, 30));

    const r = mfgCalcular({ acabado: achadas.acabado, consumo: achadas.consumo, base, larguras });
    mfgLinhas = r.linhas;
    mfgSemApontamento = r.semApontamento;
    mfgAba = 'resumo';

    mfgMontarFiltros();
    mfgMostrarCadastro();
    mfgRender();
    msg.className = 'status-msg ok';
    msg.textContent = '✓ ' + mfgLinhas.length + ' OP(s) analisada(s)'
      + (mfgSemApontamento.length ? ', ' + mfgSemApontamento.length + ' com consumo sem apontamento' : '')
      + ' — cadastro ' + deOndeVeioOCadastro + '.';
    document.getElementById('mfgSalvarBtn').style.display = '';
  } catch (e) {
    console.error('Análise MFG:', e);
    msg.className = 'status-msg erro';
    msg.textContent = 'Não consegui ler: ' + e.message;
  }
}

// ---- Filtros ----------------------------------------------------------------
function mfgMontarFiltros() {
  const ests = [...new Set(mfgLinhas.map(l => l.est).filter(Boolean))].sort();
  const classes = [...new Set(mfgLinhas.map(l => l.classe).filter(Boolean))].sort();
  const selEst = document.getElementById('mfgFiltroEst');
  const selClasse = document.getElementById('mfgFiltroClasse');
  selEst.innerHTML = '<option value="">Todas as unidades (consolidado)</option>'
    + ests.map(e => '<option value="' + escapeHtml(e) + '">' + escapeHtml(rotuloUnidade(e) || e) + '</option>').join('');

  // ---- Os dois lados do confronto -----------------------------------------
  // ⚠️ A máquina vai no rótulo (PM/RB), e não é enfeite: o pedido nasceu de
  // comparar duas fábricas que rodam na MESMA máquina ("ambas trabalham com a
  // robor"). Sem isso a pessoa teria de lembrar de cor qual é qual para montar
  // um par que faz sentido.
  const maq = {};
  mfgLinhas.forEach(l => { if (l.est) maq[l.est] = l.maquina; });
  const opcoes = (vazio) => '<option value="">' + vazio + '</option>'
    + ests.map(e => '<option value="' + escapeHtml(e) + '">'
        + escapeHtml(rotuloUnidade(e) || e) + (maq[e] ? ' · ' + escapeHtml(maq[e]) : '')
        + '</option>').join('');
  const selA = document.getElementById('mfgUnidadeA');
  const selB = document.getElementById('mfgUnidadeB');
  selA.innerHTML = opcoes('— escolha a 1ª —');
  selB.innerHTML = opcoes('— escolha a 2ª —');
  // ⚠️ A primeira já nasce na unidade de quem abriu a tela: quem investiga
  // começa pela própria fábrica, e deixar as duas em branco obrigaria a dois
  // cliques antes de ver qualquer coisa. A segunda fica vazia de propósito --
  // escolher a comparação é justamente a decisão que o pedido descreve.
  mfgFiltros.unidadeA = ests.includes(unidadeAtual) ? unidadeAtual : '';
  mfgFiltros.unidadeB = '';
  selA.value = mfgFiltros.unidadeA;
  selB.value = '';
  selClasse.innerHTML = '<option value="">Todas as classes</option>'
    + classes.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');

  // ⚠️ Montado de quem REALMENTE aparece no arquivo, não de MFG_POLIOL_FORNECEDOR:
  // um código novo de poliol precisa aparecer no filtro (como "Outro (...)") para
  // alguém notar que falta cadastrar. Uma lista fixa esconderia exatamente isso.
  // A ordem é por VOLUME de OPs -- o sistema principal da fábrica primeiro.
  const contaForn = {};
  mfgLinhas.forEach(l => { contaForn[l.fornecedor] = (contaForn[l.fornecedor] || 0) + 1; });
  const forns = Object.keys(contaForn).sort((a, b) => contaForn[b] - contaForn[a]);
  const selForn = document.getElementById('mfgFiltroFornecedor');
  selForn.innerHTML = '<option value="">Todos os fornecedores</option>'
    + forns.map(f => '<option value="' + escapeHtml(f) + '">' + escapeHtml(f)
        + ' (' + contaForn[f] + ')</option>').join('');
  selForn.value = mfgFiltros.fornecedor = '';

  // ⚠️ ABRE NA UNIDADE DO CABEÇALHO, e não no consolidado. O arquivo do MFG traz
  // as cinco fábricas juntas, e quem abre a tela quer ver a sua — é o idioma de
  // todo o portal (o seletor do topo manda em todas as outras telas). O
  // consolidado continua a um clique, porque comparar as unidades é justamente
  // o que o MFG da empresa não deixava fazer sem tabela dinâmica por fora.
  mfgFiltros.est = ests.includes(unidadeAtual) ? unidadeAtual : '';
  selEst.value = mfgFiltros.est;
  selClasse.value = mfgFiltros.classe = '';
}

// Trocar a unidade no cabeçalho reaponta a análise que já está em memória --
// sem pedir o arquivo de novo, porque ele já tem as cinco fábricas dentro.
// Chamada por trocarUnidade() em js/estoque.js, junto com as outras telas.
function mfgTrocarUnidade() {
  if (!mfgLinhas.length) return;
  const ests = new Set(mfgLinhas.map(l => l.est));
  mfgFiltros.est = ests.has(unidadeAtual) ? unidadeAtual : '';
  const sel = document.getElementById('mfgFiltroEst');
  if (sel) sel.value = mfgFiltros.est;
  mfgRender();
}

// `ignorarUnidade` serve ao quadro comparativo, que mostra as cinco fábricas
// mesmo com a tela filtrada numa só -- ver a nota em mfgRender().
function mfgFiltradas(ignorarUnidade) {
  const busca = mfgFiltros.busca.trim().toLowerCase();
  return mfgLinhas.filter(l => {
    if (!ignorarUnidade && mfgFiltros.est && l.est !== mfgFiltros.est) return false;
    if (mfgFiltros.fornecedor && l.fornecedor !== mfgFiltros.fornecedor) return false;
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
  // A dimensão da aba aberta: Resumo soma tudo, Químico e Aço medem só a sua.
  const dim = (mfgAba === 'quimico' || mfgAba === 'material') ? mfgAba : 'resumo';
  const valorDa = MFG_DIMENSOES[dim].dif;

  // ---- Cards --------------------------------------------------------------
  // ⚠️ Os cards contam o que o FILTRO deixou, para o dinheiro bater com a
  // tabela que está na frente da pessoa. "Quantas OPs existem no total" fica na
  // linha de resumo ao lado -- misturar os dois faria o número parecer errado.
  //
  // ⚠️ E contam o dinheiro DA ABA: no Químico, a perda é só a do químico. O
  // total das duas abas fecha com o Resumo, que é o que a fábrica ganhou ou
  // perdeu de verdade -- a separação é de análise, não de caixa.
  let perda = 0, ganho = 0, semCadastro = 0, divergentes = 0;
  linhas.forEach(l => {
    const s = mfgSituacaoDim(l, tol, dim);
    if (s === 'sem_cadastro') { semCadastro++; return; }
    if (s !== 'ok') divergentes++;
    const v = valorDa(l);
    if (v < 0) perda += v; else ganho += v;
  });
  const liquido = perda + ganho;

  const card = (icone, cor, rotulo, valor, nota) =>
    '<div class="stat-card" title="' + escapeHtml(nota) + '">'
    + '<div class="stat-icone ' + cor + '">' + icone + '</div>'
    + '<div class="stat-texto"><div class="stat-rotulo">' + escapeHtml(rotulo) + '</div>'
    + '<div class="stat-valor">' + valor + '</div>'
    + '<div class="stat-nota">' + escapeHtml(nota) + '</div></div></div>';

  const oQue = dim === 'quimico' ? 'no químico' : dim === 'material' ? 'no aço/filme' : '';
  cards.innerHTML =
      card('🏭', 'azul', 'OPs analisadas', linhas.length, 'com produção apontada')
    + card('⚖️', divergentes ? 'laranja' : 'verde', 'Com divergência', divergentes,
           ('fora da faixa de ' + mfgFmt(tol, 1) + '% ' + oQue).trim())
    + card('📉', 'vermelho', 'Perda', '<span class="mfg-bad">' + mfgRS(perda) + '</span>',
           ('consumiram a mais que a receita ' + oQue).trim())
    + card('📈', 'verde', 'Ganho', '<span class="mfg-good">' + mfgRS(ganho) + '</span>',
           ('consumiram a menos que a receita ' + oQue).trim())
    + card('💰', liquido < 0 ? 'vermelho' : 'verde',
           dim === 'resumo' ? 'Resultado' : 'Resultado ' + MFG_DIMENSOES[dim].rotulo,
           '<span class="' + (liquido < 0 ? 'mfg-bad' : 'mfg-good') + '">' + mfgRS(liquido) + '</span>',
           dim === 'resumo'
             ? (liquido < 0 ? 'a operação perdeu no período' : 'a operação ganhou no período')
             : 'só esta parte; o Resumo soma as duas')
    + card('❓', semCadastro ? 'laranja' : 'roxo', 'Sem cadastro', semCadastro,
           'fora da conta de perda e ganho')
    + (mfgSemApontamento.length
        ? card('🚨', 'laranja', 'Consumo sem OP', mfgSemApontamento.length,
               'baixaram material e não produziram')
        : '');

  // ---- Quadro por unidade --------------------------------------------------
  //
  // ⚠️ Este quadro mostra SEMPRE todas as fábricas do arquivo, mesmo com a tela
  // filtrada numa só (é o único lugar com `ignorarUnidade`). Filtrá-lo junto o
  // deixaria com uma linha só -- e "como a minha unidade está contra as outras"
  // é justamente a pergunta que o MFG da empresa não respondia sem tabela
  // dinâmica por fora. Clicar numa linha aponta a tela para aquela unidade, e a
  // linha da unidade em foco fica destacada.
  const porEst = {};
  mfgFiltradas(true).forEach(l => {
    if (l.motivos.length) return;
    const u = porEst[l.est] || (porEst[l.est] = { ops: 0, m2: 0, perda: 0, ganho: 0 });
    u.ops++; u.m2 += l.m2;
    const v = valorDa(l);
    if (v < 0) u.perda += v; else u.ganho += v;
  });
  const ests = Object.keys(porEst).sort();
  const totalGeral = ests.reduce((s, e) => s + porEst[e].ganho + porEst[e].perda, 0);
  porUnidade.innerHTML = ests.length <= 1 ? '' :
    '<table class="mfg-tabela-unidade"><thead><tr>'
    + '<th>Unidade</th><th>OPs</th><th>m²</th><th>Ganho</th><th>Perda</th><th>Resultado</th>'
    + '</tr></thead><tbody>'
    + ests.map(e => {
        const u = porEst[e];
        const liq = u.ganho + u.perda;
        return '<tr class="mfg-linha-unidade' + (mfgFiltros.est === e ? ' mfg-unidade-ativa' : '') + '"'
          + ' data-est="' + escapeHtml(e) + '" title="Clique para ver só esta unidade">'
          + '<td>' + escapeHtml(rotuloUnidade(e) || e) + '</td>'
          + '<td>' + u.ops + '</td>'
          + '<td>' + mfgFmt(u.m2, 0) + '</td>'
          + '<td class="mfg-good">' + mfgRS(u.ganho) + '</td>'
          + '<td class="mfg-bad">' + mfgRS(u.perda) + '</td>'
          + '<td class="' + (liq < 0 ? 'mfg-bad' : 'mfg-good') + '"><b>' + mfgRS(liq) + '</b></td></tr>';
      }).join('')
    + '<tr class="mfg-linha-total mfg-linha-unidade' + (mfgFiltros.est ? '' : ' mfg-unidade-ativa') + '"'
    + ' data-est="" title="Clique para ver todas as unidades juntas">'
    + '<td><b>Todas as unidades</b></td><td></td><td></td><td></td><td></td>'
    + '<td class="' + (totalGeral < 0 ? 'mfg-bad' : 'mfg-good') + '"><b>' + mfgRS(totalGeral) + '</b></td></tr>'
    + '</tbody></table>';

  // ---- A lista -------------------------------------------------------------
  // Cada aba usa um container próprio: a tabela de OPs (com as colunas da
  // dimensão) ou o quadro do comparador, que tem forma totalmente diferente.
  const ehComparar = mfgAba === 'comparar';
  document.getElementById('mfgTabelaArea').style.display = ehComparar ? 'none' : '';
  document.getElementById('mfgCompararCorpo').style.display = ehComparar ? '' : 'none';
  if (ehComparar) {
    vazio.style.display = 'none';
    resumo.textContent = 'Comparando o índice de ' + MFG_INDICES[mfgFiltros.indice].rotulo.toLowerCase()
      + ' entre as unidades, por ' + (mfgFiltros.compararPor === 'item' ? 'item'
          : mfgFiltros.compararPor === 'fornecedor' ? 'sistema químico' : 'classe') + '.';
    mfgRenderComparar();
    return;
  }

  if (mfgAba === 'semop') {
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
  // A ordem é a do dinheiro DA ABA: a maior perda em cima. É a OP que precisa
  // ser investigada primeiro — ordem alfabética esconderia o problema.
  const ordenadas = linhas.slice().sort((a, b) => valorDa(a) - valorDa(b));
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

  // ⚠️ O cabeçalho é montado aqui, não fica fixo no HTML: cada aba mostra as
  // colunas da SUA dimensão. No Químico não faz sentido ver aço, e no Aço a
  // densidade da espuma não diz nada -- é isso que "separar para análise" quer
  // dizer na prática.
  const COLUNAS = {
    resumo: [
      ['OP', ''], ['Unid.', ''], ['Classe', ''], ['Item', ''], ['m²', 'n'],
      ['Teórico (kg)', 'n', 'Quanto a receita previa de POLIOL + MDI + CATALIZADOR + PENTANO'],
      ['Reportado (kg)', 'n', 'Quanto foi realmente baixado no Consumo'],
      ['Diferença', 'n', 'Teórico menos reportado. Negativo = consumiu a mais'],
      ['Resultado R$', 'n', 'Químico + aço + filme + alumínio, ao preço desta unidade'],
      ['Situação', ''], ['', '']
    ],
    quimico: [
      ['OP', ''], ['Unid.', ''], ['Sistema', '', 'Fornecedor do poliol que a OP consumiu'],
      ['Classe', ''], ['Item', ''], ['m²', 'n'],
      ['Dens. teór.', 'n', 'Densidade do cadastro, em kg/m³'],
      ['Dens. realiz.', 'n', 'Reportado ÷ volume, em kg/m³ — sem o +1%'],
      ['Teórico (kg)', 'n'], ['Reportado (kg)', 'n'],
      ['Diferença', 'n', 'Negativo = espuma mais densa que a receita'],
      ['R$ químico', 'n'], ['Situação', ''], ['', '']
    ],
    material: [
      ['OP', ''], ['Unid.', ''], ['Classe', ''], ['Item', ''], ['m²', 'n'],
      ['Aço teór.', 'n'], ['Aço real', 'n'],
      ['Filme+Alu teór.', 'n'], ['Filme+Alu real', 'n'],
      ['Diferença', 'n', 'Negativo = gastou mais material que o índice previa'],
      ['R$ material', 'n'], ['Situação', ''], ['', '']
    ]
  };
  document.querySelector('#mfgTabela thead').innerHTML = '<tr>'
    + COLUNAS[dim].map(c => '<th' + (c[1] === 'n' ? ' class="mfg-num"' : '')
        + (c[2] ? ' title="' + escapeHtml(c[2]) + '"' : '') + '>' + escapeHtml(c[0]) + '</th>').join('')
    + '</tr>';

  const num = (v, casas, cor) => '<td class="mfg-num' + (cor ? ' ' + cor : '') + '">' + mfgFmt(v, casas) + '</td>';

  corpo.innerHTML = mostradas.map(l => {
    const s = mfgSituacaoDim(l, tol, dim);
    const info = MFG_SITUACOES[s];
    const onde = dim === 'resumo' ? mfgOndeDiverge(l, tol) : '';
    const dif = dim === 'material' ? l.diferencaMaterial : l.diferenca;
    const pct = mfgPercentual(l, dim === 'resumo' ? 'quimico' : dim);
    const rs = valorDa(l);

    const inicio = '<tr>'
      + '<td><b>' + escapeHtml(l.op) + '</b><div class="mfg-sub">' + escapeHtml(l.data || '') + '</div></td>'
      + '<td>' + escapeHtml(l.est) + '<div class="mfg-sub">' + escapeHtml(l.maquina) + '</div></td>'
      // A coluna do sistema químico só na aba Químico: no Aço ela não explica nada.
      + (dim === 'quimico'
          ? '<td>' + escapeHtml(l.fornecedor)
            + (l.poliolMisturado ? '<div class="mfg-sub mfg-bad">⚠ mais de um poliol</div>' : '')
            + '</td>'
          : '')
      + '<td>' + escapeHtml(l.classe || '—') + '</td>'
      + '<td>' + escapeHtml(l.item) + '<div class="mfg-sub">' + escapeHtml(String(l.descricao || '').slice(0, 38)) + '</div></td>'
      + num(l.m2, 1);

    let meio;
    if (dim === 'quimico') {
      meio = num(l.densidadeTeorica, 1)
        + num(l.densidadeRealizada, 2, l.densidadeRealizada > l.densidadeTeorica ? 'mfg-bad' : 'mfg-good')
        + num(l.teorico, 1) + num(l.reportado, 1);
    } else if (dim === 'material') {
      meio = num(l.acoTeorico, 1) + num(l.acoReal, 1)
        + num(l.filmeTeorico + l.aluTeorico, 1) + num(l.filmeReal + l.aluReal, 1);
    } else {
      meio = num(l.teorico, 1) + num(l.reportado, 1);
    }

    return inicio + meio
      + '<td class="mfg-num ' + (dif < 0 ? 'mfg-bad' : 'mfg-good') + '">'
        + (l.motivos.length ? '—' : (dif > 0 ? '+' : '') + mfgFmt(dif, 1)
           + '<div class="mfg-sub">' + (pct > 0 ? '+' : '') + mfgFmt(pct, 1) + '%</div>') + '</td>'
      + '<td class="mfg-num ' + (rs < 0 ? 'mfg-bad' : 'mfg-good') + '"><b>'
        + (l.motivos.length ? '—' : mfgRS(rs)) + '</b></td>'
      + '<td><span class="mfg-badge ' + info.classe + '" title="' + escapeHtml(info.ajuda) + '">'
        + escapeHtml(info.rotulo) + '</span>'
        + (onde ? '<div class="mfg-sub">' + escapeHtml(onde) + '</div>' : '') + '</td>'
      + '<td><button class="btn btn-mini mfg-detalhe-btn" data-op="' + escapeHtml(l.op) + '">🔍</button></td>'
      + '</tr>';
  }).join('');
}

// ---- Comparador de índices entre unidades -----------------------------------
//
// O Victor: *"Percebi que a unidade 105 teve ganho no quimico, enquanto a
// unidade 106 teve uma perca enorme. Ambas unidades trabalham com a robor.
// Preciso descobrir pq a unidade 106 ta tendo tanta perca e com isso, quero
// comparar os indices e descobrir se tem algum errado."*
//
// ⚠️ A DESCOBERTA QUE MUDA PARA ONDE OLHAR: **a largura útil se CANCELA na
// fórmula do químico.** O MFG calcula `(m² ÷ largura) × largura × altura ×
// densidade × 1,01` — a largura entra e sai. Conferido na fórmula original e no
// código (`teorico = m2 × altura × densidade × 1,01`, sem largura nenhuma).
//
// Consequência direta para a investigação: **PM × RB não explica diferença
// nenhuma no químico.** A máquina só muda a largura, e a largura não está na
// conta. Então, se a 106 perde e a 105 ganha sendo as duas Robor, a causa está
// num destes três lugares, e é isto que esta aba separa:
//
//   1. a densidade REALIZADA é de fato maior na 106 (processo: espuma mais
//      densa do que a receita pede);
//   2. a densidade CADASTRADA está errada para os produtos que a 106 faz
//      (o mesmo item com índice diferente entre unidades não existe -- o
//      cadastro é único --, mas classes diferentes têm densidades diferentes,
//      e o mix de cada fábrica é diferente);
//   3. o m² APONTADO está subestimado na 106 (produziu mais do que apontou, e
//      aí todo o químico gasto é dividido por um denominador menor).
//
// ⚠️ Para o AÇO a largura NÃO se cancela -- ela não entra na conta dele de jeito
// nenhum (o índice do aço é kg por m², direto do cadastro). Mas a máquina
// importa de outro jeito ali: largura de bobina e refile são físicos.
//
// O índice é sempre "quanto de material por unidade de produto":
//   químico  -> kg/m³ (densidade)      = kg reportado ÷ (m² × altura)
//   aço      -> kg/m²                  = kg baixado   ÷ m²
//
// Os dois lados (teórico e realizado) usam o MESMO denominador, então a
// comparação é honesta mesmo com volumes muito diferentes entre as fábricas.
// `kgTeor`/`kgReal` existem para a MÉDIA do confronto entre duas unidades: a
// média honesta é `Σ real ÷ Σ teórico`, não a média dos índices de cada
// produto -- ver a nota em mfgRenderDuelo().
const MFG_INDICES = {
  // ⚠️ O ÍNDICE DO QUÍMICO É kg/m² — consumo dividido pela metragem (pedido do
  // Victor, 15/09/2026). É a mesma régua do aço e do filme, e é como a fábrica
  // pensa: "quanto de químico eu gasto por m² produzido".
  //
  // ⚠️ E o divisor NÃO altera o desvio. `desvio = (real − teórico) ÷ teórico`, e
  // os dois lados são divididos pela MESMA base — ela se cancela:
  //     (real/base − teor/base) ÷ (teor/base) = (real − teor) ÷ teor
  // Então trocar m³ por m² muda só o número absoluto na célula. Desvio,
  // discordância, ordenação e custo da diferença saem idênticos. Conferido no
  // navegador contra os valores de antes da troca.
  quimico:  { rotulo: 'Químico (kg/m²)', unidade: 'kg/m²',
              teor: a => a.m2 ? a.quimicoTeorico / a.m2 : 0,
              real: a => a.m2 ? a.quimicoReal / a.m2 : 0,
              temBase: a => a.quimicoTeorico > 0,
              kgTeor: a => a.quimicoTeorico, kgReal: a => a.quimicoReal,
              base: a => a.m2, preco: a => a.precoQuimico },
  // A densidade fica como segunda opção, e não foi jogada fora: ela é a única
  // que dá para comparar entre ESPESSURAS diferentes. O kg/m² de um painel de
  // 100 mm é mais que o dobro do de uma isotelha de 30 mm sem nenhum desperdício
  // -- então o número absoluto em kg/m² só se compara no MESMO produto, e é por
  // isso que a tela avisa isso quando o agrupamento é por classe.
  quimicoDens: { rotulo: 'Químico — densidade (kg/m³)', unidade: 'kg/m³',
              teor: a => a.volume ? a.quimicoTeorico / a.volume : 0,
              real: a => a.volume ? a.quimicoReal / a.volume : 0,
              temBase: a => a.quimicoTeorico > 0,
              kgTeor: a => a.quimicoTeorico, kgReal: a => a.quimicoReal,
              base: a => a.volume, preco: a => a.precoQuimico },
  aco:      { rotulo: 'Aço', unidade: 'kg/m²',
              teor: a => a.m2 ? a.acoTeorico / a.m2 : 0,
              real: a => a.m2 ? a.acoReal / a.m2 : 0,
              temBase: a => a.acoTeorico > 0,
              kgTeor: a => a.acoTeorico, kgReal: a => a.acoReal,
              base: a => a.m2, preco: a => a.precoAco },
  filme:    { rotulo: 'Filme', unidade: 'kg/m²',
              teor: a => a.m2 ? a.filmeTeorico / a.m2 : 0,
              real: a => a.m2 ? a.filmeReal / a.m2 : 0,
              temBase: a => a.filmeTeorico > 0,
              kgTeor: a => a.filmeTeorico, kgReal: a => a.filmeReal,
              base: a => a.m2, preco: a => a.precoFilme }
};

// Junta as OPs por (classe|item) × unidade. A média é PONDERADA pelo volume --
// somar as densidades de cada OP e dividir por N daria o mesmo peso a uma OP de
// 20 m² e a uma de 2.000, e é justamente a grande que move o resultado do mês.
function mfgAgruparIndices(porItem) {
  const por = mfgFiltros.compararPor;
  const mapa = new Map();
  mfgFiltradas(true).forEach(l => {
    if (l.motivos.length) return;
    const chave = por === 'item' ? l.item
                : por === 'fornecedor' ? l.fornecedor
                : (l.classe || '(sem classe)');
    const rotulo = por === 'item' ? (l.item + ' · ' + String(l.descricao || '').slice(0, 30)) : chave;
    const g = mapa.get(chave) || mapa.set(chave, { chave, rotulo, unidades: {} }).get(chave);
    const a = g.unidades[l.est] || (g.unidades[l.est] = {
      est: l.est, maquina: l.maquina, ops: 0, m2: 0, volume: 0,
      quimicoTeorico: 0, quimicoReal: 0, acoTeorico: 0, acoReal: 0,
      filmeTeorico: 0, filmeReal: 0, valor: 0,
      // Preço da família NAQUELA unidade — é o mesmo em todas as linhas dela,
      // e é o que transforma a diferença de índice em dinheiro.
      precoQuimico: l.precoQuimico, precoAco: l.precoAco, precoFilme: l.precoFilme
    });
    a.ops++; a.m2 += l.m2;
    a.volume += l.m2 * (l.espessura + l.trapezio);
    a.quimicoTeorico += l.teorico; a.quimicoReal += l.reportado;
    a.acoTeorico += l.acoTeorico;  a.acoReal += l.acoReal;
    a.filmeTeorico += l.filmeTeorico; a.filmeReal += l.filmeReal;
    a.valor += l.rsTotal;
  });
  return [...mapa.values()];
}

// ---- Duas unidades, cara a cara ---------------------------------------------
//
// O Victor: *"Quero poder selecionar a primeira unidade e dps selecionar a
// segunda unidade e a partir dai fazer a comparação. Pegue os itens em comum das
// duas unidades e faça a comparação dos indices, faça uma média de indice."*
//
// ⚠️ SÓ OS ITENS EM COMUM, e isso é o ponto. Comparar a média geral de duas
// fábricas mistura duas coisas: o quanto cada uma gasta a mais que a receita, e
// o MIX de produtos que cada uma faz. Uma fábrica que só faz painel denso
// pareceria pior que uma que só faz isotelha, sem gastar um grama a mais. Preso
// aos produtos que as duas fazem, o que sobra é a diferença de processo.
//
// ⚠️ A MÉDIA É `Σ real ÷ Σ teórico`, e NÃO a média dos índices de cada produto.
// Somar os percentuais e dividir por N daria o mesmo peso a um produto de 200 m²
// e a um de 20.000 -- e é o grande que faz o mês. Feita assim, a média também
// fica **neutra ao mix**: cada produto é comparado com o teórico DELE, então a
// proporção entre produtos não entra na conta. É o número que responde "quem
// roda mais apertado", que é a pergunta.
// Como a linha do comparador se chama, conforme o agrupamento escolhido.
function mfgRotuloGrupo() {
  return mfgFiltros.compararPor === 'item' ? 'Item'
       : mfgFiltros.compararPor === 'fornecedor' ? 'Sistema químico'
       : 'Classe';
}

// O mesmo rótulo na forma de contagem ("4 classe(s) em comum"). Fica à parte
// porque o plural em português não sai de um "(s)" grudado no singular --
// "item(s)" e "sistema químico(s)" saem errados.
function mfgRotuloGrupoPlural() {
  return mfgFiltros.compararPor === 'item' ? 'item(ns)'
       : mfgFiltros.compararPor === 'fornecedor' ? 'sistema(s) químico(s)'
       : 'classe(s)';
}

function mfgRenderDuelo(alvo, indice, porItem, grupos, maquinaDe) {
  const A = mfgFiltros.unidadeA, B = mfgFiltros.unidadeB;
  const piso = mfgFiltros.m2Minimo || 0;

  const comuns = grupos.map(g => {
    const a = g.unidades[A], b = g.unidades[B];
    if (!a || !b || !indice.temBase(a) || !indice.temBase(b)) return null;
    if (a.m2 < piso || b.m2 < piso) return null;
    const ia = indice.real(a), ib = indice.real(b);
    // Devolução líquida não é índice de processo -- fora do confronto.
    if (ia < 0 || ib < 0) return null;
    // ⚠️ CADA LADO CONTRA O SEU PRÓPRIO TEÓRICO. A primeira versão media o desvio
    // de B contra o teórico de A, e isso passava desapercebido agrupando por
    // ITEM -- ali o cadastro é o mesmo e os dois teóricos coincidem. Por CLASSE
    // e por FORNECEDOR não: o teórico do grupo é a média ponderada do MIX de cada
    // fábrica, e os mixes são diferentes. No arquivo real isso fazia a BASF na 106
    // aparecer com +138% (o certo é +8,9%) e a WANHUA com −43,6% (o certo é
    // +6,8%) -- número inventado, e no lugar mais perigoso possível: um
    // comparativo de fornecedor. Pego conferindo contra um cálculo independente.
    const ta = indice.teor(a), tb = indice.teor(b);
    const da = ta ? ((ia - ta) / ta) * 100 : 0;
    const db = tb ? ((ib - tb) / tb) * 100 : 0;
    return { rotulo: g.rotulo, teoricoA: ta, teoricoB: tb, a, b, ia, ib, da, db,
             diferenca: da - db };
  }).filter(Boolean);

  if (!comuns.length) {
    alvo.innerHTML = '<div class="empty-msg">Não há ' + mfgRotuloGrupo().toLowerCase()
      + ' feito nas DUAS unidades com índice de ' + escapeHtml(indice.rotulo.toLowerCase())
      + ' neste recorte' + (piso ? ' e com pelo menos ' + mfgFmt(piso, 0) + ' m² em cada' : '')
      + '. Tente agrupar por classe, baixar o piso de m², ou escolher outro par.</div>';
    return;
  }

  // ---- A média, pelos itens em comum --------------------------------------
  const soma = (est) => comuns.reduce((s, c) => {
    const u = c[est === A ? 'a' : 'b'];
    s.kgTeor += indice.kgTeor(u); s.kgReal += indice.kgReal(u);
    s.base += indice.base(u); s.m2 += u.m2; s.ops += u.ops;
    return s;
  }, { kgTeor: 0, kgReal: 0, base: 0, m2: 0, ops: 0 });
  const mA = soma(A), mB = soma(B);
  mA.indice = mA.base ? mA.kgReal / mA.base : 0;
  mB.indice = mB.base ? mB.kgReal / mB.base : 0;
  mA.teorico = mA.base ? mA.kgTeor / mA.base : 0;
  mB.teorico = mB.base ? mB.kgTeor / mB.base : 0;
  mA.desvio = mA.kgTeor ? ((mA.kgReal - mA.kgTeor) / mA.kgTeor) * 100 : 0;
  mB.desvio = mB.kgTeor ? ((mB.kgReal - mB.kgTeor) / mB.kgTeor) * 100 : 0;

  const pior = mA.desvio > mB.desvio ? A : B;
  const melhor = pior === A ? B : A;
  const mPior = pior === A ? mA : mB, mMelhor = pior === A ? mB : mA;
  const lacuna = mPior.desvio - mMelhor.desvio;

  // ⚠️ O custo da diferença: quanto a fábrica pior gastou a mais do que teria
  // gasto rodando no índice da melhor, NOS MESMOS PRODUTOS. Não é uma meta nem
  // uma promessa -- é a conta de "quanto vale fechar esta lacuna", e é o número
  // que faz alguém agir. O preço é o da unidade pior, que é quem paga.
  const kgExtra = mPior.kgTeor * (lacuna / 100);
  const precoPior = indice.preco(comuns[0][pior === A ? 'a' : 'b']) || 0;
  const custo = kgExtra * precoPior;

  const painel =
    '<div class="mfg-duelo">'
    + [A, B].map(est => {
        const m = est === A ? mA : mB;
        const ganhando = est === melhor;
        return '<div class="mfg-duelo-lado' + (ganhando ? ' mfg-duelo-melhor' : '') + '">'
          + '<div class="stat-rotulo">' + escapeHtml(rotuloUnidade(est) || est)
            + ' · ' + escapeHtml(maquinaDe[est] || '') + '</div>'
          + '<div class="mfg-duelo-indice">' + mfgFmt(m.indice, 2)
            + '<span class="mfg-sub"> ' + escapeHtml(indice.unidade) + '</span></div>'
          // ⚠️ O TEÓRICO DE CADA LADO VAI JUNTO, e isto não é enfeite. Em kg/m² o
          // índice absoluto depende da espessura: no arquivo real a 105 marca
          // 1,72 kg/m² contra 1,26 da 106 -- parece que a 105 gasta MAIS, quando
          // na verdade ela roda 4,4% ABAIXO da receita e a 106 10,6% acima (a 105
          // faz painel mais grosso). O número grande sozinho contradizia o
          // veredito escrito embaixo dele. Com o teórico ao lado, o par se
          // explica: 1,72 contra 1,80 é abaixo; 1,26 contra 1,14 é acima.
          + '<div class="' + (m.desvio > 0 ? 'mfg-bad' : 'mfg-good') + '"><b>'
            + (m.desvio > 0 ? '+' : '') + mfgFmt(m.desvio, 1) + '%</b> vs o teórico de '
            + mfgFmt(m.teorico, 2) + '</div>'
          + '<div class="mfg-sub">' + m.ops + ' OPs · ' + mfgFmt(m.m2, 0) + ' m² nos itens em comum</div>'
          + '</div>';
      }).join('')
    + '<div class="mfg-duelo-lacuna">'
    + '<div class="stat-rotulo">Diferença</div>'
    + '<div class="mfg-duelo-indice ' + (lacuna > 0.05 ? 'mfg-bad' : 'mfg-good') + '">'
      + mfgFmt(Math.abs(lacuna), 1) + ' pp</div>'
    + (lacuna > 0.05
        ? '<div class="mfg-sub"><b>' + escapeHtml(rotuloUnidade(pior) || pior) + '</b> roda mais '
          + 'pesado que a <b>' + escapeHtml(rotuloUnidade(melhor) || melhor) + '</b> nos mesmos produtos.</div>'
          + '<div style="margin-top:6px;">Custo da diferença: <b class="mfg-bad">' + mfgRS(custo) + '</b>'
          + '<div class="mfg-sub">' + mfgFmt(kgExtra, 0) + ' kg a mais no período, ao preço da '
          + escapeHtml(pior) + '. É quanto vale fechar a lacuna — não é meta.</div></div>'
          // ⚠️ A lacuna é medida contra a OUTRA FÁBRICA, não contra a receita. Se
          // a melhor está rodando ABAIXO do teórico, parte da lacuna é ela gastando
          // menos do que a receita manda -- o que pode ser ganho real, mas também
          // pode ser consumo subapontado ou m² superapontado. Perseguir esse número
          // como meta seria perseguir um artefato. O aviso não esconde o valor:
          // diz contra o que ele foi medido.
          + (mMelhor.desvio < -0.5
              ? '<div class="mfg-sub" style="margin-top:6px;"><b class="mfg-bad">⚠️ Leia com cuidado:</b> a '
                + escapeHtml(melhor) + ' está <b>' + mfgFmt(mMelhor.desvio, 1) + '%</b> abaixo do próprio '
                + 'teórico. Parte desta lacuna é ela consumir menos que a receita — pode ser ganho real, '
                + 'ou consumo subapontado. A régua mais segura é o desvio de cada uma contra o teórico ('
                + (mPior.desvio > 0 ? '+' : '') + mfgFmt(mPior.desvio, 1) + '% na ' + escapeHtml(pior) + ').</div>'
              : '')
        : '<div class="mfg-sub">As duas rodam praticamente no mesmo índice nos itens em comum.</div>')
    + '</div></div>';

  // ---- A tabela, produto a produto ----------------------------------------
  // Ordena pela diferença ENTRE AS DUAS, em módulo: no topo, o produto em que
  // elas mais discordam -- é por onde a investigação começa.
  comuns.sort((x, y) => Math.abs(y.diferenca) - Math.abs(x.diferenca));

  // O teórico vai DENTRO da célula, ao lado do realizado: agrupado por classe ou
  // fornecedor ele é diferente em cada fábrica (mix diferente), e uma coluna
  // "Teórico" única no meio da tabela daria a impressão de referência comum.
  const celula = (ind, teor, desvio, m2, marcar) =>
    '<td class="mfg-num' + (marcar ? ' mfg-celula-pior' : '') + '">' + mfgFmt(ind, 2)
    + '<div class="mfg-sub ' + (desvio > 0 ? 'mfg-bad' : 'mfg-good') + '">'
    + (desvio > 0 ? '+' : '') + mfgFmt(desvio, 1) + '%</div>'
    + '<div class="mfg-sub">teór. ' + mfgFmt(teor, 2) + '</div>'
    + '<div class="mfg-sub">' + mfgFmt(m2, 0) + ' m²</div></td>';

  alvo.innerHTML = painel
    + '<div class="modal-text" style="margin:14px 0 10px; font-size:12.5px;">'
    + 'Só os ' + (porItem ? 'itens' : 'as classes') + ' que <b>as duas fábricas fizeram</b> ('
    + comuns.length + '). Presa aos mesmos produtos, a comparação tira o efeito do mix — '
    + 'o que sobra é diferença de processo. A média de cima é <b>Σ real ÷ Σ teórico</b>, '
    + 'ponderada pelo volume e neutra ao mix.'
    + (mfgFiltros.indice.indexOf('quimico') === 0
        ? '<br>⚠️ <b>A máquina (PM/RB) não entra no químico:</b> a largura útil se cancela na '
          + 'fórmula, então diferença aqui é densidade realizada, cadastro do produto, ou m² apontado.'
        : '')
    + ((mfgFiltros.indice === 'quimico' && mfgFiltros.compararPor !== 'item')
        ? '<br>⚠️ <b>Em kg/m² o número absoluto depende da ESPESSURA:</b> o químico enche o '
          + 'núcleo, então um painel de 100 mm gasta mais por m² que uma isotelha de 30 mm sem '
          + 'nenhum desperdício. Agrupado por classe, espessuras diferentes entram no mesmo '
          + 'número. <b>O desvio e a discordância continuam válidos</b> (o divisor se cancela) — '
          + 'para comparar o valor absoluto, agrupe por <b>código do item</b> ou use a densidade.'
        : '')
    + '</div>'
    + '<div class="scroll-area"><table class="data-table mfg-tabela-comparar"><thead><tr>'
    + '<th>' + escapeHtml(mfgRotuloGrupo()) + '</th>'
    + '<th class="mfg-num">' + escapeHtml(rotuloUnidade(A) || A)
      + '<div class="mfg-sub">' + escapeHtml(maquinaDe[A] || '') + '</div></th>'
    + '<th class="mfg-num">' + escapeHtml(rotuloUnidade(B) || B)
      + '<div class="mfg-sub">' + escapeHtml(maquinaDe[B] || '') + '</div></th>'
    + '<th class="mfg-num" title="Desvio de A menos desvio de B. Positivo = A gasta mais.">A − B</th>'
    + '</tr></thead><tbody>'
    + comuns.slice(0, MFG_TETO_LINHAS).map(c =>
        '<tr><td>' + escapeHtml(c.rotulo) + '</td>'
        + celula(c.ia, c.teoricoA, c.da, c.a.m2, c.diferenca > 0)
        + celula(c.ib, c.teoricoB, c.db, c.b.m2, c.diferenca < 0)
        + '<td class="mfg-num ' + (Math.abs(c.diferenca) > 5 ? 'mfg-bad' : '') + '"><b>'
          + (c.diferenca > 0 ? '+' : '') + mfgFmt(c.diferenca, 1) + ' pp</b></td></tr>'
      ).join('')
    + '</tbody></table></div>'
    + '<div class="mfg-sub" style="margin-top:8px;">' + comuns.length + ' '
    + mfgRotuloGrupoPlural() + ' em comum'
    + (comuns.length > MFG_TETO_LINHAS ? ' — mostrando os ' + MFG_TETO_LINHAS + ' de maior diferença.' : '.')
    + '</div>';
}

function mfgRenderComparar() {
  const alvo = document.getElementById('mfgCompararCorpo');
  const indice = MFG_INDICES[mfgFiltros.indice] || MFG_INDICES.quimico;
  const porItem = mfgFiltros.compararPor === 'item';
  const grupos = mfgAgruparIndices(porItem);

  // Todas as unidades presentes, com a máquina de cada uma -- é o cabeçalho.
  const ests = [...new Set(grupos.flatMap(g => Object.keys(g.unidades)))].sort();
  const maquinaDe = {};
  grupos.forEach(g => Object.values(g.unidades).forEach(a => { maquinaDe[a.est] = a.maquina; }));

  if (ests.length < 2) {
    alvo.innerHTML = '<div class="empty-msg">O arquivo só tem uma unidade — não há o que comparar. '
      + 'Comparar índices precisa de pelo menos duas fábricas no mesmo arquivo.</div>';
    return;
  }

  // Com as duas unidades escolhidas, vira confronto cara a cara. Sem elas,
  // continua o panorama de todas as fábricas -- as duas visões respondem
  // perguntas diferentes ("quem discorda de quem" × "por que estas duas").
  const A = mfgFiltros.unidadeA, B = mfgFiltros.unidadeB;
  if (A && B && A !== B) return mfgRenderDuelo(alvo, indice, porItem, grupos, maquinaDe);
  if (A && B && A === B) {
    alvo.innerHTML = '<div class="empty-msg">Escolha duas unidades <b>diferentes</b> para comparar, '
      + 'ou deixe uma em branco para ver o panorama de todas.</div>';
    return;
  }

  // ⚠️ Só entra quem foi feito em MAIS DE UMA unidade: com uma só não há
  // comparação, e a linha ocuparia espaço sem responder nada.
  //
  // ⚠️ E o piso de m² é do usuário, não meu, com padrão ZERO. Um desvio de
  // +138% em 396 m² domina a ordenação, e é tentador filtrá-lo de saída -- mas
  // 101 kg/m³ de espuma PIR é fisicamente impossível, ou seja, é um achado de
  // verdade (químico lançado na OP errada, ou m² apontado muito a menos), não
  // ruído. Esconder por padrão tiraria da tela justamente o caso mais grave.
  // Então nada sai sozinho: o m² de cada fábrica aparece na célula, e quem quer
  // olhar só o que move o mês levanta o piso e a tela diz quantas linhas saíram.
  const piso = mfgFiltros.m2Minimo || 0;
  let escondidasPorVolume = 0;
  const linhas = grupos.map(g => {
    const presentes = ests.filter(e => g.unidades[e] && indice.temBase(g.unidades[e])
                                   && g.unidades[e].m2 >= piso);
    if (presentes.length < 2) {
      if (piso && ests.filter(e => g.unidades[e] && indice.temBase(g.unidades[e])).length >= 2) {
        escondidasPorVolume++;
      }
      return null;
    }
    const desvios = presentes.map(e => {
      const a = g.unidades[e];
      const t = indice.teor(a), r = indice.real(a);
      return {
        est: e, teorico: t, real: r, desvio: t ? ((r - t) / t) * 100 : 0, m2: a.m2,
        // ⚠️ Índice REAL NEGATIVO acontece de verdade: no período, a unidade
        // devolveu mais material do que consumiu daquele produto (a soma do
        // Consumo ficou positiva). Não é um índice de processo, é um artefato
        // do corte de datas -- e comparar "-4,76 kg/m²" com um índice normal
        // dá uma discordância de 150 pp que joga lixo para o topo da lista.
        // Fica visível e marcado, mas FORA da conta da discordância.
        devolucao: r < 0
      };
    });
    const validos = desvios.filter(d => !d.devolucao);
    // Sem dois lados comparáveis não há comparação.
    if (validos.length < 2) return null;
    const pcts = validos.map(d => d.desvio);
    return {
      chave: g.chave, rotulo: g.rotulo, desvios,
      // A "discordância": o quanto a fábrica que mais gasta e a que menos gasta
      // se afastam NO MESMO produto. É este número que responde "tem algum
      // errado?", e é por ele que a lista é ordenada.
      espalhamento: Math.max(...pcts) - Math.min(...pcts),
      m2: presentes.reduce((s, e) => s + g.unidades[e].m2, 0)
    };
  }).filter(Boolean);

  if (!linhas.length) {
    alvo.innerHTML = '<div class="empty-msg">Nenhum ' + mfgRotuloGrupo().toLowerCase()
      + ' foi produzido em mais de uma unidade com índice de ' + escapeHtml(indice.rotulo.toLowerCase())
      + ' cadastrado — não há comparação possível neste recorte.</div>';
    return;
  }

  // ⚠️ A ordem é a da DISCORDÂNCIA, não alfabética: no topo fica o produto em
  // que as fábricas mais divergem entre si, que é exatamente onde mora o índice
  // errado (ou o processo fora de controle). Mesma decisão de ordenar a tabela
  // principal pelo dinheiro.
  linhas.sort((a, b) => b.espalhamento - a.espalhamento);

  const cab = '<tr><th>' + escapeHtml(mfgRotuloGrupo()) + '</th>'
    + ests.map(e => '<th class="mfg-num">' + escapeHtml(rotuloUnidade(e) || e)
        + '<div class="mfg-sub">' + escapeHtml(maquinaDe[e] || '') + '</div></th>').join('')
    + '<th class="mfg-num" title="Distância entre a unidade que mais gasta e a que menos gasta, no mesmo produto">Discordância</th></tr>';

  const corpo = linhas.slice(0, MFG_TETO_LINHAS).map(l => {
    const porEst = {};
    l.desvios.forEach(d => { porEst[d.est] = d; });
    const comparaveis = l.desvios.filter(d => !d.devolucao);
    const piorDesvio = Math.max(...comparaveis.map(d => d.desvio));
    return '<tr>'
      + '<td>' + escapeHtml(l.rotulo) + '<div class="mfg-sub">' + mfgFmt(l.m2, 0)
        + ' m² · ' + escapeHtml(indice.unidade) + '</div></td>'
      + ests.map(e => {
          const d = porEst[e];
          if (!d) return '<td class="mfg-num mfg-gray">—</td>';
          if (d.devolucao) {
            return '<td class="mfg-num mfg-gray" title="No período esta unidade devolveu mais '
              + 'material do que consumiu neste produto. Não é um índice de processo — fica fora '
              + 'da conta da discordância.">' + mfgFmt(d.real, 2)
              + '<div class="mfg-sub">devolução líq.</div></td>';
          }
          const ruim = d.desvio > 0;
          // A pior fábrica do produto fica marcada: é onde começa a conversa.
          const pior = d.desvio === piorDesvio && d.desvio > 0 && l.espalhamento > 0;
          // ⚠️ O m² de CADA unidade vai junto, e não é enfeite: um desvio de
          // +138% em 67 m² é ruído de uma OP só, e um de +9% em 8.000 m² é
          // dinheiro de verdade. Sem o volume ao lado, os dois se parecem na
          // tela -- e o de cima é o que rouba a atenção.
          return '<td class="mfg-num' + (pior ? ' mfg-celula-pior' : '') + '">'
            + mfgFmt(d.real, 2)
            + '<div class="mfg-sub ' + (ruim ? 'mfg-bad' : 'mfg-good') + '">'
            + (d.desvio > 0 ? '+' : '') + mfgFmt(d.desvio, 1) + '%</div>'
            + '<div class="mfg-sub">teór. ' + mfgFmt(d.teorico, 2) + '</div>'
            + '<div class="mfg-sub">' + mfgFmt(d.m2, 0) + ' m²</div></td>';
        }).join('')
      + '<td class="mfg-num"><b>' + mfgFmt(l.espalhamento, 1) + ' pp</b></td>'
      + '</tr>';
  }).join('');

  alvo.innerHTML =
    '<div class="modal-text" style="margin-bottom:10px; font-size:12.5px;">'
    + 'Índice = <b>quanto de material por unidade de produto</b> ('
    + escapeHtml(indice.unidade) + '). O <b>teórico vem do cadastro e é o mesmo para todas as '
    + 'fábricas</b> — quem muda é o realizado. A coluna <b>Discordância</b> é a distância, em '
    + 'pontos percentuais, entre a unidade que mais gasta e a que menos gasta <i>no mesmo '
    + 'produto</i>: é ela que aponta onde há índice errado ou processo fora de controle, e a '
    + 'lista começa por ela.'
    + (mfgFiltros.indice.indexOf('quimico') === 0
        ? '<br>⚠️ <b>PM × RB não explica diferença no químico:</b> a largura útil entra e sai da '
          + 'fórmula (m² ÷ largura × largura), então a máquina não altera o teórico. Se duas '
          + 'fábricas divergem aqui, a causa é a densidade realizada, o cadastro do produto, ou '
          + 'o m² apontado a menos.'
        : '')
    + ((mfgFiltros.indice === 'quimico' && mfgFiltros.compararPor !== 'item')
        ? '<br>⚠️ <b>Em kg/m² o número absoluto depende da ESPESSURA:</b> o químico enche o '
          + 'núcleo, então um painel de 100 mm gasta mais por m² que uma isotelha de 30 mm sem '
          + 'nenhum desperdício. Agrupado por classe, espessuras diferentes entram no mesmo '
          + 'número. <b>O desvio e a discordância continuam válidos</b> (o divisor se cancela) — '
          + 'para comparar o valor absoluto, agrupe por <b>código do item</b> ou use a densidade.'
        : '')
    + '</div>'
    + '<div class="scroll-area"><table class="data-table mfg-tabela-comparar"><thead>' + cab
    + '</thead><tbody>' + corpo + '</tbody></table></div>'
    + '<div class="mfg-sub" style="margin-top:8px;">'
    + (linhas.length > MFG_TETO_LINHAS
        ? 'Mostrando ' + MFG_TETO_LINHAS + ' de ' + linhas.length + ' — use os filtros para estreitar.'
        : linhas.length + ' ' + mfgRotuloGrupoPlural() + ' feito(s) em mais de uma unidade.')
    // O corte por volume nunca é silencioso.
    + (escondidasPorVolume
        ? ' <b class="mfg-bad">' + escondidasPorVolume + ' fora da lista por terem menos de '
          + mfgFmt(piso, 0) + ' m² nas fábricas</b> — baixe o piso para vê-las.'
        : '')
    + '</div>';
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
  'OP', 'Unidade', 'Máquina', 'Data', 'Sistema químico', 'Código do poliol',
  'Classe', 'Item', 'Descrição', 'UM',
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
    l.op, l.est, l.maquina, l.data, l.fornecedor, l.poliolCodigo,
    l.classe, l.item, l.descricao || '', l.um || '',
    l.m2, l.espessura * 1000, l.largura, l.densidadeTeorica, l.densidadeRealizada,
    l.grupos.POLIOL || 0, l.grupos.MDI || 0, l.grupos.CATALIZADOR || 0, l.grupos.PENTANO || 0, l.adesivo,
    l.teorico, l.reportado, l.diferenca, l.percentual,
    l.acoTeorico, l.acoReal, l.filmeTeorico, l.filmeReal, l.aluTeorico, l.aluReal,
    l.diferencaMaterial, l.percentualMaterial,
    l.rsQuimico, l.rsMaterial, l.rsTotal,
    MFG_SITUACOES[mfgSituacao(l, tol)].rotulo, mfgOndeDiverge(l, tol), l.motivos.join('; ')
  ]);
}

// A aba Comparar tem forma própria (uma coluna por unidade), então exporta a
// própria comparação. As abas de OP exportam a planilha completa -- ali o
// recorte é do que se OLHA, e quem leva para o Excel vai querer as duas
// dimensões na mesma linha para montar a tabela dinâmica dele.
// A aba Comparar tem duas formas — panorama de todas, ou confronto de duas —, e
// a exportação segue a que está na tela. Exportar sempre o panorama entregaria
// uma planilha diferente do que a pessoa está olhando.
function mfgExportacaoDuelo() {
  const indice = MFG_INDICES[mfgFiltros.indice];
  const porItem = mfgFiltros.compararPor === 'item';
  const A = mfgFiltros.unidadeA, B = mfgFiltros.unidadeB;
  const piso = mfgFiltros.m2Minimo || 0;
  const rotA = rotuloUnidade(A) || A, rotB = rotuloUnidade(B) || B;

  // Um teórico POR LADO: agrupado por classe/fornecedor eles diferem (mix).
  const cabecalho = [mfgRotuloGrupo(),
    rotA + ' teórico', rotA + ' realizado', rotA + ' desvio %', rotA + ' m²',
    rotB + ' teórico', rotB + ' realizado', rotB + ' desvio %', rotB + ' m²',
    'Diferença A − B (pp)'];

  const linhas = mfgAgruparIndices(porItem).map(g => {
    const a = g.unidades[A], b = g.unidades[B];
    if (!a || !b || !indice.temBase(a) || !indice.temBase(b)) return null;
    if (a.m2 < piso || b.m2 < piso) return null;
    const ia = indice.real(a), ib = indice.real(b);
    if (ia < 0 || ib < 0) return null;   // devolução líquida, ver mfgRenderDuelo
    const ta = indice.teor(a), tb = indice.teor(b);
    const da = ta ? ((ia - ta) / ta) * 100 : 0;
    const db = tb ? ((ib - tb) / tb) * 100 : 0;
    return [g.rotulo, ta, ia, da, a.m2, tb, ib, db, b.m2, da - db];
  }).filter(Boolean).sort((x, y) => Math.abs(y[9]) - Math.abs(x[9]));

  return { cabecalho, linhas, aba: (A + ' x ' + B).slice(0, 28) };
}

function mfgExportacaoComparar() {
  const indice = MFG_INDICES[mfgFiltros.indice];
  const porItem = mfgFiltros.compararPor === 'item';
  const grupos = mfgAgruparIndices(porItem);
  const ests = [...new Set(grupos.flatMap(g => Object.keys(g.unidades)))].sort();
  const maquinaDe = {};
  grupos.forEach(g => Object.values(g.unidades).forEach(a => { maquinaDe[a.est] = a.maquina; }));

  const cabecalho = [mfgRotuloGrupo(), 'm²', 'Unidade do índice']
    .concat(ests.flatMap(e => [
      (rotuloUnidade(e) || e) + ' (' + (maquinaDe[e] || '') + ') teórico',
      (rotuloUnidade(e) || e) + ' realizado',
      (rotuloUnidade(e) || e) + ' desvio %'
    ]))
    .concat(['Discordância (pp)']);

  const linhas = grupos.map(g => {
    const presentes = ests.filter(e => g.unidades[e] && indice.temBase(g.unidades[e]));
    if (presentes.length < 2) return null;
    const dv = {};
    presentes.forEach(e => {
      const a = g.unidades[e], t = indice.teor(a), r = indice.real(a);
      dv[e] = { t, r, d: t ? ((r - t) / t) * 100 : 0 };
    });
    const pcts = presentes.map(e => dv[e].d);
    return [g.rotulo,
            presentes.reduce((s, e) => s + g.unidades[e].m2, 0),
            indice.unidade]
      .concat(ests.flatMap(e => dv[e] ? [dv[e].t, dv[e].r, dv[e].d] : ['', '', '']))
      .concat([Math.max(...pcts) - Math.min(...pcts)]);
  }).filter(Boolean).sort((a, b) => b[b.length - 1] - a[a.length - 1]);

  return { cabecalho, linhas, aba: 'Comparar ' + indice.rotulo.slice(0, 20) };
}

async function mfgExportar(formato) {
  const comparando = mfgAba === 'comparar';
  const A = mfgFiltros.unidadeA, B = mfgFiltros.unidadeB;
  const duelo = comparando && A && B && A !== B;
  const pacote = duelo ? mfgExportacaoDuelo()
    : comparando ? mfgExportacaoComparar()
    : { cabecalho: MFG_EXPORT_CABECALHO, linhas: mfgLinhasExportacao(), aba: 'Análise MFG' };
  if (!pacote.linhas.length) {
    alert(duelo
      ? 'Nenhum produto foi feito nas duas unidades neste recorte — não há confronto para exportar.'
      : comparando
      ? 'Nenhum produto foi feito em mais de uma unidade neste recorte — não há comparação para exportar.'
      : 'Nenhuma OP para exportar — confira os filtros.');
    return;
  }
  const nome = (duelo ? 'confronto-' + A + '-x-' + B + '-'
    : comparando ? 'comparar-indices-mfg-' : 'analise-mfg-')
    + new Date().toISOString().slice(0, 10);
  if (formato === 'csv') exportarCsvGenerico(pacote.cabecalho, pacote.linhas, nome);
  else await exportarXlsxGenerico(pacote.cabecalho, pacote.linhas, pacote.aba, nome);
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
      ? 'A tabela do histórico ainda não existe. Rode sql/fase50-analise-mfg.sql no painel do Supabase. '
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
    // Histórico é cortesia: o fase50 pode não ter rodado ainda, e a tela
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

// Diz se já há cadastro guardado — é o que decide se as duas planilhas soltas
// bastam. Sem esta linha, a pessoa clicaria no botão e só descobriria no erro.
function mfgMostrarCadastro() {
  const alvo = document.getElementById('mfgCadastroInfo');
  if (!alvo) return;
  const c = mfgLerCadastroGuardado();
  if (!c) {
    alvo.innerHTML = '<br><b class="mfg-bad">Ainda não há cadastro guardado neste navegador</b>'
      + ' — comece pelo arquivo completo do MFG.';
    return;
  }
  const quantos = Object.keys((c.base && c.base.produtos) || {}).length;
  alvo.innerHTML = '<br><b class="mfg-good">✓ Cadastro guardado</b> — ' + quantos
    + ' produto(s), de ' + escapeHtml(c.arquivo || 'arquivo anterior') + ', em '
    + new Date(c.quando).toLocaleDateString('pt-BR') + '.';
}

function carregarMfg() {
  mfgMostrarCadastro();
  mfgRender();
  carregarHistoricoMfg();
}

// ---- Ligações ---------------------------------------------------------------
document.getElementById('mfgArquivoInput').addEventListener('change', (e) => {
  mfgAbrirArquivos(e.target.files);
  e.target.value = '';   // permite reescolher o MESMO arquivo depois de corrigir
});
document.getElementById('mfgPlanilhasInput').addEventListener('change', (e) => {
  mfgAbrirArquivos(e.target.files);
  e.target.value = '';
});
document.getElementById('mfgFiltroEst').addEventListener('change', (e) => {
  mfgFiltros.est = e.target.value; mfgRender();
});
document.getElementById('mfgFiltroClasse').addEventListener('change', (e) => {
  mfgFiltros.classe = e.target.value; mfgRender();
});
document.getElementById('mfgFiltroFornecedor').addEventListener('change', (e) => {
  mfgFiltros.fornecedor = e.target.value; mfgRender();
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
// ---- Abas ------------------------------------------------------------------
// Mesmo padrao `data-*-aba` do Controle EXP. A aba so troca o que se OLHA -- os
// filtros (unidade, classe, busca, tolerancia) continuam valendo em todas.
function mfgTrocarAba(aba) {
  mfgAba = aba;
  document.querySelectorAll('#mfgAbas [data-mfg-aba]').forEach(b => {
    b.className = 'btn' + (b.dataset.mfgAba === aba ? ' btn-primary' : '');
  });
  // Os controles do comparador so fazem sentido na aba dele.
  document.getElementById('mfgCompararControles').style.display = aba === 'comparar' ? '' : 'none';
  document.getElementById('mfgCompararControles2').style.display = aba === 'comparar' ? '' : 'none';
  // Situacao e tolerancia nao se aplicam ao comparador nem a lista de orfas.
  document.getElementById('mfgFiltroSituacao').style.display =
    (aba === 'comparar' || aba === 'semop') ? 'none' : '';
  mfgRender();
}

document.getElementById('mfgAbas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mfg-aba]');
  if (b) mfgTrocarAba(b.dataset.mfgAba);
});
document.getElementById('mfgIndice').addEventListener('change', (e) => {
  mfgFiltros.indice = e.target.value; mfgRender();
});
document.getElementById('mfgCompararPor').addEventListener('change', (e) => {
  mfgFiltros.compararPor = e.target.value; mfgRender();
});
document.getElementById('mfgUnidadeA').addEventListener('change', (e) => {
  mfgFiltros.unidadeA = e.target.value; mfgRender();
});
document.getElementById('mfgUnidadeB').addEventListener('change', (e) => {
  mfgFiltros.unidadeB = e.target.value; mfgRender();
});
// Troca os dois lados de lugar. A coluna "A − B" muda de sinal, e é isso que
// se quer quando a fábrica que interessa está do lado errado da conta.
document.getElementById('mfgInverterBtn').addEventListener('click', () => {
  const a = mfgFiltros.unidadeA;
  mfgFiltros.unidadeA = mfgFiltros.unidadeB;
  mfgFiltros.unidadeB = a;
  document.getElementById('mfgUnidadeA').value = mfgFiltros.unidadeA;
  document.getElementById('mfgUnidadeB').value = mfgFiltros.unidadeB;
  mfgRender();
});
document.getElementById('mfgM2Minimo').addEventListener('input', (e) => {
  const v = parseFloat(String(e.target.value).replace(',', '.'));
  mfgFiltros.m2Minimo = isFinite(v) && v > 0 ? v : 0;
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
// Clicar numa linha do quadro comparativo aponta a tela para aquela unidade.
document.getElementById('mfgPorUnidade').addEventListener('click', (e) => {
  const tr = e.target.closest('.mfg-linha-unidade');
  if (!tr) return;
  mfgFiltros.est = tr.dataset.est || '';
  document.getElementById('mfgFiltroEst').value = mfgFiltros.est;
  mfgRender();
});
document.getElementById('mfgDetalheModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('mfgDetalheModal')) mfgFecharDetalhe();
});
