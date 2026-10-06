/**
 * =====================================================================
 *  MAKLAYN — Rotas de sistema: saúde, status dos motores e do banco,
 *  e inspeção do system prompt (útil para auditoria de prompt engineering).
 * =====================================================================
 */

import { Router } from 'express';
import config from '../config.js';
import { getDb } from '../db/index.js';
import { statusProvedores, recomendarModo, SYSTEM_PROMPT, MODE_INSTRUCTIONS } from '../ai/index.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const inicio = Date.now();
  let banco = 'ok';
  try {
    await getDb().ping();
  } catch (e) {
    banco = `falha: ${e.message}`;
  }

  res.status(banco === 'ok' ? 200 : 503).json({
    aplicacao: config.app.nome,
    versao: config.app.versao,
    ambiente: config.app.ambiente,
    uptime_s: Math.round(process.uptime()),
    banco: { cliente: config.db.cliente, status: banco },
    ia: statusProvedores(),
    resposta_ms: Date.now() - inicio
  });
});

router.get('/status', (_req, res) => {
  res.json({
    aplicacao: {
      nome: config.app.nome,
      versao: config.app.versao,
      descricao: config.app.descricao,
      ambiente: config.app.ambiente
    },
    banco: { cliente: config.db.cliente },
    ia: statusProvedores(),
    google_login: {
      configurado: Boolean(config.auth.google.clientId && config.auth.google.clientSecret),
      demo_habilitado: config.auth.google.permitirDemo
    },
    modos: ['Codigo', 'Redacao', 'Pesquisa']
  });
});

/** Mostra o prompt de sistema em vigor (transparência / auditoria). */
router.get('/prompt', (_req, res) => {
  res.json({
    system_prompt: SYSTEM_PROMPT,
    instrucoes_por_modo: MODE_INSTRUCTIONS
  });
});

/** Sugere o pilar ideal para um texto livre (usado pela interface). */
router.post('/recomendar-modo', (req, res) => {
  const texto = String(req.body?.prompt ?? '');
  res.json({ ...recomendarModo(texto), prompt: texto.slice(0, 200) });
});

export default router;
