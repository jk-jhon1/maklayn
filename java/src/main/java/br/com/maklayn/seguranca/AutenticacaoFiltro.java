package br.com.maklayn.seguranca;

import br.com.maklayn.dominio.Usuario;
import br.com.maklayn.servico.UsuarioServico;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * =====================================================================
 *  MAKLAYN — Filtro de autenticação
 *
 *  Lê o JWT do cookie httpOnly (padrão) ou do cabeçalho
 *  "Authorization: Bearer <token>", valida e anexa o usuário à requisição.
 *  Não bloqueia nada: cada controlador decide se exige sessão.
 * =====================================================================
 */
@Component
public class AutenticacaoFiltro extends OncePerRequestFilter {

    /** Atributo da requisição onde o usuário autenticado é guardado. */
    public static final String ATRIBUTO_USUARIO = "maklayn.usuario";

    private final JwtServico jwt;
    private final UsuarioServico usuarios;
    private final String nomeCookie;

    public AutenticacaoFiltro(JwtServico jwt, UsuarioServico usuarios,
                              @Value("${maklayn.auth.cookie-nome:maklayn_token}") String nomeCookie) {
        this.jwt = jwt;
        this.usuarios = usuarios;
        this.nomeCookie = nomeCookie;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
        throws ServletException, IOException {

        String token = extrairToken(req);
        if (token != null) {
            try {
                JwtServico.DadosToken dados = jwt.verificar(token);
                usuarios.buscarPorId(dados.getIdUsuario())
                    .filter(u -> Boolean.TRUE.equals(u.getAtivo()))
                    .ifPresent(u -> req.setAttribute(ATRIBUTO_USUARIO, u));
            } catch (RuntimeException ignorado) {
                // token inválido ou expirado => segue como visitante
            }
        }
        chain.doFilter(req, res);
    }

    private String extrairToken(HttpServletRequest req) {
        if (req.getCookies() != null) {
            for (Cookie c : req.getCookies()) {
                if (nomeCookie.equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) {
                    return c.getValue();
                }
            }
        }

        String auth = req.getHeader("Authorization");
        if (auth != null && auth.toLowerCase().startsWith("bearer ")) {
            return auth.substring(7).trim();
        }
        return null;
    }

    /** Usuário autenticado da requisição, ou null para visitantes. */
    public static Usuario usuarioDa(HttpServletRequest req) {
        return (Usuario) req.getAttribute(ATRIBUTO_USUARIO);
    }
}
