package br.com.maklayn.ai;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * =====================================================================
 *  MAKLAYN — Motor SIMULADO (maklayn-mock)
 *
 *  Gerador determinístico por template: respeita a estrutura exigida no
 *  system prompt (código + explicação + trade-offs + testes | redação
 *  ENEM completa | pesquisa com referências), sem consumir tokens.
 *
 *  Uso: desenvolvimento, testes e demonstração. Para IA real, defina
 *  AI_PROVIDER=gemini ou openai com a respectiva chave.
 *
 *  Compatível com JDK 11: sem text blocks e sem switch com expressão —
 *  os textos longos ficam em src/main/resources/templates/*.md.
 * =====================================================================
 */
@Component
public class MockAiEngine implements AiEngine {

    private static final DateTimeFormatter ABNT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private static final Pattern TEMA_SQL = Pattern.compile(
        "mysql|select|join|sql|banco de dados|[íi]ndice|indexar|consulta", Pattern.CASE_INSENSITIVE);

    private static final Pattern TEMA_AUTH = Pattern.compile(
        "login|autentica|jwt|token|oauth|senha|hash|sess", Pattern.CASE_INSENSITIVE);

    @Override
    public String id() {
        return "mock";
    }

    @Override
    public String rotulo() {
        return "Maklayn Simulado";
    }

    @Override
    public String modeloPadrao() {
        return "maklayn-mock-v1";
    }

    @Override
    public boolean disponivel() {
        return true;
    }

    @Override
    public RespostaIA gerar(PedidoIA pedido) throws Exception {
        long inicio = System.currentTimeMillis();
        Thread.sleep(350 + (long) (Math.random() * 400)); // simula latência de rede

        String texto;
        switch (pedido.getModo()) {
            case Redacao:
                texto = respostaRedacao(pedido.getPrompt());
                break;
            case Pesquisa:
                texto = respostaPesquisa(pedido.getPrompt());
                break;
            case Codigo:
            default:
                texto = respostaCodigo(pedido.getPrompt());
                break;
        }
        texto += aviso();

        return new RespostaIA(texto, modeloPadrao(), texto.length() / 4,
            System.currentTimeMillis() - inicio);
    }

    /* ------------------------------------------------------------------ */
    /* Pilar 1 — Engenharia de Software                                    */
    /* ------------------------------------------------------------------ */

    private String respostaCodigo(String prompt) {
        if (TEMA_SQL.matcher(prompt == null ? "" : prompt).find()) {
            return Templates.preencher("codigo-sql",
                valoresDoPrompt(prompt));
        }
        if (TEMA_AUTH.matcher(prompt == null ? "" : prompt).find()) {
            return Templates.preencher("codigo-auth", valoresDoPrompt(prompt));
        }

        Map<String, String> valores = valoresDoPrompt(prompt);
        valores.put("linguagem", detectarLinguagem(prompt));
        return Templates.preencher("codigo-generico", valores);
    }

    /* ------------------------------------------------------------------ */
    /* Pilar 2 — Redação ENEM                                              */
    /* ------------------------------------------------------------------ */

    private String respostaRedacao(String prompt) {
        String tema = resumir(prompt);
        Map<String, String> valores = new LinkedHashMap<>();
        valores.put("prompt", tema);
        valores.put("tema", tema);
        return Templates.preencher("redacao", valores);
    }

    /* ------------------------------------------------------------------ */
    /* Pilar 3 — Pesquisa acadêmica                                        */
    /* ------------------------------------------------------------------ */

    private String respostaPesquisa(String prompt) {
        AreaTema area = areaDoTema(prompt);

        StringBuilder listaRefs = new StringBuilder();
        int numero = 1;
        for (Ref ref : area.refs) {
            listaRefs.append(numero++).append(". **").append(ref.titulo)
                .append("**. Disponível em: <").append(ref.url).append(">. Acesso em: ")
                .append(LocalDate.now().format(ABNT)).append(".\n");
        }

        Map<String, String> valores = new LinkedHashMap<>();
        valores.put("prompt", resumir(prompt));
        valores.put("tema", resumir(prompt));
        valores.put("area_titulo", area.titulo);
        valores.put("evidencias", area.evidencias);
        valores.put("referencias", listaRefs.toString().trim());

        return Templates.preencher("pesquisa", valores);
    }

    /* ------------------------------------------------------------------ */
    /* Auxiliares                                                          */
    /* ------------------------------------------------------------------ */

    private Map<String, String> valoresDoPrompt(String prompt) {
        Map<String, String> valores = new LinkedHashMap<>();
        valores.put("prompt", resumir(prompt));
        return valores;
    }

    private String aviso() {
        return "\n\n" + Templates.carregar("aviso");
    }

    private String resumir(String prompt) {
        String limpo = prompt == null ? "" : prompt.replaceAll("\\s+", " ").trim();
        return limpo.length() > 160 ? limpo.substring(0, 157) + "..." : limpo;
    }

    private String detectarLinguagem(String prompt) {
        String t = prompt == null ? "" : prompt.toLowerCase();
        if (t.matches(".*(python|pandas|django|flask|\\.py).*")) {
            return "python";
        }
        if (t.matches(".*(java|spring|jvm|maven).*")) {
            return "java";
        }
        if (t.matches(".*(sql|select|join|mysql|postgres|banco de dados).*")) {
            return "sql";
        }
        if (t.matches(".*(javascript|typescript|node|react|express).*")) {
            return "javascript";
        }
        if (t.matches(".*(c#|csharp|\\.net).*")) {
            return "csharp";
        }
        return "java";
    }

    private AreaTema areaDoTema(String prompt) {
        String t = prompt == null ? "" : prompt.toLowerCase();

        if (t.matches(".*(educa|escola|enem|ensino|professor|aluno|aprendiz).*")) {
            return new AreaTema("Educação no Brasil",
                "Segundo o Censo Escolar do INEP, o Brasil tem cerca de 47 milhões de matrículas na "
                    + "educação básica, mas o índice de aprendizado adequado em Matemática no 9º ano "
                    + "permanece abaixo de 20% na rede pública (SAEB) — distância que expõe o hiato "
                    + "entre acesso e qualidade.",
                listaDeRefs(
                    new Ref("INEP — Instituto Nacional de Estudos e Pesquisas Educacionais",
                        "https://www.gov.br/inep/pt-br"),
                    new Ref("SciELO — artigos revisados por pares", "https://www.scielo.br/"),
                    new Ref("Catálogo de Teses e Dissertações da CAPES",
                        "https://catalogodeteses.capes.gov.br/")));
        }

        if (t.matches(".*(tecnolog|intelig[êe]ncia artificial|software|internet|dados|algoritm|digital).*")) {
            return new AreaTema("Tecnologia e Inteligência Artificial",
                "A documentação oficial do Google define IA generativa como sistemas que produzem "
                    + "conteúdo original a partir de padrões estatísticos aprendidos. No plano "
                    + "jurídico, o PL 2338/2023 (Marco Legal da IA no Brasil) propõe classificação "
                    + "de riscos, inspirado no AI Act europeu.",
                listaDeRefs(
                    new Ref("Google AI for Developers — documentação oficial", "https://ai.google.dev/"),
                    new Ref("MDN Web Docs — referência técnica", "https://developer.mozilla.org/pt-BR/"),
                    new Ref("Senado Federal — PL 2338/2023 (Marco Legal da IA)",
                        "https://www25.senado.leg.br/web/atividade/materias/-/materia/157233")));
        }

        if (t.matches(".*(sa[úu]de|mental|sus|vacina|hospital|epidemi).*")) {
            return new AreaTema("Saúde pública e saúde mental",
                "O DATASUS mantém séries de mortalidade, internações e cobertura da atenção "
                    + "primária. A OMS estima que cerca de 1 em cada 8 pessoas no mundo vive com "
                    + "algum transtorno mental, o que sustenta a defesa de políticas públicas de "
                    + "saúde mental.",
                listaDeRefs(
                    new Ref("DATASUS — Departamento de Informática do SUS",
                        "https://datasus.saude.gov.br/"),
                    new Ref("OPAS/OMS — Organização Pan-Americana da Saúde", "https://www.paho.org/pt"),
                    new Ref("SciELO Saúde Pública", "https://www.scielo.br/")));
        }

        return new AreaTema("Pesquisa acadêmica multidisciplinar",
            "A produção científica brasileira responde por cerca de 2% dos artigos indexados "
                + "mundialmente (Scopus), com concentração em saúde, ciências agrárias e exatas. "
                + "A busca sistemática exige combinar bases indexadas com repositórios de teses, "
                + "para reduzir viés de seleção.",
            listaDeRefs(
                new Ref("Google Acadêmico — literatura revisada", "https://scholar.google.com.br/"),
                new Ref("SciELO Brasil — periódicos revisados por pares", "https://www.scielo.br/"),
                new Ref("Portal de Periódicos da CAPES", "https://www.periodicos.capes.gov.br/"),
                new Ref("IBGE — dados oficiais brasileiros", "https://www.ibge.gov.br/")));
    }

    private List<Ref> listaDeRefs(Ref... refs) {
        List<Ref> lista = new ArrayList<>();
        for (Ref ref : refs) {
            lista.add(ref);
        }
        return lista;
    }

    /** Área temática usada pelo pilar de pesquisa. */
    private static final class AreaTema {
        private final String titulo;
        private final String evidencias;
        private final List<Ref> refs;

        private AreaTema(String titulo, String evidencias, List<Ref> refs) {
            this.titulo = titulo;
            this.evidencias = evidencias;
            this.refs = refs;
        }
    }

    /** Referência sugerida (título + URL real e verificável). */
    private static final class Ref {
        private final String titulo;
        private final String url;

        private Ref(String titulo, String url) {
            this.titulo = titulo;
            this.url = url;
        }
    }
}
