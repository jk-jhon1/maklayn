package br.com.maklayn.repositorio;

import br.com.maklayn.dominio.ReferenciaSalva;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** Acesso à tabela Referencias_Salvas. */
public interface ReferenciaSalvaRepositorio extends JpaRepository<ReferenciaSalva, Long> {

    Optional<ReferenciaSalva> findByIdAndIdUsuario(Long id, Long idUsuario);

    Optional<ReferenciaSalva> findByIdUsuarioAndUrlReferencia(Long idUsuario, String urlReferencia);

    long countByIdUsuario(Long idUsuario);

    @Query("SELECT r FROM ReferenciaSalva r "
        + "WHERE r.idUsuario = :idUsuario "
        + "  AND (:busca IS NULL "
        + "       OR LOWER(r.tituloLink)    LIKE LOWER(CONCAT('%', :busca, '%')) "
        + "       OR LOWER(r.urlReferencia) LIKE LOWER(CONCAT('%', :busca, '%')) "
        + "       OR LOWER(r.anotacao)      LIKE LOWER(CONCAT('%', :busca, '%'))) "
        + "ORDER BY r.dataSalvo DESC, r.id DESC")
    Page<ReferenciaSalva> filtrar(@Param("idUsuario") Long idUsuario,
                                  @Param("busca") String busca,
                                  Pageable pageable);

    List<ReferenciaSalva> findByIdUsuarioOrderByDataSalvoDesc(Long idUsuario);
}
