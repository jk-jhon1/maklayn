/**
 * =====================================================================
 *  MAKLAYN — Rotas de consultas (núcleo funcional da IA)
 *
 *  POST   /api/consultas          -> executa uma consulta e persiste
 *  GET    /api/consultas          -> histórico paginado (?tipo=&busca=&pagina=)
 *  GET    /api/consultas/resumo   -> métricas do dashboard
 *  GET    /api/consultas/:id      -> consulta completa
 *  DELETE /api/consultas/:id      -> remove do histórico
 * =====================================================================
 */

import { Router } from 'express';
import { exigirAutenticacao, limitador } from '../auth/middleware.js';
import * as consultas from '../services/consultaService.js';
import { TIPOS_VALIDOS, normalizarModo, recomendarModo, statusProvedores } from '../ai/index.js';

const router = Router();

router.use(exigirAutenticacao);

/* Executa uma consulta no Maklayn */
router.post('/', limitador({ janelaMs: 60_000, maximo: 20 }), async (req, res, next) => {
  try {
    const { prompt, mensagem, modo, tipo, modelo, historico } = req.body ?? {};
    const texto = prompt ?? mensagem;

    if (!texto || !String(texto).trim()) {
      return res.status(400).json({
        erro: 'PROMPT_VAZIO',
        mensagem: 'Envie o campo "prompt" com a sua pergunta.'
      });
    }

    const modoEscolhido = normalizarModo(modo ?? tipo) ?? recomendarModo(String(texto)).modo;

    const consulta = await consultas.executarConsulta({
      idUsuario: req.usuario.id_usuario,
      prompt: texto,
      modo: modoEscolhido,
      modelo,
      historico: Array.isArray(historico) ? historico : []
    });

    res.status(201).json({ consulta });
  } catch (e) {
    next(e);
  }
});

/* Histórico */
router.get('/', async (req, res, next) => {
  try {
    const { tipo, busca, pagina, porPagina, completo } = req.query;
    const resultado = await consultas.listar({
      idUsuario: req.usuario.id_usuario,
      tipo,
      busca,
      pagina,
      porPagina,
      somenteResumo: completo !== '1'
    });
    res.json(resultado);
  } catch (e) {
    next(e);
  }
});

router.get('/resumo', async (req, res, next) => {
  try {
    res.json(await consultas.resumo(req.usuario.id_usuario));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const consulta = await consultas.obter(Number(req.params.id), req.usuario.id_usuario);
    if (!consulta) {
      return res.status(404).json({ erro: 'NAO_ENCONTRADA', mensagem: 'Consulta não encontrada no seu histórico.' });
    }
    res.json({ consulta });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await consultas.excluir(Number(req.params.id), req.usuario.id_usuario));
  } catch (e) {
    next(e);
  }
});

export default router;
export { TIPOS_VALIDOS, statusProvedores };
