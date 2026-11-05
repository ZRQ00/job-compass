package com.jobcompass.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jobcompass.config.AppProperties;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationRegistry;
import org.springframework.stereotype.Component;

/** Thin client for a local Ollama server, built on the JDK HTTP client. */
@Component
public class OllamaClient {

    public record Status(boolean reachable, String model, boolean modelAvailable) {
    }

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper mapper;
    private final AppProperties.Ollama cfg;
    private final ObservationRegistry observations;

    public OllamaClient(ObjectMapper mapper, AppProperties props, ObservationRegistry observations) {
        this.mapper = mapper;
        this.cfg = props.ollama();
        this.observations = observations;
    }

    /** Timer (llm.call) and trace span around one model call, tagged with operation and model. */
    private Observation observe(String operation, String model) {
        return Observation.createNotStarted("llm.call", observations)
                .lowCardinalityKeyValue("operation", operation)
                .lowCardinalityKeyValue("model", model == null ? "unknown" : model);
    }

    public String model() {
        return cfg.model();
    }

    public Status status() {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(cfg.url() + "/api/tags"))
                    .timeout(Duration.ofSeconds(5)).GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) return new Status(false, cfg.model(), false);
            boolean available = false;
            for (JsonNode m : mapper.readTree(resp.body()).path("models")) {
                String name = m.hasNonNull("model") ? m.get("model").asText() : m.path("name").asText("");
                if (name.equals(cfg.model()) || name.startsWith(cfg.model() + ":")) available = true;
            }
            return new Status(true, cfg.model(), available);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Status(false, cfg.model(), false);
        } catch (Exception e) {
            return new Status(false, cfg.model(), false);
        }
    }

    public void ensureReady() {
        Status s = status();
        if (!s.reachable()) {
            throw new OllamaException("Ollama isn't reachable at " + cfg.url() + ". Start it with `ollama serve`.");
        }
        if (!s.modelAvailable()) {
            throw new OllamaException("Model '" + cfg.model() + "' isn't pulled. Run `ollama pull " + cfg.model() + "`.");
        }
    }

    /** Builds an /api/chat payload. {@code format} may be null for free-form output. */
    public ObjectNode payload(boolean stream, boolean think, JsonNode format, double temperature,
                              String system, String user) {
        return payload(cfg.model(), stream, think, format, temperature, system, user);
    }

    /** Same as above but for an explicit model (used by the eval harness). */
    public ObjectNode payload(String model, boolean stream, boolean think, JsonNode format, double temperature,
                              String system, String user) {
        ObjectNode p = mapper.createObjectNode();
        p.put("model", model);
        p.put("stream", stream);
        p.put("think", think);
        if (format != null) p.set("format", format);
        ObjectNode opts = p.putObject("options");
        opts.put("temperature", temperature);
        opts.put("num_ctx", cfg.numCtx());
        var msgs = p.putArray("messages");
        msgs.addObject().put("role", "system").put("content", system);
        msgs.addObject().put("role", "user").put("content", user);
        return p;
    }

    private HttpRequest chatRequest(ObjectNode payload) {
        return HttpRequest.newBuilder(URI.create(cfg.url() + "/api/chat"))
                .timeout(Duration.ofSeconds(cfg.timeoutSeconds()))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload.toString()))
                .build();
    }

    /** Blocking call; returns the final message content. */
    public String chat(ObjectNode payload) {
        return observe("chat", payload.path("model").asText(null)).observe(() -> doChat(payload));
    }

    private String doChat(ObjectNode payload) {
        try {
            HttpResponse<String> resp = http.send(chatRequest(payload), HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new OllamaException("Ollama returned HTTP " + resp.statusCode());
            }
            return mapper.readTree(resp.body()).path("message").path("content").asText("");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new OllamaException("Interrupted while waiting for Ollama", e);
        } catch (IOException e) {
            throw new OllamaException("Couldn't reach Ollama: " + e.getMessage(), e);
        }
    }

    /** Embeds one text with the configured embedding model. */
    public float[] embed(String text) {
        return observe("embed", cfg.embedModel()).observe(() -> doEmbed(text));
    }

    private float[] doEmbed(String text) {
        try {
            ObjectNode p = mapper.createObjectNode();
            p.put("model", cfg.embedModel());
            p.put("input", text);
            HttpRequest req = HttpRequest.newBuilder(URI.create(cfg.url() + "/api/embed"))
                    .timeout(Duration.ofSeconds(cfg.timeoutSeconds()))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(p.toString())).build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new OllamaException("Embedding failed (HTTP " + resp.statusCode() + "). Is `"
                        + cfg.embedModel() + "` pulled?");
            }
            JsonNode vec = mapper.readTree(resp.body()).path("embeddings").path(0);
            if (!vec.isArray() || vec.isEmpty()) throw new OllamaException("Ollama returned no embedding");
            float[] out = new float[vec.size()];
            for (int i = 0; i < out.length; i++) out[i] = (float) vec.get(i).asDouble();
            return out;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new OllamaException("Interrupted while waiting for Ollama", e);
        } catch (IOException e) {
            throw new OllamaException("Couldn't reach Ollama: " + e.getMessage(), e);
        }
    }

    /** pgvector text literal, e.g. [0.1,0.2]. */
    public static String vectorLiteral(float[] v) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < v.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(v[i]);
        }
        return sb.append(']').toString();
    }

    /** Non-streaming chat that returns the whole assistant message (needed for tool calls). */
    public JsonNode chatMessage(ObjectNode payload) {
        return observe("chat_tools", payload.path("model").asText(null)).observe(() -> doChatMessage(payload));
    }

    private JsonNode doChatMessage(ObjectNode payload) {
        try {
            HttpResponse<String> resp = http.send(chatRequest(payload), HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new OllamaException("Ollama returned HTTP " + resp.statusCode());
            }
            return mapper.readTree(resp.body()).path("message");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new OllamaException("Interrupted while waiting for Ollama", e);
        } catch (IOException e) {
            throw new OllamaException("Couldn't reach Ollama: " + e.getMessage(), e);
        }
    }

    /**
     * Streaming call. Each NDJSON line is parsed and handed to {@code onChunk}. When {@code cancelled}
     * turns true the stream is closed, which aborts generation on the Ollama side.
     */
    public void stream(ObjectNode payload, Consumer<JsonNode> onChunk, BooleanSupplier cancelled) {
        observe("stream", payload.path("model").asText(null)).observe(() -> doStream(payload, onChunk, cancelled));
    }

    private void doStream(ObjectNode payload, Consumer<JsonNode> onChunk, BooleanSupplier cancelled) {
        try {
            HttpResponse<java.io.InputStream> resp =
                    http.send(chatRequest(payload), HttpResponse.BodyHandlers.ofInputStream());
            if (resp.statusCode() != 200) {
                resp.body().close();
                throw new OllamaException("Ollama returned HTTP " + resp.statusCode());
            }
            try (BufferedReader r = new BufferedReader(new InputStreamReader(resp.body(), StandardCharsets.UTF_8))) {
                String line;
                while (!cancelled.getAsBoolean() && (line = r.readLine()) != null) {
                    if (!line.isBlank()) onChunk.accept(mapper.readTree(line));
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new OllamaException("Interrupted while waiting for Ollama", e);
        } catch (IOException e) {
            if (!cancelled.getAsBoolean()) throw new OllamaException("Couldn't reach Ollama: " + e.getMessage(), e);
        }
    }
}
