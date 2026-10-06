/**
 * MAKLAYN — Serviço de usuários.
 * Camada de domínio: nenhum código HTTP aqui, apenas regras e SQL.
 */

import { getDb } from '../db/index.js';

const CAMPOS_PUBLICOS =
  'id_usuario, nome_completo, email, google_id, foto_url, papel, ativo, data_criacao, data_acesso';

export async function buscarPorId(id) {
  if (!id) return null;
  const db = getDb();
  return db.get(`SELECT ${CAMPOS_PUBLICOS} FROM Usuarios WHERE id_usuario = ?`, [id]);
}

export async function buscarPorEmail(email) {
  const db = getDb();
  return db.get(`SELECT ${CAMPOS_PUBLICOS} FROM Usuarios WHERE email = ?`, [String(email).toLowerCase()]);
}

export async function buscarPorGoogleId(googleId) {
  const db = getDb();
  return db.get(`SELECT ${CAMPOS_PUBLICOS} FROM Usuarios WHERE google_id = ?`, [googleId]);
}

/**
 * Cria ou atualiza o usuário a partir do perfil do Google.
 * Usa transação para evitar corrida entre dois logins simultâneos.
 */
export async function upsertDoGoogle(perfil) {
  const db = getDb();
  const email = String(perfil.email).toLowerCase();

  return db.transacao(async (tx) => {
    const porGoogle = await tx.query(
      `SELECT ${CAMPOS_PUBLICOS} FROM Usuarios WHERE google_id = ?`,
      [perfil.google_id]
    );
    if (porGoogle[0]) {
      await tx.run(
        `UPDATE Usuarios SET nome_completo = ?, foto_url = ?, data_acesso = NOW() WHERE id_usuario = ?`,
        [perfil.nome_completo, perfil.foto_url ?? null, porGoogle[0].id_usuario]
      );
      return tx.query(`SELECT ${CAMPOS_PUBLICOS} FROM Usuarios WHERE id_usuario = ?`, [porGoogle[0].id_usuario]);
    }

    const porEmail = await tx.query(`SELECT ${CAMPOS_PUBLICOS} FROM Usuarios WHERE email = ?`, [email]);
    if (porEmail[0]) {
      // conta criada antes do login Google: vincula o google_id
      await tx.run(
        `UPDATE Usuarios SET google_id = ?, nome_completo = ?, foto_url = ?, data_acesso = NOW()
         WHERE id_usuario = ?`,
        [perfil.google_id, perfil.nome_completo, perfil.foto_url ?? null, porEmail[0].id_usuario]
      );
      return tx.query(`SELECT ${CAMPOS_PUBLICOS} FROM Usuarios WHERE id_usuario = ?`, [porEmail[0].id_usuario]);
    }

    await tx.run(
      `INSERT INTO Usuarios (nome_completo, email, google_id, foto_url, papel) VALUES (?, ?, ?, ?, ?)`,
      [perfil.nome_completo, email, perfil.google_id, perfil.foto_url ?? null, 'aluno']
    );
    const criado = await tx.query(`SELECT ${CAMPOS_PUBLICOS} FROM Usuarios WHERE email = ?`, [email]);
    return criado;
  });
}

/** Login de demonstração (apenas quando ALLOW_DEMO_LOGIN=true). */
export async function criarOuBuscarDemo({ nome, email, papel = 'aluno' }) {
  const db = getDb();
  const emailLimpo = String(email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) {
    const e = new Error('Informe um e-mail válido para o login de demonstração.');
    e.status = 400;
    throw e;
  }

  const existente = await buscarPorEmail(emailLimpo);
  if (existente) {
    await db.run(`UPDATE Usuarios SET data_acesso = NOW() WHERE id_usuario = ?`, [existente.id_usuario]);
    return buscarPorId(existente.id_usuario);
  }

  return db.inserirERetornar('Usuarios', {
    nome_completo: nome?.trim() || emailLimpo.split('@')[0],
    email: emailLimpo,
    google_id: `demo:${emailLimpo}`,
    foto_url: null,
    papel: ['aluno', 'dev', 'professor', 'admin'].includes(papel) ? papel : 'aluno'
  });
}

export async function atualizarPerfil(id, { nome_completo, papel }) {
  const db = getDb();
  const campos = [];
  const valores = [];

  if (nome_completo?.trim()) {
    campos.push('nome_completo = ?');
    valores.push(nome_completo.trim());
  }
  if (papel && ['aluno', 'dev', 'professor'].includes(papel)) {
    campos.push('papel = ?');
    valores.push(papel);
  }
  if (!campos.length) return buscarPorId(id);

  valores.push(id);
  await db.run(`UPDATE Usuarios SET ${campos.join(', ')} WHERE id_usuario = ?`, valores);
  return buscarPorId(id);
}

export async function estatisticas(idUsuario) {
  const db = getDb();
  return db.get(`SELECT * FROM vw_estatisticas_usuario WHERE id_usuario = ?`, [idUsuario]);
}

export default {
  buscarPorId,
  buscarPorEmail,
  buscarPorGoogleId,
  upsertDoGoogle,
  criarOuBuscarDemo,
  atualizarPerfil,
  estatisticas
};
