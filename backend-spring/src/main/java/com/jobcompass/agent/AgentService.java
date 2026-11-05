package com.jobcompass.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jobcompass.service.OllamaClient;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Chat assistant that can call tools in a loop (query the tracker, search resume, research a company). */
@Service
public class AgentService {

    public record ToolCall(String name, JsonNode arguments) {
    }

    public record Reply(String conversationId, String reply, List<ToolCall> toolCalls) {
    }

    private static final int MAX_ROUNDS = 6;
    private static final int HISTORY_TURNS = 20;

    private final OllamaClient ollama;
    private final AgentTools tools;
    private final ChatMemory memory;
    private final ObjectMapper mapper;

    public AgentService(OllamaClient ollama, AgentTools tools, ChatMemory memory, ObjectMapper mapper) {
        this.ollama = ollama;
        this.tools = tools;
        this.memory = memory;
        this.mapper = mapper;
    }

    private static String systemPrompt() {
        return "You are Job Compass, an assistant for one person's job hunt. Today is " + LocalDate.now() + ". "
                + "Their applications live in a tracker you can query with tools. Always use tools for facts "
                + "about their applications, resume or notes instead of guessing, and say so when a tool "
                + "returns nothing. Applications with status 'applied' and no movement for a week or more need "
                + "a follow-up. When tailoring resume bullets, only use experience that appears in the resume. "
                + "Be concise.";
    }

    public Reply chat(String conversationId, String userMessage) {
        ollama.ensureReady();
        String id = (conversationId == null || conversationId.isBlank()) ? UUID.randomUUID().toString() : conversationId;

        ArrayNode messages = mapper.createArrayNode();
        messages.addObject().put("role", "system").put("content", systemPrompt());
        for (ChatMemory.Turn t : memory.recent(id, HISTORY_TURNS)) {
            messages.addObject().put("role", t.role()).put("content", t.content());
        }
        messages.addObject().put("role", "user").put("content", userMessage);

        List<ToolCall> used = new ArrayList<>();
        String reply = null;
        for (int round = 0; round < MAX_ROUNDS && reply == null; round++) {
            ObjectNode payload = mapper.createObjectNode();
            payload.put("model", ollama.model());
            payload.put("stream", false);
            payload.put("think", false);
            payload.set("tools", tools.definitions());
            payload.putObject("options").put("temperature", 0.2);
            payload.set("messages", messages);

            JsonNode msg = ollama.chatMessage(payload);
            JsonNode calls = msg.path("tool_calls");
            if (!calls.isArray() || calls.isEmpty()) {
                reply = msg.path("content").asText("").strip();
                if (reply.isEmpty()) reply = "I don't have an answer for that.";
                break;
            }
            messages.add(msg);
            for (JsonNode c : calls) {
                String name = c.path("function").path("name").asText("");
                JsonNode args = c.path("function").path("arguments");
                used.add(new ToolCall(name, args));
                messages.addObject().put("role", "tool").put("tool_name", name).put("content", tools.run(name, args));
            }
        }
        if (reply == null) reply = "I couldn't finish that within the tool limit. Try a narrower question.";

        memory.add(id, "user", userMessage);
        memory.add(id, "assistant", reply);
        return new Reply(id, reply, used);
    }
}
