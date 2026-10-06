/**
 * =====================================================================
 *  MAKLAYN — Ativação do login Google pela interface
 * =====================================================================
 *
 *  Verifica o caminho "sem editar arquivos": o Client ID do Google
 *  (informação pública) pode ser colado na tela de login e passa a valer
 *  imediatamente, inclusive nas próximas execuções (.runtime/).
 *
 *  Rodar:  node testes/client-id-interface.teste.mjs
 * =====================================================================
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const PORTA = Number(process.env.PORTA_TESTE || 3300);
const API = `http://127.0.0.1:${PORTA}`;

let falhas = 0;
const verificar = (nome, ok, detalhe = '') => {
  console.log(`  ${ok ? '✔' : '✖'} ${nome}${detalhe ? '  → ' + detalhe : ''}`);
  if (!ok) falhas++;
};

const CLIENT_ID = '1234567890-abc123def456.apps.googleusercontent.com';

function subirServidor(ambiente = {}) {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: RAIZ,
    env: {
      ...process.env,
      PORT: String(PORTA),
      DB_CLIENT: 'sqlite',
      DB_FILE: ':memory:',
      JWT_SECRET: 'segredo-de-teste',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ...ambiente
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function aguardar(tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try { if ((await fetch(`${API}/api/health`)).ok) return true; } catch { /* subindo */ }
    await esperar(250);
  }
  return false;
}

const pedir = async (caminho, opcoes = {}) => {
  const r = await fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
  });
  return { status: r.status, dados: await r.json().catch(() => ({})) };
};

/* ------------------------------------------------------------------ */

rmSync(path.join(RAIZ, '.runtime'), { recursive: true, force: true });

console.log('\n=== ATIVAÇÃO DO LOGIN GOOGLE PELA INTERFACE ===');
let servidor = subirServidor();
verificar('servidor iniciado', await aguardar());

let r = await pedir('/api/auth/config');
verificar('sem Client ID: login Google desativado e o campo é oferecido',
  r.dados.google.configurado === false && r.dados.google.aceita_client_id_em_tempo_de_execucao === true,
  `configurado=${r.dados.google.configurado}`);

r = await pedir('/api/auth/google', { redirect: 'manual' });
verificar('fluxo server-side avisa que falta o Secret',
  r.status === 503 && r.dados.erro === 'GOOGLE_NAO_CONFIGURADO' && /CLIENT_SECRET/.test(r.dados.mensagem),
  r.dados.mensagem?.slice(0, 70));

r = await pedir('/api/auth/google/client-id', { method: 'POST', body: JSON.stringify({ client_id: 'abc' }) });
verificar('formato inválido é recusado com explicação',
  r.status === 400 && r.dados.erro === 'CLIENT_ID_INVALIDO' && /apps\.googleusercontent\.com/.test(r.dados.mensagem),
  r.dados.mensagem?.slice(0, 60));

r = await pedir('/api/auth/google/client-id', { method: 'POST', body: JSON.stringify({}) });
verificar('campo vazio é recusado', r.status === 400 && r.dados.erro === 'CLIENT_ID_INVALIDO');

r = await pedir('/api/auth/google/client-id', { method: 'POST', body: JSON.stringify({ client_id: CLIENT_ID }) });
verificar('Client ID válido ativa o login Google', r.status === 200 && r.dados.google.configurado === true,
  r.dados.mensagem);

r = await pedir('/api/auth/config');
verificar('config passa a anunciar o Client ID (botão do Google aparece)',
  r.dados.google.configurado === true && r.dados.google.client_id === CLIENT_ID,
  `client_id=${String(r.dados.google.client_id).slice(0, 30)}...`);
verificar('fluxo server-side continua indisponível sem Secret',
  r.dados.google.fluxo_server_side === false);

const salvo = JSON.parse(readFileSync(path.join(RAIZ, '.runtime', 'google-client-id.json'), 'utf8'));
verificar('Client ID persistido para as próximas execuções',
  salvo.client_id === CLIENT_ID, '.runtime/google-client-id.json');

/* reinicia para provar que a configuração sobrevive */
servidor.kill('SIGKILL');
await esperar(800);
servidor = subirServidor();
verificar('servidor reiniciado', await aguardar());

r = await pedir('/api/auth/config');
verificar('após reiniciar, o login Google continua ativo',
  r.dados.google.configurado === true && r.dados.google.client_id === CLIENT_ID);

/* o Client ID do .env tem precedência? não: o colado depois vence, e ele é o
   mesmo valor que a interface mostra — comportamento esperado e documentado */
r = await pedir('/api/auth/google/credential', { method: 'POST', body: JSON.stringify({ credential: 'x.y.z' }) });
verificar('credencial inválida é recusada com 401 (validação de fato acontece)',
  r.status === 401 && r.dados.erro === 'CREDENCIAL_INVALIDA', r.dados.mensagem?.slice(0, 55));

/* produção: recurso desligado, como manda a segurança */
servidor.kill('SIGKILL');
await esperar(800);
servidor = subirServidor({ NODE_ENV: 'production' });
verificar('servidor em produção iniciado', await aguardar());

r = await pedir('/api/auth/config');
verificar('em produção a interface não oferece o campo',
  r.dados.google.aceita_client_id_em_tempo_de_execucao === false);

r = await pedir('/api/auth/google/client-id', { method: 'POST', body: JSON.stringify({ client_id: CLIENT_ID }) });
verificar('em produção a rota é bloqueada (403)',
  r.status === 403 && r.dados.erro === 'RECURSO_DESATIVADO', r.dados.mensagem?.slice(0, 60));

servidor.kill('SIGKILL');
rmSync(path.join(RAIZ, '.runtime'), { recursive: true, force: true });

console.log(`\n${falhas === 0 ? '✅ ATIVAÇÃO PELA INTERFACE: TODAS AS VERIFICAÇÕES PASSARAM' : `❌ ${falhas} FALHA(S)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
