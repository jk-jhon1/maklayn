package br.com.maklayn.seguranca;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Testes do JWT próprio: assinatura, adulteração e expiração.
 */
class JwtServicoTest {

    private final JwtServico jwt = new JwtServico("segredo-de-teste-123", 3600);

    @Test
    @DisplayName("Token assinado é verificado e devolve as claims corretas")
    void roundTrip() {
        String token = jwt.assinar(42L, "maria@exemplo.com", "aluno");
        JwtServico.DadosToken dados = jwt.verificar(token);

        assertEquals(42L, dados.getIdUsuario());
        assertEquals("maria@exemplo.com", dados.getEmail());
        assertEquals("aluno", dados.getPapel());
    }

    @Test
    @DisplayName("Payload adulterado é rejeitado pela verificação da assinatura")
    void payloadAdulterado() {
        String token = jwt.assinar(1L, "a@b.com", "aluno");
        String[] partes = token.split("\\.");
        String adulterado = partes[0] + "." + partes[1].substring(0, partes[1].length() - 2) + "XY." + partes[2];

        assertThrows(JwtServico.TokenInvalidoException.class, () -> jwt.verificar(adulterado));
    }

    @Test
    @DisplayName("Token expirado é rejeitado")
    void expirado() {
        String token = jwt.assinar(1L, "a@b.com", "aluno", -10);
        assertThrows(JwtServico.TokenInvalidoException.class, () -> jwt.verificar(token));
    }

    @Test
    @DisplayName("Token malformado não derruba a aplicação, apenas retorna erro")
    void malformado() {
        assertThrows(JwtServico.TokenInvalidoException.class, () -> jwt.verificar("abc.def"));
        assertThrows(JwtServico.TokenInvalidoException.class, () -> jwt.verificar(null));
    }
}
