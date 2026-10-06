package br.com.maklayn.seguranca;

import br.com.maklayn.ai.HttpJson;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * =====================================================================
 *  MAKLAYN — Integração com o Google (OAuth 2.0 / OpenID Connect)
 *  Seção 3 da especificação.
 *
 *   A) Authorization Code Flow:  /api/auth/google -> tela do Google
 *      /api/auth/google/callback -> troca "code" por tokens (server-side)
 *   B) Google Identity Services: o botão do Google devolve um id_token,
 *      validado em /api/auth/google/credential.
 *
 *  O Client Secret nunca sai do backend; o parâmetro `state` é um JWT
 *  assinado (proteção contra CSRF).
 * =====================================================================
 */
@Service
public class GoogleServico {

    private static final String AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
    private static final String USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
    private static final String TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final HttpJson http;

    public GoogleServico(@Value("${maklayn.auth.google.client-id:}") String clientId,
                         @Value("${maklayn.auth.google.client-secret:}") String clientSecret,
                         @Value("${maklayn.auth.google.redirect-uri:}") String redirectUri,
                         HttpJson http) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.http = http;
    }

    public boolean configurado() {
        return clientId != null && !clientId.isBlank()
            && clientSecret != null && !clientSecret.isBlank();
    }

    public String getClientId() {
        return clientId;
    }

    /**
     * URL da tela de consentimento do Google.
     *
     * @param state valor opaco devolvido pelo Google no callback — comparado
     *              com o cookie gravado no início do fluxo (proteção CSRF).
     */
    public String urlConsentimento(String state) {
        if (!configurado()) {
            throw new IllegalStateException(
                "Google OAuth não configurado: defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.");
        }
        return AUTH_ENDPOINT
            + "?client_id=" + enc(clientId)
            + "&redirect_uri=" + enc(redirectUri)
            + "&response_type=code"
            + "&scope=" + enc("openid email profile")
            + "&access_type=offline"
            + "&include_granted_scopes=true"
            + "&prompt=" + enc("select_account")
            + (state == null || state.isBlank() ? "" : "&state=" + enc(state));
    }

    /** Troca o `code` pelos tokens e busca o perfil do usuário. */
    public PerfilGoogle trocarCodePorPerfil(String code) throws Exception {
        String corpo = "code=" + enc(code)
            + "&client_id=" + enc(clientId)
            + "&client_secret=" + enc(clientSecret)
            + "&redirect_uri=" + enc(redirectUri)
            + "&grant_type=authorization_code";

        JsonNode tokens = http.postForm(TOKEN_ENDPOINT, corpo);
        String accessToken = tokens.path("access_token").asText("");
        if (accessToken.isBlank()) {
            throw new IllegalStateException("O Google não retornou access_token.");
        }

        JsonNode perfil = http.getJson(USERINFO_ENDPOINT, Map.of("Authorization", "Bearer " + accessToken));
        return converter(perfil, true);
    }

    /**
     * Valida um id_token (credential) emitido pelo Google Identity Services
     * no frontend, sem precisar do Client Secret.
     */
    public PerfilGoogle validarCredencial(String idToken) throws Exception {
        if (clientId == null || clientId.isBlank()) {
            throw new IllegalStateException("GOOGLE_CLIENT_ID não configurado.");
        }

        JsonNode dados = http.getJson(TOKENINFO_ENDPOINT + "?id_token=" + enc(idToken), null);

        if (!clientId.equals(dados.path("aud").asText())) {
            throw new IllegalStateException("A credencial não pertence a esta aplicação.");
        }
        if (!"true".equals(dados.path("email_verified").asText())) {
            throw new IllegalStateException("E-mail do Google não verificado.");
        }
        return converter(dados, true);
    }

    /* ------------------------------------------------------------------ */

    private PerfilGoogle converter(JsonNode dados, boolean verificado) {
        String email = dados.path("email").asText("").toLowerCase();
        String nome = dados.path("name").asText(email.contains("@") ? email.substring(0, email.indexOf('@')) : email);
        String foto = dados.path("picture").asText(null);

        return new PerfilGoogle(dados.path("sub").asText(), nome, email, foto, verificado);
    }

    private String enc(String valor) {
        return URLEncoder.encode(valor == null ? "" : valor, StandardCharsets.UTF_8);
    }

    /** Perfil normalizado devolvido pelo Google. */
    public static final class PerfilGoogle {

        private final String googleId;
        private final String nomeCompleto;
        private final String email;
        private final String fotoUrl;
        private final boolean emailVerificado;

        public PerfilGoogle(String googleId, String nomeCompleto, String email,
                            String fotoUrl, boolean emailVerificado) {
            this.googleId = googleId;
            this.nomeCompleto = nomeCompleto;
            this.email = email;
            this.fotoUrl = fotoUrl;
            this.emailVerificado = emailVerificado;
        }

        public String getGoogleId() {
            return googleId;
        }

        public String getNomeCompleto() {
            return nomeCompleto;
        }

        public String getEmail() {
            return email;
        }

        public String getFotoUrl() {
            return fotoUrl;
        }

        public boolean isEmailVerificado() {
            return emailVerificado;
        }

        public Map<String, Object> paraMapa() {
            Map<String, Object> mapa = new LinkedHashMap<>();
            mapa.put("google_id", googleId);
            mapa.put("nome_completo", nomeCompleto);
            mapa.put("email", email);
            mapa.put("foto_url", fotoUrl);
            return mapa;
        }
    }
}
