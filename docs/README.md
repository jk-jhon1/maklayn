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

## Login Google nesta demonstração

O login Google **funciona aqui** pelo fluxo do **Google Identity Services**: o Google
devolve ao navegador um `id_token` assinado e a demonstração confere a assinatura com
as **chaves públicas** do Google (JWKS) via Web Crypto — sem servidor e sem Client Secret.

Para ativar, informe o seu **Client ID** (informação pública):

- na tela de login do site → campo "Ativar o login Google nesta demonstração"; ou
- em [`js/config.js`](js/config.js) → `googleClientId`, valendo para todos os visitantes.

Passo a passo: [`configurar-login-google.md`](configurar-login-google.md).

## O que a demonstração NÃO tem

- **Fluxo OAuth server-side** (Authorization Code) — exige backend, pois só ele pode guardar o *Client Secret*.
- **Banco relacional** — os dados ficam no `localStorage` do próprio navegador.
- **Provedores de IA reais** (Gemini/OpenAI) — a demo usa o motor simulado, sem chaves.

Para a versão completa, veja o [README principal](../README.md).
