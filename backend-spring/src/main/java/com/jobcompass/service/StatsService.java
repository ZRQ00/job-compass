package com.jobcompass.service;

import com.jobcompass.dto.Stats;
import com.jobcompass.entity.Job;
import com.jobcompass.repo.JobRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class StatsService {

    private static final List<String> PIPELINE = List.of("applied", "interview", "offer", "rejected", "withdrawn");

    private final JobRepository jobs;
    private final SettingsService settings;

    public StatsService(JobRepository jobs, SettingsService settings) {
        this.jobs = jobs;
        this.settings = settings;
    }

    public Stats compute() {
        List<Job> all = jobs.findAll();
        LocalDate today = LocalDate.now();
        LocalDate thisMonday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        int followUpDays = settings.getInt(SettingsService.FOLLOW_UP_AFTER_DAYS);

        Map<String, Integer> byStatus = new LinkedHashMap<>();
        PIPELINE.forEach(s -> byStatus.put(s, 0));
        for (Job j : all) byStatus.merge(j.getStatus(), 1, Integer::sum);

        int appliedThisWeek = (int) all.stream()
                .filter(j -> j.getDateApplied() != null && !j.getDateApplied().isBefore(thisMonday)
                        && !j.getDateApplied().isAfter(today))
                .count();

        Integer responseRate = null;
        if (!all.isEmpty()) {
            responseRate = (int) Math.round(100.0 * jobs.countRespondedJobs() / all.size());
        }

        List<Stats.FollowUp> followUps = all.stream()
                .filter(j -> j.getStatus().equals("applied") && j.getDateApplied() != null)
                .map(j -> new Stats.FollowUp(j.getId(), j.getCompany(), j.getRole(), j.getDateApplied(),
                        (int) ChronoUnit.DAYS.between(j.getDateApplied(), today)))
                .filter(f -> f.daysWaiting() >= followUpDays)
                .sorted(Comparator.comparingInt(Stats.FollowUp::daysWaiting).reversed())
                .toList();

        List<Stats.WeekActivity> activity = new ArrayList<>();
        for (int i = 7; i >= 0; i--) {
            LocalDate start = thisMonday.minusWeeks(i);
            LocalDate end = start.plusWeeks(1);
            int n = (int) all.stream()
                    .filter(j -> j.getDateApplied() != null && !j.getDateApplied().isBefore(start)
                            && j.getDateApplied().isBefore(end))
                    .count();
            activity.add(new Stats.WeekActivity(start, n));
        }

        return new Stats(all.size(), byStatus, appliedThisWeek, settings.getInt(SettingsService.WEEKLY_GOAL),
                followUpDays, responseRate, followUps, activity);
    }
}
