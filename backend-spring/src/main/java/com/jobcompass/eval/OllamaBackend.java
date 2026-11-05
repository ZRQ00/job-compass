package com.jobcompass.eval;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jobcompass.service.OllamaClient;
import com.jobcompass.service.OllamaException;

public class OllamaBackend implements ExtractionBackend {

    private final OllamaClient ollama;
    private final String model;
    private final JsonNode schema;

    public OllamaBackend(OllamaClient ollama, ObjectMapper mapper, String model) {
        this.ollama = ollama;
        this.model = model;
        try {
            this.schema = mapper.readTree(ExtractionPrompts.SCHEMA);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public String name() {
        return "ollama:" + model;
    }

    @Override
    public String complete(String system, String user) {
        ObjectNode payload = ollama.payload(model, false, false, schema, 0, system, user);
        try {
            return ollama.chat(payload);
        } catch (OllamaException e) {
            // Models without thinking support reject the "think" flag with HTTP 400. Retry without it.
            if (e.getMessage() != null && e.getMessage().contains("HTTP 400")) {
                payload.remove("think");
                return ollama.chat(payload);
            }
            throw e;
        }
    }
}
