package com.areatherm.climate.dto;

import com.areatherm.climate.ClimateProfile;

import java.math.BigDecimal;

/**
 * Response envelope for {@code POST /climate-profiles}. Per API_SPEC.md's
 * "every response distinguishes source" convention: this endpoint only ever
 * creates a caller-supplied profile, so a single top-level
 * {@code source = "USER_INPUT"} is proportionate -- no need for per-field
 * source tagging when every field on this response came from the request body.
 */
public record ClimateProfileResponse(
        Long id,
        Long locationId,
        BigDecimal ambientTempMinC,
        BigDecimal ambientTempMaxC,
        BigDecimal avgTempCAnnual,
        BigDecimal solarIrradianceKwhM2Yr,
        BigDecimal sunshineHoursPerDay,
        BigDecimal avgWindSpeedMs,
        BigDecimal avgRelativeHumidityPct,
        BigDecimal avgCloudCoverPct,
        String version,
        int hourlyPointsSaved,
        String source
) {

    public static ClimateProfileResponse from(ClimateProfile profile, int hourlyPointsSaved) {
        return new ClimateProfileResponse(
                profile.getId(),
                profile.getLocation().getId(),
                profile.getAmbientTempMinC(),
                profile.getAmbientTempMaxC(),
                profile.getAvgTempCAnnual(),
                profile.getSolarIrradianceKwhM2Yr(),
                profile.getSunshineHoursPerDay(),
                profile.getAvgWindSpeedMs(),
                profile.getAvgRelativeHumidityPct(),
                profile.getAvgCloudCoverPct(),
                profile.getVersion(),
                hourlyPointsSaved,
                "USER_INPUT"
        );
    }
}
