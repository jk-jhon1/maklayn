package br.com.maklayn.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Cliente HTTP/JSON enxuto, baseado no java.net.http.HttpClient (JDK 11+).
 * Centraliza timeout, cabeçalhos e tratamento de erro para os motores de IA
 * e para a verificação de credenciais do Google.
 */
@Component
public class HttpJson {

    private final HttpClient cliente = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();

    private final ObjectMapper mapper = new ObjectMapper();

    public ObjectMapper mapper() {
        return mapper;
    }

    public JsonNode postJson(String url, Map<String, Object> corpo, Map<String, String> cabecalhos)
        throws Exception {

        String json = mapper.writeValueAsString(corpo);
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(120))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(json));

        if (cabecalhos != null) {
            cabecalhos.forEach(req::header);
        }

        HttpResponse<String> resposta = cliente.send(req.build(), HttpResponse.BodyHandlers.ofString());

        if (resposta.statusCode() >= 400) {
            throw new IllegalStateException(
                "HTTP " + resposta.statusCode() + ": " + recortar(resposta.body()));
        }
        return mapper.readTree(resposta.body());
    }

    public JsonNode postForm(String url, String corpoUrlEncoded) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(60))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(corpoUrlEncoded))
            .build();

        HttpResponse<String> resposta = cliente.send(req, HttpResponse.BodyHandlers.ofString());
        if (resposta.statusCode() >= 400) {
            throw new IllegalStateException("HTTP " + resposta.statusCode() + ": " + recortar(resposta.body()));
        }
        return mapper.readTree(resposta.body());
    }

    public JsonNode getJson(String url, Map<String, String> cabecalhos) throws Exception {
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(60))
            .GET();

        if (cabecalhos != null) {
            cabecalhos.forEach(req::header);
        }

        HttpResponse<String> resposta = cliente.send(req.build(), HttpResponse.BodyHandlers.ofString());
        if (resposta.statusCode() >= 400) {
            throw new IllegalStateException("HTTP " + resposta.statusCode() + ": " + recortar(resposta.body()));
        }
        return mapper.readTree(resposta.body());
    }

    private String recortar(String texto) {
        if (texto == null) {
            return "(sem corpo)";
        }
        return texto.length() > 300 ? texto.substring(0, 300) + "..." : texto;
    }
}
