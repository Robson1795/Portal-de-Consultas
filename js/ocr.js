// Portal de Estoque Kingspan Isoeste — validacao de bobina por foto (OCR)
// Extraido do index.html na Fase 2a (03/09/2026), sem alteracao de conteudo.
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.

// ========================================================================
// CONTAGEM DE BOBINAS POR FOTO (validação manual por enquanto - OCR automático
// pode ser plugado depois, assim que houver uma conta de API de OCR configurada)
// ========================================================================
let fotoEtiquetaAtual = null;

document.getElementById('registrarFotoBtn').addEventListener('click', () => {
  document.getElementById('fotoEtiquetaInput').click();
});

document.getElementById('fotoEtiquetaInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  fotoEtiquetaAtual = file;
  abrirValidacaoBobina();
  e.target.value = ''; // permite tirar a mesma foto de novo depois, se precisar
});

function abrirValidacaoBobina() {
  document.getElementById('valBobinaId').value = '';
  document.getElementById('valPesoEtiqueta').value = '';
  document.getElementById('valLocalizacaoReal').value = '';
  document.getElementById('valSistemaInfo').style.display = 'none';
  document.getElementById('validacaoMsg').textContent = '';
  esconderVeredito();

  const preview = document.getElementById('validacaoFotoPreview');
  if (fotoEtiquetaAtual) {
    const url = URL.createObjectURL(fotoEtiquetaAtual);
    preview.innerHTML = `<img src="${url}" style="width:100%; max-height:180px; object-fit:contain; border-radius:8px; background:var(--row-alt);">`;
  } else {
    preview.innerHTML = '';
  }

  document.getElementById('validacaoModal').classList.add('open');

  if (fotoEtiquetaAtual) {
    lerEtiquetaComOcr(fotoEtiquetaAtual);
  } else {
    document.getElementById('valBobinaId').focus();
  }
}

// Lê o texto da etiqueta usando Tesseract.js (roda no próprio celular, sem custo).
// Sempre deixa os campos editáveis: se errar, o operador corrige na hora.
async function lerEtiquetaComOcr(file) {
  const msg = document.getElementById('validacaoMsg');
  msg.className = 'status-msg';
  msg.textContent = 'Lendo etiqueta... 0%';

  try {
    const { data } = await Tesseract.recognize(file, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          msg.textContent = `Lendo etiqueta... ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    const texto = (data.text || '').toUpperCase();
    const codigoEncontrado = acharCodigoBobina(texto);
    const pesoEncontrado = acharPesoEtiqueta(texto);

    if (codigoEncontrado) {
      document.getElementById('valBobinaId').value = codigoEncontrado;
      // dispara a busca automática no sistema
      document.getElementById('valBobinaId').dispatchEvent(new Event('change'));
    }
    if (pesoEncontrado !== null) {
      document.getElementById('valPesoEtiqueta').value = pesoEncontrado;
    }

    if (codigoEncontrado || pesoEncontrado !== null) {
      mostrarVeredito(codigoEncontrado, pesoEncontrado);
    } else {
      msg.textContent = 'Não consegui ler a etiqueta. Digite os dados manualmente.';
      msg.className = 'status-msg status-err';
      esconderVeredito();
      document.getElementById('valBobinaId').focus();
    }
  } catch (err) {
    msg.textContent = 'Erro na leitura. Digite os dados manualmente.';
    msg.className = 'status-msg status-err';
    esconderVeredito();
    document.getElementById('valBobinaId').focus();
  }
}

// Compara automaticamente o que foi lido da etiqueta com o que está no sistema
// e mostra um veredito grande e claro (OK ou divergente), sem o operador precisar conferir na mão.
function mostrarVeredito(codigo, pesoEtiqueta) {
  const box = document.getElementById('veredictoBox');
  const msg = document.getElementById('validacaoMsg');
  const candidatas = bobinasDoItem(codigo);

  // Vários lotes com o mesmo item: não há veredito automático possível.
  //
  // Antes daqui saía um `find()`, que devolvia a PRIMEIRA linha e comparava
  // o peso da etiqueta contra um lote escolhido a esmo — dizendo "TUDO OK"
  // ou "DIVERGENTE" sobre a bobina errada. Mostrar as opções e calar o
  // veredito é pior de usar e certo; o veredito estava confortável e errado.
  if (candidatas.length > 1) {
    const linhas = candidatas.map(b =>
      `<div>lote <b>${escapeHtml(b.lote || '—')}</b> · ${escapeHtml(b.localizacao || '—')} · <b>${escapeHtml(String(b.qtd_liquida))}</b> ${escapeHtml(b.um || '')}</div>`
    ).join('');
    box.style.display = 'block';
    box.style.background = '#fffbeb';
    box.style.borderColor = '#d97706';
    box.style.color = '#92400e';
    box.innerHTML = `<div style="font-size:20px; font-weight:800;">⚠️ ${candidatas.length} lotes deste item</div>
      <div style="font-size:13px; margin-top:4px;">Confira o lote na etiqueta e registre a divergência se o peso não bater:</div>
      <div style="font-size:12.5px; margin-top:6px; line-height:1.5;">${linhas}</div>`;
    msg.textContent = '';
    if (navigator.vibrate) navigator.vibrate(150);
    return;
  }

  const bobina = candidatas[0] || null;

  if (!bobina) {
    box.style.display = 'block';
    box.style.background = '#fee2e2';
    box.style.borderColor = '#b91c1c';
    box.style.color = '#991b1b';
    box.innerHTML = `<div style="font-size:20px; font-weight:800;">❌ Não encontrada no sistema</div>
      <div style="font-size:13px; margin-top:4px;">Código lido: <b>${escapeHtml(codigo || '—')}</b>. Confira o código ou registre como divergência.</div>`;
    msg.textContent = '';
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    return;
  }

  const pesoSistema = parseNum(bobina.qtd_liquida);
  const pesoDivergente = pesoEtiqueta !== null && Math.abs(pesoEtiqueta - pesoSistema) > 0.01;

  box.style.display = 'block';
  if (pesoEtiqueta === null) {
    // Achou a bobina, mas não conseguiu ler o peso da etiqueta
    box.style.background = '#fffbeb';
    box.style.borderColor = '#d97706';
    box.style.color = '#92400e';
    box.innerHTML = `<div style="font-size:20px; font-weight:800;">⚠️ Confira o peso</div>
      <div style="font-size:13px; margin-top:4px;">Bobina <b>${escapeHtml(bobina.item)}</b> encontrada. No sistema: <b>${escapeHtml(String(pesoSistema))}</b>. Não consegui ler o peso da etiqueta — digite abaixo.</div>`;
    if (navigator.vibrate) navigator.vibrate(150);
  } else if (!pesoDivergente) {
    box.style.background = '#f0fbf4';
    box.style.borderColor = '#2f9e5c';
    box.style.color = '#166534';
    box.innerHTML = `<div style="font-size:22px; font-weight:800;">✅ TUDO OK</div>
      <div style="font-size:13px; margin-top:4px;">Peso da etiqueta bate com o sistema (<b>${escapeHtml(String(pesoSistema))}</b>). Confirme a localização e toque em OK.</div>`;
    if (navigator.vibrate) navigator.vibrate(150);
    msg.textContent = '';
  } else {
    const dif = (pesoEtiqueta - pesoSistema).toFixed(2);
    box.style.background = '#fffbeb';
    box.style.borderColor = '#d97706';
    box.style.color = '#92400e';
    box.innerHTML = `<div style="font-size:22px; font-weight:800;">⚠️ DIVERGENTE</div>
      <div style="font-size:13px; margin-top:4px;">Etiqueta: <b>${escapeHtml(String(pesoEtiqueta))}</b> · Sistema: <b>${escapeHtml(String(pesoSistema))}</b> · Diferença: <b>${dif > 0 ? '+' : ''}${escapeHtml(dif)}</b></div>`;
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    msg.textContent = '';
  }
}

function esconderVeredito() {
  document.getElementById('veredictoBox').style.display = 'none';
}

// Procura o código da bobina no texto lido.
// Na etiqueta real, o código vem logo depois da palavra "PRODUTO" (normalmente na 1ª linha),
// então essa é a pista mais confiável — com alguns planos B caso o OCR erre a palavra.
function acharCodigoBobina(texto) {
  // 1) Procura "PRODUTO" e pega o código que vem logo depois
  //    (aceita ":" ou espaços no meio, e tolera o OCR ler "PRODUT0"/"PROOUTO")
  const aposProduto = texto.match(/PR[O0][D0][U|]?[T7][O0]\s*:?\s*([A-Z0-9\-\.\/]{3,})/);
  if (aposProduto) {
    const candidato = aposProduto[1].trim();
    // Confere se esse código existe mesmo na planilha carregada
    const naPlanilha = bobinasData.find(b => String(b.item).toUpperCase() === candidato);
    if (naPlanilha) return naPlanilha.item;
    return candidato; // devolve mesmo assim - o operador confere na tela
  }

  // 2) Plano B: procura qualquer código da planilha dentro do texto lido
  const limpo = texto.replace(/[^A-Z0-9]/g, ' ');
  for (const b of bobinasData) {
    const cod = String(b.item).toUpperCase();
    if (cod && limpo.includes(cod)) return b.item;
  }

  // 3) Plano C: pega a maior sequência de dígitos (5+) como palpite
  const numeros = limpo.match(/\b\d{5,}\b/g);
  if (numeros && numeros.length) return numeros.sort((a, b) => b.length - a.length)[0];
  return null;
}

// Converte o número lido da etiqueta em kg.
//
// Não usa `parseNum()`: aquele apaga TODO ponto antes de trocar a vírgula
// por ponto, então "1234.56" virava 123456 — cem vezes o peso real.
//
// Regras, na ordem:
//   tem ponto E vírgula  -> o último dos dois é o decimal ("4.820,50")
//   um separador só      -> se vier seguido de exatamente 3 dígitos, é
//                           milhar ("4.820"); senão é decimal ("4820,50")
//
// A ambiguidade que sobra é "820,500": em etiqueta brasileira quase sempre
// significa 820500 (milhar), e é assim que se lê aqui. Se aparecer etiqueta
// com três casas decimais, este é o ponto a rever.
function numeroDaEtiqueta(bruto) {
  let s = String(bruto).replace(/\s/g, '');
  const temPonto = s.includes('.');
  const temVirgula = s.includes(',');

  if (temPonto && temVirgula) {
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const milhar = decimal === '.' ? ',' : '.';
    s = s.split(milhar).join('');
    s = s.replace(decimal, '.');
  } else if (temPonto || temVirgula) {
    const sep = temPonto ? '.' : ',';
    const partes = s.split(sep);
    const ultima = partes[partes.length - 1];
    if (partes.length > 2 || ultima.length === 3) {
      s = partes.join('');            // milhar
    } else {
      s = partes.join('.');           // decimal
    }
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Procura o peso no texto lido.
//
// ⚠️ A versão anterior usava /(\d{1,3}(?:[.,]\d{3})*...)\s*KG/ e errava a
// maioria das bobinas reais: o `\d{1,3}` casava só três dígitos, então
// "4820 KG" era lido como 820, "12480 KG" como 480 e "4820,50 KG" como
// 820,50. Bobina pesa quatro ou cinco dígitos, e só a etiqueta que
// imprimisse "4.820" era lida certo — o veredito automático acusava
// divergência em quase toda leitura bem-sucedida do código.
function acharPesoEtiqueta(texto) {
  // 1) Prefere o número que vem depois de PESO/LÍQUIDO: é o peso da bobina,
  //    e não a largura, a espessura ou o número do lote.
  const aposPeso = texto.match(
    /P[E3][S5][O0][^0-9]{0,20}?(\d[\d.,\s]{0,14}\d|\d)\s*K[G6]\b/);
  if (aposPeso) return numeroDaEtiqueta(aposPeso[1]);

  // 2) Qualquer número seguido de KG.
  const comKg = texto.match(/(\d[\d.,\s]{0,14}\d|\d)\s*K[G6]\b/);
  if (comKg) return numeroDaEtiqueta(comKg[1]);

  return null;
}

// Todas as linhas da planilha com este item. A mesma bobina existe em
// vários lotes e localizações, então isto costuma devolver mais de uma —
// e é por isso que o veredito automático não pode usar a primeira.
function bobinasDoItem(codigo) {
  if (!codigo) return [];
  const alvo = String(codigo).toUpperCase();
  return bobinasData.filter(r => String(r.item).toUpperCase() === alvo);
}

// Assim que o operador digita/confirma o código, busca automaticamente no sistema
document.getElementById('valBobinaId').addEventListener('change', () => {
  const codigo = document.getElementById('valBobinaId').value.trim();
  const info = document.getElementById('valSistemaInfo');
  if (!codigo) { info.style.display = 'none'; return; }

  const candidatas = bobinasDoItem(codigo);

  // Mais de um lote: não se elege um. Sem peso de sistema definido, o
  // registro sai com `peso_sistema` nulo em vez de com o número do lote errado.
  if (candidatas.length > 1) {
    document.getElementById('valPesoSistemaTexto').textContent =
      candidatas.length + ' lotes — confira a etiqueta';
    document.getElementById('valLocalizacaoSistemaTexto').textContent =
      candidatas.map(b => b.localizacao || '—').join(' / ');
    info.style.display = 'block';
    info.dataset.pesoSistema = '';
    info.dataset.localizacaoSistema = '';
    return;
  }

  const bobina = candidatas[0];
  if (bobina) {
    document.getElementById('valPesoSistemaTexto').textContent = bobina.qtd_liquida;
    document.getElementById('valLocalizacaoSistemaTexto').textContent = bobina.localizacao || '-';
    document.getElementById('valLocalizacaoReal').value = bobina.localizacao || '';
    info.style.display = 'block';
    info.dataset.pesoSistema = bobina.qtd_liquida;
    info.dataset.localizacaoSistema = bobina.localizacao || '';
  } else {
    document.getElementById('valPesoSistemaTexto').textContent = 'não encontrado';
    document.getElementById('valLocalizacaoSistemaTexto').textContent = 'não encontrado';
    info.style.display = 'block';
    info.dataset.pesoSistema = '';
    info.dataset.localizacaoSistema = '';
  }
});

document.getElementById('confirmarOkBtn').addEventListener('click', () => salvarValidacaoBobina(true));
document.getElementById('salvarDivergenteBtn').addEventListener('click', () => salvarValidacaoBobina(false));
document.getElementById('validacaoCloseBtn').addEventListener('click', () => {
  document.getElementById('validacaoModal').classList.remove('open');
});
document.getElementById('validacaoModal').addEventListener('click', (e) => {
  if (e.target.id === 'validacaoModal') e.currentTarget.classList.remove('open');
});

async function salvarValidacaoBobina(marcadoComoOk) {
  const bobina_id = document.getElementById('valBobinaId').value.trim();
  // Campo vazio é "não informado", não zero. Antes passava por `parseNum()`,
  // que devolve 0 para string vazia: o registro saía com peso 0 kg gravado
  // como fato, e a comparação acusava divergência de 0 contra 4820.
  const pesoBruto = document.getElementById('valPesoEtiqueta').value.trim();
  const peso_etiqueta = pesoBruto ? numeroDaEtiqueta(pesoBruto) : null;
  const localizacao_real = document.getElementById('valLocalizacaoReal').value.trim();
  const info = document.getElementById('valSistemaInfo');
  const peso_sistema = info.dataset.pesoSistema ? parseNum(info.dataset.pesoSistema) : null;
  const localizacao_sistema = info.dataset.localizacaoSistema || null;
  const msg = document.getElementById('validacaoMsg');

  if (!bobina_id) {
    msg.textContent = 'Digite o código da bobina.';
    msg.className = 'status-msg status-err';
    return;
  }

  // Confirmar OK sem peso lido não registra nada de útil: seria um "confere"
  // sobre uma comparação que não aconteceu.
  if (marcadoComoOk && peso_etiqueta === null) {
    msg.textContent = 'Informe o peso da etiqueta antes de confirmar OK.';
    msg.className = 'status-msg status-err';
    document.getElementById('valPesoEtiqueta').focus();
    return;
  }

  msg.textContent = 'Salvando...';
  msg.className = 'status-msg';

  // ---- Regra de negócio: decide OK ou Divergente ----
  // A comparação só existe quando os dois números existem.
  const pesoDivergente = peso_etiqueta !== null && peso_sistema !== null
    && Math.abs(peso_etiqueta - peso_sistema) > 0.01;
  const localDivergente = !!localizacao_sistema && localizacao_real !== localizacao_sistema;

  let status = 'OK';
  let alerta_sistema = false;
  const motivos = [];

  if (pesoDivergente) motivos.push('Peso divergente');
  if (localDivergente) motivos.push('Localização divergente');
  if (peso_etiqueta === null) motivos.push('Peso da etiqueta não informado');
  if (peso_sistema === null) motivos.push('Sem peso de sistema: item com vários lotes ou fora da planilha');

  if (!marcadoComoOk) {
    // "Salvar divergência" sem motivo nenhum é correção manual: vale como OK.
    if (motivos.length) { status = 'Divergente'; alerta_sistema = true; }
  } else if (pesoDivergente || localDivergente) {
    // Confirmou OK apesar de divergir. Fica registrado como decisão de quem
    // estava lá, não como se os números batessem — antes os dois casos saíam
    // gravados igual, e o registro não sabia distinguir um do outro.
    status = 'OK com ressalva';
    alerta_sistema = true;
    motivos.push('Confirmado pelo operador');
  }
  const motivo_alerta = motivos.length ? motivos.join(' + ') : null;

  // ---- Foto da etiqueta ----
  // Em 04/09/2026 o bucket `fotos-bobinas` não existe, e toda foto é
  // descartada. Isso agora aparece na tela: a foto é a prova da conferência,
  // e perdê-la em silêncio é o pior dos mundos.
  let foto_url = null;
  let avisoFoto = '';
  if (fotoEtiquetaAtual) {
    const ext = (fotoEtiquetaAtual.type || '').includes('png') ? 'png' : 'jpg';
    const nomeArquivo = `${bobina_id}_${Date.now()}.${ext}`;
    const up = await sb.storage.from('fotos-bobinas').upload(nomeArquivo, fotoEtiquetaAtual);
    if (up.error) {
      avisoFoto = ' A foto NÃO foi guardada: ' + up.error.message;
      console.error('Falha ao subir a foto da etiqueta:', up.error.message);
    } else {
      foto_url = sb.storage.from('fotos-bobinas').getPublicUrl(nomeArquivo).data.publicUrl;
    }
  }

  // O cliente do Supabase devolve { error }, não lança: o try/catch que
  // existia aqui nunca disparava, e uma recusa do banco aparecia como
  // "Registrado!" em verde, com o modal fechando em seguida. Mesmo defeito
  // do item A1 da auditoria, que já havia sido corrigido nos outros módulos
  // e passou batido neste.
  const { error } = await sb.from('contagem_bobinas_ocr').insert({
    bobina_id, peso_etiqueta, peso_sistema, localizacao_sistema, localizacao_real,
    status, alerta_sistema, motivo_alerta, foto_url, operador: nomeUsuarioAtual
  });

  if (error) {
    msg.textContent = 'NÃO SALVOU: ' + error.message + ' — registre no papel e avise o responsável.';
    msg.className = 'status-msg status-err';
    console.error('Falha ao gravar a validação por foto:', error.message);
    return;
  }

  if (alerta_sistema) dispararAlertaBobina(bobina_id, motivo_alerta);

  msg.textContent = `Registrado como ${status}.` + avisoFoto;
  msg.className = avisoFoto ? 'status-msg status-err' : 'status-msg status-ok';
  fotoEtiquetaAtual = null;
  // Com aviso de foto perdida, o modal fica aberto: a pessoa precisa ler.
  if (!avisoFoto) {
    setTimeout(() => document.getElementById('validacaoModal').classList.remove('open'), 1000);
  }
}

// ---- Alertas em tempo real pro supervisor ----
function dispararAlertaBobina(bobinaId, motivo) {
  sb.channel('alertas-bobinas').send({
    type: 'broadcast', event: 'divergencia',
    payload: { bobina_id: bobinaId, motivo, quando: new Date().toISOString(), quem: nomeUsuarioAtual }
  });
}

sb.channel('alertas-bobinas')
  .on('broadcast', { event: 'divergencia' }, (msg) => {
    const banner = document.getElementById('alertaBobinaBanner');
    banner.textContent = `⚠️ Divergência na bobina ${msg.payload.bobina_id}: ${msg.payload.motivo} (registrado por ${msg.payload.quem})`;
    banner.style.display = 'block';
    setTimeout(() => { banner.style.display = 'none'; }, 15000);
  })
  .subscribe();

// ---- Exportação CSV ----
document.getElementById('exportarOcrBtn').addEventListener('click', async () => {
  const { data, error } = await sb.from('contagem_bobinas_ocr').select('*').order('criado_em', { ascending: false });
  if (error || !data || data.length === 0) {
    alert('Nenhum registro de contagem por foto encontrado ainda.');
    return;
  }
  const cabecalho = 'ID da Bobina,Peso Etiqueta,Peso Sistema,Localizacao Sistema,Localizacao Real,Status,Alerta Sistema,Operador,Data\n';
  const linhas = data.map(r => [
    r.bobina_id, r.peso_etiqueta, r.peso_sistema, r.localizacao_sistema, r.localizacao_real,
    r.status, r.alerta_sistema ? `Sim - ${r.motivo_alerta}` : 'Não', r.operador,
    new Date(r.criado_em).toLocaleString('pt-BR')
  ].map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + cabecalho + linhas], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `contagem_bobinas_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
});

