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

    private final String authEndpoint;
    private final String tokenEndpoint;
    private final String userinfoEndpoint;
    private final String tokeninfoEndpoint;

    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final HttpJson http;

    public GoogleServico(@Value("${maklayn.auth.google.client-id:}") String clientId,
                         @Value("${maklayn.auth.google.client-secret:}") String clientSecret,
                         @Value("${maklayn.auth.google.redirect-uri:}") String redirectUri,
                         @Value("${maklayn.auth.google.auth-endpoint:https://accounts.google.com/o/oauth2/v2/auth}")
                             String authEndpoint,
                         @Value("${maklayn.auth.google.token-endpoint:https://oauth2.googleapis.com/token}")
                             String tokenEndpoint,
                         @Value("${maklayn.auth.google.userinfo-endpoint:https://www.googleapis.com/oauth2/v3/userinfo}")
                             String userinfoEndpoint,
                         @Value("${maklayn.auth.google.tokeninfo-endpoint:https://oauth2.googleapis.com/tokeninfo}")
                             String tokeninfoEndpoint,
                         HttpJson http) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.authEndpoint = authEndpoint;
        this.tokenEndpoint = tokenEndpoint;
        this.userinfoEndpoint = userinfoEndpoint;
        this.tokeninfoEndpoint = tokeninfoEndpoint;
        this.http = http;
    }

    /**
     * Erro de autenticação com status HTTP e código de aplicação,
     * no mesmo vocabulário da versão Node.
     */
    public static class ErroGoogle extends RuntimeException {
        private final int status;
        private final String codigo;

        public ErroGoogle(String mensagem, String codigo, int status) {
            super(mensagem);
            this.codigo = codigo;
            this.status = status;
        }

        public int getStatus() {
            return status;
        }

        public String getCodigo() {
            return codigo;
        }
    }

    /** Traduz a falha devolvida pelo Google em uma mensagem acionável. */
    private static String mensagemDaFalha(String respostaBruta) {
        String motivo = "";
        int i = respostaBruta.indexOf("\"error\"");
        if (i >= 0) {
            int aspas = respostaBruta.indexOf('"', i + 7);
            if (aspas >= 0) {
                int fim = respostaBruta.indexOf('"', aspas + 1);
                if (fim > aspas) motivo = respostaBruta.substring(aspas + 1, fim);
            }
        }
        if ("invalid_grant".equals(motivo)) {
            return "O código de autorização já foi usado ou expirou. Faça login novamente. [invalid_grant]";
        }
        if ("invalid_client".equals(motivo)) {
            return "GOOGLE_CLIENT_SECRET ou GOOGLE_CLIENT_ID não conferem com os do Google Cloud Console. [invalid_client]";
        }
        if ("redirect_uri_mismatch".equals(motivo)) {
            return "A GOOGLE_REDIRECT_URI não está cadastrada no Google Cloud Console. [redirect_uri_mismatch]";
        }
        return "Falha ao trocar o código por tokens" + (motivo.isEmpty() ? "." : " [" + motivo + "]");
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
            throw new ErroGoogle(
                "Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env (veja o README, item \"Login com Google\").",
                "GOOGLE_NAO_CONFIGURADO", 503);
        }
        return authEndpoint
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

        JsonNode tokens;
        try {
            tokens = http.postForm(tokenEndpoint, corpo);
        } catch (Exception e) {
            throw new ErroGoogle(mensagemDaFalha(e.getMessage() == null ? "" : e.getMessage()),
                "GOOGLE_TOKEN_INVALIDO", 401);
        }
        String accessToken = tokens.path("access_token").asText("");
        if (accessToken.isBlank()) {
            throw new IllegalStateException("O Google não retornou access_token.");
        }

        JsonNode perfil;
        try {
            perfil = http.getJson(userinfoEndpoint, Map.of("Authorization", "Bearer " + accessToken));
        } catch (Exception e) {
            throw new ErroGoogle("O Google recusou a leitura do perfil.",
                "GOOGLE_PERFIL_FALHOU", 401);
        }
        return converter(perfil, true);
    }

    /**
     * Valida um id_token (credential) emitido pelo Google Identity Services
     * no frontend, sem precisar do Client Secret.
     */
    public PerfilGoogle validarCredencial(String idToken) throws Exception {
        if (clientId == null || clientId.isBlank()) {
            throw new ErroGoogle("GOOGLE_CLIENT_ID não configurado no servidor.",
                "GOOGLE_NAO_CONFIGURADO", 503);
        }

        JsonNode dados;
        try {
            dados = http.getJson(tokeninfoEndpoint + "?id_token=" + enc(idToken), null);
        } catch (Exception e) {
            throw new ErroGoogle("Credencial do Google inválida, expirada ou de outra aplicação.",
                "CREDENCIAL_INVALIDA", 401);
        }

        if (!clientId.equals(dados.path("aud").asText())) {
            throw new ErroGoogle("A credencial foi emitida para outra aplicação (aud diferente).",
                "CREDENCIAL_OUTRA_APLICACAO", 401);
        }
        if (!"true".equals(dados.path("email_verified").asText())) {
            throw new ErroGoogle("A conta Google deste e-mail ainda não foi verificada.",
                "EMAIL_NAO_VERIFICADO", 401);
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
