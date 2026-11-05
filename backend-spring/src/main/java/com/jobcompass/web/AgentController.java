package com.jobcompass.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.jobcompass.agent.AgentService;
import com.jobcompass.agent.ChatMemory;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/agent")
public class AgentController {

    private final AgentService agent;
    private final ChatMemory memory;

    public AgentController(AgentService agent, ChatMemory memory) {
        this.agent = agent;
        this.memory = memory;
    }

    /** Body: {"message": "...", "conversation_id": "optional, to continue a conversation"}. */
    @PostMapping("/chat")
    public AgentService.Reply chat(@RequestBody JsonNode body) {
        String message = body.path("message").asText("").strip();
        if (message.isEmpty()) throw new ApiException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY, "message can't be empty");
        return agent.chat(body.path("conversation_id").asText(null), message);
    }

    @GetMapping("/conversations/{id}")
    public List<Map<String, Object>> conversation(@PathVariable String id) {
        return memory.all(id);
    }

    @DeleteMapping("/conversations/{id}")
    public Map<String, Integer> delete(@PathVariable String id) {
        return Map.of("deleted_messages", memory.delete(id));
    }
}
