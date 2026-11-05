package com.jobcompass.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDate;

public record JobCreate(
        @NotBlank String company,
        @NotBlank String role,
        String location,
        LocalDate dateApplied,
        @PositiveOrZero Integer salaryMin,
        @PositiveOrZero Integer salaryMax,
        String notes,
        String status,
        String jobDescription,
        String jobUrl) {
}
