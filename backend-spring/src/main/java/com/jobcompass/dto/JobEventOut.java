package com.jobcompass.dto;

import com.jobcompass.entity.JobEvent;
import java.time.LocalDateTime;

public record JobEventOut(String fromStatus, String toStatus, LocalDateTime createdAt) {
    public static JobEventOut of(JobEvent e) {
        return new JobEventOut(e.getFromStatus(), e.getToStatus(), e.getCreatedAt());
    }
}
