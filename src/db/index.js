/**
 * =====================================================================
 *  MAKLAYN — Camada de acesso a dados (fachada)
 *
 *  Expõe uma API única e ASSÍNCRONA, independente do SGBD:
 *     db.query(sql, params)   -> array de linhas
 *     db.get(sql, params)     -> primeira linha ou null
 *     db.run(sql, params)     -> { insertId, alteradas }
 *     db.transacao(async (tx) => { ... })  -> atômico
 *
 *  Implementações: MySQL (mysql2 — produção, conforme a especificação)
 *  e SQLite (better-sqlite3 — desenvolvimento local sem servidor).
 * =====================================================================
 */

import config from '../config.js';
import { criarMysql } from './mysql.js';
import { criarSqlite } from './sqlite.js';

/** Diferenças mínimas de dialeto entre MySQL e SQLite. */
function adaptarSql(sql, cliente) {
  if (cliente !== 'sqlite') return sql;
  return String(sql)
    .replace(/NOW\(\)/gi, "datetime('now')")
    .replace(/CURRENT_TIMESTAMP/gi, "datetime('now')")
    .replace(/DEFAULT \(datetime\('now'\)\)/gi, "DEFAULT (datetime('now'))")
    .replace(/\bFOR UPDATE\b/gi, '');
}

const CHAVE_PRIMARIA = {
  Usuarios: 'id_usuario',
  Historico_Consultas: 'id_consulta',
  Referencias_Salvas: 'id_referencia',
  Usuario: 'id_usuario'
};

function montar(implementacao) {
  const { cliente } = config.db;

  const normalizar = (resultado) => (Array.isArray(resultado) ? resultado : (resultado?.linhas ?? []));

  const api = {
    cliente,
    tipo: implementacao.tipo,

    async query(sql, params = []) {
      return normalizar(await implementacao.query(adaptarSql(sql, cliente), params));
    },

    async get(sql, params = []) {
      return (await api.query(sql, params))[0] ?? null;
    },

    async run(sql, params = []) {
      return implementacao.run(adaptarSql(sql, cliente), params);
    },

    /** Executa `fn(tx)` dentro de uma transação; faz rollback em erro. */
    async transacao(fn) {
      return implementacao.comTransacao(async (tx) => {
        const txApi = {
          query: async (sql, params = []) =>
            normalizar(await tx.query(adaptarSql(sql, cliente), params)),
          run: (sql, params = []) => tx.run(adaptarSql(sql, cliente), params)
        };
        return fn(txApi);
      });
    },

    /** INSERT + SELECT do registro criado, em uma só chamada. */
    async inserirERetornar(tabela, dados) {
      const colunas = Object.keys(dados);
      const marcadores = colunas.map(() => '?').join(', ');
      const valores = colunas.map((c) => dados[c]);
      const { insertId } = await api.run(
        `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${marcadores})`,
        valores
      );
      const chave = CHAVE_PRIMARIA[tabela] ?? 'id';
      return api.get(`SELECT * FROM ${tabela} WHERE ${chave} = ?`, [insertId]);
    },

    async ping() {
      await api.query('SELECT 1');
      return true;
    },

    async fechar() {
      return implementacao.fechar?.();
    }
  };

  return api;
}

let db;

export async function conectarBanco() {
  if (db) return db;

  if (config.db.cliente === 'sqlite') {
    db = montar(await criarSqlite());
    console.log(`[maklayn] banco conectado: SQLite -> ${config.db.arquivoSqlite}`);
  } else {
    db = montar(await criarMysql());
    const { host, port, database } = config.db.mysql;
    console.log(`[maklayn] banco conectado: MySQL -> ${host}:${port}/${database}`);
  }

  await db.ping();
  return db;
}

export function getDb() {
  if (!db) throw new Error('Banco não inicializado: chame conectarBanco() antes.');
  return db;
}

export async function fecharBanco() {
  if (db) {
    await db.fechar();
    db = null;
  }
}

export default { conectarBanco, getDb, fecharBanco };
