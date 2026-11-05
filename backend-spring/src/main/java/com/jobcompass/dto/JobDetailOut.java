package com.jobcompass.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.jobcompass.entity.Job;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record JobDetailOut(
        Long id,
        String company,
        String role,
        String location,
        LocalDate dateApplied,
        Integer salaryMin,
        Integer salaryMax,
        String notes,
        String status,
        String jobDescription,
        String jobUrl,
        Integer matchScore,
        String matchSummary,
        JsonNode matchDetails,
        LocalDateTime matchedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime statusChangedAt,
        List<JobEventOut> events) {

    public static JobDetailOut of(Job j) {
        JobOut o = JobOut.of(j);
        return new JobDetailOut(o.id(), o.company(), o.role(), o.location(), o.dateApplied(), o.salaryMin(),
                o.salaryMax(), o.notes(), o.status(), o.jobDescription(), o.jobUrl(), o.matchScore(),
                o.matchSummary(), o.matchDetails(), o.matchedAt(), o.createdAt(), o.updatedAt(),
                o.statusChangedAt(), j.getEvents().stream().map(JobEventOut::of).toList());
    }
}
