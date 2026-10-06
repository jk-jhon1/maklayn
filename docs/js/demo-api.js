/**
 * =====================================================================
 *  MAKLAYN — Adaptador de demonstração estática (GitHub Pages)
 * =====================================================================
 *
 *  Permite navegar a INTERFACE REAL do Maklayn sem servidor:
 *
 *    • intercepta as chamadas `/api/*` feitas pelo front-end;
 *    • responde usando o MESMO motor simulado do backend
 *      (`motor-mock.js`, cópia fiel de `src/ai/providers/mock.js`);
 *    • persiste usuários, histórico e referências no `localStorage`
 *      (substituindo o banco relacional da versão completa);
 *    • mantém o mesmo contrato JSON da API Node/Java.
 *
 *  O aplicativo completo — Express + MySQL ou Spring Boot + JDK 11,
 *  com banco relacional e login Google OAuth 2.0 real — está em:
 *  https://github.com/jk-jhon1/maklayn
 *
 *  Este arquivo NÃO faz parte da aplicação de produção; existe apenas
 *  para publicar a interface como página estática.
 * =====================================================================
 */

import { gerar, meta as motorMeta } from './motor-mock.js';
import { SYSTEM_PROMPT, MODE_INSTRUCTIONS, recomendarModo } from './systemPrompt.js';

/* ------------------------------------------------------------------ */
/* Configuração do login Google na demonstração                       */
/* ------------------------------------------------------------------ */

/**
 * O fluxo "Google Identity Services" entrega ao navegador um `id_token`
 * (JWT assinado pelo Google). A verificação usa apenas as CHAVES PÚBLICAS
 * do Google (JWKS) — por isso funciona sem backend e sem Client Secret.
 *
 * O Client ID é informação pública (aparece no HTML de qualquer site).
 * Defina-o em `config.js` ou cole na tela de login (fica no localStorage).
 */
const CONFIG_PADRAO = {
  googleClientId: '',
  googleJwksUri: 'https://www.googleapis.com/oauth2/v3/certs'
};

function configDemo() {
  const doArquivo = (typeof globalThis !== 'undefined' && globalThis.MAKLAYN_DEMO) || {};
  let doNavegador = '';
  try { doNavegador = localStorage.getItem('maklayn-google-client-id') || ''; } catch { /* modo privado */ }
  return {
    googleClientId: doArquivo.googleClientId || doNavegador || '',
    googleJwksUri: doArquivo.googleJwksUri || CONFIG_PADRAO.googleJwksUri
  };
}

const b64urlParaTexto = (trecho) => {
  const base64 = trecho.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const b64urlParaBytes = (trecho) => {
  const base64 = trecho.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
};

/** Busca as chaves públicas do Google (com cache de 1 hora). */
let chavesGoogle = null;
async function obterChavesGoogle() {
  if (chavesGoogle && chavesGoogle.expiraEm > Date.now()) return chavesGoogle.chaves;

  const resposta = await fetch(configDemo().googleJwksUri);
  if (!resposta.ok) throw new Error('Não foi possível obter as chaves públicas do Google.');

  const dados = await resposta.json();
  chavesGoogle = { chaves: dados.keys || [], expiraEm: Date.now() + 3600 * 1000 };
  return chavesGoogle.chaves;
}

/**
 * Verifica um id_token do Google exatamente como um servidor faria:
 * assinatura RS256 (chave pública), emissor, público-alvo, validade e e-mail.
 * Devolve o conteúdo (claims) ou lança um erro explicativo.
 */
async function verificarIdTokenGoogle(idToken, clientId) {
  const partes = String(idToken).split('.');
  if (partes.length !== 3) throw new Error('Token malformado.');

  const cabecalho = JSON.parse(b64urlParaTexto(partes[0]));
  const conteudo = JSON.parse(b64urlParaTexto(partes[1]));

  if (conteudo.iss !== 'accounts.google.com' && conteudo.iss !== 'https://accounts.google.com') {
    throw new Error('Emissor inesperado no token.');
  }
  if (conteudo.aud !== clientId) {
    throw new Error('Esta credencial foi emitida para outra aplicação (Client ID diferente).');
  }
  if (!(conteudo.exp * 1000 > Date.now())) {
    throw new Error('Token expirado — tente entrar novamente.');
  }
  if (conteudo.email_verified === false || conteudo.email_verified === 'false') {
    throw new Error('A conta Google deste e-mail não está verificada.');
  }

  // Assinatura: mesma checagem que o backend faz.
  const chaves = await obterChavesGoogle();
  const chave = chaves.find((k) => k.kid === cabecalho.kid) || chaves[0];
  if (!chave) throw new Error('Chave pública correspondente não encontrada.');

  const chaveCripto = await crypto.subtle.importKey(
    'jwk',
    { kty: chave.kty, n: chave.n, e: chave.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const assinaturaOk = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    chaveCripto,
    b64urlParaBytes(partes[2]),
    new TextEncoder().encode(`${partes[0]}.${partes[1]}`)
  );

  if (!assinaturaOk) throw new Error('Assinatura do token inválida.');

  return conteudo;
}

/* ------------------------------------------------------------------ */
/* Armazenamento local (papel do banco de dados na demonstração)       */
/* ------------------------------------------------------------------ */

const CHAVE_BANCO = 'maklayn-demo-banco-v1';
const CHAVE_SESSAO = 'maklayn-demo-sessao-v1';
const TIPOS_VALIDOS = ['Codigo', 'Redacao', 'Pesquisa'];
const PAPEIS_VALIDOS = ['aluno', 'dev', 'professor', 'admin']; // mesma lista do backend

function bancoVazio() {
  return {
    usuarios: [],
    consultas: [],
    referencias: [],
    seq: { usuario: 0, consulta: 0, referencia: 0 }
  };
}

function lerBanco() {
  try {
    const bruto = localStorage.getItem(CHAVE_BANCO);
    if (!bruto) return bancoVazio();
    const dados = JSON.parse(bruto);
    return { ...bancoVazio(), ...dados, seq: { ...bancoVazio().seq, ...(dados.seq || {}) } };
  } catch {
    return bancoVazio();
  }
}

function gravarBanco(banco) {
  try {
    localStorage.setItem(CHAVE_BANCO, JSON.stringify(banco));
  } catch { /* modo privado do navegador: a sessão vale só enquanto a aba viver */ }
}

function lerSessao() {
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

function gravarSessao(idUsuario) {
  try {
    if (idUsuario) sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ idUsuario }));
    else sessionStorage.removeItem(CHAVE_SESSAO);
  } catch { /* ignora */ }
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const dois = (n) => String(n).padStart(2, '0');

function agora() {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())} ` +
         `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Aliases aceitos — cópia de `normalizarModo` (src/ai/index.js). */
const ALIASES_MODO = {
  codigo: 'Codigo', 'código': 'Codigo', code: 'Codigo', engenharia: 'Codigo',
  redacao: 'Redacao', 'redação': 'Redacao', enem: 'Redacao', texto: 'Redacao',
  pesquisa: 'Pesquisa', research: 'Pesquisa', academico: 'Pesquisa', 'acadêmico': 'Pesquisa'
};

/** Igual ao backend: devolve `null` quando o valor não é reconhecido,
 *  deixando a decisão do padrão para quem chamou. */
function normalizarModo(valor) {
  if (valor === null || valor === undefined) return null;
  return ALIASES_MODO[String(valor).trim().toLowerCase()] || null;
}

/**
 * Sugestão de pilar a partir do texto — espelha POST /api/recomendar-modo.
 * ATENÇÃO: `recomendarModo` devolve `{ modo, placar }`; o backend usa `.modo`.
 * (Foi exatamente este detalhe que gerou a chave "[object Object]" no placar.)
 */
function recomendarPilar(texto) {
  const sugestao = recomendarModo(String(texto || ''));
  return sugestao && TIPOS_VALIDOS.includes(sugestao.modo) ? sugestao.modo : 'Pesquisa';
}

/** Null-safe: em JavaScript `[].includes(null)` não lança, mas a regra
 *  também valida o tipo para nunca gravar valor inesperado no perfil. */
function papelValido(papel) {
  if (typeof papel !== 'string') return 'aluno';
  const limpo = papel.trim().toLowerCase();
  return PAPEIS_VALIDOS.includes(limpo) ? limpo : 'aluno';
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Extrai links de uma resposta — cópia de `extrairReferencias` do backend. */
function extrairReferencias(texto = '') {
  const refs = [];
  const vistos = new Set();

  for (const m of texto.matchAll(/\[([^\]\n]{3,200})\]\((https?:\/\/[^\s)]+)\)/g)) {
    const [, titulo, url] = m;
    const limpa = url.replace(/[.,;]+$/, '');
    if (!vistos.has(limpa)) {
      vistos.add(limpa);
      refs.push({ titulo_link: titulo.trim(), url_referencia: limpa });
    }
  }

  for (const m of texto.matchAll(/<?(https?:\/\/[^\s<>)"']+)>?/g)) {
    const url = m[1].replace(/[.,;]+$/, '');
    if (!vistos.has(url) && !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(url)) {
      vistos.add(url);
      let titulo = url;
      try {
        titulo = new URL(url).hostname.replace(/^www\./, '');
      } catch { /* url malformada: mantém a string */ }
      refs.push({ titulo_link: titulo, url_referencia: url });
    }
  }

  return refs.slice(0, 25);
}

function respostaJson(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function respostaTexto(texto, status = 200) {
  return new Response(texto, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

const naoAutenticado = () =>
  respostaJson({ erro: 'NAO_AUTENTICADO', mensagem: 'Faça login para acessar este recurso.' }, 401);

/* ------------------------------------------------------------------ */
/* Visão pública dos registros (igual à serialização do backend)       */
/* ------------------------------------------------------------------ */

function visaoUsuario(u) {
  return {
    id_usuario: u.id_usuario,
    nome_completo: u.nome_completo,
    email: u.email,
    google_id: u.google_id,
    foto_url: u.foto_url ?? null,
    papel: u.papel,
    ativo: 1,
    data_criacao: u.data_criacao,
    data_acesso: u.data_acesso ?? null
  };
}

function visaoConsulta(c) {
  return {
    id_consulta: c.id_consulta,
    id_usuario: c.id_usuario,
    tipo_consulta: c.tipo_consulta,
    prompt_usuario: c.prompt_usuario,
    resposta_ia: c.resposta_ia,
    modelo_usado: c.modelo_usado,
    tokens_usados: c.tokens_usados,
    latencia_ms: c.latencia_ms,
    data_hora: c.data_hora,
    provedor: c.provedor,
    fallback: c.fallback,
    aviso: c.aviso ?? null,
    referencias_detectadas: c.referencias_detectadas || []
  };
}

function visaoReferencia(r, incluirTipo = false) {
  const base = {
    id_referencia: r.id_referencia,
    id_usuario: r.id_usuario,
    id_consulta: r.id_consulta ?? null,
    titulo_link: r.titulo_link,
    url_referencia: r.url_referencia,
    anotacao: r.anotacao ?? null,
    data_salvo: r.data_salvo,
    atualizada: r.atualizada !== false
  };
  if (incluirTipo) base.tipo_consulta = r.tipo_consulta ?? null;
  return base;
}

function provedores() {
  return [
    { id: 'mock', rotulo: motorMeta.rotulo || 'Maklayn Simulado', requerChave: false, configurado: true },
    { id: 'gemini', rotulo: 'Google Gemini', requerChave: true, configurado: false },
    { id: 'openai', rotulo: 'OpenAI / compatíveis', requerChave: true, configurado: false }
  ];
}

/* ------------------------------------------------------------------ */
/* Rotas emuladas                                                      */
/* ------------------------------------------------------------------ */

function usuarioDaSessao(banco) {
  const sessao = lerSessao();
  if (!sessao) return null;
  return banco.usuarios.find((u) => u.id_usuario === sessao.idUsuario) || null;
}

async function rotaSaude() {
  const inicio = performance.now();
  return respostaJson({
    aplicacao: 'Maklayn',
    versao: '1.0.0',
    ambiente: 'demonstração (GitHub Pages)',
    uptime_s: Math.round(performance.now() / 1000),
    banco: { cliente: 'localStorage', status: 'ok' },
    ia: {
      ativo: 'mock',
      rotulo: motorMeta.rotulo || 'Maklayn Simulado',
      modelo: motorMeta.modeloPadrao || 'maklayn-mock-v1',
      disponiveis: provedores()
    },
    resposta_ms: Math.max(1, Math.round(performance.now() - inicio))
  });
}

function rotaStatus() {
  return respostaJson({
    aplicacao: {
      nome: 'Maklayn',
      versao: '1.0.0',
      descricao: 'Assistente de Inteligência Artificial Multidisciplinar — engenharia de software, redação padrão ENEM e pesquisa acadêmica.',
      ambiente: 'demonstração (GitHub Pages)'
    },
    banco: { cliente: 'localStorage' },
    ia: {
      ativo: 'mock',
      rotulo: motorMeta.rotulo || 'Maklayn Simulado',
      modelo: motorMeta.modeloPadrao || 'maklayn-mock-v1',
      disponiveis: provedores()
    },
    google_login: { configurado: false, demo_habilitado: true },
    modos: TIPOS_VALIDOS
  });
}

function rotaPrompt() {
  return respostaJson({
    system_prompt: SYSTEM_PROMPT,
    instrucoes_por_modo: MODE_INSTRUCTIONS
  });
}

function rotaAuthConfig() {
  const { googleClientId } = configDemo();
  return respostaJson({
    google: { configurado: Boolean(googleClientId), client_id: googleClientId || null },
    demo: true,
    provedor_ia: 'mock',
    aviso: googleClientId
      ? 'Login Google ativo nesta demonstração (Google Identity Services + verificação por chaves públicas).'
      : 'Informe seu Client ID do Google para ativar o login Google nesta demonstração — o botão fica na tela de entrada.'
  });
}

function rotaAuthEu(banco) {
  const usuario = usuarioDaSessao(banco);
  if (!usuario) return respostaJson({ autenticado: false, usuario: null });
  return respostaJson({ autenticado: true, usuario: visaoUsuario(usuario) });
}

function rotaLoginDemo(banco, corpo) {
  const email = String(corpo.email || '').trim().toLowerCase();
  const nome = String(corpo.nome || '').trim();

  if (!EMAIL_VALIDO.test(email)) {
    return respostaJson({ erro: 'EMAIL_INVALIDO', mensagem: 'Informe um e-mail válido.' }, 400);
  }

  let usuario = banco.usuarios.find((u) => u.email === email);
  if (!usuario) {
    banco.seq.usuario += 1;
    usuario = {
      id_usuario: banco.seq.usuario,
      nome_completo: nome || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      email,
      google_id: `demo:${email}`,
      foto_url: null,
      papel: papelValido(corpo.papel),
      data_criacao: agora(),
      data_acesso: null
    };
    banco.usuarios.push(usuario);
  }

  usuario.data_acesso = agora();
  gravarBanco(banco);
  gravarSessao(usuario.id_usuario);

  return respostaJson({
    autenticado: true,
    usuario: visaoUsuario(usuario),
    token: `demo.${btoa(usuario.email)}.local`,
    demo: true
  });
}

function rotaSair() {
  gravarSessao(null);
  return respostaJson({ autenticado: false, mensagem: 'Sessão encerrada.' });
}

async function rotaCriarConsulta(banco, usuario, corpo) {
  const prompt = String(corpo.prompt || '').trim();
  if (prompt.length < 3) {
    return respostaJson({ erro: 'PROMPT_INVALIDO', mensagem: 'Escreva uma pergunta com pelo menos 3 caracteres.' }, 400);
  }

  const modo = normalizarModo(corpo.modo ?? corpo.tipo) ?? recomendarPilar(prompt);
  const resultado = await gerar({ prompt, modo });

  banco.seq.consulta += 1;
  const consulta = {
    id_consulta: banco.seq.consulta,
    id_usuario: usuario.id_usuario,
    tipo_consulta: modo,
    prompt_usuario: prompt,
    resposta_ia: resultado.texto,
    modelo_usado: resultado.modelo || motorMeta.modeloPadrao || 'maklayn-mock-v1',
    tokens_usados: resultado.tokens || Math.ceil(resultado.texto.length / 4),
    latencia_ms: resultado.latencia_ms || 0,
    data_hora: agora(),
    provedor: 'mock',
    fallback: false,
    aviso: null,
    referencias_detectadas: extrairReferencias(resultado.texto)
  };

  banco.consultas.push(consulta);
  gravarBanco(banco);
  return respostaJson({ consulta: visaoConsulta(consulta) }, 201);
}

function rotaListarConsultas(banco, usuario, params) {
  const pagina = Math.max(1, parseInt(params.get('pagina') || '1', 10) || 1);
  const porPagina = Math.min(50, Math.max(1, parseInt(params.get('limite') || params.get('por_pagina') || '10', 10) || 10));
  const tipo = params.get('tipo');

  let lista = banco.consultas
    .filter((c) => c.id_usuario === usuario.id_usuario)
    .filter((c) => !tipo || c.tipo_consulta === tipo)
    .sort((a, b) => b.id_consulta - a.id_consulta);

  const total = lista.length;
  const itens = lista.slice((pagina - 1) * porPagina, pagina * porPagina).map((c) => ({
    id_consulta: c.id_consulta,
    tipo_consulta: c.tipo_consulta,
    data_hora: c.data_hora,
    modelo_usado: c.modelo_usado,
    latencia_ms: c.latencia_ms,
    tokens_usados: c.tokens_usados,
    resumo_prompt: c.prompt_usuario.length > 120 ? `${c.prompt_usuario.slice(0, 117)}…` : c.prompt_usuario,
    tamanho_resposta: (c.resposta_ia || '').length
  }));

  return respostaJson({ itens, total, pagina, por_pagina: porPagina });
}

function rotaResumo(banco, usuario) {
  const lista = banco.consultas.filter((c) => c.id_usuario === usuario.id_usuario);
  const porPilar = { Codigo: 0, Redacao: 0, Pesquisa: 0 };
  for (const c of lista) porPilar[c.tipo_consulta] = (porPilar[c.tipo_consulta] || 0) + 1;

  const ordenadas = [...lista].sort((a, b) => b.id_consulta - a.id_consulta);
  const latencias = lista.map((c) => c.latencia_ms).filter((n) => Number.isFinite(n));
  const dias = {};
  for (const c of lista) {
    const dia = (c.data_hora || '').slice(0, 10);
    if (dia) dias[dia] = (dias[dia] || 0) + 1;
  }

  return respostaJson({
    total: lista.length,
    por_pilar: porPilar,
    latencia_media_ms: latencias.length ? Math.round(latencias.reduce((s, n) => s + n, 0) / latencias.length) : 0,
    ultima_consulta: ordenadas[0] ? ordenadas[0].data_hora : null,
    referencias_salvas: banco.referencias.filter((r) => r.id_usuario === usuario.id_usuario).length,
    ultimos_dias: Object.entries(dias)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 7)
      .map(([dia, total]) => ({ dia, total }))
  });
}

function rotaBuscarConsulta(banco, usuario, id) {
  const consulta = banco.consultas.find((c) => c.id_consulta === id && c.id_usuario === usuario.id_usuario);
  if (!consulta) return respostaJson({ erro: 'NAO_ENCONTRADA', mensagem: 'Consulta não encontrada.' }, 404);
  return respostaJson({ consulta: visaoConsulta(consulta) });
}

function rotaExcluirConsulta(banco, usuario, id) {
  const antes = banco.consultas.length;
  banco.consultas = banco.consultas.filter((c) => !(c.id_consulta === id && c.id_usuario === usuario.id_usuario));
  const removidas = antes - banco.consultas.length;
  gravarBanco(banco);
  if (!removidas) return respostaJson({ erro: 'NAO_ENCONTRADA', mensagem: 'Consulta não encontrada.' }, 404);
  return respostaJson({ removidas });
}

function rotaListarReferencias(banco, usuario) {
  const itens = banco.referencias
    .filter((r) => r.id_usuario === usuario.id_usuario)
    .sort((a, b) => b.id_referencia - a.id_referencia)
    .map((r) => visaoReferencia(r, true));
  return respostaJson({ itens, total: itens.length });
}

function rotaSalvarReferencia(banco, usuario, corpo) {
  const titulo = String(corpo.titulo_link || '').trim();
  const url = String(corpo.url_referencia || '').trim();

  if (!/^https?:\/\/.+\..+/i.test(url)) {
    return respostaJson({ erro: 'URL_INVALIDA', mensagem: 'Informe uma URL válida (começando com http:// ou https://).' }, 400);
  }

  banco.seq.referencia += 1;
  const referencia = {
    id_referencia: banco.seq.referencia,
    id_usuario: usuario.id_usuario,
    id_consulta: corpo.id_consulta ?? null,
    titulo_link: titulo || (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })(),
    url_referencia: url,
    anotacao: corpo.anotacao ?? null,
    data_salvo: agora(),
    atualizada: true
  };

  banco.referencias.push(referencia);
  gravarBanco(banco);
  return respostaJson({ referencia: visaoReferencia(referencia) }, 201);
}

function rotaExcluirReferencia(banco, usuario, id) {
  const antes = banco.referencias.length;
  banco.referencias = banco.referencias.filter((r) => !(r.id_referencia === id && r.id_usuario === usuario.id_usuario));
  const removidas = antes - banco.referencias.length;
  gravarBanco(banco);
  if (!removidas) return respostaJson({ erro: 'NAO_ENCONTRADA', mensagem: 'Referência não encontrada.' }, 404);
  return respostaJson({ removidas });
}

function rotaAbnt(banco, usuario) {
  const lista = banco.referencias
    .filter((r) => r.id_usuario === usuario.id_usuario)
    .sort((a, b) => a.id_referencia - b.id_referencia);

  if (!lista.length) return respostaTexto('Nenhuma referência salva ainda.');

  const linhas = lista.map((r, i) => {
    const titulo = String(r.titulo_link || r.url_referencia).toUpperCase();
    const data = r.data_salvo ? r.data_salvo.slice(0, 10).split('-').reverse().join('/') : hoje().split('-').reverse().join('/');
    return `${i + 1}. ${titulo}. Disponível em: <${r.url_referencia}>. Acesso em: ${data}.`;
  });

  return respostaTexto(linhas.join('\n'));
}

/* ------------------------------------------------------------------ */
/* Roteador                                                            */
/* ------------------------------------------------------------------ */

async function tratar(caminho, metodo, params, corpo) {
  const banco = lerBanco();
  const usuario = usuarioDaSessao(banco);

  // Rotas públicas
  if (metodo === 'GET' && caminho === '/api/health') return rotaSaude();
  if (metodo === 'GET' && caminho === '/api/status') return rotaStatus();
  if (metodo === 'GET' && caminho === '/api/prompt') return rotaPrompt();
  if (metodo === 'GET' && caminho === '/api/auth/config') return rotaAuthConfig();
  if (metodo === 'GET' && caminho === '/api/auth/eu') return rotaAuthEu(banco);
  if (metodo === 'POST' && caminho === '/api/auth/demo') return rotaLoginDemo(banco, corpo);
  if (metodo === 'POST' && caminho === '/api/auth/sair') return rotaSair();
  if (metodo === 'POST' && caminho === '/api/recomendar-modo') {
    const texto = String(corpo.texto || corpo.prompt || '');
    const sugestao = recomendarModo(texto);
    return respostaJson({ ...sugestao, prompt: texto.slice(0, 200) });
  }
  if (metodo === 'POST' && caminho === '/api/auth/google/credential') {
    const { googleClientId } = configDemo();
    if (!googleClientId) {
      return respostaJson({
        erro: 'GOOGLE_NAO_CONFIGURADO',
        mensagem: 'Defina o Client ID do Google (campo na tela de login) para usar o login Google nesta demonstração.'
      }, 503);
    }

    try {
      const conteudo = await verificarIdTokenGoogle(corpo.credential ?? corpo.id_token, googleClientId);

      let usuario = banco.usuarios.find((u) => u.google_id === conteudo.sub);
      if (!usuario) {
        usuario = banco.usuarios.find((u) => u.email === String(conteudo.email).toLowerCase());
      }
      if (!usuario) {
        banco.seq.usuario += 1;
        usuario = {
          id_usuario: banco.seq.usuario,
          nome_completo: conteudo.name || String(conteudo.email).split('@')[0],
          email: String(conteudo.email).toLowerCase(),
          google_id: conteudo.sub,
          foto_url: conteudo.picture ?? null,
          papel: 'aluno',
          data_criacao: agora(),
          data_acesso: null
        };
        banco.usuarios.push(usuario);
      } else {
        usuario.google_id = conteudo.sub;                 // conta local que virou conta Google
        usuario.foto_url = conteudo.picture ?? usuario.foto_url;
      }

      usuario.data_acesso = agora();
      gravarBanco(banco);
      gravarSessao(usuario.id_usuario);

      return respostaJson({
        autenticado: true,
        usuario: visaoUsuario(usuario),
        token: `demo.${btoa(usuario.email)}.local`,
        demo: true
      });
    } catch (e) {
      return respostaJson({ erro: 'CREDENCIAL_INVALIDA', mensagem: `Login Google recusado: ${e.message}` }, 401);
    }
  }

  // Daqui para baixo exige sessão
  if (!usuario) return naoAutenticado();

  if (caminho === '/api/consultas' && metodo === 'POST') return rotaCriarConsulta(banco, usuario, corpo);
  if (caminho === '/api/consultas' && metodo === 'GET') return rotaListarConsultas(banco, usuario, params);
  if (caminho === '/api/consultas/resumo' && metodo === 'GET') return rotaResumo(banco, usuario);

  if (caminho === '/api/referencias' && metodo === 'GET') return rotaListarReferencias(banco, usuario);
  if (caminho === '/api/referencias' && metodo === 'POST') return rotaSalvarReferencia(banco, usuario, corpo);
  if (caminho === '/api/referencias/abnt' && metodo === 'GET') return rotaAbnt(banco, usuario);

  let m;
  if ((m = caminho.match(/^\/api\/consultas\/(\d+)$/))) {
    const id = Number(m[1]);
    if (metodo === 'GET') return rotaBuscarConsulta(banco, usuario, id);
    if (metodo === 'DELETE') return rotaExcluirConsulta(banco, usuario, id);
  }
  if ((m = caminho.match(/^\/api\/referencias\/(\d+)$/)) && metodo === 'DELETE') {
    return rotaExcluirReferencia(banco, usuario, Number(m[1]));
  }

  return respostaJson({ erro: 'ROTA_NAO_IMPLEMENTADA', mensagem: `A demonstração não implementa ${metodo} ${caminho}.` }, 404);
}

/* ------------------------------------------------------------------ */
/* Instalação do interceptador                                         */
/* ------------------------------------------------------------------ */

export function instalarDemoMaklayn(escopo = globalThis) {
  const alvo = escopo.window || escopo;
  const fetchOriginal = alvo.fetch ? alvo.fetch.bind(alvo) : null;

  alvo.fetch = async function fetchDemo(entrada, opcoes = {}) {
    const bruta = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
    let url;
    try {
      url = new URL(bruta, escopo.location ? escopo.location.href : 'https://exemplo.local/');
    } catch {
      return fetchOriginal ? fetchOriginal(entrada, opcoes) : respostaJson({ erro: 'URL_INVALIDA' }, 400);
    }

    if (!url.pathname.startsWith('/api')) {
      if (fetchOriginal) return fetchOriginal(entrada, opcoes);
      throw new Error(`Sem servidor na demonstração para: ${url.pathname}`);
    }

    const metodo = String(opcoes.method || (entrada && entrada.method) || 'GET').toUpperCase();
    let corpo = {};
    if (opcoes.body) {
      try {
        corpo = typeof opcoes.body === 'string' ? JSON.parse(opcoes.body) : opcoes.body;
      } catch { corpo = {}; }
    }

    try {
      return await tratar(url.pathname, metodo, url.searchParams, corpo);
    } catch (e) {
      return respostaJson({ erro: 'ERRO_INTERNO', mensagem: `Falha na demonstração: ${e.message}` }, 500);
    }
  };

  return alvo.fetch;
}

/**
 * Campo para colar o Client ID do Google direto na tela de login.
 * Aparece apenas na demonstração e enquanto nenhum Client ID estiver
 * configurado — assim dá para testar o login Google sem recompilar nada.
 */
function injetarCampoClientId() {
  if (typeof document === 'undefined') return;

  const overlay = document.getElementById('overlayLogin');
  const area = document.getElementById('areaGoogle');
  if (!overlay || !area || document.getElementById('campoClientId')) return;
  if (configDemo().googleClientId) return;         // já configurado: nada a mostrar
  if (overlay.hidden && !overlay.offsetParent) { /* segue: o overlay abre depois */ }

  const caixa = document.createElement('div');
  caixa.id = 'campoClientId';
  caixa.className = 'aviso-caixa';
  caixa.style.marginTop = '10px';
  caixa.innerHTML = `
    <div style="margin-bottom:6px">
      <strong>Ativar o login Google nesta demonstração</strong><br>
      Cole o seu <em>Client ID</em> do Google (é público). O passo a passo para criar
      está em <a href="https://github.com/jk-jhon1/maklayn/blob/main/docs/configurar-login-google.md"
      target="_blank" rel="noopener">configurar-login-google.md</a>.
    </div>
    <div style="display:flex;gap:6px">
      <input id="inputClientId" placeholder="1234-abc.apps.googleusercontent.com"
             style="flex:1;padding:8px;border-radius:8px;border:1px solid #ffffff33;
                    background:#0e1120;color:#e8e9f3;font-size:12px">
      <button type="button" id="salvarClientId" class="botao ciano pequeno">Usar</button>
    </div>`;

  caixa.querySelector('#salvarClientId').addEventListener('click', () => {
    const valor = caixa.querySelector('#inputClientId').value.trim();
    if (!/apps\.googleusercontent\.com$/.test(valor)) {
      alert('Isso não parece um Client ID do Google — ele termina em .apps.googleusercontent.com');
      return;
    }
    try { localStorage.setItem('maklayn-google-client-id', valor); } catch { /* modo privado */ }
    location.reload();
  });

  area.appendChild(caixa);
}

/** Aviso flutuante explicando o que esta página é (e o que não é). */
function mostrarAvisoDemo() {
  if (typeof document === 'undefined' || document.getElementById('avisoDemoMaklayn')) return;

  const caixa = document.createElement('div');
  caixa.id = 'avisoDemoMaklayn';
  caixa.style.cssText = [
    'position:fixed', 'bottom:14px', 'right:14px', 'z-index:9999', 'max-width:330px',
    'background:#161a2b', 'color:#e8e9f3', 'border:1px solid #7c5cff55', 'border-radius:12px',
    'padding:12px 14px', 'font:13px/1.5 system-ui,-apple-system,Segoe UI,sans-serif',
    'box-shadow:0 12px 30px #00000066'
  ].join(';');

  caixa.innerHTML = `
    <strong style="color:#a58bff">Demonstração estática</strong>
    <div style="margin-top:6px">
      A interface é a mesma do aplicativo; aqui o motor simulado roda no seu navegador
      e os dados ficam salvos apenas nele. Para ativar o <strong>login Google</strong>,
      clique em &ldquo;Entrar&rdquo; e cole o seu Client ID — ou rode a versão completa,
      com banco relacional e login server-side.
    </div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
      <a href="https://github.com/jk-jhon1/maklayn" target="_blank" rel="noopener"
         style="color:#7c5cff;text-decoration:none;font-weight:600">Ver o código →</a>
      <button type="button" style="margin-left:auto;background:transparent;border:1px solid #ffffff33;
        color:#c9cad8;border-radius:8px;padding:2px 8px;cursor:pointer">ocultar</button>
    </div>`;

  caixa.querySelector('button').addEventListener('click', () => caixa.remove());
  document.body.appendChild(caixa);
}

/* Instala automaticamente quando executado no navegador. */
instalarDemoMaklayn(globalThis);

if (typeof document !== 'undefined') {
  const aoCarregar = () => {
    mostrarAvisoDemo();
    injetarCampoClientId();

    // o overlay de login é aberto/alterado pelo app — observa para reinjetar
    const overlay = document.getElementById('overlayLogin');
    if (overlay && typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => injetarCampoClientId())
        .observe(overlay, { attributes: true, childList: true, subtree: true });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aoCarregar);
  else aoCarregar();
}
