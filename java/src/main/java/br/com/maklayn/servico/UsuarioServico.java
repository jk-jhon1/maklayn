package br.com.maklayn.servico;

import br.com.maklayn.dominio.Usuario;
import br.com.maklayn.repositorio.HistoricoConsultaRepositorio;
import br.com.maklayn.repositorio.ReferenciaSalvaRepositorio;
import br.com.maklayn.repositorio.UsuarioRepositorio;
import br.com.maklayn.seguranca.GoogleServico;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * MAKLAYN — Serviço de usuários (regras de domínio, sem código HTTP).
 */
@Service
public class UsuarioServico {

    private static final Logger log = LoggerFactory.getLogger(UsuarioServico.class);
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final List<String> PAPEIS = List.of("aluno", "dev", "professor", "admin");

    private final UsuarioRepositorio repo;
    private final HistoricoConsultaRepositorio historicoRepo;
    private final ReferenciaSalvaRepositorio referenciaRepo;

    public UsuarioServico(UsuarioRepositorio repo,
                          HistoricoConsultaRepositorio historicoRepo,
                          ReferenciaSalvaRepositorio referenciaRepo) {
        this.repo = repo;
        this.historicoRepo = historicoRepo;
        this.referenciaRepo = referenciaRepo;
    }

    public Optional<Usuario> buscarPorId(Long id) {
        return id == null ? Optional.empty() : repo.findById(id);
    }

    public Optional<Usuario> buscarPorEmail(String email) {
        return email == null ? Optional.empty() : repo.findByEmail(email.toLowerCase());
    }

    /**
     * Cria ou atualiza o usuário a partir do perfil do Google.
     * Idempotente: repetir o login não duplica contas.
     */
    @Transactional
    public Usuario upsertDoGoogle(GoogleServico.PerfilGoogle perfil) {
        String email = perfil.getEmail() == null ? "" : perfil.getEmail().toLowerCase();

        Optional<Usuario> porGoogle = repo.findByGoogleId(perfil.getGoogleId());
        if (porGoogle.isPresent()) {
            Usuario u = porGoogle.get();
            u.setNomeCompleto(perfil.getNomeCompleto());
            u.setFotoUrl(perfil.getFotoUrl());
            u.setDataAcesso(LocalDateTime.now());
            return repo.save(u);
        }

        Optional<Usuario> porEmail = repo.findByEmail(email);
        if (porEmail.isPresent()) {
            // conta criada antes do login Google: vincula o google_id
            Usuario u = porEmail.get();
            u.setGoogleId(perfil.getGoogleId());
            u.setNomeCompleto(perfil.getNomeCompleto());
            u.setFotoUrl(perfil.getFotoUrl());
            u.setDataAcesso(LocalDateTime.now());
            log.info("Conta {} vinculada à identidade Google.", email);
            return repo.save(u);
        }

        Usuario novo = new Usuario();
        novo.setNomeCompleto(perfil.getNomeCompleto());
        novo.setEmail(email);
        novo.setGoogleId(perfil.getGoogleId());
        novo.setFotoUrl(perfil.getFotoUrl());
        novo.setPapel("aluno");
        novo.setDataAcesso(LocalDateTime.now());
        return repo.save(novo);
    }

    /** Login de demonstração (usado quando não há credenciais Google). */
    @Transactional
    public Usuario criarOuBuscarDemo(String nome, String email, String papel) {
        String limpo = email == null ? "" : email.trim().toLowerCase();
        if (!EMAIL.matcher(limpo).matches()) {
            throw new RegraDeNegocioException("Informe um e-mail válido para o login de demonstração.");
        }

        Optional<Usuario> existente = repo.findByEmail(limpo);
        if (existente.isPresent()) {
            Usuario u = existente.get();
            u.setDataAcesso(LocalDateTime.now());
            return repo.save(u);
        }

        Usuario novo = new Usuario();
        novo.setNomeCompleto(nome == null || nome.isBlank() ? limpo.substring(0, limpo.indexOf('@')) : nome.trim());
        novo.setEmail(limpo);
        novo.setGoogleId("demo:" + limpo);
        novo.setPapel(papelValido(papel));
        return repo.save(novo);
    }

    /**
     * Normaliza o papel informado.
     *
     * <p>Cuidado importante: esta lista é imutável e o método {@code contains(null)}
     * de {@code List.of(...)} lança {@link NullPointerException}. Por isso a
     * verificação de nulo vem sempre antes.</p>
     */
    private static String papelValido(String papel) {
        if (papel == null) {
            return "aluno";
        }
        return PAPEIS.contains(papel) ? papel : "aluno";
    }

    @Transactional
    public Usuario atualizarPerfil(Long idUsuario, String nomeCompleto, String papel) {
        Usuario u = repo.findById(idUsuario)
            .orElseThrow(() -> new RegraDeNegocioException("Usuário não encontrado.", 404));

        if (nomeCompleto != null && !nomeCompleto.isBlank()) {
            u.setNomeCompleto(nomeCompleto.trim());
        }
        if (papel != null && PAPEIS.contains(papel)) {
            u.setPapel(papel);
        }
        return repo.save(u);
    }

    /** Métricas do painel do usuário. */
    public Estatisticas estatisticas(Long idUsuario) {
        long codigo = historicoRepo.countByIdUsuarioAndTipoConsulta(idUsuario, br.com.maklayn.ai.TipoConsulta.Codigo);
        long redacao = historicoRepo.countByIdUsuarioAndTipoConsulta(idUsuario, br.com.maklayn.ai.TipoConsulta.Redacao);
        long pesquisa = historicoRepo.countByIdUsuarioAndTipoConsulta(idUsuario, br.com.maklayn.ai.TipoConsulta.Pesquisa);
        long total = historicoRepo.countByIdUsuario(idUsuario);
        long referencias = referenciaRepo.countByIdUsuario(idUsuario);

        return new Estatisticas(total, codigo, redacao, pesquisa, referencias);
    }

    /** Erro de regra de negócio — traduzido para HTTP pelo @RestControllerAdvice. */
    public static class RegraDeNegocioException extends RuntimeException {
        private final int status;

        public RegraDeNegocioException(String mensagem) {
            this(mensagem, 400);
        }

        public RegraDeNegocioException(String mensagem, int status) {
            super(mensagem);
            this.status = status;
        }

        public int getStatus() {
            return status;
        }
    }

    /** Métricas de uso do usuário (painel). */
    public static final class Estatisticas {

        private final long total;
        private final long codigo;
        private final long redacao;
        private final long pesquisa;
        private final long referencias;

        public Estatisticas(long total, long codigo, long redacao, long pesquisa, long referencias) {
            this.total = total;
            this.codigo = codigo;
            this.redacao = redacao;
            this.pesquisa = pesquisa;
            this.referencias = referencias;
        }

        public long getTotal() {
            return total;
        }

        public long getCodigo() {
            return codigo;
        }

        public long getRedacao() {
            return redacao;
        }

        public long getPesquisa() {
            return pesquisa;
        }

        public long getReferencias() {
            return referencias;
        }
    }
}
