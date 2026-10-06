package br.com.maklayn.ai;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * =====================================================================
 *  MAKLAYN — Motor compatível com a API OpenAI (chat/completions)
 *
 *  Funciona com OpenAI, Groq, DeepSeek, OpenRouter, Together, Ollama...
 *  Basta apontar OPENAI_BASE_URL para o endpoint desejado.
 * =====================================================================
 */
@Component
public class OpenAiEngine implements AiEngine {

    private final HttpJson http;
    private final String apiKey;
    private final String modelo;
    private final String baseUrl;

    public OpenAiEngine(HttpJson http,
                        @Value("${maklayn.ia.openai.api-key:}") String apiKey,
                        @Value("${maklayn.ia.openai.modelo:gpt-4o-mini}") String modelo,
                        @Value("${maklayn.ia.openai.base-url:https://api.openai.com/v1}") String baseUrl) {
        this.http = http;
        this.apiKey = apiKey;
        this.modelo = modelo;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    @Override
    public String id() {
        return "openai";
    }

    @Override
    public String rotulo() {
        return "OpenAI (compatível)";
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
            throw new IllegalStateException("OPENAI_API_KEY não configurada.");
        }

        long inicio = System.currentTimeMillis();
        String usado = (pedido.getModelo() == null || pedido.getModelo().isBlank()) ? modelo : pedido.getModelo();

        List<Map<String, Object>> mensagens = new ArrayList<>();
        mensagens.add(Map.of("role", "system", "content",
            MaklaynPrompt.SYSTEM_PROMPT + "\n" + MaklaynPrompt.instrucaoDoModo(pedido.getModo())));

        if (pedido.getHistorico() != null) {
            for (PedidoIA.Mensagem m : pedido.getHistorico()) {
                mensagens.add(Map.of(
                    "role", "ia".equals(m.getPapel()) ? "assistant" : "user",
                    "content", m.getTexto()));
            }
        }
        mensagens.add(Map.of("role", "user", "content", pedido.getPrompt()));

        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("model", usado);
        corpo.put("messages", mensagens);
        corpo.put("temperature", 0.7);
        corpo.put("max_tokens", 4096);

        JsonNode json = http.postJson(baseUrl + "/chat/completions", corpo,
            Map.of("Authorization", "Bearer " + apiKey));

        String texto = json.path("choices").path(0).path("message").path("content").asText("");
        if (texto.isBlank()) {
            throw new IllegalStateException("O provedor não retornou conteúdo.");
        }

        int tokens = json.path("usage").path("total_tokens").asInt(0);
        return new RespostaIA(texto.trim(), usado, tokens, System.currentTimeMillis() - inicio);
    }
}
