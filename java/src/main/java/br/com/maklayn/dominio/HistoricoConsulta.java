package br.com.maklayn.dominio;

import br.com.maklayn.ai.TipoConsulta;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.EnumType;
import javax.persistence.Enumerated;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Lob;
import javax.persistence.PrePersist;
import javax.persistence.Table;

import java.time.LocalDateTime;

/**
 * Tabela Historico_Consultas — histórico de conversas (seção 2).
 *
 * id_consulta · id_usuario (FK) · tipo_consulta (ENUM) · prompt_usuario ·
 * resposta_ia · data_hora
 */
@Entity
@Table(name = "Historico_Consultas")
public class HistoricoConsulta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_consulta")
    private Long id;

    @Column(name = "id_usuario", nullable = false)
    private Long idUsuario;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_consulta", nullable = false, length = 12)
    private TipoConsulta tipoConsulta;

    @Lob
    @Column(name = "prompt_usuario", nullable = false)
    private String promptUsuario;

    @Lob
    @Column(name = "resposta_ia", nullable = false)
    private String respostaIa;

    @Column(name = "modelo_usado", length = 80)
    private String modeloUsado;

    @Column(name = "tokens_usados")
    private Integer tokensUsados;

    @Column(name = "latencia_ms")
    private Integer latenciaMs;

    @Column(name = "data_hora", nullable = false)
    private LocalDateTime dataHora;

    @PrePersist
    void aoCriar() {
        if (dataHora == null) {
            dataHora = LocalDateTime.now();
        }
    }

    // ------------------------------------------------------------ getters

    public Long getId() {
        return id;
    }

    public Long getIdUsuario() {
        return idUsuario;
    }

    public void setIdUsuario(Long idUsuario) {
        this.idUsuario = idUsuario;
    }

    public TipoConsulta getTipoConsulta() {
        return tipoConsulta;
    }

    public void setTipoConsulta(TipoConsulta tipoConsulta) {
        this.tipoConsulta = tipoConsulta;
    }

    public String getPromptUsuario() {
        return promptUsuario;
    }

    public void setPromptUsuario(String promptUsuario) {
        this.promptUsuario = promptUsuario;
    }

    public String getRespostaIa() {
        return respostaIa;
    }

    public void setRespostaIa(String respostaIa) {
        this.respostaIa = respostaIa;
    }

    public String getModeloUsado() {
        return modeloUsado;
    }

    public void setModeloUsado(String modeloUsado) {
        this.modeloUsado = modeloUsado;
    }

    public Integer getTokensUsados() {
        return tokensUsados;
    }

    public void setTokensUsados(Integer tokensUsados) {
        this.tokensUsados = tokensUsados;
    }

    public Integer getLatenciaMs() {
        return latenciaMs;
    }

    public void setLatenciaMs(Integer latenciaMs) {
        this.latenciaMs = latenciaMs;
    }

    public LocalDateTime getDataHora() {
        return dataHora;
    }
}
