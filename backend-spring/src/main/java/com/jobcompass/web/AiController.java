package com.jobcompass.web;

import com.jobcompass.service.EmbeddingService;
import com.jobcompass.service.ExportService;
import com.jobcompass.service.MatchService;
import com.jobcompass.service.OllamaClient;
import java.util.List;
import java.util.Map;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class AiController {

    private final OllamaClient ollama;
    private final MatchService match;
    private final ExportService export;
    private final EmbeddingService embeddings;

    public AiController(OllamaClient ollama, MatchService match, ExportService export, EmbeddingService embeddings) {
        this.ollama = ollama;
        this.match = match;
        this.export = export;
        this.embeddings = embeddings;
    }

    /** Saved jobs ranked by similarity to your resume (vector search, no LLM call). */
    @GetMapping("/jobs/ranked")
    public List<EmbeddingService.RankedJob> ranked() {
        return embeddings.rank();
    }

    /** Rebuilds all embeddings. Run once after migrating data or changing the embedding model. */
    @PostMapping("/embeddings/reindex")
    public Map<String, Integer> reindex() {
        return embeddings.reindexAll();
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "ai", ollama.status(), "circuit", ollama.circuitState());
    }

    @PostMapping(value = "/jobs/{id}/match", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter match(@PathVariable long id) {
        return match.start(id);
    }

    @GetMapping("/jobs/export.csv")
    public ResponseEntity<byte[]> csv() {
        return file(export.csv(), "text/csv; charset=utf-8", "job-compass.csv");
    }

    @GetMapping("/jobs/export.xlsx")
    public ResponseEntity<byte[]> xlsx() {
        return file(export.xlsx(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "job-compass.xlsx");
    }

    private static ResponseEntity<byte[]> file(byte[] body, String type, String name) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, type)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(name).build().toString())
                .body(body);
    }
}
