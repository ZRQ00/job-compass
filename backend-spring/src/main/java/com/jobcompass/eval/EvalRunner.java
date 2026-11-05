package com.jobcompass.eval;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jobcompass.service.OllamaClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Scores field extraction on a hand-labelled dataset, per model and prompt variant.
 *
 *   mvn spring-boot:run -Dspring-boot.run.profiles=eval \
 *     -Dspring-boot.run.arguments="--eval.models=ollama:qwen3.5:9b,ollama:llama3.2:3b --eval.variants=baseline,strict"
 */
@Component
@Profile("eval")
public class EvalRunner implements ApplicationRunner {

    private record Example(String id, String text, Map<String, Object> expected) {
    }

    private final OllamaClient ollama;
    private final ObjectMapper mapper;
    private final ApplicationContext ctx;

    @Value("${eval.dataset:eval/dataset.jsonl}") private String datasetPath;
    @Value("${eval.out:eval/results}") private String outDir;
    @Value("${eval.models:}") private String modelSpecs;
    @Value("${eval.variants:baseline}") private String variantNames;
    @Value("${app.ollama.model}") private String defaultModel;

    public EvalRunner(OllamaClient ollama, ObjectMapper mapper, ApplicationContext ctx) {
        this.ollama = ollama;
        this.mapper = mapper;
        this.ctx = ctx;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        int code = 0;
        try {
            execute();
        } catch (Exception e) {
            System.err.println("Eval failed: " + e.getMessage());
            code = 1;
        }
        final int exit = code;
        System.exit(SpringApplication.exit(ctx, () -> exit));
    }

    private void execute() throws Exception {
        List<Example> data = load(Path.of(datasetPath));
        if (data.isEmpty()) throw new IllegalStateException("No examples in " + datasetPath);

        List<ExtractionBackend> backends = new ArrayList<>();
        String specs = modelSpecs.isBlank() ? "ollama:" + defaultModel : modelSpecs;
        for (String spec : specs.split("\\s*,\\s*")) backends.add(backend(spec));

        List<String> variants = Arrays.asList(variantNames.split("\\s*,\\s*"));
        for (String v : variants) {
            if (!ExtractionPrompts.VARIANTS.containsKey(v)) throw new IllegalArgumentException("Unknown variant " + v);
        }

        ArrayNode raw = mapper.createArrayNode();
        StringBuilder md = new StringBuilder();
        String stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
        md.append("# Extraction eval ").append(stamp).append("\n\nExamples: ").append(data.size()).append("\n\n");
        md.append("| model | variant | valid JSON | company | role | location | salary min | salary max | mean | "
                + "role (lenient) | hallucinated | p50 ms | p95 ms |\n");
        md.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|\n");

        for (ExtractionBackend b : backends) {
            for (String variant : variants) {
                String system = ExtractionPrompts.VARIANTS.get(variant);
                Map<String, Scorer.Tally> tallies = new LinkedHashMap<>();
                Scorer.FIELDS.forEach(f -> tallies.put(f, new Scorer.Tally()));
                List<Long> latencies = new ArrayList<>();
                int valid = 0, done = 0;

                for (Example ex : data) {
                    long t0 = System.nanoTime();
                    Map<String, Object> predicted = new HashMap<>();
                    String error = null;
                    try {
                        String text = ex.text().length() > 12_000 ? ex.text().substring(0, 12_000) : ex.text();
                        JsonNode n = mapper.readTree(b.complete(system, text));
                        for (String f : Scorer.FIELDS) {
                            JsonNode v = n.path(f);
                            predicted.put(f, v.isNull() || v.isMissingNode() ? null : v.isNumber() ? v.numberValue() : v.asText());
                        }
                        valid++;
                    } catch (Exception e) {
                        error = e.getMessage();
                    }
                    latencies.add((System.nanoTime() - t0) / 1_000_000);

                    ObjectNode rec = raw.addObject();
                    rec.put("model", b.name()).put("variant", variant).put("id", ex.id());
                    if (error != null) rec.put("error", error);
                    ObjectNode outcomes = rec.putObject("outcomes");
                    for (String f : Scorer.FIELDS) {
                        Object exp = ex.expected().get(f), pred = predicted.get(f);
                        Scorer.Outcome o = Scorer.grade(f, exp, pred);
                        tallies.get(f).add(o, Scorer.lenientOk(f, exp, pred));
                        outcomes.put(f, o.name());
                        rec.putObject("predicted_" + f).put("value", pred == null ? null : pred.toString())
                                .put("expected", exp == null ? null : exp.toString());
                    }
                    System.out.printf("[%s/%s] %d/%d%n", b.name(), variant, ++done, data.size());
                }

                double mean = tallies.values().stream().mapToDouble(Scorer.Tally::accuracy).average().orElse(0);
                int halluc = tallies.values().stream().mapToInt(t -> t.hallucinated).sum();
                Collections.sort(latencies);
                md.append(String.format("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %d | %d | %d |%n",
                        b.name(), variant, pct((double) valid / data.size()),
                        pct(tallies.get("company").accuracy()), pct(tallies.get("role").accuracy()),
                        pct(tallies.get("location").accuracy()), pct(tallies.get("salary_min").accuracy()),
                        pct(tallies.get("salary_max").accuracy()), pct(mean),
                        pct(tallies.get("role").lenientAccuracy()), halluc,
                        Scorer.percentile(latencies, 0.5), Scorer.percentile(latencies, 0.95)));
            }
        }

        Path out = Path.of(outDir);
        Files.createDirectories(out);
        Files.writeString(out.resolve("extraction-" + stamp + ".md"), md.toString());
        Files.writeString(out.resolve("extraction-" + stamp + ".json"),
                mapper.writerWithDefaultPrettyPrinter().writeValueAsString(raw));
        System.out.println("\n" + md);
        System.out.println("Wrote " + out.resolve("extraction-" + stamp + ".md"));
    }

    private ExtractionBackend backend(String spec) {
        int i = spec.indexOf(':');
        if (i < 0) throw new IllegalArgumentException("Model spec must look like ollama:NAME, got " + spec);
        String provider = spec.substring(0, i), name = spec.substring(i + 1);
        return switch (provider) {
            case "ollama" -> new OllamaBackend(ollama, mapper, name);
            default -> throw new IllegalArgumentException("Unknown provider " + provider);
        };
    }

    private List<Example> load(Path path) throws Exception {
        List<Example> out = new ArrayList<>();
        int line = 0;
        for (String s : Files.readAllLines(path)) {
            line++;
            if (s.isBlank()) continue;
            JsonNode n = mapper.readTree(s);
            Map<String, Object> expected = new HashMap<>();
            for (String f : Scorer.FIELDS) {
                JsonNode v = n.path("expected").path(f);
                expected.put(f, v.isNull() || v.isMissingNode() ? null : v.isNumber() ? v.numberValue() : v.asText());
            }
            out.add(new Example(n.path("id").asText("line-" + line), n.path("text").asText(), expected));
        }
        return out;
    }

    private static String pct(double d) {
        return String.format("%.0f%%", d * 100);
    }
}
