package br.com.maklayn.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * MAKLAYN — Configuração web.
 *
 * Libera CORS apenas para origens locais de desenvolvimento, permitindo que
 * a interface HTML/React (servida pela versão Node em :3000) converse com
 * esta API Java em :8080.
 *
 * Em produção: remova esta configuração e sirva frontend e API no mesmo
 * domínio, ou restrinja a lista de origens.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins(
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",   // Vite/React
                "http://localhost:4200")   // Angular
            .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true);
    }
}
