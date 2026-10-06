package br.com.maklayn;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * =====================================================================
 *  MAKLAYN — Assistente de Inteligência Artificial Multidisciplinar
 *
 *  Pilares: Engenharia de Software · Redação Padrão ENEM · Pesquisa Acadêmica.
 *  Persistência: MySQL (tabelas Usuarios, Historico_Consultas,
 *  Referencias_Salvas) · Autenticação: JWT + Google OAuth 2.0.
 *
 *  Executar:  mvn spring-boot:run
 * =====================================================================
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class MaklaynApplication {

    public static void main(String[] args) {
        SpringApplication.run(MaklaynApplication.class, args);
        System.out.println(String.join("\n",
            "",
            "  MAKLAYN  --  Assistente de IA Multidisciplinar (Java, JDK 11+)",
            "  > API:    http://localhost:8080/api/health",
            "  > Interface grafica disponivel na versao Node (pasta ../public)",
            ""));
    }
}
