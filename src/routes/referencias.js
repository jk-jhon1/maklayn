/**
 * =====================================================================
 *  MAKLAYN — Rotas de referências salvas (Referencias_Salvas)
 *
 *  POST   /api/referencias            -> salva um link sugerido pela IA
 *  GET    /api/referencias            -> lista (?busca=)
 *  GET    /api/referencias/abnt       -> exporta em formato ABNT (texto)
 *  DELETE /api/referencias/:id        -> remove
 * =====================================================================
 */

import { Router } from 'express';
import { exigirAutenticacao } from '../auth/middleware.js';
import * as referencias from '../services/referenciaService.js';

const router = Router();
router.use(exigirAutenticacao);

router.post('/', async (req, res, next) => {
  try {
    const { titulo_link, url_referencia, anotacao, id_consulta } = req.body ?? {};
    const referencia = await referencias.salvar({
      idUsuario: req.usuario.id_usuario,
      idConsulta: id_consulta ?? null,
      titulo_link,
      url_referencia,
      anotacao
    });
    res.status(referencia.atualizada ? 200 : 201).json({ referencia });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { busca, pagina, porPagina } = req.query;
    res.json(await referencias.listar({ idUsuario: req.usuario.id_usuario, busca, pagina, porPagina }));
  } catch (e) {
    next(e);
  }
});

router.get('/abnt', async (req, res, next) => {
  try {
    const texto = await referencias.exportarAbnt(req.usuario.id_usuario);
    res.type('text/plain; charset=utf-8').send(texto || 'Nenhuma referência salva ainda.');
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await referencias.excluir(Number(req.params.id), req.usuario.id_usuario));
  } catch (e) {
    next(e);
  }
});

export default router;
