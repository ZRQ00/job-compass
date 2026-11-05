package com.jobcompass.web;

import com.jobcompass.service.AiResponseException;
import com.jobcompass.service.OllamaException;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Errors come back as {"detail": "..."} so the existing frontend error handling keeps working. */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, String>> api(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("detail", e.getMessage()));
    }

    @ExceptionHandler(OllamaException.class)
    ResponseEntity<Map<String, String>> ollama(OllamaException e) {
        return ResponseEntity.status(503).body(Map.of("detail", e.getMessage()));
    }

    @ExceptionHandler(AiResponseException.class)
    ResponseEntity<Map<String, String>> ai(AiResponseException e) {
        return ResponseEntity.status(502).body(Map.of("detail", e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + " " + f.getDefaultMessage())
                .findFirst().orElse("Invalid request");
        return ResponseEntity.unprocessableEntity().body(Map.of("detail", msg));
    }
}
