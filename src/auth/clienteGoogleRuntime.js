/**
 * =====================================================================
 *  MAKLAYN — Client ID do Google definido em tempo de execução
 * =====================================================================
 *
 *  O Client ID do Google é informação PÚBLICA (aparece no HTML de
 *  qualquer site que oferece "Entrar com Google"). Ele normalmente vem
 *  do `.env`, mas em desenvolvimento é chato ter que editar arquivo e
 *  reiniciar o servidor só para testar o login.
 *
 *  Este módulo permite que o próprio aplicativo receba o Client ID pela
 *  interface (POST /api/auth/google/client-id), guardando-o em
 *  `.runtime/google-client-id.json`.
 *
 *  Segurança:
 *   • desativado quando NODE_ENV=production;
 *   • pode ser desligado com ALLOW_RUNTIME_CLIENT_ID=false;
 *   • o formato do valor é validado antes de aceitar;
 *   • é um valor público — não há segredo algum armazenado aqui.
 *     (O Client Secret continua exclusivamente no `.env` do servidor.)
 * =====================================================================
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ARQUIVO = path.resolve(process.cwd(), '.runtime', 'google-client-id.json');

/** Formato de um Client ID do Google (ex.: 123-abc.apps.googleusercontent.com). */
const FORMATO = /^\d{6,}-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;

let cache = null;

/** Client ID definido em tempo de execução ('' quando não houver). */
export function clientIdRuntime() {
  if (cache !== null) return cache;

  try {
    if (existsSync(ARQUIVO)) {
      const dados = JSON.parse(readFileSync(ARQUIVO, 'utf8'));
      cache = String(dados.client_id || '');
    } else {
      cache = '';
    }
  } catch {
    cache = '';
  }
  return cache;
}

/** Grava o Client ID (em memória e em disco). */
export function definirClientIdRuntime(clientId) {
  const limpo = String(clientId || '').trim();
  cache = limpo;

  try {
    mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    writeFileSync(
      ARQUIVO,
      JSON.stringify({ client_id: limpo, definido_em: new Date().toISOString() }, null, 2),
      'utf8'
    );
  } catch {
    // sem permissão de escrita: o valor continua válido nesta execução
  }
  return cache;
}

/** O recurso está habilitado neste ambiente? */
export function permitidoEmTempoDeExecucao() {
  if (process.env.NODE_ENV === 'production') return false;
  return String(process.env.ALLOW_RUNTIME_CLIENT_ID ?? 'true').toLowerCase() !== 'false';
}

/** Valida o formato e devolve uma mensagem de erro, ou null se estiver ok. */
export function validarFormatoClientId(clientId) {
  const valor = String(clientId || '').trim();
  if (!valor) return 'Informe o Client ID do Google.';
  if (!FORMATO.test(valor)) {
    return 'Isso não parece um Client ID do Google — ele termina em ".apps.googleusercontent.com" ' +
           'e começa com o número do projeto (ex.: 1234567890-abc123.apps.googleusercontent.com).';
  }
  return null;
}

export default { clientIdRuntime, definirClientIdRuntime, permitidoEmTempoDeExecucao, validarFormatoClientId };
