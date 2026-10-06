/**
 * =====================================================================
 *  MAKLAYN — Servidor HTTP (Express)
 *  Assistente de IA Multidisciplinar: Engenharia de Software,
 *  Redação Padrão ENEM e Pesquisa Acadêmica/Técnica.
 *
 *  Executar:  npm start        (produção)
 *             npm run dev      (recarrega ao salvar)
 * =====================================================================
 */

import express from 'express';
import path from 'node:path';
import config, { RAIZ, validarConfig } from './config.js';
import { conectarBanco, fecharBanco } from './db/index.js';
import { identificarUsuario, tratadorDeErros } from './auth/middleware.js';
import rotasAuth from './routes/auth.js';
import rotasConsultas from './routes/consultas.js';
import rotasReferencias from './routes/referencias.js';
import rotasSistema from './routes/sistema.js';

export async function criarApp() {
  await conectarBanco();

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  /* --- Cabeçalhos de segurança ------------------------------------- */
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' https://accounts.google.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "frame-src https://accounts.google.com",
        "font-src 'self' data:",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')
    );
    next();
  });

  /* --- Parsers ------------------------------------------------------ */
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  /* --- Sessão (cookie httpOnly ou Bearer) --------------------------- */
  app.use(identificarUsuario);

  /* --- API ---------------------------------------------------------- */
  app.use('/api/auth', rotasAuth);
  app.use('/api/consultas', rotasConsultas);
  app.use('/api/referencias', rotasReferencias);
  app.use('/api', rotasSistema);

  /* --- Frontend estático -------------------------------------------- */
  app.use(express.static(path.join(RAIZ, 'public'), { extensions: ['html'], maxAge: '1h' }));

  app.get('/', (_req, res) => res.sendFile(path.join(RAIZ, 'public', 'index.html')));

  /* --- 404 e erros --------------------------------------------------- */
  app.use((req, res) => {
    res.status(404).json({ erro: 'ROTA_NAO_ENCONTRADA', caminho: req.originalUrl });
  });
  app.use(tratadorDeErros);

  return app;
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */
const executadoDiretamente =
  process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (executadoDiretamente) {
  const app = await criarApp();
  const { porta, host } = config.app;

  const servidor = app.listen(porta, host, () => {
    const avisos = validarConfig();
    console.log('');
    console.log('  ███  MAKLAYN  —  Assistente de IA Multidisciplinar');
    console.log(`  ▸ Servidor:  http://localhost:${porta}`);
    console.log(`  ▸ Banco:     ${config.db.cliente === 'sqlite' ? 'SQLite (dev)' : 'MySQL'}`);
    console.log(`  ▸ Motor IA:  ${config.ia.provedor}`);
    console.log(`  ▸ Google:    ${config.auth.google.clientId ? 'configurado' : 'modo demonstração'}`);
    if (avisos.length) console.log(`\n  ⚠  ${avisos.join('\n  ⚠  ')}`);
    console.log('');
  });

  const encerrar = async (sinal) => {
    console.log(`\n[maklayn] ${sinal} recebido — encerrando com elegância...`);
    servidor.close(async () => {
      await fecharBanco();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

export default { criarApp };
