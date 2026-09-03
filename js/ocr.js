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
  const bobina = codigo ? bobinasData.find(r => r.item === codigo) : null;

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

// Procura um peso no texto (ex: "1.234,56 KG" ou "1234.56")
function acharPesoEtiqueta(texto) {
  const m = texto.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*KG/);
  if (m) return parseNum(m[1]);
  return null;
}

// Assim que o operador digita/confirma o código, busca automaticamente no sistema
document.getElementById('valBobinaId').addEventListener('change', () => {
  const codigo = document.getElementById('valBobinaId').value.trim();
  const info = document.getElementById('valSistemaInfo');
  if (!codigo) { info.style.display = 'none'; return; }

  const bobina = bobinasData.find(r => r.item === codigo);
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
  const peso_etiqueta = parseNum(document.getElementById('valPesoEtiqueta').value);
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

  msg.textContent = 'Salvando...';
  msg.className = 'status-msg';

  // ---- Regra de negócio: decide OK ou Divergente ----
  const pesoDivergente = peso_sistema !== null && Math.abs(peso_etiqueta - peso_sistema) > 0.01;
  const localDivergente = localizacao_sistema && localizacao_real !== localizacao_sistema;

  let status = 'OK';
  let alerta_sistema = false;
  let motivo_alerta = null;

  if (!marcadoComoOk && (pesoDivergente || localDivergente)) {
    status = 'Divergente';
    alerta_sistema = true;
    motivo_alerta = [pesoDivergente ? 'Peso divergente' : null, localDivergente ? 'Localização divergente' : null].filter(Boolean).join(' + ');
  } else if (!marcadoComoOk) {
    // Operador clicou em "Salvar divergência" mas os valores batem - registra mesmo assim como correção manual
    status = 'OK';
  }

  // Sobe a foto pro Storage (se o bucket "fotos-bobinas" existir)
  let foto_url = null;
  if (fotoEtiquetaAtual) {
    try {
      const nomeArquivo = `${bobina_id}_${Date.now()}.jpg`;
      const { error: upErr } = await sb.storage.from('fotos-bobinas').upload(nomeArquivo, fotoEtiquetaAtual);
      if (!upErr) foto_url = sb.storage.from('fotos-bobinas').getPublicUrl(nomeArquivo).data.publicUrl;
    } catch (e) { /* segue sem foto se o bucket ainda não existir */ }
  }

  try {
    await sb.from('contagem_bobinas_ocr').insert({
      bobina_id, peso_etiqueta, peso_sistema, localizacao_sistema, localizacao_real,
      status, alerta_sistema, motivo_alerta, foto_url, operador: nomeUsuarioAtual
    });

    if (alerta_sistema) dispararAlertaBobina(bobina_id, motivo_alerta);

    msg.textContent = `Registrado como ${status}!`;
    msg.className = 'status-msg status-ok';
    fotoEtiquetaAtual = null;
    setTimeout(() => document.getElementById('validacaoModal').classList.remove('open'), 1000);
  } catch (err) {
    msg.textContent = 'Erro ao salvar: ' + err.message;
    msg.className = 'status-msg status-err';
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

