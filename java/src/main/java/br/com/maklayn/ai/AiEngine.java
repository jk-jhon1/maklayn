package br.com.maklayn.ai;

import java.util.List;

/**
 * Contrato comum a todos os motores de IA do Maklayn.
 * Padrão de projeto: Strategy — trocar o provedor não altera o resto do sistema.
 *
 * <p>Nota de compatibilidade: as classes internas eram {@code record} na versão
 * Java 17; foram convertidas em classes imutáveis simples para rodar em JDK 11.</p>
 */
public interface AiEngine {

    /** Identificador curto do motor (mock, gemini, openai). */
    String id();

    /** Nome exibido na interface. */
    String rotulo();

    /** Modelo padrão usado quando nenhum é informado. */
    String modeloPadrao();

    /** Indica se o motor está pronto para uso (chave de API presente etc.). */
    boolean disponivel();

    /** Gera a resposta para o pedido informado. */
    RespostaIA gerar(PedidoIA pedido) throws Exception;

    // =================================================================
    //  DTOs do motor
    // =================================================================

    /** Entrada do motor: prompt, pilar, histórico e modelo opcional. */
    final class PedidoIA {

        private final String prompt;
        private final TipoConsulta modo;
        private final List<Mensagem> historico;
        private final String modelo;

        public PedidoIA(String prompt, TipoConsulta modo, List<Mensagem> historico, String modelo) {
            this.prompt = prompt;
            this.modo = modo;
            this.historico = historico;
            this.modelo = modelo;
        }

        public String getPrompt() {
            return prompt;
        }

        public TipoConsulta getModo() {
            return modo;
        }

        public List<Mensagem> getHistorico() {
            return historico;
        }

        public String getModelo() {
            return modelo;
        }

        /** Turno do histórico: papel = "usuario" ou "ia". */
        public static final class Mensagem {

            private final String papel;
            private final String texto;

            public Mensagem(String papel, String texto) {
                this.papel = papel;
                this.texto = texto;
            }

            public String getPapel() {
                return papel;
            }

            public String getTexto() {
                return texto;
            }
        }
    }

    /** Saída do motor: texto em Markdown, modelo, tokens e latência. */
    final class RespostaIA {

        private final String texto;
        private final String modelo;
        private final Integer tokens;
        private final long latenciaMs;

        public RespostaIA(String texto, String modelo, Integer tokens, long latenciaMs) {
            this.texto = texto;
            this.modelo = modelo;
            this.tokens = tokens;
            this.latenciaMs = latenciaMs;
        }

        public String getTexto() {
            return texto;
        }

        public String getModelo() {
            return modelo;
        }

        public Integer getTokens() {
            return tokens;
        }

        public long getLatenciaMs() {
            return latenciaMs;
        }
    }
}
