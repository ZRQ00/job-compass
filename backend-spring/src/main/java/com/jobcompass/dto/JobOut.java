package com.jobcompass.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jobcompass.entity.Job;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** Same JSON shape as the FastAPI JobOut (snake_case applied globally). */
public record JobOut(
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
        LocalDateTime statusChangedAt) {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static JobOut of(Job j) {
        return new JobOut(j.getId(), j.getCompany(), j.getRole(), j.getLocation(), j.getDateApplied(),
                j.getSalaryMin(), j.getSalaryMax(), j.getNotes(), j.getStatus(), j.getJobDescription(),
                j.getJobUrl(), j.getMatchScore(), j.getMatchSummary(), parse(j.getMatchDetails()),
                j.getMatchedAt(), j.getCreatedAt(), j.getUpdatedAt(), j.getStatusChangedAt());
    }

    private static JsonNode parse(String json) {
        if (json == null) return null;
        try {
            return MAPPER.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }
}
