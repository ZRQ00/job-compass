package com.jobcompass.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jobcompass.dto.JobOut;
import com.jobcompass.entity.Job;
import com.jobcompass.web.ApiException;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Resume vs. job description. The model's reasoning is streamed to the client as Server-Sent Events:
 * {@code thinking} (text deltas), {@code result} (the updated job), {@code error}. If the client disconnects,
 * the Ollama stream is closed so generation stops.
 */
@Service
public class MatchService {

    private static final String SCHEMA = """
            {"type":"object",
             "properties":{
               "score":{"type":"integer"},
               "summary":{"type":"string"},
               "strengths":{"type":"array","items":{"type":"string"}},
               "gaps":{"type":"array","items":{"type":"string"}},
               "suggestions":{"type":"array","items":{"type":"string"}}},
             "required":["score","summary","strengths","gaps","suggestions"]}""";

    private static final String PROMPT = """
            You are a candid career coach. Compare the candidate's resume with the job description. \
            Return JSON with: score (0-100 overall fit), summary (2-3 sentences), strengths (what in the resume \
            matches the role), gaps (requirements the resume does not show), and suggestions (concrete ways to \
            tailor the resume for this job). Only use facts that appear in the resume; never invent experience.""";

    private final OllamaClient ollama;
    private final JobService jobs;
    private final ResumeService resume;
    private final ObjectMapper mapper;

    public MatchService(OllamaClient ollama, JobService jobs, ResumeService resume, ObjectMapper mapper) {
        this.ollama = ollama;
        this.jobs = jobs;
        this.resume = resume;
        this.mapper = mapper;
    }

    public SseEmitter start(long jobId) {
        Job job = jobs.get(jobId);
        if (job.getJobDescription() == null || job.getJobDescription().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Add a job description before matching.");
        }
        String resumeText = resume.text();
        if (resumeText == null || resumeText.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Upload your resume first.");
        }
        ollama.ensureReady();

        String user = "RESUME:\n" + cut(resumeText, 10_000) + "\n\nJOB: " + job.getRole() + " at "
                + job.getCompany() + "\nDESCRIPTION:\n" + cut(job.getJobDescription(), 8_000);

        SseEmitter emitter = new SseEmitter(0L);
        AtomicBoolean cancelled = new AtomicBoolean(false);
        emitter.onCompletion(() -> cancelled.set(true));
        emitter.onTimeout(() -> cancelled.set(true));
        emitter.onError(e -> cancelled.set(true));

        Thread.ofVirtual().name("match-" + jobId).start(() -> run(jobId, user, emitter, cancelled));
        return emitter;
    }

    private void run(long jobId, String user, SseEmitter emitter, AtomicBoolean cancelled) {
        StringBuilder content = new StringBuilder();
        try {
            JsonNode schema = mapper.readTree(SCHEMA);
            ObjectNode payload = ollama.payload(true, true, schema, 0.3, PROMPT, user);

            ollama.stream(payload, chunk -> {
                JsonNode msg = chunk.path("message");
                String thinking = msg.path("thinking").asText("");
                if (!thinking.isEmpty() && !send(emitter, "thinking", mapper.createObjectNode().put("text", thinking))) {
                    cancelled.set(true);
                }
                content.append(msg.path("content").asText(""));
            }, cancelled::get);

            if (cancelled.get()) return;

            JsonNode n = mapper.readTree(stripFences(content.toString()));
            int score = Math.max(0, Math.min(100, n.path("score").asInt(0)));
            ObjectNode details = mapper.createObjectNode();
            details.set("strengths", list(n.path("strengths")));
            details.set("gaps", list(n.path("gaps")));
            details.set("suggestions", list(n.path("suggestions")));

            JobOut saved = jobs.saveMatch(jobId, score, n.path("summary").asText(""), details.toString());
            send(emitter, "result", saved);
            emitter.complete();
        } catch (OllamaException e) {
            fail(emitter, cancelled, e.getMessage());
        } catch (IOException | RuntimeException e) {
            fail(emitter, cancelled, "The model returned something unreadable. Try again.");
        }
    }

    private void fail(SseEmitter emitter, AtomicBoolean cancelled, String message) {
        if (cancelled.get()) return;
        send(emitter, "error", mapper.createObjectNode().put("detail", message));
        emitter.complete();
    }

    private boolean send(SseEmitter emitter, String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(mapper.writeValueAsString(data)));
            return true;
        } catch (IOException | IllegalStateException e) {
            return false;
        }
    }

    private JsonNode list(JsonNode n) {
        var arr = mapper.createArrayNode();
        if (n.isArray()) n.forEach(x -> arr.add(x.asText()));
        return arr;
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    private static String stripFences(String s) {
        String t = s.strip();
        if (t.startsWith("```")) {
            t = t.replaceFirst("^```[a-zA-Z]*\\s*", "").replaceFirst("\\s*```$", "");
        }
        return t;
    }
}
