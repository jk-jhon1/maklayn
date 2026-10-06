#!/usr/bin/env node
/**
 * MAKLAYN — Migração de banco (MySQL).
 *
 *   npm run db:migrate
 *
 * Lê db/schema.mysql.sql, remove comentários e executa cada instrução.
 * O script é idempotente (CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE VIEW).
 */

import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import config, { RAIZ } from '../src/config.js';

const ARQUIVO = path.join(RAIZ, 'db', 'schema.mysql.sql');

/** Divide o script em comandos individuais, respeitando strings e comentários. */
function dividirComandos(sql) {
  const comandos = [];
  let atual = '';
  let emString = null;
  let emLinhaComentario = false;
  let emBlocoComentario = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const prox = sql[i + 1];

    if (emLinhaComentario) {
      if (c === '\n') emLinhaComentario = false;
      continue;
    }
    if (emBlocoComentario) {
      if (c === '*' && prox === '/') {
        emBlocoComentario = false;
        i++;
      }
      continue;
    }
    if (emString) {
      atual += c;
      if (c === emString && sql[i - 1] !== '\\') emString = null;
      continue;
    }

    if (c === '-' && prox === '-') { emLinhaComentario = true; i++; continue; }
    if (c === '#' ) { emLinhaComentario = true; continue; }
    if (c === '/' && prox === '*') { emBlocoComentario = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { emString = c; atual += c; continue; }

    if (c === ';') {
      if (atual.trim()) comandos.push(atual.trim());
      atual = '';
      continue;
    }
    atual += c;
  }
  if (atual.trim()) comandos.push(atual.trim());
  return comandos;
}

async function migrar() {
  if (!fs.existsSync(ARQUIVO)) throw new Error(`Arquivo não encontrado: ${ARQUIVO}`);
  if (config.db.cliente === 'sqlite') {
    console.log('[migrate] DB_CLIENT=sqlite — o esquema SQLite é criado automaticamente no boot.');
    return;
  }

  const { host, port, user, password } = config.db.mysql;
  console.log(`[migrate] conectando em ${user}@${host}:${port} ...`);

  const conexao = await mysql.createConnection({ host, port, user, password, multipleStatements: false });
  const comandos = dividirComandos(fs.readFileSync(ARQUIVO, 'utf8'));
  console.log(`[migrate] ${comandos.length} comandos a executar.`);

  let ok = 0;
  for (const comando of comandos) {
    const rotulo = comando.split('\n')[0].slice(0, 70);
    try {
      await conexao.query(comando);
      ok++;
      console.log(`  ✔ ${rotulo}`);
    } catch (e) {
      console.error(`  ✖ ${rotulo}\n     ${e.message}`);
      if (!/already exists/i.test(e.message)) {
        await conexao.end();
        throw e;
      }
    }
  }

  await conexao.end();
  console.log(`[migrate] concluído: ${ok}/${comandos.length} comandos aplicados em "${config.db.mysql.database}".`);
}

migrar().catch((e) => {
  console.error('[migrate] FALHA:', e.message);
  process.exit(1);
});
