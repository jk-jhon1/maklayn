/**
 * =====================================================================
 *  MAKLAYN — Provedor compatível com a API OpenAI (chat/completions)
 *
 *  Funciona com: OpenAI, Groq, DeepSeek, Together, OpenRouter, Ollama
 *  e qualquer endpoint que fale o mesmo protocolo. Basta trocar
 *  OPENAI_BASE_URL.
 *
 *  Ativar com:
 *     AI_PROVIDER=openai
 *     OPENAI_API_KEY=sk-...
 *     OPENAI_MODEL=gpt-4o-mini                     (opcional)
 *     OPENAI_BASE_URL=https://api.openai.com/v1    (opcional)
 * =====================================================================
 */

import { SYSTEM_PROMPT, MODE_INSTRUCTIONS } from '../systemPrompt.js';

export const meta = {
  id: 'openai',
  rotulo: 'OpenAI (compatível)',
  modeloPadrao: process.env.OPENAI_MODEL || 'gpt-4o-mini'
};

export async function gerar({ prompt, modo = 'Pesquisa', historico = [], modelo }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.');

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const mdl = modelo || meta.modeloPadrao;
  const inicio = Date.now();

  const mensagens = [
    { role: 'system', content: SYSTEM_PROMPT + '\n' + (MODE_INSTRUCTIONS[modo] ?? '') },
    ...historico.map((m) => ({
      role: m.papel === 'ia' ? 'assistant' : 'user',
      content: m.texto
    })),
    { role: 'user', content: prompt }
  ];

  const resposta = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: mdl,
      messages: mensagens,
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error(`Provedor HTTP ${resposta.status}: ${detalhe.slice(0, 400)}`);
  }

  const json = await resposta.json();
  const texto = json.choices?.[0]?.message?.content?.trim();
  if (!texto) throw new Error('O provedor não retornou conteúdo.');

  return {
    texto,
    modelo: mdl,
    tokens: json.usage?.total_tokens ?? null,
    latencia_ms: Date.now() - inicio
  };
}

export default { meta, gerar };
