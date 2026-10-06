package br.com.maklayn.web;

import br.com.maklayn.dominio.Usuario;
import br.com.maklayn.seguranca.AutenticacaoFiltro;
import br.com.maklayn.seguranca.GoogleServico;
import br.com.maklayn.seguranca.JwtServico;
import br.com.maklayn.servico.UsuarioServico;
import javax.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * =====================================================================
 *  MAKLAYN — Rotas de autenticação (seção 3 da especificação)
 *
 *  GET   /api/auth/config             -> status da configuração
 *  GET   /api/auth/google             -> redireciona à tela do Google
 *  GET   /api/auth/google/callback    -> troca o "code" e cria a sessão
 *  POST  /api/auth/google/credential  -> login via Google Identity Services
 *  POST  /api/auth/demo               -> login de demonstração
 *  GET   /api/auth/eu                 -> usuário da sessão atual
 *  POST  /api/auth/sair               -> encerra a sessão
 *  PATCH /api/auth/perfil             -> atualiza nome/papel
 * =====================================================================
 */
@RestController
@RequestMapping("/api/auth")
public class AuthControlador {

    private final UsuarioServico usuarios;
    private final GoogleServico google;
    private final JwtServico jwt;
    private final String nomeCookie;
    private final long expiracaoSegundos;
    private final boolean permitirDemo;

    public AuthControlador(UsuarioServico usuarios,
                           GoogleServico google,
                           JwtServico jwt,
                           @Value("${maklayn.auth.cookie-nome:maklayn_token}") String nomeCookie,
                           @Value("${maklayn.auth.jwt-expiracao-segundos:28800}") long expiracaoSegundos,
                           @Value("${maklayn.auth.permitir-demo:true}") boolean permitirDemo) {
        this.usuarios = usuarios;
        this.google = google;
        this.jwt = jwt;
        this.nomeCookie = nomeCookie;
        this.expiracaoSegundos = expiracaoSegundos;
        this.permitirDemo = permitirDemo;
    }

    /* -------------------------------------------------- configuração */

    @GetMapping("/config")
    public Map<String, Object> config() {
        Map<String, Object> resposta = new LinkedHashMap<>();
        resposta.put("google", Map.of(
            "configurado", google.configurado(),
            "client_id", google.getClientId() == null || google.getClientId().isBlank()
                ? "" : google.getClientId()));
        resposta.put("demo", permitirDemo);
        return resposta;
    }

    /* ------------------------------------- fluxo Authorization Code */

    @GetMapping("/google")
    public ResponseEntity<Void> entrarComGoogle() {
        if (!google.configurado()) {
            throw new UsuarioServico.RegraDeNegocioException(
                "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados.", 503);
        }
        // `state` aleatório guardado em cookie httpOnly: o callback só é aceito
        // se o valor devolvido pelo Google for idêntico (proteção CSRF).
        String state = UUID.randomUUID().toString();

        return ResponseEntity.status(302)
            .header(HttpHeaders.LOCATION, google.urlConsentimento(state))
            .header(HttpHeaders.SET_COOKIE, montarCookie("maklayn_state", state, 600, false))
            .build();
    }

    @GetMapping("/google/callback")
    public ResponseEntity<Void> callbackGoogle(@RequestParam(required = false) String code,
                                              @RequestParam(required = false) String state,
                                              @RequestParam(required = false) String error,
                                              @CookieValue(name = "maklayn_state", required = false) String stateCookie) {
        if (error != null) {
            return redirecionar("/?erro=" + error);
        }
        if (code == null || code.isBlank()) {
            throw new UsuarioServico.RegraDeNegocioException("Callback do Google sem o parâmetro 'code'.");
        }
        if (stateCookie != null && !stateCookie.equals(state)) {
            throw new UsuarioServico.RegraDeNegocioException(
                "Parâmetro 'state' inválido — possível tentativa de CSRF.", 400);
        }

        try {
            GoogleServico.PerfilGoogle perfil = google.trocarCodePorPerfil(code);
            Usuario usuario = usuarios.upsertDoGoogle(perfil);
            String token = jwt.assinar(usuario.getId(), usuario.getEmail(), usuario.getPapel());

            return ResponseEntity.status(302)
                .header(HttpHeaders.LOCATION, "/")
                .header(HttpHeaders.SET_COOKIE, montarCookie(nomeCookie, token, expiracaoSegundos, false))
                .build();
        } catch (Exception e) {
            throw new UsuarioServico.RegraDeNegocioException("Falha no login Google: " + e.getMessage(), 401);
        }
    }

    /* ---------------------------------- Google Identity Services */

    @PostMapping("/google/credential")
    public ResponseEntity<Map<String, Object>> credencialGoogle(@RequestBody Map<String, Object> corpo) {
        String credencial = texto(corpo.get("credential"));
        if (credencial == null) {
            credencial = texto(corpo.get("id_token"));
        }
        if (credencial == null) {
            throw new UsuarioServico.RegraDeNegocioException("Envie o campo 'credential'.", 400);
        }

        try {
            GoogleServico.PerfilGoogle perfil = google.validarCredencial(credencial);
            Usuario usuario = usuarios.upsertDoGoogle(perfil);
            String token = jwt.assinar(usuario.getId(), usuario.getEmail(), usuario.getPapel());

            return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, montarCookie(nomeCookie, token, expiracaoSegundos, false))
                .body(sessao(usuario, token));
        } catch (Exception e) {
            throw new UsuarioServico.RegraDeNegocioException("Credencial Google inválida: " + e.getMessage(), 401);
        }
    }

    /* ---------------------------------------------- modo demonstração */

    @PostMapping("/demo")
    public ResponseEntity<Map<String, Object>> demo(@RequestBody Map<String, Object> corpo) {
        if (!permitirDemo) {
            throw new UsuarioServico.RegraDeNegocioException(
                "Login de demonstração desativado (ALLOW_DEMO_LOGIN=false).", 403);
        }
        Usuario usuario = usuarios.criarOuBuscarDemo(
            texto(corpo.get("nome")), texto(corpo.get("email")), texto(corpo.get("papel")));

        String token = jwt.assinar(usuario.getId(), usuario.getEmail(), usuario.getPapel());
        Map<String, Object> corpoResposta = sessao(usuario, token);
        corpoResposta.put("demo", true);

        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, montarCookie(nomeCookie, token, expiracaoSegundos, false))
            .body(corpoResposta);
    }

    /* ------------------------------------------------------ sessão */

    @GetMapping("/eu")
    public Map<String, Object> eu(HttpServletRequest req) {
        Usuario usuario = AutenticacaoFiltro.usuarioDa(req);
        if (usuario == null) {
            return Map.of("autenticado", false);
        }
        return sessao(usuario, null);
    }

    @PostMapping("/sair")
    public ResponseEntity<Map<String, Object>> sair() {
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, montarCookie(nomeCookie, "", 0, true))
            .body(Map.of("autenticado", false, "mensagem", "Sessão encerrada."));
    }

    @PatchMapping("/perfil")
    public Map<String, Object> atualizarPerfil(HttpServletRequest req, @RequestBody Map<String, Object> corpo) {
        Usuario usuario = AutenticacaoFiltro.usuarioDa(req);
        if (usuario == null) {
            throw new UsuarioServico.RegraDeNegocioException("Faça login para atualizar o perfil.", 401);
        }
        Usuario atualizado = usuarios.atualizarPerfil(usuario.getId(),
            texto(corpo.get("nome_completo")), texto(corpo.get("papel")));
        return Map.of("usuario", usuarioParaMapa(atualizado));
    }

    /* --------------------------------------------------- auxiliares */

    private Map<String, Object> sessao(Usuario usuario, String token) {
        Map<String, Object> resposta = new LinkedHashMap<>();
        resposta.put("autenticado", true);
        resposta.put("usuario", usuarioParaMapa(usuario));
        if (token != null) {
            resposta.put("token", token);
        }
        return resposta;
    }

    private Map<String, Object> usuarioParaMapa(Usuario u) {
        Map<String, Object> mapa = new LinkedHashMap<>();
        mapa.put("id_usuario", u.getId());
        mapa.put("nome_completo", u.getNomeCompleto());
        mapa.put("email", u.getEmail());
        mapa.put("foto_url", u.getFotoUrl());
        mapa.put("papel", u.getPapel());
        mapa.put("data_criacao", u.getDataCriacao());
        return mapa;
    }

    /** Cookie httpOnly (inacessível ao JavaScript => protege contra XSS). */
    private String montarCookie(String nome, String valor, long maxAge, boolean apagar) {
        StringBuilder sb = new StringBuilder();
        sb.append(nome).append('=').append(apagar ? "" : valor);
        sb.append("; Path=/; HttpOnly; SameSite=Lax");
        sb.append("; Max-Age=").append(maxAge);
        return sb.toString();
    }

    private ResponseEntity<Void> redirecionar(String caminho) {
        return ResponseEntity.status(302).header(HttpHeaders.LOCATION, caminho).build();
    }

    private String texto(Object valor) {
        if (valor == null) {
            return null;
        }
        String s = String.valueOf(valor).trim();
        return s.isEmpty() ? null : s;
    }
}
