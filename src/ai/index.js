/**
 * =====================================================================
 *  MAKLAYN — Roteador de provedores de IA
 *
 *  Seleciona o motor com base em AI_PROVIDER (mock | gemini | openai).
 *  Se o provedor real falhar (chave ausente, cota, rede), o Maklayn
 *  cai automaticamente para o motor simulado — o usuário nunca recebe
 *  um erro cru de infraestrutura.
 * =====================================================================
 */

import * as mock from './providers/mock.js';
import * as gemini from './providers/gemini.js';
import * as openai from './providers/openai.js';
import { SYSTEM_PROMPT, MODE_INSTRUCTIONS, recomendarModo } from './systemPrompt.js';

const PROVEDORES = { mock, gemini, openai };

export const TIPOS_VALIDOS = ['Codigo', 'Redacao', 'Pesquisa'];

/** Traduz o rótulo da interface para o valor do ENUM do banco. */
export function normalizarModo(valor) {
  const v = String(valor ?? '').toLowerCase();
  if (['codigo', 'código', 'code', 'engenharia'].includes(v)) return 'Codigo';
  if (['redacao', 'redação', 'enem', 'texto'].includes(v)) return 'Redacao';
  if (['pesquisa', 'research', 'academico', 'acadêmico'].includes(v)) return 'Pesquisa';
  return null;
}

export function provedorAtivo() {
  const id = String(process.env.AI_PROVIDER || 'mock').toLowerCase();
  return PROVEDORES[id] ?? mock;
}

export function statusProvedores() {
  const ativo = provedorAtivo();
  return {
    ativo: ativo.meta.id,
    rotulo: ativo.meta.rotulo,
    modelo: ativo.meta.modeloPadrao,
    disponiveis: [
      { id: 'mock', rotulo: 'Maklayn Simulado', requerChave: false, configurado: true },
      {
        id: 'gemini',
        rotulo: 'Google Gemini',
        requerChave: true,
        env: 'GEMINI_API_KEY',
        configurado: Boolean(process.env.GEMINI_API_KEY)
      },
      {
        id: 'openai',
        rotulo: 'OpenAI (compatível)',
        requerChave: true,
        env: 'OPENAI_API_KEY',
        configurado: Boolean(process.env.OPENAI_API_KEY)
      }
    ]
  };
}

/**
 * Gera uma resposta do Maklayn.
 *
 * @param {object}   params
 * @param {string}   params.prompt    Texto do usuário
 * @param {string}   params.modo      Codigo | Redacao | Pesquisa
 * @param {Array}    params.historico [{ papel: 'usuario'|'ia', texto }]
 * @param {string}   [params.modelo]
 * @returns {Promise<{texto, modelo, tokens, latencia_ms, provedor, fallback?}>}
 */
export async function gerarResposta({ prompt, modo = 'Pesquisa', historico = [], modelo } = {}) {
  if (!prompt || !String(prompt).trim()) {
    const erro = new Error('O prompt do usuário não pode ser vazio.');
    erro.status = 400;
    throw erro;
  }

  const provedor = provedorAtivo();

  try {
    const r = await provedor.gerar({
      prompt: String(prompt).trim(),
      modo,
      historico: historico.slice(-8), // janela de contexto (últimos 8 turnos)
      modelo
    });
    return { ...r, provedor: provedor.meta.id };
  } catch (e) {
    if (provedor.meta.id === 'mock') throw e; // mock falhou = erro real de código
    console.warn(`[maklayn] provedor "${provedor.meta.id}" falhou -> fallback simulado: ${e.message}`);
    const r = await mock.gerar({ prompt, modo, modelo: mock.meta.modeloPadrao });
    return {
      ...r,
      provedor: 'mock',
      fallback: true,
      aviso: `Provedor "${provedor.meta.id}" indisponível (${e.message}). Resposta gerada pelo motor simulado.`
    };
  }
}

/** Extrai links markdown de uma resposta — alimenta "Referências salvas". */
export function extrairReferencias(texto = '') {
  const refs = [];
  const vistos = new Set();

  // 1) Links markdown [título](url)
  for (const m of texto.matchAll(/\[([^\]\n]{3,200})\]\((https?:\/\/[^\s)]+)\)/g)) {
    const [, titulo, url] = m;
    const limpa = url.replace(/[.,;]+$/, '');
    if (!vistos.has(limpa)) {
      vistos.add(limpa);
      refs.push({ titulo_link: titulo.trim(), url_referencia: limpa });
    }
  }

  // 2) Links em texto puro: <https://...> ou "Disponível em: https://..."
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

export { SYSTEM_PROMPT, MODE_INSTRUCTIONS, recomendarModo };
export default { gerarResposta, normalizarModo, provedorAtivo, statusProvedores, extrairReferencias, TIPOS_VALIDOS };
