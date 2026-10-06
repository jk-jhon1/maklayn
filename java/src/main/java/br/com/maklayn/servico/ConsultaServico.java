package br.com.maklayn.servico;

import br.com.maklayn.ai.AiEngine;
import br.com.maklayn.ai.AiRouter;
import br.com.maklayn.ai.MaklaynPrompt;
import br.com.maklayn.ai.TipoConsulta;
import br.com.maklayn.dominio.HistoricoConsulta;
import br.com.maklayn.repositorio.HistoricoConsultaRepositorio;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * MAKLAYN — Serviço de consultas.
 * Orquestra: prompt do usuário -> motor de IA -> persistência -> resposta.
 */
@Service
public class ConsultaServico {

    private static final int LIMITE_PROMPT = 20_000;

    private final HistoricoConsultaRepositorio repo;
    private final AiRouter roteador;

    public ConsultaServico(HistoricoConsultaRepositorio repo, AiRouter roteador) {
        this.repo = repo;
        this.roteador = roteador;
    }

    /** Executa uma consulta completa e registra no histórico. */
    @Transactional
    public Execucao executar(Long idUsuario, String prompt, TipoConsulta modo, String modelo,
                             List<AiEngine.PedidoIA.Mensagem> historico) throws Exception {

        String texto = prompt == null ? "" : prompt.trim();
        if (texto.isEmpty()) {
            throw new UsuarioServico.RegraDeNegocioException("O prompt não pode ser vazio.");
        }
        if (texto.length() > LIMITE_PROMPT) {
            throw new UsuarioServico.RegraDeNegocioException("Prompt muito longo (máximo de 20.000 caracteres).", 413);
        }

        TipoConsulta tipo = modo == null ? MaklaynPrompt.recomendarModo(texto) : modo;

        AiRouter.ResultadoGeracao resultado = roteador.gerar(new AiEngine.PedidoIA(texto, tipo, historico, modelo));
        AiEngine.RespostaIA resposta = resultado.getResposta();

        HistoricoConsulta consulta = new HistoricoConsulta();
        consulta.setIdUsuario(idUsuario);
        consulta.setTipoConsulta(tipo);
        consulta.setPromptUsuario(texto);
        consulta.setRespostaIa(resposta.getTexto());
        consulta.setModeloUsado(resposta.getModelo());
        consulta.setTokensUsados(resposta.getTokens());
        consulta.setLatenciaMs((int) resposta.getLatenciaMs());
        repo.save(consulta);

        return new Execucao(consulta, resultado.getProvedor(), resultado.getAviso(), resultado.isFallback(),
            roteador.extrairReferencias(resposta.getTexto()));
    }

    /** Histórico paginado com filtro por pilar e busca textual. */
    @Transactional(readOnly = true)
    public Pagina listar(Long idUsuario, TipoConsulta tipo, String busca, int pagina, int porPagina) {
        int limite = Math.min(Math.max(porPagina, 1), 100);
        int paginaZeroBased = Math.max(pagina - 1, 0);
        Pageable pageable = PageRequest.of(paginaZeroBased, limite);

        String filtro = (busca == null || busca.isBlank()) ? null : busca.trim();
        Page<HistoricoConsulta> resultado = (tipo == null)
            ? repo.filtrarSemTipo(idUsuario, filtro, pageable)
            : repo.filtrarComTipo(idUsuario, tipo, filtro, pageable);

        List<ItemHistorico> itens = new ArrayList<>();
        for (HistoricoConsulta consulta : resultado.getContent()) {
            itens.add(paraItem(consulta));
        }

        return new Pagina(itens, resultado.getTotalElements(), pagina, limite);
    }

    @Transactional(readOnly = true)
    public HistoricoConsulta obter(Long id, Long idUsuario) {
        return repo.findByIdAndIdUsuario(id, idUsuario).orElse(null);
    }

    @Transactional
    public void excluir(Long id, Long idUsuario) {
        HistoricoConsulta consulta = repo.findByIdAndIdUsuario(id, idUsuario)
            .orElseThrow(() -> new UsuarioServico.RegraDeNegocioException("Consulta não encontrada.", 404));
        repo.delete(consulta);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> resumo(Long idUsuario) {
        long codigo = repo.countByIdUsuarioAndTipoConsulta(idUsuario, TipoConsulta.Codigo);
        long redacao = repo.countByIdUsuarioAndTipoConsulta(idUsuario, TipoConsulta.Redacao);
        long pesquisa = repo.countByIdUsuarioAndTipoConsulta(idUsuario, TipoConsulta.Pesquisa);

        return Map.of(
            "total", repo.countByIdUsuario(idUsuario),
            "por_pilar", Map.of("Codigo", codigo, "Redacao", redacao, "Pesquisa", pesquisa));
    }

    private ItemHistorico paraItem(HistoricoConsulta c) {
        String resumo = c.getPromptUsuario() == null ? "" : c.getPromptUsuario().replaceAll("\\s+", " ").trim();
        if (resumo.length() > 220) {
            resumo = resumo.substring(0, 217) + "...";
        }
        return new ItemHistorico(
            c.getId(),
            c.getTipoConsulta() == null ? null : c.getTipoConsulta().name(),
            resumo,
            c.getDataHora(),
            c.getModeloUsado(),
            c.getLatenciaMs(),
            c.getTokensUsados(),
            c.getRespostaIa() == null ? 0 : c.getRespostaIa().length());
    }

    // ------------------------------------------------------------- DTOs

    // ------------------------------------------------------------- DTOs

    /** Resultado de uma consulta: entidade persistida + metadados do motor. */
    public static final class Execucao {

        private final HistoricoConsulta consulta;
        private final String provedor;
        private final String aviso;
        private final boolean fallback;
        private final List<Map<String, String>> referenciasDetectadas;

        public Execucao(HistoricoConsulta consulta, String provedor, String aviso,
                        boolean fallback, List<Map<String, String>> referenciasDetectadas) {
            this.consulta = consulta;
            this.provedor = provedor;
            this.aviso = aviso;
            this.fallback = fallback;
            this.referenciasDetectadas = referenciasDetectadas;
        }

        public HistoricoConsulta getConsulta() {
            return consulta;
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

        public List<Map<String, String>> getReferenciasDetectadas() {
            return referenciasDetectadas;
        }
    }

    /** Item resumido do histórico (sem o texto completo da resposta). */
    public static final class ItemHistorico {

        private final Long idConsulta;
        private final String tipoConsulta;
        private final String resumoPrompt;
        private final LocalDateTime dataHora;
        private final String modeloUsado;
        private final Integer latenciaMs;
        private final Integer tokensUsados;
        private final int tamanhoResposta;

        public ItemHistorico(Long idConsulta, String tipoConsulta, String resumoPrompt,
                             LocalDateTime dataHora, String modeloUsado, Integer latenciaMs,
                             Integer tokensUsados, int tamanhoResposta) {
            this.idConsulta = idConsulta;
            this.tipoConsulta = tipoConsulta;
            this.resumoPrompt = resumoPrompt;
            this.dataHora = dataHora;
            this.modeloUsado = modeloUsado;
            this.latenciaMs = latenciaMs;
            this.tokensUsados = tokensUsados;
            this.tamanhoResposta = tamanhoResposta;
        }

        public Long getIdConsulta() {
            return idConsulta;
        }

        public String getTipoConsulta() {
            return tipoConsulta;
        }

        public String getResumoPrompt() {
            return resumoPrompt;
        }

        public LocalDateTime getDataHora() {
            return dataHora;
        }

        public String getModeloUsado() {
            return modeloUsado;
        }

        public Integer getLatenciaMs() {
            return latenciaMs;
        }

        public Integer getTokensUsados() {
            return tokensUsados;
        }

        public int getTamanhoResposta() {
            return tamanhoResposta;
        }
    }

    /** Página de resultados do histórico. */
    public static final class Pagina {

        private final List<ItemHistorico> itens;
        private final long total;
        private final int pagina;
        private final int porPagina;

        public Pagina(List<ItemHistorico> itens, long total, int pagina, int porPagina) {
            this.itens = itens;
            this.total = total;
            this.pagina = pagina;
            this.porPagina = porPagina;
        }

        public List<ItemHistorico> getItens() {
            return itens;
        }

        public long getTotal() {
            return total;
        }

        public int getPagina() {
            return pagina;
        }

        public int getPorPagina() {
            return porPagina;
        }
    }
}
