/**
 * MAKLAYN — Serviço de consultas (Histórico_Consultas).
 * Orquestra: prompt do usuário -> motor de IA -> persistência -> resposta.
 */

import { getDb } from '../db/index.js';
import { gerarResposta, extrairReferencias, normalizarModo } from '../ai/index.js';

/**
 * Executa uma consulta completa no Maklayn.
 * @returns {Promise<object>} consulta persistida + referências detectadas
 */
export async function executarConsulta({ idUsuario, prompt, modo, modelo, historico = [] }) {
  const texto = String(prompt ?? '').trim();
  if (!texto) {
    const e = new Error('O prompt não pode ser vazio.');
    e.status = 400;
    e.codigo = 'PROMPT_VAZIO';
    throw e;
  }
  if (texto.length > 20_000) {
    const e = new Error('Prompt muito longo (máximo de 20.000 caracteres).');
    e.status = 413;
    e.codigo = 'PROMPT_LONGO';
    throw e;
  }

  const tipoConsulta = normalizarModo(modo) ?? 'Pesquisa';
  const resultado = await gerarResposta({ prompt: texto, modo: tipoConsulta, modelo, historico });
  const db = getDb();

  const { insertId } = await db.run(
    `INSERT INTO Historico_Consultas
       (id_usuario, tipo_consulta, prompt_usuario, resposta_ia, modelo_usado, tokens_usados, latencia_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      idUsuario,
      tipoConsulta,
      texto,
      resultado.texto,
      resultado.modelo ?? null,
      resultado.tokens ?? null,
      resultado.latencia_ms ?? null
    ]
  );

  const consulta = await db.get(`SELECT * FROM Historico_Consultas WHERE id_consulta = ?`, [insertId]);

  return {
    ...consulta,
    provedor: resultado.provedor,
    fallback: resultado.fallback ?? false,
    aviso: resultado.aviso ?? null,
    referencias_detectadas: extrairReferencias(resultado.texto)
  };
}

/** Histórico paginado, com filtro por pilar e busca textual. */
export async function listar({ idUsuario, tipo, busca, pagina = 1, porPagina = 20, somenteResumo = true }) {
  const db = getDb();
  const limite = Math.min(Math.max(Number(porPagina) || 20, 1), 100);
  const deslocamento = (Math.max(Number(pagina) || 1, 1) - 1) * limite;

  const filtros = ['id_usuario = ?'];
  const valores = [idUsuario];

  const tipoNormalizado = normalizarModo(tipo);
  if (tipoNormalizado) {
    filtros.push('tipo_consulta = ?');
    valores.push(tipoNormalizado);
  }
  if (busca?.trim()) {
    filtros.push('(prompt_usuario LIKE ? OR resposta_ia LIKE ?)');
    valores.push(`%${busca.trim()}%`, `%${busca.trim()}%`);
  }

  const where = filtros.join(' AND ');
  const colunas = somenteResumo
    ? 'id_consulta, tipo_consulta, data_hora, modelo_usado, latencia_ms, tokens_usados, ' +
      'SUBSTR(prompt_usuario, 1, 220) AS resumo_prompt, LENGTH(resposta_ia) AS tamanho_resposta'
    : '*';

  const [itens, total] = await Promise.all([
    db.query(
      `SELECT ${colunas} FROM Historico_Consultas
       WHERE ${where} ORDER BY data_hora DESC, id_consulta DESC LIMIT ? OFFSET ?`,
      [...valores, limite, deslocamento]
    ),
    db.get(`SELECT COUNT(*) AS total FROM Historico_Consultas WHERE ${where}`, valores)
  ]);

  return {
    itens,
    total: Number(total?.total ?? 0),
    pagina: Number(pagina) || 1,
    por_pagina: limite
  };
}

export async function obter(idConsulta, idUsuario) {
  const db = getDb();
  return db.get(
    `SELECT * FROM Historico_Consultas WHERE id_consulta = ? AND id_usuario = ?`,
    [idConsulta, idUsuario]
  );
}

export async function excluir(idConsulta, idUsuario) {
  const db = getDb();
  const r = await db.run(
    `DELETE FROM Historico_Consultas WHERE id_consulta = ? AND id_usuario = ?`,
    [idConsulta, idUsuario]
  );
  if (!r.alteradas) {
    const e = new Error('Consulta não encontrada.');
    e.status = 404;
    e.codigo = 'NAO_ENCONTRADA';
    throw e;
  }
  return { removidas: r.alteradas };
}

/** Agregados para os cartões do dashboard. */
export async function resumo(idUsuario) {
  const db = getDb();
  const stats = await db.get(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN tipo_consulta = 'Codigo'   THEN 1 ELSE 0 END) AS codigo,
        SUM(CASE WHEN tipo_consulta = 'Redacao'  THEN 1 ELSE 0 END) AS redacao,
        SUM(CASE WHEN tipo_consulta = 'Pesquisa' THEN 1 ELSE 0 END) AS pesquisa,
        ROUND(AVG(latencia_ms)) AS latencia_media,
        MAX(data_hora) AS ultima
     FROM Historico_Consultas WHERE id_usuario = ?`,
    [idUsuario]
  );

  const porDia = await db.query(
    `SELECT SUBSTR(data_hora, 1, 10) AS dia, COUNT(*) AS total
     FROM Historico_Consultas
     WHERE id_usuario = ?
     GROUP BY SUBSTR(data_hora, 1, 10)
     ORDER BY dia DESC LIMIT 7`,
    [idUsuario]
  );

  const totalReferencias = await db.get(
    `SELECT COUNT(*) AS total FROM Referencias_Salvas WHERE id_usuario = ?`,
    [idUsuario]
  );

  return {
    total: Number(stats?.total ?? 0),
    por_pilar: {
      Codigo: Number(stats?.codigo ?? 0),
      Redacao: Number(stats?.redacao ?? 0),
      Pesquisa: Number(stats?.pesquisa ?? 0)
    },
    latencia_media_ms: stats?.latencia_media ?? null,
    ultima_consulta: stats?.ultima ?? null,
    referencias_salvas: Number(totalReferencias?.total ?? 0),
    ultimos_dias: porDia.reverse()
  };
}

export default { executarConsulta, listar, obter, excluir, resumo };
