package com.jobcompass.service;

/** Ollama is unreachable, the model isn't pulled, or the call failed. Maps to HTTP 503. */
public class OllamaException extends RuntimeException {
    public OllamaException(String message) {
        super(message);
    }

    public OllamaException(String message, Throwable cause) {
        super(message, cause);
    }
}
