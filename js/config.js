// Portal de Estoque Kingspan Isoeste — configuracao e cliente do Supabase
// Extraido do index.html na Fase 2a (03/09/2026), sem alteracao de conteudo.
//
// Script classico, nao modulo: o escopo lexical global e compartilhado entre
// os arquivos, e a ordem de carregamento no fim do index.html importa.

// ---- Configuração do Supabase ----
const SUPABASE_URL = "https://muhfzfdynbpzdjconpio.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11aGZ6ZmR5bmJwemRqY29ucGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NDcyNDYsImV4cCI6MjEwMzQyMzI0Nn0.IZ803oFvTdZvPGhmpcNAHFkV8oQ2XOy720D-YtPWYow";
const EDIT_PIN = "2026";
const PINS_CONTAGEM = { '106': 'INV106', '101': 'INV101', '105': 'INV105' };
const ADMIN_EMAIL = "robson_alves1995@live.com";
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

