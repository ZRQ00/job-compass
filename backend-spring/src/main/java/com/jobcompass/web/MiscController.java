package com.jobcompass.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.jobcompass.dto.BoardOut;
import com.jobcompass.dto.Stats;
import com.jobcompass.service.*;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** Stats, settings, boards, resume. Kept together because each is a handful of lines. */
@RestController
public class MiscController {

    private final StatsService stats;
    private final SettingsService settings;
    private final BoardService boards;
    private final ResumeService resume;

    public MiscController(StatsService stats, SettingsService settings, BoardService boards, ResumeService resume) {
        this.stats = stats;
        this.settings = settings;
        this.boards = boards;
        this.resume = resume;
    }

    @GetMapping("/stats")
    public Stats stats() {
        return stats.compute();
    }

    @GetMapping("/settings")
    public Map<String, Integer> settings() {
        return settings.all();
    }

    @RequestMapping(value = "/settings", method = {RequestMethod.PUT, RequestMethod.PATCH})
    public Map<String, Integer> updateSettings(@RequestBody Map<String, Object> body) {
        return settings.update(body);
    }

    @GetMapping("/boards")
    public List<BoardOut> boards() {
        return boards.list();
    }

    @PostMapping("/boards")
    @ResponseStatus(HttpStatus.CREATED)
    public BoardOut createBoard(@RequestBody JsonNode body) {
        return boards.create(body.path("name").asText(""), body.path("url").asText(""));
    }

    @PutMapping("/boards/order")
    public List<BoardOut> reorderBoards(@RequestBody List<Long> ids) {
        return boards.reorder(ids);
    }

    @PatchMapping("/boards/{id}")
    public BoardOut updateBoard(@PathVariable long id, @RequestBody JsonNode body) {
        return boards.update(id, body);
    }

    @DeleteMapping("/boards/{id}")
    public Map<String, Long> deleteBoard(@PathVariable long id) {
        boards.delete(id);
        return Map.of("deleted", id);
    }

    @GetMapping("/resume")
    public ResumeService.ResumeOut resume() {
        return resume.get();
    }

    @PutMapping("/resume")
    public ResumeService.ResumeOut saveResume(@RequestBody JsonNode body) {
        return resume.save(body.path("text").asText(""));
    }

    @PostMapping(value = "/resume/upload", consumes = "multipart/form-data")
    public ResumeService.ResumeOut uploadResume(@RequestParam("file") MultipartFile file) {
        return resume.upload(file);
    }
}
