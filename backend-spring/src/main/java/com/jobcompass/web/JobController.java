package com.jobcompass.web;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jobcompass.dto.*;
import com.jobcompass.service.ExtractionService;
import com.jobcompass.service.JobService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/jobs")
public class JobController {

    private final JobService jobs;
    private final ExtractionService extraction;

    public JobController(JobService jobs, ExtractionService extraction) {
        this.jobs = jobs;
        this.extraction = extraction;
    }

    @GetMapping
    public List<JobOut> list(@RequestParam(required = false) String status,
                             @RequestParam(required = false) String q) {
        return jobs.list(status, q).stream().map(JobOut::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JobDetailOut create(@Valid @RequestBody JobCreate body) {
        return jobs.createDetail(body);
    }

    @GetMapping("/duplicates")
    public DuplicateCheck duplicates(@RequestParam String company, @RequestParam(defaultValue = "") String role) {
        return new DuplicateCheck(jobs.duplicates(company, role).stream().map(JobOut::of).toList());
    }

    @PostMapping("/extract")
    public ExtractResult extract(@Valid @RequestBody ExtractRequest body) {
        return extraction.extract(body.text());
    }

    @GetMapping("/{id}")
    public JobDetailOut get(@PathVariable long id) {
        return jobs.getDetail(id);
    }

    @PatchMapping("/{id}")
    public JobDetailOut update(@PathVariable long id, @RequestBody ObjectNode body) {
        return jobs.updateDetail(id, body);
    }

    @DeleteMapping("/{id}")
    public Map<String, Long> delete(@PathVariable long id) {
        jobs.delete(id);
        return Map.of("deleted", id);
    }
}
