#!/usr/bin/env node
/**
 * MAKLAYN — Reset do banco de desenvolvimento.
 *   SQLite: apaga o arquivo e recria o esquema.
 *   MySQL : remove as tabelas e reaplica o schema.
 */

import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import config, { RAIZ } from '../src/config.js';

async function resetSqlite() {
  const arquivo = config.db.arquivoSqlite;
  for (const sufixo of ['', '-wal', '-shm']) {
    const alvo = arquivo + sufixo;
    if (fs.existsSync(alvo)) {
      fs.unlinkSync(alvo);
      console.log(`  ✔ removido ${path.basename(alvo)}`);
    }
  }
  const { criarSqlite } = await import('./sqlite.js');
  const impl = await criarSqlite();
  const tabelas = await impl.query(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'"
  );
  await impl.fechar();
  console.log(`  ✔ esquema recriado (${tabelas.map((t) => t.name).join(', ')})`);
}

async function resetMysql() {
  const { host, port, user, password, database } = config.db.mysql;
  const conexao = await mysql.createConnection({ host, port, user, password, database });
  await conexao.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const tabela of ['Referencias_Salvas', 'Historico_Consultas', 'Usuarios']) {
    await conexao.query(`DROP TABLE IF EXISTS ${tabela}`);
    console.log(`  ✔ tabela ${tabela} removida`);
  }
  await conexao.query('SET FOREIGN_KEY_CHECKS = 1');
  await conexao.end();

  const { execSync } = await import('node:child_process');
  execSync('node src/db/migrate.js', { cwd: RAIZ, stdio: 'inherit' });
}

(async () => {
  console.log(`[reset] banco: ${config.db.cliente}`);
  if (config.db.cliente === 'sqlite') await resetSqlite();
  else await resetMysql();
  console.log('[reset] concluído.');
})().catch((e) => {
  console.error('[reset] FALHA:', e.message);
  process.exit(1);
});
