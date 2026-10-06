# `docs/` — demonstração estática (GitHub Pages)

Esta pasta existe **apenas** para publicar a interface do Maklayn como site estático,
possível de abrir direto no navegador: **https://jk-jhon1.github.io/maklayn/**

## Como funciona

| Arquivo | Papel |
|---|---|
| `index.html` | cópia de `public/index.html`, com caminhos relativos |
| `css/styles.css` | cópia de `public/css/styles.css` |
| `js/app.js`, `js/markdown.js` | cópias fiéis do front-end real |
| `js/motor-mock.js` | cópia de `src/ai/providers/mock.js` (motor simulado) |
| `js/systemPrompt.js` | cópia de `src/ai/systemPrompt.js` |
| `js/demo-api.js` | **adaptador**: responde `/api/*` no navegador usando o motor simulado e guarda os dados no `localStorage` |

O contrato JSON é idêntico ao do backend Node/Express e Java/Spring Boot — a interface
não sabe que está falando com um adaptador.

## O que a demonstração NÃO tem

- **Login Google OAuth 2.0 real** — exige servidor, porque o *Client Secret* nunca pode ir ao navegador.
- **Banco relacional** — os dados ficam no `localStorage` do próprio navegador.
- **Provedores de IA reais** (Gemini/OpenAI) — a demo usa o motor simulado, sem chaves.

Para a versão completa, veja o [README principal](../README.md).
