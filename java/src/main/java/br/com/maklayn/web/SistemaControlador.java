package br.com.maklayn.web;

import br.com.maklayn.ai.AiRouter;
import br.com.maklayn.ai.MaklaynPrompt;
import br.com.maklayn.ai.TipoConsulta;
import br.com.maklayn.seguranca.GoogleServico;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * =====================================================================
 *  MAKLAYN — Rotas de sistema
 *
 *  GET  /api/health           -> saúde da aplicação, banco e motor de IA
 *  GET  /api/status           -> resumo de configuração
 *  GET  /api/prompt           -> system prompt em vigor (auditoria)
 *  POST /api/recomendar-modo  -> sugere o pilar ideal para um texto
 * =====================================================================
 */
@RestController
@RequestMapping("/api")
public class SistemaControlador {

    private final AiRouter roteador;
    private final GoogleServico google;
    private final JdbcTemplate jdbc;
    private final String ambiente;
    private final String banco;

    public SistemaControlador(AiRouter roteador,
                              GoogleServico google,
                              JdbcTemplate jdbc,
                              @Value("${spring.profiles.active:default}") String ambiente,
                              @Value("${spring.datasource.url}") String banco) {
        this.roteador = roteador;
        this.google = google;
        this.jdbc = jdbc;
        this.ambiente = ambiente;
        this.banco = banco;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        long inicio = System.currentTimeMillis();

        String statusBanco;
        try {
            Integer um = jdbc.queryForObject("SELECT 1", Integer.class);
            statusBanco = (um != null && um == 1) ? "ok" : "inesperado";
        } catch (Exception e) {
            statusBanco = "falha: " + e.getMessage();
        }

        Map<String, Object> resposta = new LinkedHashMap<>();
        resposta.put("aplicacao", "Maklayn");
        resposta.put("versao", "1.0.0 (Java)");
        resposta.put("ambiente", ambiente);
        resposta.put("uptime_s", java.lang.management.ManagementFactory.getRuntimeMXBean().getUptime() / 1000);
        resposta.put("banco", Map.of("cliente", clienteBanco(), "status", statusBanco));
        resposta.put("ia", roteador.status());
        resposta.put("resposta_ms", System.currentTimeMillis() - inicio);
        return resposta;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        Map<String, Object> resposta = new LinkedHashMap<>();
        resposta.put("aplicacao", Map.of(
            "nome", "Maklayn",
            "versao", "1.0.0 (Java)",
            "descricao", "Assistente de Inteligência Artificial Multidisciplinar"));
        resposta.put("banco", Map.of("cliente", clienteBanco()));
        resposta.put("ia", roteador.status());
        resposta.put("google_login", Map.of(
            "configurado", google.configurado(),
            "demo_habilitado", true));
        resposta.put("modos", TipoConsulta.values());
        return resposta;
    }

    /** Transparência: expõe o prompt de sistema em vigor. */
    @GetMapping("/prompt")
    public Map<String, Object> prompt() {
        return Map.of(
            "system_prompt", MaklaynPrompt.SYSTEM_PROMPT,
            "instrucoes_por_modo", MaklaynPrompt.instrucoesPorModo());
    }

    @PostMapping("/recomendar-modo")
    public Map<String, Object> recomendar(@RequestBody(required = false) Map<String, Object> corpo) {
        String texto = corpo == null || corpo.get("prompt") == null ? "" : String.valueOf(corpo.get("prompt"));
        return Map.of(
            "modo", MaklaynPrompt.recomendarModo(texto).name(),
            "prompt", texto.length() > 200 ? texto.substring(0, 200) : texto);
    }

    /**
     * Identifica o SGBD pela URL JDBC. A ordem importa: o banco de
     * desenvolvimento é H2 em modo de compatibilidade MySQL
     * (jdbc:h2:mem:maklayn;MODE=MySQL), então "h2" precisa ser testado antes.
     */
    private String clienteBanco() {
        String url = banco == null ? "" : banco.toLowerCase();
        if (url.startsWith("jdbc:h2")) {
            return "h2";
        }
        if (url.contains("mysql")) {
            return "mysql";
        }
        if (url.contains("postgresql")) {
            return "postgresql";
        }
        return "jdbc";
    }
}
