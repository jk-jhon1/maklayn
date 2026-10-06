package br.com.maklayn.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Testes do motor simulado: garantem que cada pilar respeita a estrutura
 * exigida pelo system prompt.
 */
class MockAiEngineTest {

    private final MockAiEngine motor = new MockAiEngine();

    private String gerar(TipoConsulta modo, String prompt) throws Exception {
        return motor.gerar(new AiEngine.PedidoIA(prompt, modo, Collections.emptyList(), null)).getTexto();
    }

    @Test
    @DisplayName("Pilar Código devolve bloco de código, explicação, trade-offs e testes")
    void pilarCodigo() throws Exception {
        String texto = gerar(TipoConsulta.Codigo, "Como otimizar uma consulta SQL com índice composto?");

        assertTrue(texto.contains("```sql"), "deve conter bloco de código SQL");
        assertTrue(texto.contains("### Como funciona"), "deve explicar o funcionamento");
        assertTrue(texto.contains("trade-offs"), "deve discutir trade-offs");
        assertTrue(texto.contains("Testes sugeridos"), "deve sugerir testes");
        assertTrue(texto.contains("maklayn-mock-v1"), "deve avisar que o motor é simulado");
    }

    @Test
    @DisplayName("Pilar Redação devolve estrutura ENEM com as 5 competências")
    void pilarRedacao() throws Exception {
        String texto = gerar(TipoConsulta.Redacao, "Redação sobre desinformação digital no Brasil");

        assertTrue(texto.contains("Checklist das 5 Competências"));
        assertTrue(texto.contains("Proposta de intervenção") || texto.contains("Portanto"));
        assertTrue(texto.contains("Ministério da Educação"), "a intervenção precisa de agente explícito");
        assertTrue(texto.length() > 3000, "a redação deve ter extensão compatível com o ENEM");
    }

    @Test
    @DisplayName("Pilar Pesquisa devolve evidências e referências com links reais")
    void pilarPesquisa() throws Exception {
        String texto = gerar(TipoConsulta.Pesquisa, "Pesquise dados sobre educação no Brasil");

        assertTrue(texto.contains("### Evidências"));
        assertTrue(texto.contains("### Referências"));
        assertTrue(texto.contains("http"), "deve conter links verificáveis");
        assertTrue(texto.contains("gov.br") || texto.contains("scielo") || texto.contains("ibge"),
            "deve apontar para portais oficiais");
    }

    @Test
    @DisplayName("Recomendador de pilar acerta os três casos clássicos")
    void recomendarModo() {
        assertEquals(TipoConsulta.Redacao,
            MaklaynPrompt.recomendarModo("Escreva uma redação padrão ENEM sobre mobilidade urbana"));
        assertEquals(TipoConsulta.Codigo,
            MaklaynPrompt.recomendarModo("Corrija este código JavaScript com erro de promise"));
        assertEquals(TipoConsulta.Pesquisa,
            MaklaynPrompt.recomendarModo("Pesquise referências bibliográficas sobre o tema"));
    }

    @Test
    @DisplayName("O system prompt contém os quatro blocos de diretrizes da especificação")
    void systemPromptCompleto() {
        String p = MaklaynPrompt.SYSTEM_PROMPT;
        assertTrue(p.contains("GERAÇÃO DE CÓDIGOS AVANÇADOS"));
        assertTrue(p.contains("PRODUÇÃO DE TEXTOS E REDAÇÃO (ENEM)"));
        assertTrue(p.contains("PESQUISA E REFERENCIAÇÃO"));
        assertTrue(p.contains("TOM E FORMATO"));
    }
}
