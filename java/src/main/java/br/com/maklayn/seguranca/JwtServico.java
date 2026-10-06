package br.com.maklayn.seguranca;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

/**
 * =====================================================================
 *  MAKLAYN — JWT HS256 próprio (sem dependências externas)
 *
 *  Assinatura, verificação, expiração e comparação em tempo constante
 *  contra ataques de timing. Implementação espelhada à da versão Node.
 * =====================================================================
 */
@Service
public class JwtServico {

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    private static final String ALG = "HmacSHA256";

    private final String segredo;
    private final long expiracaoSegundos;
    private final ObjectMapper mapper = new ObjectMapper();

    public JwtServico(@Value("${maklayn.auth.jwt-secret}") String segredo,
                      @Value("${maklayn.auth.jwt-expiracao-segundos:28800}") long expiracaoSegundos) {
        this.segredo = segredo;
        this.expiracaoSegundos = expiracaoSegundos;
    }

    /** Gera um token assinado. */
    public String assinar(Long idUsuario, String email, String papel) {
        return assinar(idUsuario, email, papel, expiracaoSegundos);
    }

    public String assinar(Long idUsuario, String email, String papel, long expiraEmSegundos) {
        try {
            ObjectNode cabecalho = mapper.createObjectNode();
            cabecalho.put("alg", "HS256");
            cabecalho.put("typ", "JWT");

            long agora = Instant.now().getEpochSecond();
            ObjectNode corpo = mapper.createObjectNode();
            corpo.put("sub", idUsuario);
            corpo.put("email", email);
            corpo.put("papel", papel);
            corpo.put("iss", "maklayn");
            corpo.put("iat", agora);
            corpo.put("exp", agora + expiraEmSegundos);

            String semAssinatura = codificar(cabecalho) + "." + codificar(corpo);
            return semAssinatura + "." + hmac(semAssinatura);
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao assinar o token JWT.", e);
        }
    }

    /**
     * Valida a assinatura e a expiração.
     *
     * @throws TokenInvalidoException quando o token é malformado, adulterado ou expirado.
     */
    public DadosToken verificar(String token) {
        if (token == null || token.isBlank()) {
            throw new TokenInvalidoException("TOKEN_AUSENTE");
        }

        String[] partes = token.split("\\.");
        if (partes.length != 3) {
            throw new TokenInvalidoException("TOKEN_MALFORMADO");
        }

        String semAssinatura = partes[0] + "." + partes[1];
        byte[] esperada = hmac(semAssinatura).getBytes(StandardCharsets.UTF_8);
        byte[] recebida = partes[2].getBytes(StandardCharsets.UTF_8);

        if (!MessageDigest.isEqual(esperada, recebida)) {
            throw new TokenInvalidoException("ASSINATURA_INVALIDA");
        }

        try {
            JsonNode cabecalho = mapper.readTree(B64D.decode(partes[0]));
            if (!"HS256".equals(cabecalho.path("alg").asText())) {
                throw new TokenInvalidoException("ALGORITMO_NAO_SUPORTADO");
            }

            JsonNode corpo = mapper.readTree(B64D.decode(partes[1]));
            long exp = corpo.path("exp").asLong(0);
            if (exp > 0 && exp < Instant.now().getEpochSecond()) {
                throw new TokenInvalidoException("TOKEN_EXPIRADO");
            }

            return new DadosToken(corpo.path("sub").asLong(), corpo.path("email").asText(null),
                corpo.path("papel").asText("aluno"));
        } catch (TokenInvalidoException e) {
            throw e;
        } catch (Exception e) {
            throw new TokenInvalidoException("TOKEN_ILEGIVEL");
        }
    }

    /* ------------------------------------------------------------------ */

    private String codificar(Object no) throws Exception {
        return B64.encodeToString(mapper.writeValueAsBytes(no));
    }

    private String hmac(String dados) {
        try {
            Mac mac = Mac.getInstance(ALG);
            mac.init(new SecretKeySpec(segredo.getBytes(StandardCharsets.UTF_8), ALG));
            return B64.encodeToString(mac.doFinal(dados.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao calcular a assinatura HMAC.", e);
        }
    }

    public long getExpiracaoSegundos() {
        return expiracaoSegundos;
    }

    /** Claims relevantes extraídas do token. */
    public static final class DadosToken {

        private final Long idUsuario;
        private final String email;
        private final String papel;

        public DadosToken(Long idUsuario, String email, String papel) {
            this.idUsuario = idUsuario;
            this.email = email;
            this.papel = papel;
        }

        public Long getIdUsuario() {
            return idUsuario;
        }

        public String getEmail() {
            return email;
        }

        public String getPapel() {
            return papel;
        }
    }

    /** Erro de token — tratado pelo @RestControllerAdvice (HTTP 401). */
    public static class TokenInvalidoException extends RuntimeException {
        public TokenInvalidoException(String motivo) {
            super(motivo);
        }
    }
}
