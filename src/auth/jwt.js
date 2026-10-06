/**
 * =====================================================================
 *  MAKLAYN — JWT HS256 próprio (Web Crypto / node:crypto)
 *  Sem dependências externas: assinatura, verificação, expiração e
 *  comparação em tempo constante contra ataques de timing.
 * =====================================================================
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import config from '../config.js';

const b64url = (input) =>
  Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url');

const deB64url = (s) => Buffer.from(s, 'base64url').toString('utf8');

export function assinar(payload, { expiraSegundos = config.auth.jwtExpiraSegundos, segredo = config.auth.jwtSecret } = {}) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = { alg: 'HS256', typ: 'JWT' };
  const corpo = { ...payload, iat: agora, exp: agora + expiraSegundos, iss: 'maklayn' };

  const semAssinatura = `${b64url(cabecalho)}.${b64url(corpo)}`;
  const assinatura = createHmac('sha256', segredo).update(semAssinatura).digest('base64url');
  return `${semAssinatura}.${assinatura}`;
}

export function verificar(token, { segredo = config.auth.jwtSecret } = {}) {
  if (typeof token !== 'string') throw new Error('TOKEN_INVALIDO');
  const partes = token.split('.');
  if (partes.length !== 3) throw new Error('TOKEN_MALFORMADO');

  const [cabecalhoB64, corpoB64, assinaturaRecebida] = partes;
  const semAssinatura = `${cabecalhoB64}.${corpoB64}`;
  const esperada = createHmac('sha256', segredo).update(semAssinatura).digest('base64url');

  const a = Buffer.from(esperada);
  const b = Buffer.from(assinaturaRecebida);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('ASSINATURA_INVALIDA');

  const cabecalho = JSON.parse(deB64url(cabecalhoB64));
  if (cabecalho.alg !== 'HS256') throw new Error('ALGORITMO_NAO_SUPORTADO');

  const corpo = JSON.parse(deB64url(corpoB64));
  const agora = Math.floor(Date.now() / 1000);
  if (typeof corpo.exp === 'number' && corpo.exp < agora) throw new Error('TOKEN_EXPIRADO');

  return corpo;
}

/** Lê o token do cookie httpOnly ou do header Authorization: Bearer. */
export function extrairToken(req) {
  const cookie = req.headers?.cookie ?? '';
  const doCookie = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${config.auth.cookieNome}=`));
  if (doCookie) return decodeURIComponent(doCookie.split('=').slice(1).join('='));

  const auth = req.headers?.authorization ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();

  return null;
}

export function definirCookie(res, token) {
  const partes = [
    `${config.auth.cookieNome}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${config.auth.jwtExpiraSegundos}`
  ];
  if (config.app.ambiente === 'production') partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

export function limparCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${config.auth.cookieNome}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export default { assinar, verificar, extrairToken, definirCookie, limparCookie };
