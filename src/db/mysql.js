/**
 * MAKLAYN — Implementação MySQL (produção, conforme a especificação).
 * Requer o pacote mysql2 (já listado em dependencies).
 */

import mysql from 'mysql2/promise';
import config from '../config.js';

export async function criarMysql() {
  const cfg = config.db.mysql;

  const pool = mysql.createPool({
    ...cfg,
    namedPlaceholders: false,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: true
  });

  // Falha cedo e com mensagem clara se o banco não estiver acessível.
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();

  return {
    tipo: 'mysql',

    async query(sql, params = []) {
      const [linhas] = await pool.query(sql, params);
      return Array.isArray(linhas) ? linhas : [];
    },

    async run(sql, params = []) {
      const [resultado] = await pool.execute(sql, params);
      return {
        insertId: resultado.insertId ?? null,
        alteradas: resultado.affectedRows ?? 0,
        avisos: resultado.warningStatus
      };
    },

    async comTransacao(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const tx = {
          query: async (sql, params = []) => {
            const [linhas] = await conn.query(sql, params);
            return Array.isArray(linhas) ? linhas : [];
          },
          run: async (sql, params = []) => {
            const [resultado] = await conn.execute(sql, params);
            return {
              insertId: resultado.insertId ?? null,
              alteradas: resultado.affectedRows ?? 0
            };
          }
        };
        const retorno = await fn(tx);
        await conn.commit();
        return retorno;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },

    async fechar() {
      await pool.end();
    }
  };
}

export default { criarMysql };
