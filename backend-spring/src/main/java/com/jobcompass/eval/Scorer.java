package com.jobcompass.eval;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Grades extracted fields against hand-labelled answers. Pure JDK so it is easy to test. */
public final class Scorer {

    public static final List<String> FIELDS = List.of("company", "role", "location", "salary_min", "salary_max");
    private static final Set<String> NUMERIC = Set.of("salary_min", "salary_max");
    private static final Set<String> COMPANY_SUFFIXES = Set.of("inc", "llc", "ltd", "corp", "corporation", "co", "company");

    public enum Outcome { CORRECT, WRONG, MISSED, HALLUCINATED }

    /** Running totals for one field. */
    public static final class Tally {
        public int n, correct, wrong, missed, hallucinated, lenient;

        public void add(Outcome o, boolean lenientOk) {
            n++;
            switch (o) {
                case CORRECT -> correct++;
                case WRONG -> wrong++;
                case MISSED -> missed++;
                case HALLUCINATED -> hallucinated++;
            }
            if (lenientOk) lenient++;
        }

        public double accuracy() {
            return n == 0 ? 0 : (double) correct / n;
        }

        public double lenientAccuracy() {
            return n == 0 ? 0 : (double) lenient / n;
        }
    }

    private Scorer() {}

    public static boolean isEmpty(Object v) {
        return v == null || v.toString().isBlank();
    }

    public static Outcome grade(String field, Object expected, Object predicted) {
        boolean e = isEmpty(expected), p = isEmpty(predicted);
        if (e && p) return Outcome.CORRECT;
        if (e) return Outcome.HALLUCINATED;
        if (p) return Outcome.MISSED;
        return norm(field, expected).equals(norm(field, predicted)) ? Outcome.CORRECT : Outcome.WRONG;
    }

    /**
     * Same as {@link #grade} but text fields also pass when one normalised value contains the other
     * ("Senior Data Analyst" vs "Data Analyst"). Numbers stay exact.
     */
    public static boolean lenientOk(String field, Object expected, Object predicted) {
        Outcome o = grade(field, expected, predicted);
        if (o == Outcome.CORRECT) return true;
        if (o != Outcome.WRONG || NUMERIC.contains(field)) return false;
        String a = norm(field, expected), b = norm(field, predicted);
        return a.contains(b) || b.contains(a);
    }

    public static String norm(String field, Object v) {
        if (v == null) return "";
        if (NUMERIC.contains(field)) {
            String digits = v.toString().replaceAll("[^0-9.]", "");
            if (digits.isEmpty()) return "";
            try {
                return Long.toString(Math.round(Double.parseDouble(digits)));
            } catch (NumberFormatException e) {
                return digits;
            }
        }
        String s = v.toString().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").strip();
        if (field.equals("company")) {
            String[] words = s.split(" ");
            int end = words.length;
            while (end > 1 && COMPANY_SUFFIXES.contains(words[end - 1])) end--;
            s = String.join(" ", java.util.Arrays.copyOf(words, end));
        }
        return s;
    }

    /** Nearest-rank percentile of an already sorted list; p in (0, 1]. */
    public static long percentile(List<Long> sorted, double p) {
        if (sorted.isEmpty()) return 0;
        int idx = (int) Math.ceil(p * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(sorted.size() - 1, idx)));
    }
}
