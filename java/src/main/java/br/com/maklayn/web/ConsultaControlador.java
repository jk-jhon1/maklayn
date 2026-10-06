package br.com.maklayn.web;

import br.com.maklayn.ai.AiEngine;
import br.com.maklayn.ai.TipoConsulta;
import br.com.maklayn.dominio.HistoricoConsulta;
import br.com.maklayn.dominio.Usuario;
import br.com.maklayn.seguranca.AutenticacaoFiltro;
import br.com.maklayn.servico.ConsultaServico;
import br.com.maklayn.servico.UsuarioServico;
import javax.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
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
 *  MAKLAYN — Rotas de consultas (núcleo funcional da IA)
 *
 *  POST   /api/consultas        -> executa uma consulta e persiste
 *  GET    /api/consultas        -> histórico (?tipo=&busca=&pagina=)
 *  GET    /api/consultas/resumo -> métricas do painel
 *  GET    /api/consultas/{id}   -> consulta completa
 *  DELETE /api/consultas/{id}   -> remove do histórico
 * =====================================================================
 */
@RestController
@RequestMapping("/api/consultas")
public class ConsultaControlador {

    private final ConsultaServico consultas;

    public ConsultaControlador(ConsultaServico consultas) {
        this.consultas = consultas;
    }

    @PostMapping
    public Map<String, Object> executar(HttpServletRequest req, @RequestBody Map<String, Object> corpo)
        throws Exception {

        Usuario usuario = exigirUsuario(req);

        String prompt = primeiroTexto(corpo, "prompt", "mensagem");
        if (prompt == null) {
            throw new UsuarioServico.RegraDeNegocioException("Envie o campo 'prompt' com a sua pergunta.");
        }

        TipoConsulta modo = TipoConsulta.de(primeiroTexto(corpo, "modo", "tipo"));
        String modelo = primeiroTexto(corpo, "modelo");

        ConsultaServico.Execucao execucao =
            consultas.executar(usuario.getId(), prompt, modo, modelo, lerHistorico(corpo.get("historico")));

        Map<String, Object> consulta = new LinkedHashMap<>();
        consulta.put("id_consulta", execucao.getConsulta().getId());
        consulta.put("tipo_consulta", execucao.getConsulta().getTipoConsulta().name());
        consulta.put("prompt_usuario", execucao.getConsulta().getPromptUsuario());
        consulta.put("resposta_ia", execucao.getConsulta().getRespostaIa());
        consulta.put("modelo_usado", execucao.getConsulta().getModeloUsado());
        consulta.put("tokens_usados", execucao.getConsulta().getTokensUsados());
        consulta.put("latencia_ms", execucao.getConsulta().getLatenciaMs());
        consulta.put("data_hora", execucao.getConsulta().getDataHora());
        consulta.put("provedor", execucao.getProvedor());
        consulta.put("fallback", execucao.isFallback());
        if (execucao.getAviso() != null) {
            consulta.put("aviso", execucao.getAviso());
        }
        consulta.put("referencias_detectadas", execucao.getReferenciasDetectadas());

        return Map.of("consulta", consulta);
    }

    @GetMapping
    public ConsultaServico.Pagina listar(HttpServletRequest req,
                                         @RequestParam(required = false) String tipo,
                                         @RequestParam(required = false) String busca,
                                         @RequestParam(defaultValue = "1") int pagina,
                                         @RequestParam(defaultValue = "20") int porPagina) {
        Usuario usuario = exigirUsuario(req);
        return consultas.listar(usuario.getId(), TipoConsulta.de(tipo), busca, pagina, porPagina);
    }

    @GetMapping("/resumo")
    public Map<String, Object> resumo(HttpServletRequest req) {
        return consultas.resumo(exigirUsuario(req).getId());
    }

    @GetMapping("/{id}")
    public Map<String, Object> obter(HttpServletRequest req, @PathVariable Long id) {
        HistoricoConsulta consulta = consultas.obter(id, exigirUsuario(req).getId());
        if (consulta == null) {
            throw new UsuarioServico.RegraDeNegocioException("Consulta não encontrada no seu histórico.", 404);
        }

        Map<String, Object> mapa = new LinkedHashMap<>();
        mapa.put("id_consulta", consulta.getId());
        mapa.put("tipo_consulta", consulta.getTipoConsulta().name());
        mapa.put("prompt_usuario", consulta.getPromptUsuario());
        mapa.put("resposta_ia", consulta.getRespostaIa());
        mapa.put("modelo_usado", consulta.getModeloUsado());
        mapa.put("latencia_ms", consulta.getLatenciaMs());
        mapa.put("data_hora", consulta.getDataHora());
        return Map.of("consulta", mapa);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> excluir(HttpServletRequest req, @PathVariable Long id) {
        consultas.excluir(id, exigirUsuario(req).getId());
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

    private String primeiroTexto(Map<String, Object> corpo, String... chaves) {
        for (String chave : chaves) {
            Object valor = corpo.get(chave);
            if (valor != null && !String.valueOf(valor).isBlank()) {
                return String.valueOf(valor);
            }
        }
        return null;
    }

    private List<AiEngine.PedidoIA.Mensagem> lerHistorico(Object bruto) {
        List<AiEngine.PedidoIA.Mensagem> mensagens = new ArrayList<>();
        if (!(bruto instanceof List)) {
            return mensagens;
        }

        for (Object item : (List<?>) bruto) {
            if (item instanceof Map) {
                Map<?, ?> mapa = (Map<?, ?>) item;
                Object texto = mapa.get("texto");
                if (texto != null) {
                    Object papel = mapa.get("papel");
                    mensagens.add(new AiEngine.PedidoIA.Mensagem(
                        papel == null ? "usuario" : String.valueOf(papel), String.valueOf(texto)));
                }
            }
        }

        // janela de contexto: últimos 8 turnos
        return mensagens.size() > 8
            ? new ArrayList<>(mensagens.subList(mensagens.size() - 8, mensagens.size()))
            : mensagens;
    }
}
