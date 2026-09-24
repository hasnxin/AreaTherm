package com.areatherm.climate.dto;

import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/** One row of the optional hourly series on {@code POST /climate-profiles}. */
public record HourlyPointRequest(
        @NotNull Integer tsOffsetMinutes,
        @NotNull BigDecimal ambientTempC,
        @NotNull BigDecimal solarIrradianceWm2,
        BigDecimal windSpeedMs,
        BigDecimal relativeHumidityPct
) {
}
