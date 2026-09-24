package com.areatherm.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record Era5FetchRequest(
    @NotNull @Min(-90) @Max(90) Double latitude,
    @NotNull @Min(-180) @Max(180) Double longitude,
    @NotNull @Min(1950) @Max(2100) Integer year,
    @NotNull @Min(1) @Max(12) Integer month
) {
}
