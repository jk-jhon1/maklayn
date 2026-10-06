package br.com.maklayn.ai;

/**
 * Os três pilares do Maklayn — mapeiam o ENUM da coluna
 * Historico_Consultas.tipo_consulta no banco de dados.
 *
 * <p>Compatível com JDK 11 (a versão anterior usava {@code switch} com expressão).</p>
 */
public enum TipoConsulta {
    Codigo,
    Redacao,
    Pesquisa;

    /** Aceita "codigo", "código", "code", "redacao", "redação", "pesquisa"... */
    public static TipoConsulta de(String valor) {
        if (valor == null) {
            return null;
        }
        String v = valor.trim().toLowerCase();
        switch (v) {
            case "codigo":
            case "código":
            case "code":
            case "engenharia":
                return Codigo;
            case "redacao":
            case "redação":
            case "enem":
            case "texto":
                return Redacao;
            case "pesquisa":
            case "research":
            case "academico":
            case "acadêmico":
                return Pesquisa;
            default:
                return null;
        }
    }
}
