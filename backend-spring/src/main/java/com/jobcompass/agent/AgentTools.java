package com.jobcompass.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jobcompass.dto.JobDetailOut;
import com.jobcompass.service.EmbeddingService;
import com.jobcompass.service.JobService;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationRegistry;
import org.apache.tika.Tika;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** The agent's tools. Each returns plain text for the model; errors are returned, not thrown. */
@Component
public class AgentTools {

    private static final String DEFINITIONS = """
            [
             {"type":"function","function":{"name":"query_jobs",
              "description":"Run a read-only PostgreSQL SELECT on the application tracker. Tables: jobs(id, company, role, location, date_applied date, salary_min, salary_max, notes, status one of applied/interview/offer/rejected/withdrawn, job_description, job_url, match_score, match_summary, created_at, updated_at, status_changed_at); job_events(job_id, from_status, to_status, created_at). One statement, at most 50 rows returned.",
              "parameters":{"type":"object","properties":{"sql":{"type":"string","description":"A single SELECT statement"}},"required":["sql"]}}},
             {"type":"function","function":{"name":"get_job",
              "description":"Get one application in full: fields, notes, description, match result and status history.",
              "parameters":{"type":"object","properties":{"id":{"type":"integer"}},"required":["id"]}}},
             {"type":"function","function":{"name":"search_resume",
              "description":"Semantic search over the user's resume. Returns the most relevant passages.",
              "parameters":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}}},
             {"type":"function","function":{"name":"search_job_descriptions",
              "description":"Semantic search over saved job descriptions. Returns the closest applications.",
              "parameters":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}}},
             {"type":"function","function":{"name":"fetch_url",
              "description":"Fetch a public web page (for example a company's About or Careers page) and return its text.",
              "parameters":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}}}
            ]""";

    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate readOnlyTx;
    private final JobService jobs;
    private final EmbeddingService embeddings;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final Tika tika = new Tika();
    private final ObservationRegistry observations;

    public AgentTools(ObjectMapper mapper, JdbcTemplate jdbc, TransactionTemplate tx, JobService jobs,
                      EmbeddingService embeddings, ObservationRegistry observations) {
        this.observations = observations;
        this.mapper = mapper;
        this.jdbc = jdbc;
        this.readOnlyTx = new TransactionTemplate(tx.getTransactionManager());
        this.readOnlyTx.setReadOnly(true);
        this.jobs = jobs;
        this.embeddings = embeddings;
    }

    public JsonNode definitions() {
        try {
            return mapper.readTree(DEFINITIONS);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public String run(String name, JsonNode args) {
        return Observation.createNotStarted("agent.tool", observations)
                .lowCardinalityKeyValue("tool", name)
                .observe(() -> runTool(name, args));
    }

    private String runTool(String name, JsonNode args) {
        try {
            return switch (name) {
                case "query_jobs" -> query(args.path("sql").asText(""));
                case "get_job" -> getJob(args.path("id").asLong(-1));
                case "search_resume" -> json(embeddings.searchResume(args.path("query").asText(""), 4));
                case "search_job_descriptions" -> json(embeddings.searchJobs(args.path("query").asText(""), 5));
                case "fetch_url" -> fetch(args.path("url").asText(""));
                default -> "Error: unknown tool " + name;
            };
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }

    private String query(String sql) {
        String safe = SqlGuard.check(sql);
        List<Map<String, Object>> rows = readOnlyTx.execute(status -> {
            jdbc.execute("SET LOCAL statement_timeout = 3000");
            return jdbc.queryForList("SELECT * FROM (" + safe + ") AS q LIMIT 50");
        });
        return cut(json(rows), 6000);
    }

    private String getJob(long id) {
        JobDetailOut j = jobs.getDetail(id);
        String s = json(j);
        return cut(s, 6000);
    }

    private String fetch(String url) throws Exception {
        URI uri = URI.create(url.strip());
        for (int hop = 0; hop < 4; hop++) {
            UrlGuard.check(uri);
            HttpResponse<byte[]> r = http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))
                    .header("User-Agent", "JobCompass/1.0").GET().build(), HttpResponse.BodyHandlers.ofByteArray());
            int code = r.statusCode();
            if (code >= 300 && code < 400 && r.headers().firstValue("Location").isPresent()) {
                uri = uri.resolve(r.headers().firstValue("Location").get());
                continue;
            }
            if (code != 200) return "Error: the page returned HTTP " + code;
            byte[] body = r.body().length > 1_000_000 ? java.util.Arrays.copyOf(r.body(), 1_000_000) : r.body();
            return cut(tika.parseToString(new ByteArrayInputStream(body)).replaceAll("\\s+", " ").strip(), 6000);
        }
        return "Error: too many redirects";
    }

    private String json(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            return "Error: couldn't serialise result";
        }
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max) + " ...[truncated]" : s;
    }
}
