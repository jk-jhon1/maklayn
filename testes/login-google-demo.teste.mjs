/**
 * =====================================================================
 *  MAKLAYN — Login Google na DEMONSTRAÇÃO estática (GitHub Pages)
 * =====================================================================
 *
 *  Prova que o login Google funciona sem backend: o `id_token` emitido
 *  pelo Google Identity Services é verificado no próprio navegador com
 *  as CHAVES PÚBLICAS do Google (JWKS) — o Client Secret não participa.
 *
 *  O teste usa o emulador de Google (testes/google-falso.mjs), cujo JWKS
 *  é servido em /oauth2/v3/certs, e executa o MESMO código que roda no
 *  site publicado (`docs/js/demo-api.js`), via Web Crypto.
 *
 *  Rodar:  node testes/login-google-demo.teste.mjs
 * =====================================================================
 */

import { criarServidorGoogleFalso, gerarIdToken, CLIENT_ID } from './google-falso.mjs';

function storage() {
  const d = new Map();
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)),
           removeItem: (k) => d.delete(k), clear: () => d.clear() };
}
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = globalThis;
globalThis.MAKLAYN_DEMO = { googleClientId: CLIENT_ID, googleJwksUri: 'http://localhost:9098/oauth2/v3/certs' };

const google = criarServidorGoogleFalso({ redirectUris: [] });
await new Promise((r) => google.listen(9098, '0.0.0.0', r));
await import(new URL('../docs/js/demo-api.js', import.meta.url).href);

const chamar = async (caminho, opcoes = {}) => {
  const r = await fetch(`/api${caminho}`, {
    method: opcoes.method || 'GET',
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });
  const dados = await r.json().catch(() => ({}));
  return { status: r.status, dados };
};

let falhas = 0;
const verificar = (nome, ok, detalhe = '') => {
  console.log(`  ${ok ? '✔' : '✖'} ${nome}${detalhe ? '  → ' + detalhe : ''}`);
  if (!ok) falhas++;
};

console.log('\n=== LOGIN GOOGLE NA DEMONSTRAÇÃO ESTÁTICA (sem backend) ===');

let r = await chamar('/auth/config');
verificar('/auth/config anuncia o Client ID configurado',
  r.dados.google.configurado === true && r.dados.google.client_id === CLIENT_ID, r.dados.google.client_id);

r = await chamar('/auth/google/credential', { method: 'POST', body: { credential: gerarIdToken() } });
verificar('id_token válido entra na conta Google',
  r.status === 200 && r.dados.usuario.email === 'maria.silva@gmail.com',
  `${r.dados.usuario?.nome_completo} · papel ${r.dados.usuario?.papel}`);
verificar('perfil guardado com o sub do Google', r.dados.usuario.google_id === '110987654321098765432');
verificar('foto do Google importada', String(r.dados.usuario.foto_url).includes('googleusercontent'));

r = await chamar('/auth/eu');
verificar('sessão ativa depois do login Google', r.dados.autenticado === true, r.dados.usuario?.email);

r = await chamar('/consultas', { method: 'POST', body: { prompt: 'Como testar uma API REST?', modo: 'Codigo' } });
verificar('usuário do Google usa o assistente', r.status === 201, `${r.dados.consulta?.resposta_ia?.length} caracteres`);

// token de outra aplicação
r = await chamar('/auth/google/credential', { method: 'POST', body: { credential: gerarIdToken({ clientId: 'outro.apps.googleusercontent.com' }) } });
verificar('id_token de outra aplicação é recusado', r.status === 401 && /outra aplicação/.test(r.dados.mensagem), r.dados.erro);

// token expirado
r = await chamar('/auth/google/credential', { method: 'POST', body: { credential: gerarIdToken({ expiraSegundos: -60 }) } });
verificar('id_token expirado é recusado', r.status === 401 && /expirado/i.test(r.dados.mensagem), r.dados.erro);

// assinatura adulterada (troca o payload mantendo a assinatura)
const partes = gerarIdToken().split('.');
const payloadFalso = Buffer.from(JSON.stringify({
  ...JSON.parse(Buffer.from(partes[1], 'base64url').toString()),
  email: 'invasor@exemplo.com'
})).toString('base64url');
r = await chamar('/auth/google/credential', { method: 'POST', body: { credential: `${partes[0]}.${payloadFalso}.${partes[2]}` } });
verificar('id_token com payload adulterado é recusado (assinatura conferida)',
  r.status === 401 && /assinatura/i.test(r.dados.mensagem), r.dados.mensagem?.slice(0, 60));

// sem Client ID configurado
globalThis.MAKLAYN_DEMO = { googleClientId: '', googleJwksUri: 'http://localhost:9098/oauth2/v3/certs' };
r = await chamar('/auth/config');
verificar('sem Client ID, /auth/config volta ao modo demonstração',
  r.dados.google.configurado === false && r.dados.demo === true);
r = await chamar('/auth/google/credential', { method: 'POST', body: { credential: gerarIdToken() } });
verificar('sem Client ID → 503 com instrução', r.status === 503 && r.dados.erro === 'GOOGLE_NAO_CONFIGURADO', r.dados.mensagem?.slice(0, 60));

google.close();
console.log(`\n${falhas === 0 ? '✅ LOGIN GOOGLE NA DEMONSTRAÇÃO: TODAS AS VERIFICAÇÕES PASSARAM' : `❌ ${falhas} FALHA(S)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
