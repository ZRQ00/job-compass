package com.jobcompass.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ExtractRequest(@NotNull @Size(min = 20) String text) {
}
