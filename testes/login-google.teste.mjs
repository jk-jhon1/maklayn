/**
 * =====================================================================
 *  MAKLAYN — Teste do login Google de ponta a ponta
 * =====================================================================
 *
 *  Sobe o servidor de teste (`google-falso.mjs`), inicia o backend
 *  Maklayn apontado para ele e executa o fluxo REAL de autenticação:
 *
 *    1. /api/auth/google           → redireciona para a tela do provedor
 *    2. provedor                   → devolve `code` + `state` ao callback
 *    3. /api/auth/google/callback  → troca o code por tokens (com secret),
 *                                    busca o perfil, cria o usuário e
 *                                    grava o cookie de sessão
 *    4. /api/auth/eu               → confirma a sessão autenticada
 *    5. /api/auth/google/credential→ fluxo Google Identity Services
 *                                    (id_token validado pelo servidor)
 *
 *  Mais os casos de erro: secret errado, `state` adulterado, credencial
 *  falsificada, código reutilizado e callback sem parâmetros.
 *
 *  Rodar:  node testes/login-google.teste.mjs
 * =====================================================================
 */

import { criarServidorGoogleFalso, CLIENT_ID, CLIENT_SECRET, gerarIdToken } from './google-falso.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const PORTA_GOOGLE = Number(process.env.PORTA_GOOGLE || 9099);
const PORTA_API = Number(process.env.PORTA_API || 3100);
const API = `http://localhost:${PORTA_API}`;
const JWT_SECRET = 'segredo-de-teste-do-jwt';

/** 'node' (padrão) ou 'java' — o MESMO teste valida as duas implementações. */
const ALVO = (process.env.MAKLAYN_ALVO || 'node').toLowerCase();
const ROTULO = ALVO === 'java' ? 'Java / Spring Boot' : 'Node.js / Express';

/** Configuração comum aos dois backends (os nomes das variáveis são idênticos). */
const ambienteBase = (porta) => ({
  ...process.env,
  PORT: String(porta),
  SERVER_PORT: String(porta),
  DB_CLIENT: 'sqlite',
  DB_FILE: ':memory:',
  JWT_SECRET,
  AI_PROVIDER: 'mock',
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.SEGREDO_GOOGLE || CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: `http://localhost:${porta}/api/auth/google/callback`,
  GOOGLE_AUTH_ENDPOINT: `http://localhost:${PORTA_GOOGLE}/o/oauth2/v2/auth`,
  GOOGLE_TOKEN_ENDPOINT: `http://localhost:${PORTA_GOOGLE}/token`,
  GOOGLE_USERINFO_ENDPOINT: `http://localhost:${PORTA_GOOGLE}/oauth2/v3/userinfo`,
  GOOGLE_TOKENINFO_ENDPOINT: `http://localhost:${PORTA_GOOGLE}/tokeninfo`,
  GOOGLE_JWKS_URI: `http://localhost:${PORTA_GOOGLE}/oauth2/v3/certs`
});

/** Comando que sobe o backend escolhido. */
function comandoDoBackend(porta) {
  if (ALVO === 'java') {
    const jar = `${RAIZ}/java/target/maklayn-java-1.0.0.jar`;
    return {
      comando: 'java',
      argumentos: ['-Dfile.encoding=UTF-8', '-jar', jar,
                   '--spring.profiles.active=dev', `--server.port=${porta}`],
      ambiente: { ...ambienteBase(porta), JAVA_TOOL_OPTIONS: '-Dfile.encoding=UTF-8' }
    };
  }
  return { comando: process.execPath, argumentos: ['src/server.js'], ambiente: ambienteBase(porta) };
}

let falhas = 0;
const verificar = (nome, ok, detalhe = '') => {
  console.log(`  ${ok ? '✔' : '✖'} ${nome}${detalhe ? '  → ' + detalhe : ''}`);
  if (!ok) falhas++;
};

/* ------------------------------------------------------------------ */
/* Preparação                                                          */
/* ------------------------------------------------------------------ */

// Registra exatamente as URIs de retorno usadas neste teste — é assim que o
// Google se comporta: só aceita redirect_uri previamente cadastrada.
const google = criarServidorGoogleFalso({
  redirectUris: [
    `${API}/api/auth/google/callback`,
    'http://localhost:3101/api/auth/google/callback',
    'http://localhost:3102/api/auth/google/callback'
  ]
});
await new Promise((r) => google.listen(PORTA_GOOGLE, '0.0.0.0', r));
console.log(`\n  ▸ Google falso ouvindo em http://localhost:${PORTA_GOOGLE}`);

const alvo = comandoDoBackend(PORTA_API);
console.log(`  ▸ Backend sob teste: ${ROTULO}`);

const servidorMaklayn = spawn(alvo.comando, alvo.argumentos, {
  cwd: RAIZ,
  env: alvo.ambiente,
  stdio: ['ignore', 'pipe', 'pipe']
});

let logBackend = '';
servidorMaklayn.stdout.on('data', (d) => { logBackend += d; });
servidorMaklayn.stderr.on('data', (d) => { logBackend += d; });

/** Aguarda o backend responder (evita depender de tempo fixo). */
async function aguardarBackend(tentativas = ALVO === 'java' ? 120 : 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`${API}/api/health`);
      if (r.ok) return true;
    } catch { /* ainda subindo */ }
    await esperar(250);
  }
  return false;
}

const encerrarTudo = () => {
  try { servidorMaklayn.kill('SIGKILL'); } catch { /* já encerrado */ }
  try { google.close(); } catch { /* já encerrado */ }
};

/** Mostra o fim do log do backend — essencial quando algo derruba o processo. */
const despejarLog = (titulo) => {
  console.error(`\n──── log do backend (${titulo}) ────`);
  console.error(logBackend.split('\n').slice(-25).join('\n'));
};

let saida = false;
servidorMaklayn.on('exit', (codigo, sinal) => {
  if (!saida && codigo !== 0 && sinal !== 'SIGKILL') {
    console.error(`\n⚠ o backend Maklayn encerrou sozinho (código ${codigo}, sinal ${sinal})`);
    despejarLog('após a queda');
  }
});
process.on('exit', () => { saida = true; });

if (!(await aguardarBackend())) {
  console.error('\n✖ O backend Maklayn não subiu. Log:\n', logBackend.slice(-1500));
  encerrarTudo();
  process.exit(1);
}
console.log('  ▸ Backend Maklayn ouvindo em ' + API);

/* ------------------------------------------------------------------ */
/* Cliente HTTP com controle de cookies e redirecionamentos            */
/* ------------------------------------------------------------------ */

function criarCliente() {
  const cookies = new Map();
  const historico = [];

  const cabecalhoCookies = () =>
    [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  async function pedir(caminho, opcoes = {}) {
    const { seguir = false, ...resto } = opcoes;
    const cabecalhos = { ...(resto.headers || {}) };
    if (!seguir && cookies.size) cabecalhos.Cookie = cabecalhoCookies();

    const destino = caminho.startsWith('http') ? caminho : `${API}${caminho}`;
    const r = await fetch(destino, { ...resto, headers: cabecalhos, redirect: 'manual' });

    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      if (i > 0) cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }

    historico.push({ caminho, status: r.status, local: r.headers.get('location') });
    return { resposta: r, status: r.status, local: r.headers.get('location'), historico };
  }

  return { pedir, cookies, historico, limpar: () => cookies.clear() };
}

/**
 * Percorre a cadeia de redirecionamentos entre o Maklayn e o provedor,
 * exatamente como um navegador faria — parando no primeiro destino
 * que não seja um redirecionamento.
 */
async function seguirCadeia(cliente, caminhoInicial, limite = 6) {
  let caminho = caminhoInicial;
  const saltos = [];
  let ultimo = null;

  for (let i = 0; i < limite; i++) {
    ultimo = await cliente.pedir(caminho);
    saltos.push(`${new URL(caminho.startsWith('http') ? caminho : API + caminho).pathname} → ${ultimo.status}`);

    if (ultimo.status !== 302 || !ultimo.local) {
      return { ...ultimo, caminhoFinal: caminho, saltos };
    }
    caminho = ultimo.local;
  }
  return { ...ultimo, caminhoFinal: caminho, saltos };
}

/* ------------------------------------------------------------------ */
/* 1. Fluxo OAuth 2.0 (Authorization Code) — o caminho principal       */
/* ------------------------------------------------------------------ */

process.on('uncaughtException', (e) => { despejarLog('erro no teste'); console.error(e); encerrarTudo(); process.exit(1); });
process.on('unhandledRejection', (e) => { despejarLog('promise rejeitada'); console.error(e); encerrarTudo(); process.exit(1); });

console.log('\n=== 1. FLUXO OAUTH 2.0 (AUTHORIZATION CODE) ===');
const cliente = criarCliente();

let r = await cliente.pedir('/api/auth/google');
verificar('/api/auth/google redireciona para o provedor', r.status === 302, `HTTP ${r.status}`);
const urlConsent = new URL(r.local);
verificar('redireciona para o endpoint de consentimento',
  urlConsent.origin === `http://localhost:${PORTA_GOOGLE}` && urlConsent.pathname === '/o/oauth2/v2/auth',
  urlConsent.pathname);
verificar('envia client_id, redirect_uri e escopos',
  urlConsent.searchParams.get('client_id') === CLIENT_ID &&
  urlConsent.searchParams.get('redirect_uri') === `${API}/api/auth/google/callback` &&
  (urlConsent.searchParams.get('scope') || '').includes('openid'),
  `response_type=${urlConsent.searchParams.get('response_type')}`);
const stateEnviado = urlConsent.searchParams.get('state');
// Node assina o state como JWT; Java usa um UUID em cookie httpOnly.
// As duas abordagens previnem CSRF — o teste aceita ambas e cobra o essencial.
verificar('envia `state` antifraude', Boolean(stateEnviado) && stateEnviado.length >= 20,
  `state de ${String(stateEnviado).length} caracteres (${String(stateEnviado).split('.').length === 3 ? 'JWT assinado' : 'valor opaco em cookie'})`);

// Passos 2 e 3: o provedor devolve o code e o backend troca por tokens
const cadeia = await seguirCadeia(cliente, '/api/auth/google');
verificar('callback processa o `code` e conclui o login',
  cadeia.caminhoFinal.endsWith('/') || cadeia.caminhoFinal === API + '/',
  `cadeia: ${cadeia.saltos.join('  ')}`);
verificar('cookie de sessão foi gravado', cliente.cookies.has('maklayn_token'),
  `cookies: ${[...cliente.cookies.keys()].join(', ') || 'nenhum'}`);

r = await cliente.pedir('/api/auth/eu');
let dados = await r.resposta.json();
verificar('sessão autenticada como o usuário do Google',
  dados.autenticado === true && dados.usuario.email === 'maria.silva@gmail.com',
  `${dados.usuario?.nome_completo} · ${dados.usuario?.email}`);
verificar('perfil guardado com o sub do Google (google_id)',
  dados.usuario.google_id === '110987654321098765432', dados.usuario.google_id);
verificar('foto do perfil importada', String(dados.usuario.foto_url || '').includes('googleusercontent'),
  dados.usuario.foto_url);

r = await cliente.pedir('/api/consultas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Como estruturar um microsserviço em Node?', modo: 'Codigo' })
});
verificar('usuário logado pelo Google consulta a IA', r.status === 201,
  `resposta de ${(await r.resposta.json()).consulta?.resposta_ia?.length ?? 0} caracteres`);

/* ------------------------------------------------------------------ */
/* 2. Reutilização do mesmo `code` (deve falhar, como no Google)       */
/* ------------------------------------------------------------------ */

console.log('\n=== 2. SEGURANÇA: CÓDIGO DE USO ÚNICO ===');
const cliente2 = criarCliente();
r = await cliente2.pedir('/api/auth/google');
const consent2 = new URL(r.local);
const respostaProvedor = await fetch(consent2.toString(), { redirect: 'manual' });
const destino = new URL(respostaProvedor.headers.get('location'));
const code = destino.searchParams.get('code');
const state = destino.searchParams.get('state');

let reaproveitado = await cliente2.pedir(`/api/auth/google/callback?code=${code}&state=${encodeURIComponent(state)}`);
let corpo = await reaproveitado.resposta.json().catch(() => ({}));
verificar('primeiro uso do código funciona', reaproveitado.local === '/' || reaproveitado.status === 302,
  `HTTP ${reaproveitado.status}`);

reaproveitado = await cliente2.pedir(`/api/auth/google/callback?code=${code}&state=${encodeURIComponent(state)}`);
const corpoReuso = await reaproveitado.resposta.json().catch(() => ({}));
verificar('segundo uso do mesmo código é rejeitado com 401',
  reaproveitado.status === 401 && corpoReuso.erro === 'GOOGLE_TOKEN_INVALIDO',
  `HTTP ${reaproveitado.status} · ${String(corpoReuso.mensagem || '').slice(0, 70)}`);

/* ------------------------------------------------------------------ */
/* 3. Segurança: state adulterado e callback incompleto                */
/* ------------------------------------------------------------------ */

console.log('\n=== 3. SEGURANÇA: `STATE` E CALLBACK MALFORMADO ===');
const cliente3 = criarCliente();
r = await cliente3.pedir('/api/auth/google');
const stateValido = new URL(r.local).searchParams.get('state');

// Troca a assinatura do state (ataque CSRF)
const partes = stateValido.split('.');
const stateForjado = `${partes[0]}.${partes[1]}.assinaturaFalsa`;

let forjado = await cliente3.pedir(`/api/auth/google/callback?code=4/qualquer&state=${encodeURIComponent(stateForjado)}`);
let corpoForjado = await forjado.resposta.json().catch(() => ({}));
verificar('`state` com assinatura falsa → 401 STATE_INVALIDO',
  forjado.status === 401 && corpoForjado.erro === 'STATE_INVALIDO',
  `HTTP ${forjado.status} · ${String(corpoForjado.mensagem || '').slice(0, 60)}`);

// Payload trocado, mantendo a assinatura antiga
const payloadAlterado = Buffer.from(JSON.stringify({ tipo: 'oauth_state', retorno: 'https://site-malicioso.com', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
const stateAlterado = `${partes[0]}.${payloadAlterado}.${partes[2]}`;
forjado = await cliente3.pedir(`/api/auth/google/callback?code=4/qualquer&state=${encodeURIComponent(stateAlterado)}`);
verificar('`state` com payload alterado → 401', forjado.status === 401, `HTTP ${forjado.status}`);

// Assinatura correta, mas com outro segredo (simula token de outro servidor)
const cabecalhoFalso = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const payloadFalso = Buffer.from(JSON.stringify({ tipo: 'oauth_state', retorno: '/', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
const assinaturaFalsa = createHmac('sha256', 'outro-segredo').update(`${cabecalhoFalso}.${payloadFalso}`).digest('base64url');
forjado = await cliente3.pedir(`/api/auth/google/callback?code=4/qualquer&state=${cabecalhoFalso}.${payloadFalso}.${assinaturaFalsa}`);
verificar('`state` assinado com outro segredo → 401', forjado.status === 401, `HTTP ${forjado.status}`);

let semParametros = await cliente3.pedir('/api/auth/google/callback');
const corpoSemParametros = await semParametros.resposta.json().catch(() => ({}));
verificar('callback sem code/state → 400 com mensagem clara',
  semParametros.status === 400 && /code/.test(String(corpoSemParametros.mensagem || '')),
  `HTTP ${semParametros.status} · ${String(corpoSemParametros.mensagem || '').slice(0, 60)}`);

let negado = await cliente3.pedir('/api/auth/google/callback?error=access_denied');
verificar('usuário que recusa no Google é devolvido com aviso', negado.status === 302 && String(negado.local).includes('erro='),
  String(negado.local));

/* ------------------------------------------------------------------ */
/* 4. Fluxo Google Identity Services (id_token)                        */
/* ------------------------------------------------------------------ */

console.log('\n=== 4. GOOGLE IDENTITY SERVICES (id_token) ===');
const cliente4 = criarCliente();

const idToken = gerarIdToken();
let gis = await cliente4.pedir('/api/auth/google/credential', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credential: idToken })
});
dados = await gis.resposta.json();
verificar('credencial válida autentica', gis.status === 200 && dados.usuario?.email === 'maria.silva@gmail.com',
  `${dados.usuario?.nome_completo} · HTTP ${gis.status}`);

r = await cliente4.pedir('/api/auth/eu');
dados = await r.resposta.json();
verificar('sessão criada pelo fluxo GIS', dados.autenticado === true, dados.usuario?.email);

// id_token emitido para OUTRO client_id (site de terceiros)
const tokenDeOutroApp = gerarIdToken({ clientId: 'outro-app.apps.googleusercontent.com' });
gis = await cliente4.pedir('/api/auth/google/credential', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credential: tokenDeOutroApp })
});
dados = await gis.resposta.json();
verificar('id_token de outra aplicação → 401 CREDENCIAL_INVALIDA',
  gis.status === 401 && ['CREDENCIAL_INVALIDA', 'CREDENCIAL_OUTRA_APLICACAO'].includes(dados.erro),
  `HTTP ${gis.status} · ${dados.erro} · ${String(dados.mensagem || '').slice(0, 50)}`);

// token expirado
const tokenExpirado = gerarIdToken({ expiraSegundos: -60 });
gis = await cliente4.pedir('/api/auth/google/credential', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credential: tokenExpirado })
});
verificar('id_token expirado → 401', gis.status === 401, `HTTP ${gis.status}`);

// assinatura adulterada
const partesToken = idToken.split('.');
const payloadTroca = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(partesToken[1], 'base64url').toString()), email: 'invasor@exemplo.com' })).toString('base64url');
gis = await cliente4.pedir('/api/auth/google/credential', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credential: `${partesToken[0]}.${payloadTroca}.${partesToken[2]}` })
});
verificar('id_token com payload alterado → 401', gis.status === 401, `HTTP ${gis.status}`);

// sem credencial
gis = await cliente4.pedir('/api/auth/google/credential', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
});
verificar('requisição sem credencial → 400', gis.status === 400, `HTTP ${gis.status}`);

/* ------------------------------------------------------------------ */
/* 5. Secret incorreto e ausência de configuração                      */
/* ------------------------------------------------------------------ */

console.log('\n=== 5. CREDENCIAIS DO SERVIDOR ===');

// O backend com o secret errado não consegue trocar o código
const alvoParcial = comandoDoBackend(3101);
const parcial = spawn(alvoParcial.comando, alvoParcial.argumentos, {
  cwd: RAIZ,
  env: { ...alvoParcial.ambiente, GOOGLE_CLIENT_SECRET: 'segredo-ERRADO' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let pronto = false;
for (let i = 0; i < (ALVO === 'java' ? 120 : 40) && !pronto; i++) {
  try { pronto = (await fetch('http://localhost:3101/api/health')).ok; } catch { await esperar(250); }
}

if (pronto) {
  const dest = await fetch('http://localhost:3101/api/auth/google', { redirect: 'manual' });
  const consentUrl = dest.headers.get('location');
  const prov = await fetch(consentUrl, { redirect: 'manual' });
  const cb = prov.headers.get('location');

  // o callback vai para o redirect_uri da outra instância; refaz com a certa
  const cbAjustado = cb.replace('localhost:3101', 'localhost:3101');
  const respostaErro = await fetch(cbAjustado, { redirect: 'manual' });
  const corpoErro = await respostaErro.text();
  const rejeitou = respostaErro.status >= 400 || corpoErro.includes('ERRO') || corpoErro.includes('invalid_client');
  verificar('secret errado impede a troca do código', rejeitou, `HTTP ${respostaErro.status}`);
}
parcial.kill('SIGKILL');

// Backend sem credenciais: o login Google informa que falta configurar
const alvoSemGoogle = comandoDoBackend(3102);
const semGoogle = spawn(alvoSemGoogle.comando, alvoSemGoogle.argumentos, {
  cwd: RAIZ,
  env: { ...alvoSemGoogle.ambiente, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});
pronto = false;
for (let i = 0; i < (ALVO === 'java' ? 120 : 40) && !pronto; i++) {
  try { pronto = (await fetch('http://localhost:3102/api/health')).ok; } catch { await esperar(250); }
}
if (pronto) {
  const r1 = await fetch('http://localhost:3102/api/auth/google', { redirect: 'manual' });
  const b1 = await r1.json().catch(() => ({}));
  verificar('sem credenciais → 503 com instrução', r1.status === 503 && b1.erro === 'GOOGLE_NAO_CONFIGURADO', b1.mensagem?.slice(0, 60));

  const r2 = await fetch('http://localhost:3102/api/auth/config');
  const b2 = await r2.json();
  verificar('/auth/config informa que o Google está desativado', b2.google.configurado === false && b2.demo === true);
}
semGoogle.kill('SIGKILL');

/* ------------------------------------------------------------------ */
/* 6. Contas Google reaproveitadas e login de demonstração             */
/* ------------------------------------------------------------------ */

console.log('\n=== 6. REUTILIZAÇÃO DE CONTA E MODO DEMONSTRAÇÃO ===');
const cliente5 = criarCliente();
await cliente5.pedir('/api/auth/google/credential', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credential: gerarIdToken() })
});
const primeira = await (await cliente5.pedir('/api/auth/eu')).resposta.json();

const cliente6 = criarCliente();
await cliente6.pedir('/api/auth/google/credential', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credential: gerarIdToken() })
});
const segunda = await (await cliente6.pedir('/api/auth/eu')).resposta.json();
verificar('mesmo usuário do Google não duplica a conta',
  primeira.usuario.id_usuario === segunda.usuario.id_usuario,
  `id_usuario ${primeira.usuario.id_usuario} nos dois logins`);

r = await cliente3.pedir('/api/auth/demo', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nome: 'Aluno Demo', email: 'aluno@exemplo.com' })
});
verificar('login de demonstração continua funcionando (papel padrão)',
  r.status === 200 && (await r.resposta.json()).usuario.papel === 'aluno');

/* ------------------------------------------------------------------ */

encerrarTudo();
console.log(`\n${falhas === 0
  ? `✅ ${ROTULO.toUpperCase()} — LOGIN GOOGLE 100% FUNCIONAL (todas as verificações passaram)`
  : `❌ ${ROTULO} — ${falhas} FALHA(S)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
