/**
 * =====================================================================
 *  MAKLAYN — Configuração central
 *  Lê variáveis de ambiente com valores padrão seguros para desenvolvimento.
 * =====================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(__dirname, '..');

/* --- Carregador de .env nativo (sem dependência externa) ------------ */
function carregarEnv() {
  const arquivo = path.join(RAIZ, '.env');
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const valor = m[2].replace(/^["']|["']$/g, '').trim();
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}
carregarEnv();

const bool = (v, padrao = false) =>
  v === undefined ? padrao : ['1', 'true', 'sim', 'yes', 'on'].includes(String(v).toLowerCase());

/* --- Cliente de banco: mysql (padrão, conforme especificação) ou sqlite --- */
const cliente = String(process.env.DB_CLIENT || 'mysql').toLowerCase();

export const config = {
  app: {
    nome: 'Maklayn',
    versao: '1.0.0',
    descricao: 'Assistente de Inteligência Artificial Multidisciplinar',
    ambiente: process.env.NODE_ENV || 'development',
    porta: Number(process.env.PORT || 3000),
    host: process.env.HOST || '0.0.0.0'
  },

  db: {
    cliente,
    arquivoSqlite: process.env.SQLITE_FILE || path.join(RAIZ, 'db', 'maklayn.sqlite'),
    mysql: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'maklayn',
      password: process.env.DB_PASSWORD || 'maklayn',
      database: process.env.DB_NAME || 'maklayn',
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_POOL || 10),
      timezone: 'Z'
    }
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'maklayn-dev-secret-troque-em-producao',
    jwtExpiraSegundos: Number(process.env.JWT_EXPIRA || 60 * 60 * 8), // 8h
    cookieNome: 'maklayn_token',
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
      // login de demonstração quando não há credenciais Google configuradas
      permitirDemo: bool(process.env.ALLOW_DEMO_LOGIN, true),
      // Endpoints do provedor. Apontam para o Google por padrão; podem ser
      // trocados para testar com um servidor local (testes/google-falso.mjs)
      // ou para usar outro provedor compatível com OpenID Connect.
      endpoints: {
        auth: process.env.GOOGLE_AUTH_ENDPOINT || 'https://accounts.google.com/o/oauth2/v2/auth',
        token: process.env.GOOGLE_TOKEN_ENDPOINT || 'https://oauth2.googleapis.com/token',
        userinfo: process.env.GOOGLE_USERINFO_ENDPOINT || 'https://www.googleapis.com/oauth2/v3/userinfo',
        tokeninfo: process.env.GOOGLE_TOKENINFO_ENDPOINT || 'https://oauth2.googleapis.com/tokeninfo',
        jwks: process.env.GOOGLE_JWKS_URI || 'https://www.googleapis.com/oauth2/v3/certs'
      }
    }
  },

  ia: {
    provedor: (process.env.AI_PROVIDER || 'mock').toLowerCase(),
    temperatura: Number(process.env.AI_TEMPERATURE || 0.7),
    contextoMensagens: Number(process.env.AI_CONTEXTO || 8)
  }
};

export function validarConfig() {
  const avisos = [];
  if (config.auth.jwtSecret.includes('dev-secret')) {
    avisos.push('JWT_SECRET padrão em uso — defina um valor aleatório antes de ir a produção.');
  }
  if (!config.auth.google.clientId) {
    avisos.push('GOOGLE_CLIENT_ID ausente — o login Google real está desativado; use o login de demonstração.');
  }
  if (config.ia.provedor !== 'mock' && !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    avisos.push(`AI_PROVIDER="${config.ia.provedor}" sem chave de API — o fallback simulado será usado.`);
  }
  return avisos;
}

export default config;
