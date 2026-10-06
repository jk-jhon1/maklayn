/**
 * MAKLAYN — Middlewares de autenticação e de tratamento de erros.
 */

import { verificar, extrairToken } from './jwt.js';
import { buscarPorId } from '../services/usuarioService.js';

/** Anexa req.usuario quando houver token válido; nunca bloqueia. */
export async function identificarUsuario(req, _res, next) {
  try {
    const token = extrairToken(req);
    if (!token) return next();

    const corpo = verificar(token);
    const usuario = await buscarPorId(corpo.sub);
    if (usuario?.ativo) req.usuario = usuario;
    next();
  } catch {
    next(); // token inválido/expirado => segue como visitante
  }
}

/** Exige sessão válida. */
export function exigirAutenticacao(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({
      erro: 'NAO_AUTENTICADO',
      mensagem: 'Faça login para acessar este recurso.'
    });
  }
  next();
}

/** Exige um dos papéis informados (ex.: admin). */
export function exigirPapel(...papeis) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: 'NAO_AUTENTICADO' });
    if (!papeis.includes(req.usuario.papel)) {
      return res.status(403).json({ erro: 'SEM_PERMISSAO', mensagem: 'Seu perfil não permite esta ação.' });
    }
    next();
  };
}

/** Limitador simples em memória (proteção básica contra abuso). */
export function limitador({ janelaMs = 60_000, maximo = 30, chave = (req) => req.ip } = {}) {
  const registros = new Map();

  setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of registros) if (agora - v.inicio > janelaMs) registros.delete(k);
  }, janelaMs).unref?.();

  return (req, res, next) => {
    const k = chave(req);
    const agora = Date.now();
    const atual = registros.get(k);

    if (!atual || agora - atual.inicio > janelaMs) {
      registros.set(k, { inicio: agora, contagem: 1 });
      return next();
    }

    atual.contagem += 1;
    if (atual.contagem > maximo) {
      res.setHeader('Retry-After', Math.ceil((janelaMs - (agora - atual.inicio)) / 1000));
      return res.status(429).json({
        erro: 'LIMITE_EXCEDIDO',
        mensagem: `Muitas requisições. Aguarde ${Math.ceil((janelaMs - (agora - atual.inicio)) / 1000)}s.`
      });
    }
    next();
  };
}

/** Tratador central de erros — resposta JSON consistente. */
export function tratadorDeErros(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[maklayn] erro:', err);

  res.status(status).json({
    erro: err.codigo ?? (status === 500 ? 'ERRO_INTERNO' : 'ERRO'),
    mensagem: status === 500 && config$producao() ? 'Erro interno do servidor.' : err.message,
    ...(err.detalhes ? { detalhes: err.detalhes } : {})
  });
}

function config$producao() {
  return process.env.NODE_ENV === 'production';
}

export default { identificarUsuario, exigirAutenticacao, exigirPapel, limitador, tratadorDeErros };
