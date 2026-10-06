package br.com.maklayn.servico;

import br.com.maklayn.dominio.ReferenciaSalva;
import br.com.maklayn.repositorio.ReferenciaSalvaRepositorio;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

/**
 * MAKLAYN — Serviço de referências salvas (links sugeridos pela IA).
 */
@Service
public class ReferenciaServico {

    private static final DateTimeFormatter ABNT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final ReferenciaSalvaRepositorio repo;

    public ReferenciaServico(ReferenciaSalvaRepositorio repo) {
        this.repo = repo;
    }

    @Transactional
    public ResultadoSalvar salvar(Long idUsuario, Long idConsulta, String titulo, String url, String anotacao) {
        if (!urlValida(url)) {
            throw new UsuarioServico.RegraDeNegocioException(
                "URL inválida: informe um endereço http(s) completo.");
        }

        String tituloFinal = (titulo == null || titulo.isBlank()) ? url : titulo.trim();
        if (tituloFinal.length() > 300) {
            tituloFinal = tituloFinal.substring(0, 300);
        }

        Optional<ReferenciaSalva> existente = repo.findByIdUsuarioAndUrlReferencia(idUsuario, url);
        if (existente.isPresent()) {
            ReferenciaSalva r = existente.get();
            r.setTituloLink(tituloFinal);
            if (anotacao != null && !anotacao.isBlank()) {
                r.setAnotacao(anotacao);
            }
            return new ResultadoSalvar(repo.save(r), true);
        }

        ReferenciaSalva nova = new ReferenciaSalva();
        nova.setIdUsuario(idUsuario);
        nova.setIdConsulta(idConsulta);
        nova.setTituloLink(tituloFinal);
        nova.setUrlReferencia(url);
        nova.setAnotacao(anotacao);
        return new ResultadoSalvar(repo.save(nova), false);
    }

    @Transactional(readOnly = true)
    public List<ReferenciaSalva> listar(Long idUsuario, String busca, int limite) {
        String filtro = (busca == null || busca.isBlank()) ? null : busca.trim();
        Page<ReferenciaSalva> pagina = repo.filtrar(idUsuario, filtro,
            PageRequest.of(0, Math.min(Math.max(limite, 1), 200)));
        return pagina.getContent();
    }

    @Transactional(readOnly = true)
    public long contar(Long idUsuario) {
        return repo.countByIdUsuario(idUsuario);
    }

    @Transactional
    public void excluir(Long id, Long idUsuario) {
        ReferenciaSalva r = repo.findByIdAndIdUsuario(id, idUsuario)
            .orElseThrow(() -> new UsuarioServico.RegraDeNegocioException("Referência não encontrada.", 404));
        repo.delete(r);
    }

    /** Exporta as referências no formato ABNT (NBR 6023). */
    @Transactional(readOnly = true)
    public String exportarAbnt(Long idUsuario) {
        List<ReferenciaSalva> refs = repo.findByIdUsuarioOrderByDataSalvoDesc(idUsuario);
        String hoje = java.time.LocalDate.now().format(ABNT);

        StringBuilder texto = new StringBuilder();
        int numero = 1;
        for (ReferenciaSalva r : refs) {
            if (numero > 1) {
                texto.append("\n\n");
            }
            texto.append(numero++).append(". ")
                 .append(r.getTituloLink().toUpperCase())
                 .append(". Disponível em: <").append(r.getUrlReferencia())
                 .append(">. Acesso em: ").append(hoje).append(".");
        }
        return texto.toString();
    }

    private boolean urlValida(String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        try {
            String esquema = URI.create(url).getScheme();
            return "http".equalsIgnoreCase(esquema) || "https".equalsIgnoreCase(esquema);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /** Referência salva + indicação de atualização de registro existente. */
    public static final class ResultadoSalvar {

        private final ReferenciaSalva referencia;
        private final boolean atualizada;

        public ResultadoSalvar(ReferenciaSalva referencia, boolean atualizada) {
            this.referencia = referencia;
            this.atualizada = atualizada;
        }

        public ReferenciaSalva getReferencia() {
            return referencia;
        }

        public boolean isAtualizada() {
            return atualizada;
        }
    }
}
