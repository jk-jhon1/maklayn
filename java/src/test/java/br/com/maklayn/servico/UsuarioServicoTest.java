package br.com.maklayn.servico;

import br.com.maklayn.dominio.Usuario;
import br.com.maklayn.repositorio.HistoricoConsultaRepositorio;
import br.com.maklayn.repositorio.ReferenciaSalvaRepositorio;
import br.com.maklayn.repositorio.UsuarioRepositorio;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Testes do serviço de usuários — focados no login de demonstração,
 * que é a porta de entrada mais usada em avaliações do sistema.
 *
 * <p>O teste {@link #demoComPapelNulo()} é uma regressão de um bug real:
 * {@code List.of("aluno", ...).contains(null)} lança NullPointerException
 * em Java (coleções imutáveis não aceitam nulo), derrubando o login quando
 * o cliente não envia o campo "papel".</p>
 */
class UsuarioServicoTest {

    private final UsuarioRepositorio usuarioRepo = mock(UsuarioRepositorio.class);
    private final HistoricoConsultaRepositorio historicoRepo = mock(HistoricoConsultaRepositorio.class);
    private final ReferenciaSalvaRepositorio referenciaRepo = mock(ReferenciaSalvaRepositorio.class);

    private final UsuarioServico servico =
        new UsuarioServico(usuarioRepo, historicoRepo, referenciaRepo);

    private void simulandoBancoVazio() {
        when(usuarioRepo.findByEmail(anyString())).thenReturn(Optional.empty());
        when(usuarioRepo.save(any(Usuario.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    @DisplayName("Login de demonstração SEM o campo 'papel' não lança NullPointerException")
    void demoComPapelNulo() {
        simulandoBancoVazio();

        Usuario criado = servico.criarOuBuscarDemo("Ana Souza", "ana@exemplo.com", null);

        assertEquals("aluno", criado.getPapel(), "papel nulo deve virar 'aluno'");
        assertEquals("ana@exemplo.com", criado.getEmail());
        assertEquals("demo:ana@exemplo.com", criado.getGoogleId());
    }

    @Test
    @DisplayName("Papel inválido também cai no padrão 'aluno'")
    void demoComPapelInvalido() {
        simulandoBancoVazio();
        assertEquals("aluno", servico.criarOuBuscarDemo("Ana", "ana2@exemplo.com", "root").getPapel());
    }

    @Test
    @DisplayName("Papel válido é respeitado")
    void demoComPapelValido() {
        simulandoBancoVazio();
        assertEquals("dev", servico.criarOuBuscarDemo("Ana", "ana3@exemplo.com", "dev").getPapel());
    }

    @Test
    @DisplayName("Sem nome, o padrão é a parte local do e-mail")
    void demoComNomeNulo() {
        simulandoBancoVazio();
        assertEquals("ana4", servico.criarOuBuscarDemo(null, "ana4@exemplo.com", "aluno").getNomeCompleto());
    }

    @Test
    @DisplayName("E-mail inválido é rejeitado com erro de regra de negócio")
    void demoComEmailInvalido() {
        UsuarioServico.RegraDeNegocioException erro = assertThrows(
            UsuarioServico.RegraDeNegocioException.class,
            () -> servico.criarOuBuscarDemo("Ana", "sem-arroba", "aluno"));
        assertEquals(400, erro.getStatus());
    }

    @Test
    @DisplayName("Login já existente é reaproveitado, sem duplicar conta")
    void demoReaproveitaContaExistente() {
        Usuario existente = new Usuario();
        existente.setEmail("maria@exemplo.com");
        existente.setNomeCompleto("Maria Silva");
        existente.setPapel("aluno");

        when(usuarioRepo.findByEmail("maria@exemplo.com")).thenReturn(Optional.of(existente));
        when(usuarioRepo.save(any(Usuario.class))).thenAnswer(inv -> inv.getArgument(0));

        Usuario retornado = servico.criarOuBuscarDemo("Outro Nome", "Maria@Exemplo.com", "dev");

        assertEquals("maria@exemplo.com", retornado.getEmail(), "e-mail deve ser normalizado");
        assertEquals("Maria Silva", retornado.getNomeCompleto(), "não deve sobrescrever o nome existente");
    }
}
