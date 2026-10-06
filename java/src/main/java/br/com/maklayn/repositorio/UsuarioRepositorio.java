package br.com.maklayn.repositorio;

import br.com.maklayn.dominio.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/** Acesso à tabela Usuarios (Spring Data JPA). */
public interface UsuarioRepositorio extends JpaRepository<Usuario, Long> {

    Optional<Usuario> findByEmail(String email);

    Optional<Usuario> findByGoogleId(String googleId);

    boolean existsByEmail(String email);
}
