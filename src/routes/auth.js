/**
 * =====================================================================
 *  MAKLAYN — Rotas de autenticação (seção 3 da especificação)
 *
 *  GET  /api/auth/google                  -> redireciona ao Google
 *  GET  /api/auth/google/callback         -> recebe o "code" e cria sessão
 *  POST /api/auth/google/credential       -> login via GIS (id_token)
 *  POST /api/auth/demo                    -> login de demonstração
 *  GET  /api/auth/eu                      -> usuário da sessão atual
 *  POST /api/auth/sair                    -> encerra a sessão
 *  PATCH /api/auth/perfil                 -> atualiza nome/papel
 * =====================================================================
 */

import { Router } from 'express';
import config from '../config.js';
import {
  clientIdAtivo,
  fluxoServerSideDisponivel,
  googleConfigurado,
  urlConsentimento,
  validarState,
  trocarCodePorPerfil,
  validarCredencial
} from '../auth/google.js';
import { assinar, definirCookie, limparCookie } from '../auth/jwt.js';
import {
  definirClientIdRuntime,
  permitidoEmTempoDeExecucao,
  validarFormatoClientId
} from '../auth/clienteGoogleRuntime.js';
import { exigirAutenticacao, limitador } from '../auth/middleware.js';
import * as usuarios from '../services/usuarioService.js';

const router = Router();

/** Monta a resposta pública de sessão (nunca devolve hash/token). */
function sessao(res, usuario, extras = {}) {
  const token = assinar({ sub: usuario.id_usuario, email: usuario.email, papel: usuario.papel });
  definirCookie(res, token);
  return { autenticado: true, usuario, token, ...extras };
}

/* ------------------------------------------------ status da configuração */
router.get('/config', (_req, res) => {
  res.json({
    google: {
      // Basta o Client ID para o botão oficial do Google (fluxo GIS).
      configurado: googleConfigurado(),
      client_id: clientIdAtivo() || null,
      // O fluxo server-side (Authorization Code) também exige o Client Secret.
      fluxo_server_side: fluxoServerSideDisponivel(),
      // Permite ativar o login Google colando o ID aqui, sem editar arquivos.
      aceita_client_id_em_tempo_de_execucao: permitidoEmTempoDeExecucao()
    },
    demo: config.auth.google.permitirDemo,
    provedor_ia: config.ia?.provedor ?? 'mock'
  });
});

/* ------------------------------------------------ fluxo Authorization Code */
router.get('/google', async (req, res, next) => {
  try {
    if (!googleConfigurado()) {
      return res.status(503).json({
        erro: 'GOOGLE_NAO_CONFIGURADO',
        mensagem:
          'Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env (veja o README, item "Login com Google").'
      });
    }
    res.redirect(urlConsentimento({ retorno: req.query.retorno || '/' }));
  } catch (e) {
    next(e);
  }
});

router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    if (error) return res.redirect(`/?erro=${encodeURIComponent(String(error))}`);
    if (!code || !state) {
      const e = new Error('Callback do Google sem "code" ou "state".');
      e.status = 400;
      throw e;
    }

    const retorno = validarState(String(state));
    const perfil = await trocarCodePorPerfil(String(code));
    const [usuario] = await usuarios.upsertDoGoogle(perfil);

    sessao(res, usuario);
    res.redirect(retorno);
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------ Client ID em tempo de execução */
/**
 * Permite ativar o login Google pela própria interface (ambiente de
 * desenvolvimento): o valor é público e fica salvo em .runtime/.
 */
router.post('/google/client-id', (req, res, next) => {
  try {
    if (!permitidoEmTempoDeExecucao()) {
      return res.status(403).json({
        erro: 'RECURSO_DESATIVADO',
        mensagem: 'Definir o Client ID pela interface está desativado neste ambiente. Use a variável GOOGLE_CLIENT_ID.'
      });
    }

    const clientId = String(req.body?.client_id ?? '').trim();
    const problema = validarFormatoClientId(clientId);
    if (problema) {
      return res.status(400).json({ erro: 'CLIENT_ID_INVALIDO', mensagem: problema });
    }

    definirClientIdRuntime(clientId);
    res.json({
      ok: true,
      mensagem: 'Login Google ativado. Recarregue a página e use o botão do Google.',
      google: { configurado: true, client_id: clientId }
    });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------ Google Identity Services */
router.post('/google/credential', limitador({ maximo: 20 }), async (req, res, next) => {
  try {
    const credencial = req.body?.credential ?? req.body?.id_token;
    if (!credencial) {
      return res.status(400).json({ erro: 'CREDENCIAL_AUSENTE', mensagem: 'Envie o campo "credential".' });
    }

    const perfil = await validarCredencial(String(credencial));
    const [usuario] = await usuarios.upsertDoGoogle(perfil);

    res.json(sessao(res, usuario));
  } catch (e) {
    e.status ||= 401;
    next(e);
  }
});

/* ------------------------------------------------ login de demonstração */
router.post('/demo', limitador({ maximo: 15 }), async (req, res, next) => {
  try {
    if (!config.auth.google.permitirDemo) {
      return res.status(403).json({ erro: 'DEMO_DESATIVADO', mensagem: 'ALLOW_DEMO_LOGIN=false no .env.' });
    }
    const usuario = await usuarios.criarOuBuscarDemo({
      nome: req.body?.nome,
      email: req.body?.email,
      papel: req.body?.papel
    });
    res.json(sessao(res, usuario, { demo: true }));
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------ sessão atual */
router.get('/eu', (req, res) => {
  if (!req.usuario) return res.json({ autenticado: false, usuario: null });
  res.json({ autenticado: true, usuario: req.usuario });
});

router.post('/sair', (req, res) => {
  limparCookie(res);
  res.json({ autenticado: false, mensagem: 'Sessão encerrada.' });
});

router.patch('/perfil', exigirAutenticacao, async (req, res, next) => {
  try {
    const usuario = await usuarios.atualizarPerfil(req.usuario.id_usuario, req.body ?? {});
    res.json({ usuario });
  } catch (e) {
    next(e);
  }
});

export default router;
