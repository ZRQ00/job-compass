package com.jobcompass.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jobcompass.dto.ExtractResult;
import com.jobcompass.eval.ExtractionPrompts;
import org.springframework.stereotype.Service;

/** Pulls company, role, location and salary out of a pasted job description (schema-constrained JSON). */
@Service
public class ExtractionService {

    private final OllamaClient ollama;
    private final ObjectMapper mapper;

    public ExtractionService(OllamaClient ollama, ObjectMapper mapper) {
        this.ollama = ollama;
        this.mapper = mapper;
    }

    public ExtractResult extract(String text) {
        ollama.ensureReady();
        try {
            JsonNode schema = mapper.readTree(ExtractionPrompts.SCHEMA);
            String user = text.length() > 12_000 ? text.substring(0, 12_000) : text;
            String content = ollama.chat(ollama.payload(false, false, schema, 0, ExtractionPrompts.BASELINE, user));
            JsonNode n = mapper.readTree(content);
            return new ExtractResult(str(n, "company"), str(n, "role"), str(n, "location"),
                    num(n, "salary_min"), num(n, "salary_max"));
        } catch (OllamaException e) {
            throw e;
        } catch (Exception e) {
            throw new AiResponseException("The model returned something unreadable. Try again.");
        }
    }

    private static String str(JsonNode n, String k) {
        String v = n.path(k).asText("").strip();
        return v.isEmpty() ? null : v;
    }

    private static Integer num(JsonNode n, String k) {
        JsonNode v = n.path(k);
        return v.isNumber() && v.asInt() >= 0 ? v.asInt() : null;
    }
}
