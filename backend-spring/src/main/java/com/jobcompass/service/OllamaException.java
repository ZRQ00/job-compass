package com.jobcompass.service;

/**
 * Ollama is unreachable, the model isn't pulled, or the call failed. Maps to HTTP 503.
 * {@code transientFailure} marks problems worth retrying and counting towards the circuit breaker
 * (connection errors, timeouts, HTTP 5xx). Client errors such as HTTP 400 are not transient.
 */
public class OllamaException extends RuntimeException {

    private final boolean transientFailure;

    public OllamaException(String message) {
        this(message, null, false);
    }

    public OllamaException(String message, boolean transientFailure) {
        this(message, null, transientFailure);
    }

    public OllamaException(String message, Throwable cause) {
        this(message, cause, false);
    }

    public OllamaException(String message, Throwable cause, boolean transientFailure) {
        super(message, cause);
        this.transientFailure = transientFailure;
    }

    public boolean transientFailure() {
        return transientFailure;
    }
}
