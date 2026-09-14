// Portal de Estoque Kingspan Isoeste — o celular vira leitor (14/09/2026)
//
// Quando a etiqueta de reserva de aço foi feita (seção 23), o QR foi recusado
// com um motivo escrito: *"não existe leitor no portal nem rota de link profundo
// que abra uma reserva a partir de um código. Um QR que ninguém escaneia é tinta
// gasta e uma promessa falsa na etiqueta. Se um dia a câmera do módulo de OCR
// virar leitor de reserva..."*. Este arquivo é esse dia.
//
// ⚠️ SEM BIBLIOTECA. `BarcodeDetector` é uma API **nativa do navegador** (Chrome
// no Android, ChromeOS e macOS) -- zero dependência, zero CDN, o que combina com
// o "sem etapa de build" do projeto. O preço é que **nem todo navegador tem**,
// e por isso o caminho de digitar à mão não é enfeite: é o caminho de sempre em
// metade dos computadores.
//
// O que ele faz com o código lido é de propósito a coisa mais simples possível:
// **joga na busca global**. O leitor não precisa saber se aquilo é um item, um
// lote ou um endereço -- quem sabe é a busca, que já procura em todas as telas.

let scannerStream = null;
let scannerTimer = null;
let scannerDetector = null;

function scannerDisponivel() {
  return typeof window !== 'undefined'
    && 'BarcodeDetector' in window
    && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function abrirScanner() {
  document.getElementById('scannerModal').classList.add('open');
  document.getElementById('scannerManualInput').value = '';
  iniciarCameraScanner();
}

function fecharScanner() {
  document.getElementById('scannerModal').classList.remove('open');
  pararCameraScanner();
}

// ⚠️ Parar a câmera de VERDADE ao fechar. Um `<video>` escondido com a trilha
// ainda aberta mantém a luzinha de gravação acesa e come bateria do celular do
// conferente -- que é exatamente a máquina onde esta tela existe para rodar.
function pararCameraScanner() {
  if (scannerTimer) { clearInterval(scannerTimer); scannerTimer = null; }
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  const video = document.getElementById('scannerVideo');
  if (video) video.srcObject = null;
}

async function iniciarCameraScanner() {
  const aviso = document.getElementById('scannerAviso');
  const area = document.getElementById('scannerCameraArea');

  if (!scannerDisponivel()) {
    area.style.display = 'none';
    aviso.className = 'busca-vazio';
    aviso.innerHTML = 'Este navegador não sabe ler código de barras.'
      + '<br><span style="font-size:12px;">Funciona no <b>Chrome do celular</b>. '
      + 'Por aqui, digite o código no campo abaixo — dá no mesmo.</span>';
    document.getElementById('scannerManualInput').focus();
    return;
  }

  area.style.display = 'block';
  aviso.className = 'busca-vazio';
  aviso.textContent = 'Abrindo a câmera...';

  try {
    // `environment` = câmera de trás. Sem isto o celular abre a frontal, que é
    // inútil para ler etiqueta colada numa bobina.
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false
    });
  } catch (e) {
    area.style.display = 'none';
    aviso.className = 'busca-erro';
    aviso.textContent = 'Não consegui abrir a câmera (' + e.name + '). '
      + 'Se você recusou a permissão, libere nas configurações do navegador — ou digite o código abaixo.';
    return;
  }

  // ⚠️ Daqui pra baixo tudo vai dentro de um try: `srcObject` recusa um valor
  // que não seja MediaStream, `play()` pode ser bloqueado pela política de
  // autoplay, e o `BarcodeDetector` recusa formato que aquele navegador não
  // suporta. Qualquer um desses estourava como **rejeição não tratada** -- e a
  // tela ficava parada em "Abrindo a câmera..." sem dizer nada, com a câmera
  // ligada por trás. Falhar aqui tem de terminar em mensagem e câmera desligada.
  // Fora do try de propósito: o laço de detecção lá embaixo usa esta referência.
  const video = document.getElementById('scannerVideo');
  try {
    video.srcObject = scannerStream;
    await video.play().catch(() => {});
    aviso.textContent = 'Aponte para o código.';

    if (!scannerDetector) {
      // Os formatos que aparecem de verdade num galpão: QR (o que o portal
      // imprime) e os de barras lineares das etiquetas de fornecedor.
      scannerDetector = new window.BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf']
      });
    }
  } catch (e) {
    pararCameraScanner();
    area.style.display = 'none';
    aviso.className = 'busca-erro';
    aviso.textContent = 'A câmera abriu mas não deu pra usar (' + e.message + '). Digite o código abaixo.';
    return;
  }

  // 250 ms: rápido o bastante para parecer instantâneo na mão e devagar o
  // bastante para não fritar o processador do celular com detecção contínua.
  scannerTimer = setInterval(async () => {
    if (!scannerStream) return;
    try {
      const achados = await scannerDetector.detect(video);
      if (achados && achados.length) usarCodigoLido(achados[0].rawValue);
    } catch (e) {
      // Um quadro que falhou não é motivo para desistir da leitura inteira.
    }
  }, 250);
}

// ---- O que fazer com o que foi lido ---------------------------------------
function usarCodigoLido(texto) {
  const valor = String(texto || '').trim();
  if (!valor) return;
  pararCameraScanner();

  // Vibra: no galpão, com luva e barulho, o retorno tátil é o que diz "leu"
  // sem a pessoa precisar olhar a tela de perto.
  if (navigator.vibrate) navigator.vibrate(60);

  fecharScanner();
  // ⚠️ Vai para a BUSCA GLOBAL, e não para uma tela específica. O leitor não
  // tem como saber se aquilo é item, lote ou endereço -- e a busca já procura
  // em todas as telas de uma vez (seção 26). Uma rota especial por tipo de
  // código seria uma segunda regra para manter em sincronia com aquela.
  abrirBuscaGlobal(valor);
}

// ---- Ligações --------------------------------------------------------------
document.getElementById('scannerBtn').addEventListener('click', abrirScanner);
document.getElementById('scannerFechar').addEventListener('click', fecharScanner);
document.getElementById('scannerModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('scannerModal')) fecharScanner();
});
document.getElementById('scannerManualBtn').addEventListener('click', () => {
  usarCodigoLido(document.getElementById('scannerManualInput').value);
});
document.getElementById('scannerManualInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') usarCodigoLido(e.target.value);
});

// ---- QR nas etiquetas ------------------------------------------------------
//
// Agora que existe leitor, o QR deixou de ser decoração e passou a valer -- é a
// virada que o comentário da etiqueta de reserva previa.
//
// ⚠️ O QR carrega **só o código do item**, e nada de URL nem de id interno.
// Duas razões: quem escaneia quer saber "que material é este e onde ele está",
// que é exatamente o que a busca global responde com o código; e um id interno
// numa etiqueta impressa vira lixo no dia em que a tabela mudar, enquanto o
// código do item é a linguagem que o galpão inteiro já fala.
async function qrDataURL(texto) {
  await carregarBiblioteca('o gerador de QR', CDN_QRCODE, () => typeof qrcode !== 'undefined');
  // Tipo 0 = escolhe o menor tamanho que couber; 'M' = correção média, que
  // aguenta etiqueta amassada e suja sem inflar o desenho.
  const qr = qrcode(0, 'M');
  qr.addData(String(texto));
  qr.make();
  return qr.createDataURL(8, 0);
}
