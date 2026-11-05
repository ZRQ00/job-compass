package com.jobcompass.agent;

import java.util.regex.Pattern;

/**
 * Defence in depth for the agent's SQL tool. The real protection is that the query runs in a READ ONLY
 * transaction with a statement timeout; this guard rejects anything that is not a single SELECT first.
 */
public final class SqlGuard {

    private static final Pattern STARTS = Pattern.compile("(?is)^\\s*(select|with)\\b.*");
    private static final Pattern FORBIDDEN = Pattern.compile(
            "(?i)\\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|execute|vacuum|"
                    + "set|reset|listen|notify|lock|pg_[a-z_]*|lo_[a-z_]*|dblink[a-z_]*)\\b");

    private SqlGuard() {}

    /** Returns the cleaned statement (no trailing semicolon) or throws IllegalArgumentException. */
    public static String check(String sql) {
        if (sql == null || sql.isBlank()) throw new IllegalArgumentException("Empty query");
        String s = sql.strip();
        if (s.endsWith(";")) s = s.substring(0, s.length() - 1).strip();
        if (s.length() > 2000) throw new IllegalArgumentException("Query too long");
        if (s.contains(";")) throw new IllegalArgumentException("Only a single statement is allowed");
        if (s.contains("--") || s.contains("/*")) throw new IllegalArgumentException("Comments are not allowed");
        if (!STARTS.matcher(s).matches()) throw new IllegalArgumentException("Only SELECT queries are allowed");
        if (FORBIDDEN.matcher(s).find()) throw new IllegalArgumentException("That statement is not allowed");
        return s;
    }
}
