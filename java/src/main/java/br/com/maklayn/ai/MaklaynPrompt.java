package br.com.maklayn.ai;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * =====================================================================
 *  MAKLAYN — System Prompt (seção 1 da especificação)
 *
 *  Este texto é injetado como instrução de sistema em qualquer provedor
 *  de LLM. É o núcleo de inteligência do sistema: define persona,
 *  habilidades e limites da IA.
 *
 *  Compatível com JDK 11: os blocos de texto (text blocks, Java 15+)
 *  foram reescritos com String.join para manter o mesmo conteúdo.
 * =====================================================================
 */
public final class MaklaynPrompt {

    private MaklaynPrompt() {
    }

    /** Prompt base, exatamente como especificado no documento técnico. */
    public static final String SYSTEM_PROMPT = String.join("\n", List.of(
        "Você é um Assistente de Inteligência Artificial Multidisciplinar de Alto Nível, "
            + "especializado em três pilares principais: Engenharia de Software, "
            + "Redação Padrão ENEM e Pesquisa Acadêmica/Técnica.",
        "",
        "Suas diretrizes de funcionamento são:",
        "",
        "1. GERAÇÃO DE CÓDIGOS AVANÇADOS:",
        "- Escreva códigos limpos, otimizados, seguros e bem documentados.",
        "- Ao estruturar sistemas, aplique padrões de projeto adequados (ex: MVC, Microsserviços).",
        "- Forneça explicações lógicas e didáticas sobre o funcionamento de funções e classes.",
        "- Atue como um especialista Full-Stack em múltiplas linguagens e frameworks.",
        "",
        "2. PRODUÇÃO DE TEXTOS E REDAÇÃO (ENEM):",
        "- Siga estritamente as 5 competências exigidas na avaliação do ENEM.",
        "- Estruture os textos com: Introdução (com tese clara e repertório sociocultural "
            + "pertinente), Desenvolvimento 1 e 2 (argumentação sólida) e Conclusão.",
        "- A Conclusão deve conter uma Proposta de Intervenção completa (Agente, Ação, "
            + "Meio/Modo, Efeito e Detalhamento).",
        "",
        "3. PESQUISA E REFERENCIAÇÃO:",
        "- Forneça respostas factuais baseadas em evidências.",
        "- Inclua sugestões de links reais e referências bibliográficas confiáveis ao final "
            + "das pesquisas.",
        "- Cite as fontes que embasam os argumentos gerados de forma acadêmica.",
        "",
        "4. TOM E FORMATO:",
        "- Adote um tom direto, técnico quando necessário e altamente didático.",
        "- Utilize formatação rica em Markdown (tabelas, negrito, blocos de código) para "
            + "facilitar a leitura e o aprendizado do usuário."
    ));

    private static final String INSTRUCAO_CODIGO = String.join("\n", List.of(
        "",
        "---",
        "MODO ATIVO: ENGENHARIA DE SOFTWARE.",
        "Priorize: bloco de código completo e executável, comentários explicando decisões de",
        "projeto, seção \"### Como funciona\", seção \"### Complexidade e trade-offs\" (Big-O,",
        "memória, alternativas) e seção \"### Testes sugeridos\" com casos de borda.",
        "Cite pelo nome o padrão de projeto aplicado (Strategy, Repository, MVC...)."
    ));

    private static final String INSTRUCAO_REDACAO = String.join("\n", List.of(
        "",
        "---",
        "MODO ATIVO: REDAÇÃO PADRÃO ENEM.",
        "Produza uma redação dissertativo-argumentativa completa (25 a 30 linhas) com:",
        "Introdução (contextualização + tese + repertório legitimado), Desenvolvimento 1,",
        "Desenvolvimento 2 e Conclusão com Proposta de Intervenção (Agente, Ação, Meio/Modo,",
        "Efeito e Detalhamento). Ao final, inclua uma tabela \"Checklist das 5 Competências\"",
        "com nota sugerida de 0 a 200 por competência e justificativa curta.",
        "Norma-padrão, impessoalidade, sem clichês, sem ferir os direitos humanos."
    ));

    private static final String INSTRUCAO_PESQUISA = String.join("\n", List.of(
        "",
        "---",
        "MODO ATIVO: PESQUISA ACADÊMICA/TÉCNICA.",
        "Responda de forma factual no primeiro parágrafo, traga uma seção \"### Evidências\"",
        "com dados e estudos citados no padrão ABNT autor-data, e uma seção \"### Referências\"",
        "com links REAIS e verificáveis (INEP, IBGE, IPEA, SciELO, CAPES, OMS, documentação",
        "oficial). Nunca invente DOI, ISBN ou URL."
    ));

    /** Instrução adicional por pilar, concatenada ao prompt base. */
    public static String instrucaoDoModo(TipoConsulta modo) {
        if (modo == null) {
            return INSTRUCAO_PESQUISA;
        }
        switch (modo) {
            case Codigo:
                return INSTRUCAO_CODIGO;
            case Redacao:
                return INSTRUCAO_REDACAO;
            case Pesquisa:
            default:
                return INSTRUCAO_PESQUISA;
        }
    }

    /** Mapa tipo -> texto, útil para expor o prompt na API (auditoria). */
    public static Map<String, String> instrucoesPorModo() {
        Map<String, String> mapa = new LinkedHashMap<>();
        for (TipoConsulta tipo : TipoConsulta.values()) {
            mapa.put(tipo.name(), instrucaoDoModo(tipo));
        }
        return mapa;
    }

    private static final Map<TipoConsulta, List<String>> SINAIS = Map.of(
        TipoConsulta.Codigo, List.of(
            "código", "codigo", "função", "funcao", "classe", "api", "erro", "bug", "sql",
            "python", "javascript", "java", "react", "node", "docker", "algoritmo", "array",
            "refatorar", "backend", "frontend", "deploy", "git", "regex", "compilar"),
        TipoConsulta.Redacao, List.of(
            "redação", "redacao", "enem", "dissertativo", "tese", "argumentativo",
            "proposta de intervenção", "competência", "escreva um texto", "vestibular"),
        TipoConsulta.Pesquisa, List.of(
            "pesquise", "pesquisa", "explique", "o que é", "o que e", "quem foi", "quando",
            "dados", "estatística", "referências", "acadêmico", "científico", "fonte", "abnt")
    );

    /**
     * Heurística leve que sugere o pilar ideal para um texto livre.
     * Usada quando o usuário não escolhe o modo manualmente.
     */
    public static TipoConsulta recomendarModo(String texto) {
        String t = texto == null ? "" : texto.toLowerCase();

        Map<TipoConsulta, Integer> placar = new LinkedHashMap<>();
        for (TipoConsulta tipo : TipoConsulta.values()) {
            int pontos = 0;
            for (String termo : SINAIS.get(tipo)) {
                if (t.contains(termo)) {
                    pontos += termo.length() > 4 ? 2 : 1;
                }
            }
            placar.put(tipo, pontos);
        }
        if (t.contains("```")) {
            placar.put(TipoConsulta.Codigo, placar.get(TipoConsulta.Codigo) + 4);
        }
        if (t.contains("proposta de intervenção")) {
            placar.put(TipoConsulta.Redacao, placar.get(TipoConsulta.Redacao) + 3);
        }
        if (t.contains("referências bibliográficas")) {
            placar.put(TipoConsulta.Pesquisa, placar.get(TipoConsulta.Pesquisa) + 3);
        }

        TipoConsulta melhor = TipoConsulta.Pesquisa;
        int maiorPontuacao = 0;
        for (Map.Entry<TipoConsulta, Integer> entrada : placar.entrySet()) {
            if (entrada.getValue() > maiorPontuacao) {
                maiorPontuacao = entrada.getValue();
                melhor = entrada.getKey();
            }
        }
        return melhor;
    }
}
