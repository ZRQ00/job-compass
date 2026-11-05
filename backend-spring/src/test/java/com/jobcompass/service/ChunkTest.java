package com.jobcompass.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class ChunkTest {

    @Test
    void shortTextIsOneChunk() {
        assertEquals(1, EmbeddingService.chunk("hello", 800, 100).size());
        assertTrue(EmbeddingService.chunk("  ", 800, 100).isEmpty());
    }

    @Test
    void longTextOverlapsAndCoversEverything() {
        String text = "x".repeat(2000);
        var chunks = EmbeddingService.chunk(text, 800, 100);
        assertEquals(3, chunks.size());
        assertEquals(800, chunks.get(0).length());
        assertTrue(chunks.get(2).length() <= 800);
    }
}
