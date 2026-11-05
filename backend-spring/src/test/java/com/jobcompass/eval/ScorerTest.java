package com.jobcompass.eval;

import static org.junit.jupiter.api.Assertions.*;

import com.jobcompass.eval.Scorer.Outcome;
import java.util.List;
import org.junit.jupiter.api.Test;

class ScorerTest {

    @Test
    void normalisationIgnoresPunctuationCaseAndCompanySuffix() {
        assertEquals(Outcome.CORRECT, Scorer.grade("company", "Acme Inc.", "ACME"));
        assertEquals(Outcome.CORRECT, Scorer.grade("location", "Austin, TX", "Austin TX"));
        assertEquals(Outcome.CORRECT, Scorer.grade("salary_min", 100000, "100,000"));
    }

    @Test
    void outcomesDistinguishMissedFromHallucinated() {
        assertEquals(Outcome.CORRECT, Scorer.grade("salary_min", null, null));
        assertEquals(Outcome.HALLUCINATED, Scorer.grade("salary_min", null, 90000));
        assertEquals(Outcome.MISSED, Scorer.grade("location", "Remote", ""));
        assertEquals(Outcome.WRONG, Scorer.grade("company", "Acme", "Beta"));
    }

    @Test
    void lenientMatchingAppliesToTextOnly() {
        assertEquals(Outcome.WRONG, Scorer.grade("role", "Data Analyst", "Senior Data Analyst"));
        assertTrue(Scorer.lenientOk("role", "Data Analyst", "Senior Data Analyst"));
        assertFalse(Scorer.lenientOk("salary_min", 100000, 120000));
    }

    @Test
    void tallyAndPercentile() {
        Scorer.Tally t = new Scorer.Tally();
        t.add(Outcome.CORRECT, true);
        t.add(Outcome.WRONG, true);
        t.add(Outcome.MISSED, false);
        t.add(Outcome.CORRECT, true);
        assertEquals(0.5, t.accuracy(), 1e-9);
        assertEquals(0.75, t.lenientAccuracy(), 1e-9);
        List<Long> l = List.of(10L, 20L, 30L, 40L, 50L, 60L, 70L, 80L, 90L, 100L);
        assertEquals(50L, Scorer.percentile(l, 0.5));
        assertEquals(100L, Scorer.percentile(l, 0.95));
        assertEquals(0L, Scorer.percentile(List.of(), 0.5));
    }
}
