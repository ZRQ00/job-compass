package com.jobcompass.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Ollama ollama, String corsOrigins) {

    public record Ollama(String url, String model, String embedModel, int numCtx, int timeoutSeconds) {
    }
}
