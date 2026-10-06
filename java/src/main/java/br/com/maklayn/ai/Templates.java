package br.com.maklayn.ai;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * =====================================================================
 *  MAKLAYN — Carregador de templates de texto (classpath:/templates)
 *
 *  Os textos longos do motor simulado ficam em arquivos .md e usam
 *  marcadores no formato {{chave}}. Isso mantém o Java enxuto e
 *  compatível com JDK 11 (que não possui text blocks) e permite editar
 *  os textos sem recompilar a lógica.
 * =====================================================================
 */
final class Templates {

    private static final Map<String, String> CACHE = new ConcurrentHashMap<>();

    private Templates() {
    }

    /** Lê o arquivo /templates/<nome>.md do classpath (com cache). */
    static String carregar(String nome) {
        return CACHE.computeIfAbsent(nome, n -> {
            String caminho = "/templates/" + n + ".md";
            try (InputStream fluxo = Templates.class.getResourceAsStream(caminho)) {
                if (fluxo == null) {
                    throw new IllegalStateException("Template não encontrado no classpath: " + caminho);
                }
                try (BufferedReader leitor = new BufferedReader(
                    new InputStreamReader(fluxo, StandardCharsets.UTF_8))) {
                    return leitor.lines().collect(Collectors.joining("\n"));
                }
            } catch (IOException e) {
                throw new IllegalStateException("Falha ao ler o template " + caminho, e);
            }
        });
    }

    /** Substitui todos os marcadores {{chave}} do template. */
    static String preencher(String nome, Map<String, String> valores) {
        String texto = carregar(nome);
        for (Map.Entry<String, String> entrada : valores.entrySet()) {
            texto = texto.replace("{{" + entrada.getKey() + "}}",
                entrada.getValue() == null ? "" : entrada.getValue());
        }
        return texto;
    }
}
