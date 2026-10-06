package br.com.maklayn.web;

import br.com.maklayn.seguranca.GoogleServico;
import br.com.maklayn.seguranca.JwtServico;
import br.com.maklayn.servico.UsuarioServico;
import javax.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * MAKLAYN — Tratador central de exceções: respostas JSON consistentes,
 * sem vazar stack trace para o cliente.
 */
@RestControllerAdvice
public class TratadorDeErros {

    private static final Logger log = LoggerFactory.getLogger(TratadorDeErros.class);

    @ExceptionHandler(UsuarioServico.RegraDeNegocioException.class)
    public ResponseEntity<Map<String, Object>> regraDeNegocio(UsuarioServico.RegraDeNegocioException e) {
        return resposta(e.getStatus(), e.getCodigo(), e.getMessage());
    }

    @ExceptionHandler(GoogleServico.ErroGoogle.class)
    public ResponseEntity<Map<String, Object>> google(GoogleServico.ErroGoogle e) {
        return resposta(e.getStatus(), e.getCodigo(), e.getMessage());
    }

    @ExceptionHandler(JwtServico.TokenInvalidoException.class)
    public ResponseEntity<Map<String, Object>> token(JwtServico.TokenInvalidoException e) {
        return resposta(401, "NAO_AUTENTICADO", "Sessão inválida ou expirada. Entre novamente.");
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<Map<String, Object>> naoEncontrado(NoHandlerFoundException e) {
        return resposta(404, "ROTA_NAO_ENCONTRADA", "Recurso não encontrado: " + e.getRequestURL());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> generico(Exception e, HttpServletRequest req) {
        log.error("Erro não tratado em {}: {}", req.getRequestURI(), e.getMessage(), e);
        return resposta(500, "ERRO_INTERNO", "Erro interno do servidor.");
    }

    private ResponseEntity<Map<String, Object>> resposta(int status, String codigo, String mensagem) {
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("erro", codigo);
        corpo.put("mensagem", mensagem);
        HttpStatus httpStatus = HttpStatus.resolve(status);
        return ResponseEntity.status(httpStatus == null ? HttpStatus.INTERNAL_SERVER_ERROR : httpStatus).body(corpo);
    }
}
