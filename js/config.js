// Portal de Estoque Kingspan Isoeste — configuracao e cliente do Supabase
// Extraido do index.html na Fase 2a (03/09/2026), sem alteracao de conteudo.
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.

// ---- Configuração do Supabase ----
const SUPABASE_URL = "https://muhfzfdynbpzdjconpio.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11aGZ6ZmR5bmJwemRqY29ucGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NDcyNDYsImV4cCI6MjEwMzQyMzI0Nn0.IZ803oFvTdZvPGhmpcNAHFkV8oQ2XOy720D-YtPWYow";
const EDIT_PIN = "2026";
// Senha de contagem por unidade. Faltavam 103, 104, 107, 109 e 110 -- e como
// a comparacao e `valor === PINS_CONTAGEM[unidade]`, unidade ausente dava
// `undefined`, que nenhum texto digitado iguala: o modo contagem era
// INACESSIVEL nessas cinco, com qualquer senha. Foi o que travou a
// apresentacao na 104.
//
// Seguem o padrao INV + codigo. Nao sao segredo: estao neste arquivo, que
// qualquer pessoa baixa. Servem de trava contra clique acidental -- quem
// protege dado e o RLS. Passam para a aba admin na proxima entrega, e la a
// comparacao vai acontecer no banco, para a senha deixar de ser publica.
const PINS_CONTAGEM = {
  '101': 'INV101', '103': 'INV103', '104': 'INV104', '105': 'INV105',
  '106': 'INV106', '107': 'INV107', '109': 'INV109', '110': 'INV110'
};
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
// do portal (#2f9e5c) nao teria contraste suficiente ali.
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

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

