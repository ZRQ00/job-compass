package com.jobcompass;

import static org.awaitility.Awaitility.await;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/** Stats, settings, boards, resume, export, plus extract and SSE match against a fake Ollama. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AuxApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    static HttpServer fakeOllama;

    static {
        try {
            fakeOllama = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        fakeOllama.createContext("/api/tags", ex -> reply(ex, "{\"models\":[{\"name\":\"qwen3.5:9b\"}]}"));
        String vector = "[" + "0.1,".repeat(767) + "0.1]";
        fakeOllama.createContext("/api/embed", ex -> reply(ex, "{\"embeddings\":[" + vector + "]}"));
        fakeOllama.createContext("/api/chat", ex -> {
            String req = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if (req.contains("\"tools\"")) {
                if (req.contains("\"role\":\"tool\"")) {
                    reply(ex, "{\"message\":{\"role\":\"assistant\",\"content\":\"You are tracking some jobs.\"},\"done\":true}");
                } else {
                    reply(ex, "{\"message\":{\"role\":\"assistant\",\"content\":\"\",\"tool_calls\":[{\"function\":"
                            + "{\"name\":\"query_jobs\",\"arguments\":{\"sql\":\"select count(*) as n from jobs\"}}}]},\"done\":true}");
                }
            } else if (req.contains("\"stream\":true")) {
                String answer = "{\\\"score\\\":82,\\\"summary\\\":\\\"Strong fit\\\",\\\"strengths\\\":[\\\"Java\\\"],"
                        + "\\\"gaps\\\":[\\\"Kubernetes\\\"],\\\"suggestions\\\":[\\\"Lead with Spring\\\"]}";
                reply(ex, "{\"message\":{\"role\":\"assistant\",\"thinking\":\"Comparing skills\"},\"done\":false}\n"
                        + "{\"message\":{\"role\":\"assistant\",\"content\":\"" + answer + "\"},\"done\":false}\n"
                        + "{\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true}\n");
            } else {
                reply(ex, "{\"message\":{\"role\":\"assistant\",\"content\":\"{\\\"company\\\":\\\"Acme\\\","
                        + "\\\"role\\\":\\\"Data Analyst\\\",\\\"location\\\":\\\"Remote\\\","
                        + "\\\"salary_min\\\":100000,\\\"salary_max\\\":null}\"},\"done\":true}");
            }
        });
        fakeOllama.start();
    }

    static void reply(com.sun.net.httpserver.HttpExchange ex, String body) throws IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(200, b.length);
        ex.getResponseBody().write(b);
        ex.close();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("app.ollama.url", () -> "http://127.0.0.1:" + fakeOllama.getAddress().getPort());
    }

    @Autowired MockMvc mvc;
    private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

    @Test
    void healthReportsAi() throws Exception {
        mvc.perform(get("/health"))
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.ai.reachable").value(true))
                .andExpect(jsonPath("$.ai.model_available").value(true));
    }

    @Test
    void extractReturnsStructuredFields() throws Exception {
        mvc.perform(post("/jobs/extract").contentType(JSON)
                        .content("{\"text\":\"Acme is hiring a Data Analyst. Remote. $100k.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.company").value("Acme"))
                .andExpect(jsonPath("$.salary_min").value(100000))
                .andExpect(jsonPath("$.salary_max").value(nullValue()));
        mvc.perform(post("/jobs/extract").contentType(JSON).content("{\"text\":\"too short\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void matchStreamsThinkingThenSavesResult() throws Exception {
        mvc.perform(put("/resume").contentType(JSON).content("{\"text\":\"Java developer, Spring Boot\"}"))
                .andExpect(status().isOk());
        String created = mvc.perform(post("/jobs").contentType(JSON)
                        .content("{\"company\":\"Match Co\",\"role\":\"Backend\","
                                + "\"job_description\":\"Spring Boot and Kubernetes experience\"}"))
                .andReturn().getResponse().getContentAsString();
        String id = created.replaceAll(".*\"id\":(\\d+).*", "$1");

        MvcResult res = mvc.perform(post("/jobs/" + id + "/match"))
                .andExpect(request().asyncStarted()).andReturn();
        await().atMost(10, TimeUnit.SECONDS)
                .until(() -> res.getResponse().getContentAsString().contains("event:result"));
        String body = res.getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertTrue(body.contains("event:thinking"));

        mvc.perform(get("/jobs/" + id))
                .andExpect(jsonPath("$.match_score").value(82))
                .andExpect(jsonPath("$.match_details.gaps[0]").value("Kubernetes"));

        // Editing the description invalidates the saved match.
        mvc.perform(patch("/jobs/" + id).contentType(JSON).content("{\"job_description\":\"New text\"}"))
                .andExpect(jsonPath("$.match_score").value(nullValue()));
    }

    @Test
    void matchNeedsResumeAndDescription() throws Exception {
        String created = mvc.perform(post("/jobs").contentType(JSON)
                        .content("{\"company\":\"NoDesc\",\"role\":\"X\"}"))
                .andReturn().getResponse().getContentAsString();
        String id = created.replaceAll(".*\"id\":(\\d+).*", "$1");
        mvc.perform(post("/jobs/" + id + "/match")).andExpect(status().isBadRequest());
    }

    @Test
    void boardsSeededAndManageable() throws Exception {
        mvc.perform(get("/boards")).andExpect(jsonPath("$[?(@.builtin == true)]", hasSize(3)));

        String made = mvc.perform(post("/boards").contentType(JSON)
                        .content("{\"name\":\"Dice\",\"url\":\"https://www.dice.com/jobs?q=JOBCOMPASS&location=JCLOC\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.search").value("https://www.dice.com/jobs?q={query}&location={location}"))
                .andReturn().getResponse().getContentAsString();
        String id = made.replaceAll(".*\"id\":(\\d+).*", "$1");

        mvc.perform(patch("/boards/" + id).contentType(JSON).content("{\"hidden\":true}"))
                .andExpect(jsonPath("$.hidden").value(true));
        mvc.perform(delete("/boards/" + id)).andExpect(jsonPath("$.deleted").value(Integer.parseInt(id)));

        String firstId = mvc.perform(get("/boards")).andReturn().getResponse().getContentAsString()
                .replaceAll("^\\[\\{.*?\"id\":(\\d+).*$", "$1");
        mvc.perform(delete("/boards/" + firstId)).andExpect(status().isBadRequest());
    }

    @Test
    void settingsAndStats() throws Exception {
        mvc.perform(patch("/settings").contentType(JSON).content("{\"weekly_goal\":9}"))
                .andExpect(jsonPath("$.weekly_goal").value(9));
        mvc.perform(patch("/settings").contentType(JSON).content("{\"weekly_goal\":0}"))
                .andExpect(status().isUnprocessableEntity());

        mvc.perform(post("/jobs").contentType(JSON).content("{\"company\":\"StatsCo\",\"role\":\"X\"}"));
        mvc.perform(get("/stats"))
                .andExpect(jsonPath("$.total", greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.weekly_goal").value(9))
                .andExpect(jsonPath("$.by_status.applied", greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.weekly_activity", hasSize(8)))
                .andExpect(jsonPath("$.weekly_activity[7].week_start").exists());
    }

    @Test
    void resumeUploadAndExport() throws Exception {
        mvc.perform(multipart("/resume/upload")
                        .file(new MockMultipartFile("file", "cv.txt", "text/plain", "Jane Doe, Engineer".getBytes())))
                .andExpect(jsonPath("$.text").value(containsString("Jane Doe")));

        mvc.perform(post("/jobs").contentType(JSON).content("{\"company\":\"Exp, Inc\",\"role\":\"X\"}"));
        mvc.perform(get("/jobs/export.csv"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("\"Exp, Inc\"")));
        mvc.perform(get("/jobs/export.xlsx"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("job-compass.xlsx")));
    }

    @Test
    void agentCallsSqlToolAndRemembersConversation() throws Exception {
        mvc.perform(post("/jobs").contentType(JSON).content("{\"company\":\"AgentCo\",\"role\":\"X\"}"));
        String body = mvc.perform(post("/agent/chat").contentType(JSON).content("{\"message\":\"How many jobs?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply").value("You are tracking some jobs."))
                .andExpect(jsonPath("$.tool_calls[0].name").value("query_jobs"))
                .andReturn().getResponse().getContentAsString();
        String conv = body.replaceAll(".*\"conversation_id\":\"([^\"]+)\".*", "$1");

        mvc.perform(post("/agent/chat").contentType(JSON)
                .content("{\"message\":\"And now?\",\"conversation_id\":\"" + conv + "\"}"));
        mvc.perform(get("/agent/conversations/" + conv)).andExpect(jsonPath("$", hasSize(4)));
        mvc.perform(delete("/agent/conversations/" + conv)).andExpect(jsonPath("$.deleted_messages").value(4));
    }

    @Test
    void rankedJobsAppearAfterBackgroundIndexing() throws Exception {
        mvc.perform(put("/resume").contentType(JSON).content("{\"text\":\"Backend engineer with Java\"}"));
        mvc.perform(post("/jobs").contentType(JSON)
                .content("{\"company\":\"Rank Co\",\"role\":\"Java Dev\",\"job_description\":\"Build services in Java\"}"));
        await().atMost(20, TimeUnit.SECONDS).untilAsserted(() -> mvc.perform(get("/jobs/ranked"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.job.company == 'Rank Co')]", hasSize(1)))
                .andExpect(jsonPath("$[0].fit").exists()));
    }
}
