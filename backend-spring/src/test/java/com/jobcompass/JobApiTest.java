package com.jobcompass;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class JobApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;

    private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

    @Test
    void createLogsFirstEventAndDefaultsDate() throws Exception {
        mvc.perform(post("/jobs").contentType(JSON)
                        .content("{\"company\":\" Acme \",\"role\":\"Data Analyst\",\"location\":\"\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.company").value("Acme"))
                .andExpect(jsonPath("$.location").value(nullValue()))
                .andExpect(jsonPath("$.status").value("applied"))
                .andExpect(jsonPath("$.date_applied").value(notNullValue()))
                .andExpect(jsonPath("$.events", hasSize(1)))
                .andExpect(jsonPath("$.events[0].from_status").value(nullValue()))
                .andExpect(jsonPath("$.events[0].to_status").value("applied"));
    }

    @Test
    void patchChangesOnlySentFieldsAndLogsStatus() throws Exception {
        String body = mvc.perform(post("/jobs").contentType(JSON)
                        .content("{\"company\":\"Beta\",\"role\":\"Eng\",\"notes\":\"keep me\"}"))
                .andReturn().getResponse().getContentAsString();
        String id = body.replaceAll(".*\"id\":(\\d+).*", "$1");

        mvc.perform(patch("/jobs/" + id).contentType(JSON).content("{\"status\":\"interview\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value("keep me"))
                .andExpect(jsonPath("$.status").value("interview"))
                .andExpect(jsonPath("$.events", hasSize(2)));

        mvc.perform(patch("/jobs/" + id).contentType(JSON).content("{\"notes\":null}"))
                .andExpect(jsonPath("$.notes").value(nullValue()))
                .andExpect(jsonPath("$.status").value("interview"));
    }

    @Test
    void validationAndErrors() throws Exception {
        mvc.perform(post("/jobs").contentType(JSON).content("{\"company\":\"\",\"role\":\"x\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.detail").exists());
        mvc.perform(post("/jobs").contentType(JSON)
                        .content("{\"company\":\"A\",\"role\":\"B\",\"salary_min\":9,\"salary_max\":1}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/jobs/999999")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Job not found"));
    }

    @Test
    void duplicatesAndSearch() throws Exception {
        mvc.perform(post("/jobs").contentType(JSON)
                .content("{\"company\":\"Zeta Corp\",\"role\":\"Backend Engineer\",\"notes\":\"referral\"}"));
        mvc.perform(get("/jobs/duplicates").param("company", "zeta corp").param("role", "backend"))
                .andExpect(jsonPath("$.duplicates", hasSize(1)));
        mvc.perform(get("/jobs").param("q", "REFERRAL"))
                .andExpect(jsonPath("$[0].company").value("Zeta Corp"));
    }

    @Test
    void deleteReturnsId() throws Exception {
        String body = mvc.perform(post("/jobs").contentType(JSON)
                        .content("{\"company\":\"Gone\",\"role\":\"X\"}"))
                .andReturn().getResponse().getContentAsString();
        String id = body.replaceAll(".*\"id\":(\\d+).*", "$1");
        mvc.perform(delete("/jobs/" + id)).andExpect(jsonPath("$.deleted").value(Integer.parseInt(id)));
        mvc.perform(get("/jobs/" + id)).andExpect(status().isNotFound());
    }
}
