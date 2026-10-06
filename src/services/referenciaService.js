/**
 * MAKLAYN — Serviço de referências salvas (Referencias_Salvas).
 * O usuário guarda os links que a IA sugeriu, com anotação própria.
 */

import { getDb } from '../db/index.js';

function validarUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

export async function salvar({ idUsuario, idConsulta = null, titulo_link, url_referencia, anotacao = null }) {
  if (!url_referencia || !validarUrl(url_referencia)) {
    const e = new Error('URL inválida: informe um endereço http(s) completo.');
    e.status = 400;
    e.codigo = 'URL_INVALIDA';
    throw e;
  }

  const db = getDb();
  const existente = await db.get(
    `SELECT * FROM Referencias_Salvas WHERE id_usuario = ? AND url_referencia = ?`,
    [idUsuario, url_referencia]
  );

  if (existente) {
    await db.run(
      `UPDATE Referencias_Salvas SET titulo_link = ?, anotacao = COALESCE(?, anotacao) WHERE id_referencia = ?`,
      [titulo_link || existente.titulo_link, anotacao, existente.id_referencia]
    );
    return { ...existente, atualizada: true };
  }

  const criada = await db.inserirERetornar('Referencias_Salvas', {
    id_usuario: idUsuario,
    id_consulta: idConsulta,
    titulo_link: String(titulo_link || url_referencia).slice(0, 300),
    url_referencia,
    anotacao
  });

  return { ...criada, atualizada: false };
}

export async function listar({ idUsuario, busca, pagina = 1, porPagina = 50 }) {
  const db = getDb();
  const limite = Math.min(Math.max(Number(porPagina) || 50, 1), 200);
  const deslocamento = (Math.max(Number(pagina) || 1, 1) - 1) * limite;

  const filtros = ['r.id_usuario = ?'];
  const valores = [idUsuario];
  if (busca?.trim()) {
    filtros.push('(r.titulo_link LIKE ? OR r.url_referencia LIKE ? OR r.anotacao LIKE ?)');
    const t = `%${busca.trim()}%`;
    valores.push(t, t, t);
  }
  const where = filtros.join(' AND ');

  const itens = await db.query(
    `SELECT r.*, h.tipo_consulta
     FROM Referencias_Salvas r
     LEFT JOIN Historico_Consultas h ON h.id_consulta = r.id_consulta
     WHERE ${where}
     ORDER BY r.data_salvo DESC, r.id_referencia DESC
     LIMIT ? OFFSET ?`,
    [...valores, limite, deslocamento]
  );

  const total = await db.get(
    `SELECT COUNT(*) AS total FROM Referencias_Salvas r WHERE ${where}`,
    valores
  );

  return { itens, total: Number(total?.total ?? 0) };
}

export async function excluir(idReferencia, idUsuario) {
  const db = getDb();
  const r = await db.run(
    `DELETE FROM Referencias_Salvas WHERE id_referencia = ? AND id_usuario = ?`,
    [idReferencia, idUsuario]
  );
  if (!r.alteradas) {
    const e = new Error('Referência não encontrada.');
    e.status = 404;
    throw e;
  }
  return { removidas: r.alteradas };
}

/** Exporta as referências em formato ABNT (NBR 6023). */
export async function exportarAbnt(idUsuario) {
  const { itens } = await listar({ idUsuario, porPagina: 200 });
  const hoje = new Date().toLocaleDateString('pt-BR');

  return itens
    .map((r, i) =>
      `${i + 1}. ${r.titulo_link.toUpperCase()}. Disponível em: <${r.url_referencia}>. Acesso em: ${hoje}.`
    )
    .join('\n\n');
}

export default { salvar, listar, excluir, exportarAbnt };
