package br.com.maklayn.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * =====================================================================
 *  MAKLAYN — Roteador de motores de IA
 *
 *  Escolhe o motor conforme AI_PROVIDER (mock | gemini | openai) e, se o
 *  provedor real falhar (chave ausente, cota, rede), cai automaticamente
 *  para o motor simulado — o usuário nunca recebe erro cru de infraestrutura.
 *
 *  Compatível com JDK 11 (a versão anterior usava records).
 * =====================================================================
 */
@Service
public class AiRouter {

    private static final Logger log = LoggerFactory.getLogger(AiRouter.class);

    private static final Pattern LINK_MARKDOWN =
        Pattern.compile("\\[([^\\]\\n]{3,200})\\]\\((https?://[^\\s)]+)\\)");

    private static final Pattern URL_SIMPLES =
        Pattern.compile("<?(https?://[^\\s<>)\"']+)>?");

    private static final Pattern IMAGEM =
        Pattern.compile(".*\\.(png|jpg|jpeg|gif|svg|webp)$", Pattern.CASE_INSENSITIVE);

    private final Map<String, AiEngine> motores = new LinkedHashMap<>();
    private final String provedorConfigurado;

    public AiRouter(List<AiEngine> engines,
                    @Value("${maklayn.ia.provedor:mock}") String provedor) {
        for (AiEngine engine : engines) {
            motores.put(engine.id(), engine);
        }
        this.provedorConfigurado = provedor == null ? "mock" : provedor.toLowerCase();
    }

    /** Motor ativo no momento. */
    public AiEngine motorAtivo() {
        AiEngine escolhido = motores.get(provedorConfigurado);
        if (escolhido == null) {
            log.warn("AI_PROVIDER='{}' desconhecido — usando o motor simulado.", provedorConfigurado);
            return motores.get("mock");
        }
        return escolhido;
    }

    /**
     * Gera a resposta aplicando o fallback para o motor simulado.
     *
     * @return resultado do motor + metadados (provedor usado, aviso).
     */
    public ResultadoGeracao gerar(AiEngine.PedidoIA pedido) throws Exception {
        AiEngine ativo = motorAtivo();
        try {
            AiEngine.RespostaIA resposta = ativo.gerar(pedido);
            return new ResultadoGeracao(resposta, ativo.id(), null, false);
        } catch (Exception e) {
            if ("mock".equals(ativo.id())) {
                throw e; // falha do mock é falha real de código
            }
            log.warn("Provedor '{}' falhou -> fallback simulado: {}", ativo.id(), e.getMessage());

            AiEngine simulado = motores.get("mock");
            AiEngine.RespostaIA resposta = simulado.gerar(new AiEngine.PedidoIA(
                pedido.getPrompt(), pedido.getModo(), pedido.getHistorico(), simulado.modeloPadrao()));

            String aviso = "Provedor \"" + ativo.id() + "\" indisponível (" + e.getMessage()
                + "). Resposta gerada pelo motor simulado.";
            return new ResultadoGeracao(resposta, "mock", aviso, true);
        }
    }

    /** Situação de cada motor, para o painel e o endpoint /api/health. */
    public Map<String, Object> status() {
        AiEngine ativo = motorAtivo();

        List<Map<String, Object>> disponiveis = new ArrayList<>();
        disponiveis.add(itemMotor("mock", "Maklayn Simulado", false, null, true));

        for (String id : new String[]{"gemini", "openai"}) {
            AiEngine motor = motores.get(id);
            if (motor == null) {
                continue;
            }
            disponiveis.add(itemMotor(id, motor.rotulo(), true,
                "gemini".equals(id) ? "GEMINI_API_KEY" : "OPENAI_API_KEY", motor.disponivel()));
        }

        Map<String, Object> resultado = new LinkedHashMap<>();
        resultado.put("ativo", ativo.id());
        resultado.put("rotulo", ativo.rotulo());
        resultado.put("modelo", ativo.modeloPadrao());
        resultado.put("disponiveis", disponiveis);
        return resultado;
    }

    private Map<String, Object> itemMotor(String id, String rotulo, boolean requerChave,
                                          String env, boolean configurado) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("rotulo", rotulo);
        item.put("requerChave", requerChave);
        if (env != null) {
            item.put("env", env);
        }
        item.put("configurado", configurado);
        return item;
    }

    /**
     * Extrai links de uma resposta em Markdown — alimenta "Referências salvas".
     * Aceita [título](url) e URLs puras, ignorando imagens e duplicatas.
     */
    public List<Map<String, String>> extrairReferencias(String texto) {
        List<Map<String, String>> refs = new ArrayList<>();
        Set<String> vistos = new LinkedHashSet<>();
        if (texto == null) {
            return refs;
        }

        Matcher md = LINK_MARKDOWN.matcher(texto);
        while (md.find()) {
            String url = limpar(md.group(2));
            if (vistos.add(url)) {
                Map<String, String> item = new LinkedHashMap<>();
                item.put("titulo_link", md.group(1).trim());
                item.put("url_referencia", url);
                refs.add(item);
            }
        }

        Matcher bruto = URL_SIMPLES.matcher(texto);
        while (bruto.find()) {
            String url = limpar(bruto.group(1));
            if (!vistos.contains(url) && !IMAGEM.matcher(url).matches()) {
                vistos.add(url);
                Map<String, String> item = new LinkedHashMap<>();
                item.put("titulo_link", host(url));
                item.put("url_referencia", url);
                refs.add(item);
            }
        }

        return refs.size() > 25 ? new ArrayList<>(refs.subList(0, 25)) : refs;
    }

    private String limpar(String url) {
        return url.replaceAll("[.,;]+$", "");
    }

    private String host(String url) {
        try {
            String h = URI.create(url).getHost();
            return h == null ? url : h.replaceFirst("^www\\.", "");
        } catch (Exception e) {
            return url;
        }
    }

    /** Resultado do roteador: resposta + rastreabilidade do motor usado. */
    public static final class ResultadoGeracao {

        private final AiEngine.RespostaIA resposta;
        private final String provedor;
        private final String aviso;
        private final boolean fallback;

        public ResultadoGeracao(AiEngine.RespostaIA resposta, String provedor,
                                String aviso, boolean fallback) {
            this.resposta = resposta;
            this.provedor = provedor;
            this.aviso = aviso;
            this.fallback = fallback;
        }

        public AiEngine.RespostaIA getResposta() {
            return resposta;
        }

        public String getProvedor() {
            return provedor;
        }

        public String getAviso() {
            return aviso;
        }

        public boolean isFallback() {
            return fallback;
        }
    }
}
