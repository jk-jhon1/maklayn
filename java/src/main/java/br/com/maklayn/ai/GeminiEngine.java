package br.com.maklayn.ai;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * =====================================================================
 *  MAKLAYN — Motor Google Gemini (Generative Language API)
 *  Ativar com:  AI_PROVIDER=gemini  e  GEMINI_API_KEY=AIza...
 * =====================================================================
 */
@Component
public class GeminiEngine implements AiEngine {

    private static final Logger log = LoggerFactory.getLogger(GeminiEngine.class);
    private static final String BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

    private final HttpJson http;
    private final String apiKey;
    private final String modelo;

    public GeminiEngine(HttpJson http,
                        @Value("${maklayn.ia.gemini.api-key:}") String apiKey,
                        @Value("${maklayn.ia.gemini.modelo:gemini-2.0-flash}") String modelo) {
        this.http = http;
        this.apiKey = apiKey;
        this.modelo = modelo;
    }

    @Override
    public String id() {
        return "gemini";
    }

    @Override
    public String rotulo() {
        return "Google Gemini";
    }

    @Override
    public String modeloPadrao() {
        return modelo;
    }

    @Override
    public boolean disponivel() {
        return apiKey != null && !apiKey.isBlank();
    }

    @Override
    public RespostaIA gerar(PedidoIA pedido) throws Exception {
        if (!disponivel()) {
            throw new IllegalStateException("GEMINI_API_KEY não configurada.");
        }

        long inicio = System.currentTimeMillis();
        String usado = (pedido.getModelo() == null || pedido.getModelo().isBlank()) ? modelo : pedido.getModelo();
        String url = BASE + usado + ":generateContent?key=" + apiKey;

        List<Map<String, Object>> contents = new ArrayList<>();
        if (pedido.getHistorico() != null) {
            for (PedidoIA.Mensagem m : pedido.getHistorico()) {
                contents.add(Map.of(
                    "role", "ia".equals(m.getPapel()) ? "model" : "user",
                    "parts", List.of(Map.of("text", m.getTexto()))));
            }
        }
        contents.add(Map.of("role", "user", "parts", List.of(Map.of("text", pedido.getPrompt()))));

        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("systemInstruction", Map.of("parts", List.of(Map.of("text",
            MaklaynPrompt.SYSTEM_PROMPT + "\n" + MaklaynPrompt.instrucaoDoModo(pedido.getModo())))));
        corpo.put("contents", contents);
        corpo.put("generationConfig", Map.of(
            "temperature", 0.7,
            "topP", 0.95,
            "maxOutputTokens", 8192));

        JsonNode json = http.postJson(url, corpo, null);

        JsonNode candidato = json.path("candidates").path(0);
        StringBuilder texto = new StringBuilder();
        for (JsonNode parte : candidato.path("content").path("parts")) {
            texto.append(parte.path("text").asText(""));
        }

        if (texto.toString().isBlank()) {
            String motivo = candidato.path("finishReason").asText("desconhecido");
            throw new IllegalStateException("Gemini não retornou texto (motivo: " + motivo + ").");
        }

        int tokens = json.path("usageMetadata").path("totalTokenCount").asInt(0);
        long latencia = System.currentTimeMillis() - inicio;
        log.info("Gemini respondeu em {} ms ({} tokens)", latencia, tokens);

        return new RespostaIA(texto.toString().trim(), usado, tokens, latencia);
    }
}
