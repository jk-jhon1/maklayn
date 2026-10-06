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
import { clientIdRuntime } from './clienteGoogleRuntime.js';

/* Endpoints lidos da configuração — permite apontar para um servidor
 * de teste (testes/google-falso.mjs) ou outro provedor OpenID Connect. */
const AUTH_ENDPOINT = () => config.auth.google.endpoints.auth;
const TOKEN_ENDPOINT = () => config.auth.google.endpoints.token;
const USERINFO_ENDPOINT = () => config.auth.google.endpoints.userinfo;
const TOKENINFO_ENDPOINT = () => config.auth.google.endpoints.tokeninfo;
const JWKS_URI = () => config.auth.google.endpoints.jwks;

/**
 * Erro de autenticação com status HTTP correto.
 * Sem isto, falhas de OAuth (código reutilizado, secret errado, state
 * forjado) chegariam ao cliente como 500 "erro interno" — escondendo a
 * causa real de quem está integrando.
 */
function erroGoogle(mensagem, codigo = 'GOOGLE_FALHOU', status = 401) {
  const e = new Error(mensagem);
  e.status = status;
  e.codigo = codigo;
  return e;
}

/**
 * Client ID em uso: o definido em tempo de execução (interface) tem
 * precedência sobre o do `.env` — assim dá para ativar o login Google
 * sem editar arquivo nem reiniciar o servidor.
 */
export const clientIdAtivo = () => clientIdRuntime() || config.auth.google.clientId;

/**
 * Login Google disponível pelo botão oficial (Google Identity Services).
 * Basta o Client ID: o Google devolve um id_token assinado e nós
 * conferimos a assinatura — o Client Secret não participa deste fluxo.
 */
export const googleConfigurado = () => Boolean(clientIdAtivo());

/** Fluxo Authorization Code (server-side): este sim exige o Client Secret. */
export const fluxoServerSideDisponivel = () =>
  Boolean(clientIdAtivo() && config.auth.google.clientSecret);

/** URL da tela de consentimento do Google, com `state` antifraude. */
export function urlConsentimento({ retorno = '/' } = {}) {
  if (!fluxoServerSideDisponivel()) {
    throw erroGoogle(
      'O fluxo server-side precisa de GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET. ' +
      'Para entrar apenas com o Client ID, use o botão do Google na tela de login.',
      'GOOGLE_NAO_CONFIGURADO', 503);
  }

  const state = assinar({ tipo: 'oauth_state', retorno }, { expiraSegundos: 600 });

  const params = new URLSearchParams({
    client_id: clientIdAtivo(),
    redirect_uri: config.auth.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state
  });

  return `${AUTH_ENDPOINT()}?${params.toString()}`;
}

export function validarState(state) {
  let corpo;
  try {
    corpo = verificar(state);                    // lança se expirado ou adulterado
  } catch (e) {
    throw erroGoogle(`Sessão de login inválida ou expirada (${e.message}). Inicie o login novamente.`,
      'STATE_INVALIDO', 401);
  }
  if (corpo.tipo !== 'oauth_state') {
    throw erroGoogle('Sessão de login inválida (state com tipo incorreto).', 'STATE_INVALIDO', 401);
  }
  return corpo.retorno || '/';
}

/** Troca o `code` pelos tokens e busca o perfil do usuário. */
export async function trocarCodePorPerfil(code) {
  const resposta = await fetch(TOKEN_ENDPOINT(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientIdAtivo(),
      client_secret: config.auth.google.clientSecret,
      redirect_uri: config.auth.google.redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    // O Google devolve {"error":"invalid_grant"|"invalid_client", ...}
    let motivo = '';
    try { motivo = JSON.parse(detalhe).error || ''; } catch { /* corpo não-JSON */ }

    const dicas = {
      invalid_grant: 'O código de autorização já foi usado ou expirou. Faça login novamente.',
      invalid_client: 'GOOGLE_CLIENT_SECRET ou GOOGLE_CLIENT_ID não conferem com os do Google Cloud Console.',
      redirect_uri_mismatch: 'A GOOGLE_REDIRECT_URI não está cadastrada no Google Cloud Console (URIs de redirecionamento autorizados).'
    };
    const mensagem = dicas[motivo] || `Falha ao trocar o código por tokens (HTTP ${resposta.status}).`;

    throw erroGoogle(`${mensagem}${motivo ? ` [${motivo}]` : ''}`, 'GOOGLE_TOKEN_INVALIDO', 401);
  }

  const tokens = await resposta.json();
  const perfil = await fetch(USERINFO_ENDPOINT(), {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  if (!perfil.ok) {
    throw erroGoogle(`O Google recusou a leitura do perfil (HTTP ${perfil.status}).`, 'GOOGLE_PERFIL_FALHOU', 401);
  }
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
  const clientId = clientIdAtivo();
  if (!clientId) {
    throw erroGoogle('GOOGLE_CLIENT_ID não configurado no servidor.', 'GOOGLE_NAO_CONFIGURADO', 503);
  }

  const resposta = await fetch(`${TOKENINFO_ENDPOINT()}?id_token=${encodeURIComponent(idToken)}`);
  if (!resposta.ok) {
    throw erroGoogle('Credencial do Google inválida, expirada ou de outra aplicação.', 'CREDENCIAL_INVALIDA', 401);
  }

  const dados = await resposta.json();

  if (dados.aud !== clientId) {
    throw erroGoogle('A credencial foi emitida para outra aplicação (aud diferente).', 'CREDENCIAL_OUTRA_APLICACAO', 401);
  }
  if (String(dados.email_verified) !== 'true') {
    throw erroGoogle('A conta Google deste e-mail ainda não foi verificada.', 'EMAIL_NAO_VERIFICADO', 401);
  }

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
