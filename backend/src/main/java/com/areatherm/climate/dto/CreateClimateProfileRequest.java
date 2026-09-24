package com.areatherm.climate.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;

/**
 * {@code POST /climate-profiles}: "create a user-provided climate profile
 * (+ hourly series)" per API_SPEC.md. {@code hourly} is optional -- when
 * present, each point is persisted as a {@code ClimateProfileHourly} row
 * linked to the newly created profile.
 */
public record CreateClimateProfileRequest(
        @NotNull Long locationId,
        @NotNull BigDecimal ambientTempMinC,
        @NotNull BigDecimal ambientTempMaxC,
        BigDecimal avgTempCAnnual,
        BigDecimal solarIrradianceKwhM2Yr,
        BigDecimal sunshineHoursPerDay,
        BigDecimal avgWindSpeedMs,
        BigDecimal avgRelativeHumidityPct,
        BigDecimal avgCloudCoverPct,
        @NotBlank String version,
        List<@Valid HourlyPointRequest> hourly
) {
}
