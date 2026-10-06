/**
 * MAKLAYN — Implementação SQLite (desenvolvimento/preview).
 *
 * Usa o módulo nativo better-sqlite3 ou, se ele não estiver compilado,
 * cai para o SQLite compilado no próprio Node (node:sqlite, Node 22+).
 * O esquema é criado automaticamente no primeiro boot.
 */

import fs from 'node:fs';
import path from 'node:path';
import config, { RAIZ } from '../config.js';

const ARQUIVO_SCHEMA = path.join(RAIZ, 'db', 'schema.sqlite.sql');

function lerSchema() {
  return fs.readFileSync(ARQUIVO_SCHEMA, 'utf8');
}

/* ------------------------------------------------------------------ */
/* Backend A: better-sqlite3                                          */
/* ------------------------------------------------------------------ */
async function abrirBetterSqlite3() {
  const { default: Database } = await import('better-sqlite3');

  fs.mkdirSync(path.dirname(config.db.arquivoSqlite), { recursive: true });
  const raiz = new Database(config.db.arquivoSqlite);
  raiz.pragma('journal_mode = WAL');
  raiz.pragma('foreign_keys = ON');
  raiz.exec(lerSchema());

  const executar = (conexao, sql, params) => {
    const stmt = conexao.prepare(sql);
    return stmt.reader ? stmt.all(...params) : stmt.run(...params);
  };

  return {
    tipo: 'sqlite (better-sqlite3)',

    async query(sql, params = []) {
      const r = executar(raiz, sql, params);
      return Array.isArray(r) ? r : [];
    },

    async run(sql, params = []) {
      const r = executar(raiz, sql, params);
      return {
        insertId: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
        alteradas: r.changes ?? 0
      };
    },

    async comTransacao(fn) {
      const tx = {
        query: async (sql, params = []) => {
          const r = executar(raiz, sql, params);
          return Array.isArray(r) ? r : [];
        },
        run: async (sql, params = []) => {
          const r = executar(raiz, sql, params);
          return {
            insertId: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
            alteradas: r.changes ?? 0
          };
        }
      };
      raiz.exec('BEGIN');
      try {
        const retorno = await fn(tx);
        raiz.exec('COMMIT');
        return retorno;
      } catch (e) {
        raiz.exec('ROLLBACK');
        throw e;
      }
    },

    async fechar() {
      raiz.close();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Backend B: node:sqlite (Node 22+, experiência nativa)              */
/* ------------------------------------------------------------------ */
async function abrirNodeSqlite() {
  const { DatabaseSync } = await import('node:sqlite');

  fs.mkdirSync(path.dirname(config.db.arquivoSqlite), { recursive: true });
  const raiz = new DatabaseSync(config.db.arquivoSqlite);
  raiz.exec('PRAGMA journal_mode = WAL;');
  raiz.exec('PRAGMA foreign_keys = ON;');
  raiz.exec(lerSchema());

  const preparar = (sql, params) => {
    const stmt = raiz.prepare(sql);
    const retorna = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)/i.test(sql);
    return retorna ? { modo: 'linhas', dados: stmt.all(...params) } : { modo: 'run', dados: stmt.run(...params) };
  };

  const conexao = (rotulo) => ({
    query: async (sql, params = []) => {
      const r = preparar(sql, params);
      return r.modo === 'linhas' ? r.dados : [];
    },
    run: async (sql, params = []) => {
      const r = preparar(sql, params);
      return r.modo === 'run'
        ? { insertId: Number(r.dados.lastInsertRowid ?? 0) || null, alteradas: Number(r.dados.changes ?? 0) }
        : { insertId: null, alteradas: 0 };
    },
    _rotulo: rotulo
  });

  const base = conexao('base');

  return {
    tipo: 'sqlite (node:sqlite)',

    query: base.query,
    run: base.run,

    async comTransacao(fn) {
      raiz.exec('BEGIN');
      try {
        const retorno = await fn(conexao('tx'));
        raiz.exec('COMMIT');
        return retorno;
      } catch (e) {
        raiz.exec('ROLLBACK');
        throw e;
      }
    },

    async fechar() {
      raiz.close();
    }
  };
}

export async function criarSqlite() {
  try {
    return await abrirBetterSqlite3();
  } catch (e) {
    console.warn(`[maklayn] better-sqlite3 indisponível (${e.message.split('\n')[0]}). Tentando node:sqlite...`);
    return abrirNodeSqlite();
  }
}

export default { criarSqlite };
