package br.com.maklayn.web;

import br.com.maklayn.dominio.ReferenciaSalva;
import br.com.maklayn.dominio.Usuario;
import br.com.maklayn.seguranca.AutenticacaoFiltro;
import br.com.maklayn.servico.ReferenciaServico;
import br.com.maklayn.servico.UsuarioServico;
import javax.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * =====================================================================
 *  MAKLAYN — Rotas de referências salvas
 *
 *  POST   /api/referencias       -> salva um link sugerido pela IA
 *  GET    /api/referencias       -> lista (?busca=)
 *  GET    /api/referencias/abnt  -> exporta em formato ABNT (texto)
 *  DELETE /api/referencias/{id}  -> remove
 * =====================================================================
 */
@RestController
@RequestMapping("/api/referencias")
public class ReferenciaControlador {

    private final ReferenciaServico referencias;

    public ReferenciaControlador(ReferenciaServico referencias) {
        this.referencias = referencias;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> salvar(HttpServletRequest req, @RequestBody Map<String, Object> corpo) {
        Usuario usuario = exigirUsuario(req);

        ReferenciaServico.ResultadoSalvar resultado = referencias.salvar(
            usuario.getId(),
            numero(corpo.get("id_consulta")),
            texto(corpo.get("titulo_link")),
            texto(corpo.get("url_referencia")),
            texto(corpo.get("anotacao")));

        Map<String, Object> referencia = paraMapa(resultado.getReferencia());
        referencia.put("atualizada", resultado.isAtualizada());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("referencia", referencia));
    }

    @GetMapping
    public Map<String, Object> listar(HttpServletRequest req,
                                      @RequestParam(required = false) String busca,
                                      @RequestParam(defaultValue = "100") int porPagina) {
        Usuario usuario = exigirUsuario(req);
        List<Map<String, Object>> itens = new ArrayList<>();
        for (ReferenciaSalva r : referencias.listar(usuario.getId(), busca, porPagina)) {
            itens.add(paraMapa(r));
        }

        Map<String, Object> resposta = new LinkedHashMap<>();
        resposta.put("itens", itens);
        resposta.put("total", referencias.contar(usuario.getId()));
        return resposta;
    }

    @GetMapping(value = "/abnt", produces = "text/plain;charset=UTF-8")
    public ResponseEntity<String> exportarAbnt(HttpServletRequest req) {
        String texto = referencias.exportarAbnt(exigirUsuario(req).getId());
        return ResponseEntity.ok(texto.isBlank() ? "Nenhuma referência salva ainda." : texto);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> excluir(HttpServletRequest req, @PathVariable Long id) {
        referencias.excluir(id, exigirUsuario(req).getId());
        return Map.of("removidas", 1);
    }

    /* --------------------------------------------------- auxiliares */

    private Usuario exigirUsuario(HttpServletRequest req) {
        Usuario usuario = AutenticacaoFiltro.usuarioDa(req);
        if (usuario == null) {
            throw new UsuarioServico.RegraDeNegocioException("Faça login para acessar este recurso.", 401);
        }
        return usuario;
    }

    private Map<String, Object> paraMapa(ReferenciaSalva r) {
        Map<String, Object> mapa = new LinkedHashMap<>();
        mapa.put("id_referencia", r.getId());
        mapa.put("titulo_link", r.getTituloLink());
        mapa.put("url_referencia", r.getUrlReferencia());
        mapa.put("anotacao", r.getAnotacao());
        mapa.put("id_consulta", r.getIdConsulta());
        mapa.put("data_salvo", r.getDataSalvo());
        return mapa;
    }

    private String texto(Object valor) {
        if (valor == null) {
            return null;
        }
        String s = String.valueOf(valor).trim();
        return s.isEmpty() ? null : s;
    }

    private Long numero(Object valor) {
        if (valor instanceof Number) {
            return ((Number) valor).longValue();
        }
        try {
            return valor == null ? null : Long.valueOf(String.valueOf(valor));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
