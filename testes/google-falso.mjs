/**
 * =====================================================================
 *  MAKLAYN — Servidor de teste que EMULA o Google (OAuth 2.0 / OIDC)
 * =====================================================================
 *
 *  Para que serve
 *  --------------
 *  Permite provar que o login Google funciona de ponta a ponta SEM
 *  credenciais reais: o Maklayn conversa com este servidor exatamente
 *  como conversaria com `accounts.google.com`.
 *
 *  Implementa os quatro endpoints que o Maklayn usa:
 *
 *    GET  /o/oauth2/v2/auth   tela de consentimento (redireciona com `code`)
 *    POST /token              troca `code` por access_token + id_token
 *    GET  /oauth2/v3/userinfo perfil do usuário (Bearer access_token)
 *    GET  /tokeninfo          valida um id_token (usado pelo fluxo GIS)
 *    GET  /oauth2/v3/certs    JWKS (chaves públicas, p/ verificação local)
 *
 *  Como usar
 *  ---------
 *    node testes/google-falso.mjs            # sobe em http://localhost:9099
 *    node testes/google-falso.mjs --porta 9500
 *
 *  Depois aponte o Maklayn para ele (ver testes/login-google.teste.mjs):
 *    GOOGLE_AUTH_ENDPOINT=http://localhost:9099/o/oauth2/v2/auth \
 *    GOOGLE_TOKEN_ENDPOINT=http://localhost:9099/token \
 *    GOOGLE_USERINFO_ENDPOINT=http://localhost:9099/oauth2/v3/userinfo \
 *    GOOGLE_TOKENINFO_ENDPOINT=http://localhost:9099/tokeninfo \
 *    GOOGLE_JWKS_URI=http://localhost:9099/oauth2/v3/certs \
 *    GOOGLE_CLIENT_ID=teste.apps.googleusercontent.com \
 *    GOOGLE_CLIENT_SECRET=segredo-de-teste \
 *    node src/server.js
 *
 *  O que ele valida de verdade
 *  ---------------------------
 *  • client_id e redirect_uri conferem com os registrados;
 *  • o `code` é de uso único e expira em 5 minutos;
 *  • client_secret é obrigatório na troca de código (como no Google);
 *  • o id_token é um JWT RS256 assinado com chave real (RSA 2048),
 *    verificável pela JWKS publicada em /oauth2/v3/certs.
 *
 *  Este arquivo é FERRAMENTA DE TESTE — não vai para produção.
 * =====================================================================
 */

import { createServer } from 'node:http';
import { generateKeyPairSync, createSign, createVerify, createPublicKey, randomUUID } from 'node:crypto';

/* ------------------------------------------------------------------ */
/* Parâmetros                                                          */
/* ------------------------------------------------------------------ */

function argumento(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const PORTA = Number(argumento('--porta', process.env.PORTA_FAKE_GOOGLE || 9099));
const BASE = `http://localhost:${PORTA}`;

export const CLIENT_ID = argumento('--client-id', 'teste.apps.googleusercontent.com');
export const CLIENT_SECRET = argumento('--segredo', 'segredo-de-teste');
/** URIs de retorno aceitas (as mesmas que você registraria no Google Cloud). */
export const REDIRECT_URIS_PADRAO = [
  'http://localhost:3000/api/auth/google/callback',
  'http://localhost:8080/api/auth/google/callback'
];

/** Usuário que "existe" na conta Google emulada. */
export const USUARIO_FALSO = {
  sub: '110987654321098765432',
  email: 'maria.silva@gmail.com',
  email_verified: true,
  name: 'Maria Silva',
  given_name: 'Maria',
  family_name: 'Silva',
  picture: 'https://lh3.googleusercontent.com/a/foto-de-teste',
  locale: 'pt-BR'
};

/* ------------------------------------------------------------------ */
/* Chave RSA: assina os id_tokens (como o Google faz)                  */
/* ------------------------------------------------------------------ */

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const KID = 'chave-de-teste-1';

const b64url = (dados) =>
  Buffer.from(typeof dados === 'string' ? dados : JSON.stringify(dados)).toString('base64url');

/** Gera um id_token RS256 válido — mesma estrutura de um token do Google. */
export function gerarIdToken({ clientId = CLIENT_ID, expiraSegundos = 3600, usuario = USUARIO_FALSO, nonce } = {}) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = { alg: 'RS256', kid: KID, typ: 'JWT' };
  const corpo = {
    iss: 'https://accounts.google.com',
    azp: clientId,
    aud: clientId,
    sub: usuario.sub,
    email: usuario.email,
    email_verified: usuario.email_verified,
    name: usuario.name,
    given_name: usuario.given_name,
    family_name: usuario.family_name,
    picture: usuario.picture,
    locale: usuario.locale,
    iat: agora,
    exp: agora + expiraSegundos,
    ...(nonce ? { nonce } : {})
  };

  const base = `${b64url(cabecalho)}.${b64url(corpo)}`;
  const assinatura = createSign('RSA-SHA256').update(base).sign(privateKey, 'base64url');
  return `${base}.${assinatura}`;
}

/** JWKS: chave pública em formato JSON Web Key, como /oauth2/v3/certs. */
export function jwks() {
  // `publicKey` foi exportada como PEM (texto), então é preciso convertê-la
  // em KeyObject antes de extrair o formato JWK usado pelo JWKS.
  const jwk = createPublicKey(publicKey).export({ format: 'jwk' });
  return { keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] };
}

/* ------------------------------------------------------------------ */
/* Estado dos códigos emitidos                                         */
/* ------------------------------------------------------------------ */

const codigos = new Map();   // code -> { clientId, redirectUri, expiraEm }
const tokens = new Map();    // access_token -> { sub, expiraEm }

function emitirCodigo({ clientId, redirectUri }) {
  const code = `4/${randomUUID().replace(/-/g, '')}`;
  codigos.set(code, { clientId, redirectUri, expiraEm: Date.now() + 5 * 60 * 1000 });
  return code;
}

function trocarCodigo(code) {
  const registro = codigos.get(code);
  if (!registro) return { erro: 'invalid_grant', descricao: 'Código inexistente ou já utilizado.' };
  codigos.delete(code);                                   // uso único, como no Google
  if (registro.expiraEm < Date.now()) return { erro: 'invalid_grant', descricao: 'Código expirado.' };
  return { registro };
}

/* ------------------------------------------------------------------ */
/* Utilidades HTTP                                                     */
/* ------------------------------------------------------------------ */

function json(res, dados, status = 200) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(corpo)
  });
  res.end(corpo);
}

function erroOAuth(res, erro, descricao, status = 400) {
  json(res, { error: erro, error_description: descricao }, status);
}

async function corpoDaRequisicao(req) {
  const partes = [];
  for await (const parte of req) partes.push(parte);
  return Buffer.concat(partes).toString('utf8');
}

/* ------------------------------------------------------------------ */
/* Servidor                                                            */
/* ------------------------------------------------------------------ */

export function criarServidorGoogleFalso({ redirectUris = REDIRECT_URIS_PADRAO, clientId = CLIENT_ID, clientSecret = CLIENT_SECRET } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, BASE);

    /* ------------------------------------------- tela de consentimento */
    if (url.pathname === '/o/oauth2/v2/auth') {
      const clientIdParam = url.searchParams.get('client_id');
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state') ?? '';
      const escopo = url.searchParams.get('scope') ?? '';

      if (clientIdParam !== clientId) {
        return erroOAuth(res, 'invalid_client', 'client_id desconhecido para este servidor.');
      }
      if (!redirectUris.includes(redirectUri)) {
        return erroOAuth(res, 'invalid_request', `redirect_uri não registrada: ${redirectUri}`);
      }
      if (!escopo.includes('openid') || !escopo.includes('email')) {
        return erroOAuth(res, 'invalid_scope', 'é necessário solicitar os escopos openid e email.');
      }

      const code = emitirCodigo({ clientId: clientIdParam, redirectUri });
      const destino = new URL(redirectUri);
      destino.searchParams.set('code', code);
      destino.searchParams.set('state', state);
      destino.searchParams.set('scope', escopo);
      destino.searchParams.set('authuser', '0');
      destino.searchParams.set('prompt', 'consent');

      res.writeHead(302, { Location: destino.toString() });
      return res.end();
    }

    /* --------------------------------------------------- troca de código */
    if (url.pathname === '/token' && req.method === 'POST') {
      const corpo = new URLSearchParams(await corpoDaRequisicao(req));

      if (corpo.get('grant_type') !== 'authorization_code') {
        return erroOAuth(res, 'unsupported_grant_type', 'somente authorization_code é suportado aqui.');
      }
      if (corpo.get('client_id') !== clientId) {
        return erroOAuth(res, 'invalid_client', 'client_id incorreto.');
      }
      if (corpo.get('client_secret') !== clientSecret) {
        // O Google responde 401 quando o secret está errado: é assim que o
        // backend descobre que a credencial não confere.
        return erroOAuth(res, 'invalid_client', 'client_secret incorreto.', 401);
      }

      const { erro, descricao, registro } = trocarCodigo(corpo.get('code'));
      if (erro) return erroOAuth(res, erro, descricao);

      if (corpo.get('redirect_uri') !== registro.redirectUri) {
        return erroOAuth(res, 'redirect_uri_mismatch', 'redirect_uri diferente da usada na autorização.');
      }

      const accessToken = `ya29.${randomUUID().replace(/-/g, '')}`;
      tokens.set(accessToken, { sub: USUARIO_FALSO.sub, expiraEm: Date.now() + 3600 * 1000 });

      return json(res, {
        access_token: accessToken,
        expires_in: 3599,
        refresh_token: `1//${randomUUID().replace(/-/g, '')}`,
        scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        token_type: 'Bearer',
        id_token: gerarIdToken()
      });
    }

    /* --------------------------------------------------------- userinfo */
    if (url.pathname === '/oauth2/v3/userinfo') {
      const cabecalho = req.headers.authorization ?? '';
      const token = cabecalho.replace(/^Bearer\s+/i, '');
      const registro = tokens.get(token);

      if (!registro) return json(res, { error: 'invalid_token' }, 401);
      if (registro.expiraEm < Date.now()) {
        tokens.delete(token);
        return json(res, { error: 'invalid_token', error_description: 'Token expirado.' }, 401);
      }

      return json(res, {
        sub: USUARIO_FALSO.sub,
        name: USUARIO_FALSO.name,
        given_name: USUARIO_FALSO.given_name,
        family_name: USUARIO_FALSO.family_name,
        picture: USUARIO_FALSO.picture,
        email: USUARIO_FALSO.email,
        email_verified: USUARIO_FALSO.email_verified,
        locale: USUARIO_FALSO.locale
      });
    }

    /* ------------------------------------------- tokeninfo (fluxo GIS) */
    if (url.pathname === '/tokeninfo') {
      const idToken = url.searchParams.get('id_token');
      if (!idToken) return json(res, { error: 'invalid_token', error_description: 'id_token ausente.' }, 400);

      const partes = idToken.split('.');
      if (partes.length !== 3) return json(res, { error: 'invalid_token' }, 400);

      // Verificação de assinatura: mesma checagem que o Google faz.
      const ok = createVerify('RSA-SHA256')
        .update(`${partes[0]}.${partes[1]}`)
        .verify(publicKey, Buffer.from(partes[2], 'base64url'));

      if (!ok) return json(res, { error: 'invalid_token', error_description: 'Assinatura inválida.' }, 401);

      const corpo = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
      if (corpo.exp * 1000 < Date.now()) {
        return json(res, { error: 'invalid_token', error_description: 'Token expirado.' }, 401);
      }

      // O Google devolve os campos como texto, inclusive email_verified.
      return json(res, Object.fromEntries(Object.entries(corpo).map(([k, v]) => [k, String(v)])));
    }

    /* ------------------------------------------------------------- JWKS */
    if (url.pathname === '/oauth2/v3/certs') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      });
      return res.end(JSON.stringify(jwks()));
    }

    json(res, { error: 'not_found', caminho: url.pathname }, 404);
  });
}

/* Escuta apenas quando executado diretamente (não ao importar no teste). */
if (import.meta.url === `file://${process.argv[1]}`) {
  const servidor = criarServidorGoogleFalso();
  servidor.listen(PORTA, '0.0.0.0', () => {
    console.log(`
  ██  GOOGLE FALSO — servidor de teste do login Maklayn
  ▸ Endereço:      ${BASE}
  ▸ client_id:     ${CLIENT_ID}
  ▸ client_secret: ${CLIENT_SECRET}
  ▸ redirect_uri:  ${REDIRECT_URIS_PADRAO.join('  |  ')}

  Endpoints: /o/oauth2/v2/auth · /token · /oauth2/v3/userinfo · /tokeninfo · /oauth2/v3/certs
`);
  });
  const encerrar = () => servidor.close(() => process.exit(0));
  process.on('SIGTERM', encerrar);
  process.on('SIGINT', encerrar);
}
