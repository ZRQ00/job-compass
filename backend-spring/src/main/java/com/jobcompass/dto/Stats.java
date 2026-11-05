package com.jobcompass.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record Stats(
        int total,
        Map<String, Integer> byStatus,
        int appliedThisWeek,
        int weeklyGoal,
        int followUpAfterDays,
        Integer responseRate,
        List<FollowUp> followUps,
        List<WeekActivity> weeklyActivity) {

    public record FollowUp(Long id, String company, String role, LocalDate dateApplied, int daysWaiting) {
    }

    public record WeekActivity(LocalDate weekStart, int applied) {
    }
}
