package com.areatherm.climate.dto;

import com.areatherm.climate.ClimateProfile;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * Summary view for {@code GET /locations/{id}/climate-profiles} -- the
 * profile's own scalar fields, deliberately excluding its hourly/monthly
 * child rows (see {@code ClimateProfileHourlyRepository}'s paged-only access
 * pattern; loading those for every profile in a list would be unbounded).
 */
public record ClimateProfileSummaryResponse(
        Long id,
        String source,
        String dataValidationStatus,
        BigDecimal ambientTempMinC,
        BigDecimal ambientTempMaxC,
        String version,
        @JsonProperty("isIllustrative") boolean illustrative
) {

    public static ClimateProfileSummaryResponse from(ClimateProfile profile) {
        return new ClimateProfileSummaryResponse(
                profile.getId(),
                profile.getSource().name(),
                profile.getDataValidationStatus().name(),
                profile.getAmbientTempMinC(),
                profile.getAmbientTempMaxC(),
                profile.getVersion(),
                profile.isIllustrative()
        );
    }
}
