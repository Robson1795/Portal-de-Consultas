// Portal de Estoque Kingspan Isoeste — configuracao e cliente do Supabase
// Extraido do index.html na Fase 2a (03/09/2026), sem alteracao de conteudo.
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.

// ---- Configuração do Supabase ----
const SUPABASE_URL = "https://muhfzfdynbpzdjconpio.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11aGZ6ZmR5bmJwemRqY29ucGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NDcyNDYsImV4cCI6MjEwMzQyMzI0Nn0.IZ803oFvTdZvPGhmpcNAHFkV8oQ2XOy720D-YtPWYow";
// As senhas de contagem e o PIN de edicao NAO ficam mais aqui.
//
// Moraram neste arquivo ate 04/09/2026, o que as tornava publicas: basta
// abrir o portal e apertar Ctrl+U. Agora vivem em `config_unidade`, legivel
// so para admin, e a comparacao acontece DENTRO do banco:
//
//     (as senhas de tela saíram em 11/09/2026 -- ver a seção 22 do CLAUDE.md)
//
// O navegador nunca recebe a senha. Quem as edita e o admin, na aba
// Configuracoes. Ver sql/fase7-senhas-na-aba-admin.sql.

const ADMIN_EMAIL = "robson_alves1995@live.com";

// Espelha o eh_super_admin() do banco. Quem manda e o Postgres; esta lista
// existe so para a TELA nao mostrar um cargo diferente do que o RLS aplica.
const SUPER_ADMINS = [
  "robson_alves1995@live.com",
  "r.alves1@portal.kingspanisoeste.local",
  "victor.dobner@portal.kingspanisoeste.local"
];
const DOMINIO_USUARIO = "portal.kingspanisoeste.local";

// Nome que aparece destacado em verde na saudacao do cabecalho.
// Verde claro porque o cabecalho tem fundo azul-escuro; o verde do resto
// do portal (var(--ok-borda)) nao teria contraste suficiente ali.
const NOME_DESTAQUE = "victor hugo";
const COR_NOME_DESTAQUE = "#6ee7a0";

// Se a pessoa digitar um e-mail de verdade (com @), usa como está.
// Se digitar só um nome de usuário, converte pra um formato que o Supabase aceita,
// sem nunca precisar de um e-mail real (evita qualquer limite de envio de e-mail).
function resolverIdentificador(valor) {
  const limpo = valor.trim();
  if (limpo.includes('@')) return limpo.toLowerCase();
  const usuario = limpo.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${usuario}@${DOMINIO_USUARIO}`;
}

// A biblioteca do Supabase vem de CDN, e no 4G do galpão ela às vezes não
// chega. Sem esta conferência, a linha de baixo estourava, o `const sb` nunca
// completava, e os oito arquivos seguintes morriam com "sb is not defined" —
// erro que não diz nada a quem está com o celular na mão no meio do corredor.
// Aconteceu em 08/09/2026, no celular.
if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="margin:16px; padding:16px 18px; border-radius:12px;'
    + ' background:var(--erro-fundo); border:1px solid var(--erro-borda); color:var(--erro-texto);'
    + ' font: 15px/1.45 -apple-system, \'Segoe UI\', Roboto, Arial, sans-serif;">'
    + '<b>Não foi possível abrir o portal.</b><br>'
    + 'A biblioteca de acesso ao banco não chegou — quase sempre é a conexão,'
    + ' não a sua conta. Recarregue a página; se não resolver, tente no Wi-Fi.'
    + '</div>');
  // Parar aqui é de propósito: sem cliente do banco, nenhuma tela funciona,
  // e seguir só produziria uma cascata de erros no console.
  throw new Error('A biblioteca do Supabase não carregou.');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Bibliotecas pesadas, carregadas só quando usadas ---------------------
//
// Até 08/09/2026 o index.html baixava as três bibliotecas em toda abertura de
// página, mesmo para quem só ia consultar um item:
//
//     supabase-js          213 KB   (esta sim é necessária sempre)
//     tesseract.js          65 KB   (só a leitura de etiqueta por foto usa)
//     xlsx.full.min.js     861 KB   (só o Exportar Excel do Controle EXP usa)
//
// Somavam 1,1 MB antes de a tela abrir. No celular do galpão isso não era só
// lentidão: bastava um dos pedidos falhar para o portal inteiro não subir.
// Agora as duas últimas são buscadas no momento do uso, uma vez por sessão.
const CDN_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const CDN_XLSX = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
// Só o "Compartilhar imagem" do modal de comparação usa -- ver js/estoque.js.
const CDN_HTML2CANVAS = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

const bibliotecasPedidas = {};

// `jaVeio` é uma função, não um valor: precisa ser reavaliada depois do
// download para confirmar que a biblioteca realmente se registrou no window.
function carregarBiblioteca(nome, url, jaVeio) {
  if (jaVeio()) return Promise.resolve();

  if (!bibliotecasPedidas[nome]) {
    bibliotecasPedidas[nome] = new Promise((pronto, falhou) => {
      const tag = document.createElement('script');
      tag.src = url;
      tag.onload = () => jaVeio()
        ? pronto()
        : falhou(new Error(nome + ' baixou incompleta. Recarregue a página.'));
      tag.onerror = () => {
        // Esquece a promessa recusada para que uma nova tentativa possa
        // baixar de novo, em vez de repetir a falha para sempre.
        delete bibliotecasPedidas[nome];
        falhou(new Error('Não foi possível baixar ' + nome + '. Confira a conexão.'));
      };
      document.head.appendChild(tag);
    });
  }
  return bibliotecasPedidas[nome];
}

