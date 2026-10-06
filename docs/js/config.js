/**
 * =====================================================================
 *  MAKLAYN — Configuração da demonstração (GitHub Pages)
 * =====================================================================
 *
 *  Para ativar o LOGIN GOOGLE na demonstração online, basta preencher
 *  o `googleClientId` abaixo e publicar. O Client ID é informação
 *  PÚBLICA (ele aparece no HTML de qualquer site que usa o Google) —
 *  o Client Secret nunca é usado aqui e NÃO deve ser colocado neste arquivo.
 *
 *  Como obter o seu (2 minutos, sem custo):
 *    1. https://console.cloud.google.com/apis/credentials
 *    2. "Criar credenciais" → "ID do cliente OAuth"
 *       → Tipo: Aplicativo da Web
 *    3. Em "Origens JavaScript autorizadas", adicione:
 *         https://jk-jhon1.github.io
 *         http://localhost:3000
 *         http://localhost:8080
 *    4. Em "URIs de redirecionamento autorizados" (para o fluxo server-side):
 *         http://localhost:3000/api/auth/google/callback
 *         http://localhost:8080/api/auth/google/callback
 *    5. Copie o Client ID (termina em .apps.googleusercontent.com) e cole abaixo.
 *
 *  Sem preencher nada, a demonstração continua funcionando com o
 *  acesso de visitante/demonstração.
 *
 *  O passo a passo completo, com telas e solução de problemas, está em
 *  docs/configurar-login-google.md
 * =====================================================================
 */

globalThis.MAKLAYN_DEMO = {
  /**
   * Cole aqui o Client ID do Google, por exemplo:
   * googleClientId: '1234567890-abcdefghijklmnop.apps.googleusercontent.com',
   */
  googleClientId: '',

  /**
   * Chaves públicas usadas para conferir a assinatura do id_token.
   * Só mude isto para testes offline (o servidor de teste em
   * testes/google-falso.mjs publica as suas em /oauth2/v3/certs).
   */
  googleJwksUri: 'https://www.googleapis.com/oauth2/v3/certs'
};
