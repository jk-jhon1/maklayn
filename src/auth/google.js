/**
 * =====================================================================
 *  MAKLAYN — Integração com o Google (OAuth 2.0 / OpenID Connect)
 *
 *  Fluxos implementados (seção 3 da especificação):
 *
 *   A) Authorization Code Flow (server-side) — o mais seguro:
 *      /api/auth/google  -> redireciona para a tela do Google
 *      /api/auth/google/callback -> troca o "code" por tokens
 *
 *   B) Google Identity Services (frontend/React): o botão do Google
 *      devolve um "credential" (id_token) via POST em
 *      /api/auth/google/credential — validado no servidor.
 *
 *  Segurança: o parâmetro `state` é um JWT assinado (proteção CSRF) e
 *  o Client Secret nunca sai do backend.
 * =====================================================================
 */

import config from '../config.js';
import { assinar, verificar } from './jwt.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';

export const googleConfigurado = () =>
  Boolean(config.auth.google.clientId && config.auth.google.clientSecret);

/** URL da tela de consentimento do Google, com `state` antifraude. */
export function urlConsentimento({ retorno = '/' } = {}) {
  if (!googleConfigurado()) throw new Error('Google OAuth não configurado (GOOGLE_CLIENT_ID/SECRET).');

  const state = assinar({ tipo: 'oauth_state', retorno }, { expiraSegundos: 600 });

  const params = new URLSearchParams({
    client_id: config.auth.google.clientId,
    redirect_uri: config.auth.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export function validarState(state) {
  const corpo = verificar(state); // lança se inválido/expirado
  if (corpo.tipo !== 'oauth_state') throw new Error('STATE_INVALIDO');
  return corpo.retorno || '/';
}

/** Troca o `code` pelos tokens e busca o perfil do usuário. */
export async function trocarCodePorPerfil(code) {
  const resposta = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.auth.google.clientId,
      client_secret: config.auth.google.clientSecret,
      redirect_uri: config.auth.google.redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error(`Falha ao trocar o código por tokens: ${resposta.status} ${detalhe.slice(0, 200)}`);
  }

  const tokens = await resposta.json();
  const perfil = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  if (!perfil.ok) throw new Error(`Falha ao obter o perfil do Google: ${perfil.status}`);
  const dados = await perfil.json();

  return {
    google_id: dados.sub,
    nome_completo: dados.name ?? dados.email?.split('@')[0] ?? 'Usuário Maklayn',
    email: String(dados.email ?? '').toLowerCase(),
    foto_url: dados.picture ?? null,
    email_verificado: Boolean(dados.email_verified),
    escopos: tokens.scope ?? ''
  };
}

/**
 * Valida um id_token (credential) emitido pelo botão do Google
 * Identity Services no frontend — sem precisar do Client Secret.
 */
export async function validarCredencial(idToken) {
  if (!config.auth.google.clientId) throw new Error('GOOGLE_CLIENT_ID não configurado.');

  const resposta = await fetch(`${TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`);
  if (!resposta.ok) throw new Error('Credencial do Google inválida ou expirada.');

  const dados = await resposta.json();

  if (dados.aud !== config.auth.google.clientId) throw new Error('A credencial não pertence a esta aplicação.');
  if (String(dados.email_verified) !== 'true') throw new Error('E-mail do Google não verificado.');

  return {
    google_id: dados.sub,
    nome_completo: dados.name ?? dados.email?.split('@')[0] ?? 'Usuário Maklayn',
    email: String(dados.email ?? '').toLowerCase(),
    foto_url: dados.picture ?? null,
    email_verificado: true
  };
}

export default {
  googleConfigurado,
  urlConsentimento,
  validarState,
  trocarCodePorPerfil,
  validarCredencial
};
