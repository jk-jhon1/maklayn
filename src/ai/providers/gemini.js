/**
 * =====================================================================
 *  MAKLAYN — Provedor Google Gemini (Generative Language API)
 *  Ativar com:
 *     AI_PROVIDER=gemini
 *     GEMINI_API_KEY=AIza...
 *     GEMINI_MODEL=gemini-2.0-flash        (opcional)
 * =====================================================================
 */

import { SYSTEM_PROMPT, MODE_INSTRUCTIONS } from '../systemPrompt.js';

export const meta = {
  id: 'gemini',
  rotulo: 'Google Gemini',
  modeloPadrao: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
};

export async function gerar({ prompt, modo = 'Pesquisa', historico = [], modelo }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');

  const mdl = modelo || meta.modeloPadrao;
  const inicio = Date.now();

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${apiKey}`;

  const contents = [
    ...historico.map((m) => ({
      role: m.papel === 'ia' ? 'model' : 'user',
      parts: [{ text: m.texto }]
    })),
    { role: 'user', parts: [{ text: prompt }] }
  ];

  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT + '\n' + (MODE_INSTRUCTIONS[modo] ?? '') }]
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 8192
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
      ]
    })
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error(`Gemini HTTP ${resposta.status}: ${detalhe.slice(0, 400)}`);
  }

  const json = await resposta.json();
  const candidato = json.candidates?.[0];
  const texto = (candidato?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!texto) {
    const motivo = candidato?.finishReason ?? json.promptFeedback?.blockReason ?? 'desconhecido';
    throw new Error(`Gemini não retornou texto (motivo: ${motivo}).`);
  }

  return {
    texto,
    modelo: mdl,
    tokens: json.usageMetadata?.totalTokenCount ?? null,
    latencia_ms: Date.now() - inicio
  };
}

export default { meta, gerar };
