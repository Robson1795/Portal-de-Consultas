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
//     sb.rpc('senha_contagem_confere', { uni, tentativa })  -->  true | false
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

