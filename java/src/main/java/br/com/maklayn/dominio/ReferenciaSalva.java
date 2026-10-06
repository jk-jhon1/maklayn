package br.com.maklayn.dominio;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Lob;
import javax.persistence.PrePersist;
import javax.persistence.Table;

import java.time.LocalDateTime;

/**
 * Tabela Referencias_Salvas — links sugeridos pela IA e guardados pelo usuário.
 *
 * id_referencia · id_usuario (FK) · titulo_link · url_referencia
 */
@Entity
@Table(name = "Referencias_Salvas")
public class ReferenciaSalva {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_referencia")
    private Long id;

    @Column(name = "id_usuario", nullable = false)
    private Long idUsuario;

    @Column(name = "id_consulta")
    private Long idConsulta;

    @Column(name = "titulo_link", nullable = false, length = 300)
    private String tituloLink;

    @Column(name = "url_referencia", nullable = false, length = 1000)
    private String urlReferencia;

    @Lob
    @Column(name = "anotacao")
    private String anotacao;

    @Column(name = "data_salvo", nullable = false)
    private LocalDateTime dataSalvo;

    @PrePersist
    void aoCriar() {
        if (dataSalvo == null) {
            dataSalvo = LocalDateTime.now();
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

    public Long getIdConsulta() {
        return idConsulta;
    }

    public void setIdConsulta(Long idConsulta) {
        this.idConsulta = idConsulta;
    }

    public String getTituloLink() {
        return tituloLink;
    }

    public void setTituloLink(String tituloLink) {
        this.tituloLink = tituloLink;
    }

    public String getUrlReferencia() {
        return urlReferencia;
    }

    public void setUrlReferencia(String urlReferencia) {
        this.urlReferencia = urlReferencia;
    }

    public String getAnotacao() {
        return anotacao;
    }

    public void setAnotacao(String anotacao) {
        this.anotacao = anotacao;
    }

    public LocalDateTime getDataSalvo() {
        return dataSalvo;
    }
}
