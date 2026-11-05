package com.jobcompass.agent;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Conversation memory: plain user and assistant turns, stored in Postgres. */
@Repository
public class ChatMemory {

    public record Turn(String role, String content) {
    }

    private final JdbcTemplate jdbc;

    public ChatMemory(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void add(String conversationId, String role, String content) {
        jdbc.update("INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, ?, ?)",
                conversationId, role, content);
    }

    /** The last {@code limit} turns, oldest first. */
    public List<Turn> recent(String conversationId, int limit) {
        List<Turn> turns = jdbc.query(
                "SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?",
                (rs, i) -> new Turn(rs.getString("role"), rs.getString("content")), conversationId, limit);
        return turns.reversed();
    }

    public int delete(String conversationId) {
        return jdbc.update("DELETE FROM chat_messages WHERE conversation_id = ?", conversationId);
    }

    public List<Map<String, Object>> all(String conversationId) {
        return jdbc.queryForList(
                "SELECT role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY id",
                conversationId);
    }
}
