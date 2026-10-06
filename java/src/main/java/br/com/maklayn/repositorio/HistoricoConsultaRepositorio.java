package br.com.maklayn.repositorio;

import br.com.maklayn.ai.TipoConsulta;
import br.com.maklayn.dominio.HistoricoConsulta;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** Acesso à tabela Historico_Consultas. */
public interface HistoricoConsultaRepositorio extends JpaRepository<HistoricoConsulta, Long> {

    Optional<HistoricoConsulta> findByIdAndIdUsuario(Long id, Long idUsuario);

    long countByIdUsuario(Long idUsuario);

    /** Histórico sem filtro de pilar (busca textual opcional). */
    @Query("SELECT h FROM HistoricoConsulta h "
        + "WHERE h.idUsuario = :idUsuario "
        + "  AND (:busca IS NULL "
        + "       OR LOWER(h.promptUsuario) LIKE LOWER(CONCAT('%', :busca, '%')) "
        + "       OR LOWER(h.respostaIa)    LIKE LOWER(CONCAT('%', :busca, '%'))) "
        + "ORDER BY h.dataHora DESC, h.id DESC")
    Page<HistoricoConsulta> filtrarSemTipo(@Param("idUsuario") Long idUsuario,
                                           @Param("busca") String busca,
                                           Pageable pageable);

    /** Histórico filtrado por pilar (busca textual opcional). */
    @Query("SELECT h FROM HistoricoConsulta h "
        + "WHERE h.idUsuario = :idUsuario "
        + "  AND h.tipoConsulta = :tipo "
        + "  AND (:busca IS NULL "
        + "       OR LOWER(h.promptUsuario) LIKE LOWER(CONCAT('%', :busca, '%')) "
        + "       OR LOWER(h.respostaIa)    LIKE LOWER(CONCAT('%', :busca, '%'))) "
        + "ORDER BY h.dataHora DESC, h.id DESC")
    Page<HistoricoConsulta> filtrarComTipo(@Param("idUsuario") Long idUsuario,
                                           @Param("tipo") TipoConsulta tipo,
                                           @Param("busca") String busca,
                                           Pageable pageable);

    /** Contagem por pilar para o painel de métricas. */
    long countByIdUsuarioAndTipoConsulta(Long idUsuario, TipoConsulta tipo);
}
