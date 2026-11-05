package com.jobcompass.service;

import com.jobcompass.dto.JobOut;
import com.jobcompass.entity.Job;
import com.jobcompass.repo.JobRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Keeps pgvector in sync with the resume and job descriptions and answers similarity queries.
 * Indexing runs in the background after the saving transaction commits and never fails a request.
 */
@Service
public class EmbeddingService {

    public record RankedJob(JobOut job, int fit, double similarity) {
    }

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);
    // nomic-embed-text cosine similarities for related text sit roughly in this band; the fit score
    // rescales it to 0-100. It is a heuristic: calibrate it with the eval harness (step 5).
    private static final double SIM_LOW = 0.40;
    private static final double SIM_HIGH = 0.80;

    private final JdbcTemplate jdbc;
    private final OllamaClient ollama;
    private final JobRepository jobs;
    private final ResumeService resume;

    public EmbeddingService(JdbcTemplate jdbc, OllamaClient ollama, JobRepository jobs, ResumeService resume) {
        this.jdbc = jdbc;
        this.ollama = ollama;
        this.jobs = jobs;
        this.resume = resume;
    }

    // ---- background indexing -------------------------------------------------------------------

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void onJob(JobDescriptionChanged e) {
        Thread.ofVirtual().start(() -> safely("job " + e.jobId(), () -> indexJob(e.jobId())));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void onResume(ResumeChanged e) {
        Thread.ofVirtual().start(() -> safely("resume", this::indexResume));
    }

    private void safely(String what, Runnable r) {
        try {
            r.run();
        } catch (Exception ex) {
            log.warn("Embedding {} skipped: {}", what, ex.getMessage());
        }
    }

    // ---- indexing ------------------------------------------------------------------------------

    public boolean indexJob(long jobId) {
        Job j = jobs.findById(jobId).orElse(null);
        if (j == null) return false;
        if (j.getJobDescription() == null || j.getJobDescription().isBlank()) {
            jdbc.update("DELETE FROM job_embeddings WHERE job_id = ?", jobId);
            return false;
        }
        String text = j.getRole() + " at " + j.getCompany() + "\n" + cut(j.getJobDescription(), 6000);
        String hash = sha256(text);
        List<String> existing = jdbc.queryForList(
                "SELECT content_hash FROM job_embeddings WHERE job_id = ?", String.class, jobId);
        if (!existing.isEmpty() && existing.get(0).equals(hash)) return false;

        String vec = OllamaClient.vectorLiteral(ollama.embed("search_document: " + text));
        jdbc.update("""
                INSERT INTO job_embeddings (job_id, embedding, content_hash, updated_at)
                VALUES (?, ?::vector, ?, now())
                ON CONFLICT (job_id) DO UPDATE
                SET embedding = EXCLUDED.embedding, content_hash = EXCLUDED.content_hash, updated_at = now()
                """, jobId, vec, hash);
        return true;
    }

    public int indexResume() {
        List<String> chunks = chunk(resume.text(), 800, 100);
        List<String> vectors = new ArrayList<>();
        for (String c : chunks) vectors.add(OllamaClient.vectorLiteral(ollama.embed("search_document: " + c)));
        jdbc.update("DELETE FROM resume_chunks");
        for (int i = 0; i < chunks.size(); i++) {
            jdbc.update("INSERT INTO resume_chunks (chunk_index, content, embedding) VALUES (?, ?, ?::vector)",
                    i, chunks.get(i), vectors.get(i));
        }
        return chunks.size();
    }

    public Map<String, Integer> reindexAll() {
        int chunks = indexResume();
        int indexed = 0;
        for (Job j : jobs.findAll()) {
            try {
                if (indexJob(j.getId())) indexed++;
            } catch (OllamaException e) {
                throw e;
            }
        }
        Map<String, Integer> out = new LinkedHashMap<>();
        out.put("resume_chunks", chunks);
        out.put("jobs_indexed", indexed);
        return out;
    }

    static List<String> chunk(String text, int size, int overlap) {
        List<String> out = new ArrayList<>();
        if (text == null || text.isBlank()) return out;
        String t = text.strip();
        for (int start = 0; start < t.length(); start += size - overlap) {
            int end = Math.min(t.length(), start + size);
            out.add(t.substring(start, end));
            if (end == t.length()) break;
        }
        return out;
    }

    // ---- queries -------------------------------------------------------------------------------

    /** Jobs ranked by how well the best three resume chunks match the job description. */
    public List<RankedJob> rank() {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT job_id, avg(sim) AS score FROM (
                  SELECT e.job_id,
                         1 - (e.embedding <=> c.embedding) AS sim,
                         row_number() OVER (PARTITION BY e.job_id ORDER BY e.embedding <=> c.embedding) AS rn
                  FROM job_embeddings e CROSS JOIN resume_chunks c) t
                WHERE rn <= 3 GROUP BY job_id ORDER BY score DESC
                """);
        Map<Long, Job> byId = jobs.findAllById(rows.stream().map(r -> ((Number) r.get("job_id")).longValue()).toList())
                .stream().collect(Collectors.toMap(Job::getId, Function.identity()));
        List<RankedJob> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Job j = byId.get(((Number) r.get("job_id")).longValue());
            if (j == null) continue;
            double sim = ((Number) r.get("score")).doubleValue();
            int fit = (int) Math.round(100 * Math.max(0, Math.min(1, (sim - SIM_LOW) / (SIM_HIGH - SIM_LOW))));
            out.add(new RankedJob(JobOut.of(j), fit, sim));
        }
        return out;
    }

    public List<String> searchResume(String query, int k) {
        String vec = OllamaClient.vectorLiteral(ollama.embed("search_query: " + query));
        return jdbc.queryForList(
                "SELECT content FROM resume_chunks ORDER BY embedding <=> ?::vector LIMIT ?", String.class, vec, k);
    }

    public List<Map<String, Object>> searchJobs(String query, int k) {
        String vec = OllamaClient.vectorLiteral(ollama.embed("search_query: " + query));
        return jdbc.queryForList("""
                SELECT j.id, j.company, j.role, j.status, round((1 - (e.embedding <=> ?::vector))::numeric, 3) AS similarity
                FROM job_embeddings e JOIN jobs j ON j.id = e.job_id
                ORDER BY e.embedding <=> ?::vector LIMIT ?
                """, vec, vec, k);
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    private static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
