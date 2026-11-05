package com.jobcompass.service;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jobcompass.config.AppProperties;
import io.micrometer.observation.ObservationRegistry;
import org.junit.jupiter.api.Test;

/** Plain unit test: points the client at a closed port, so every call fails with a connection error. */
class OllamaResilienceTest {

    private static OllamaClient unreachableClient() {
        var cfg = new AppProperties.Ollama("http://127.0.0.1:1", "m", "e", 2048, 2);
        return new OllamaClient(new ObjectMapper(), new AppProperties(cfg, ""), ObservationRegistry.NOOP);
    }

    @Test
    void circuitOpensAfterRepeatedConnectionFailuresAndFailsFast() {
        OllamaClient client = unreachableClient();
        var payload = client.payload(false, false, null, 0, "s", "u");

        for (int i = 0; i < 4; i++) {
            OllamaException e = assertThrows(OllamaException.class, () -> client.chat(payload));
            assertTrue(e.transientFailure(), "connection errors are transient");
        }
        assertEquals("OPEN", client.circuitState());

        OllamaException paused = assertThrows(OllamaException.class, () -> client.chat(payload));
        assertTrue(paused.getMessage().contains("paused"), paused.getMessage());
        assertFalse(paused.transientFailure());
    }

    @Test
    void embedIsRetriedBeforeGivingUp() {
        OllamaClient client = unreachableClient();
        // 3 attempts per embed call; the 4th failure within the window trips the breaker, so the second
        // embed call ends early with the "paused" message instead of a third connection attempt.
        assertThrows(OllamaException.class, () -> client.embed("hello"));
        OllamaException second = assertThrows(OllamaException.class, () -> client.embed("hello"));
        assertEquals("OPEN", client.circuitState());
        assertTrue(second.getMessage().contains("paused") || second.getMessage().contains("reach"));
    }
}
