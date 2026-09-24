package com.areatherm.climate.dto;

import com.areatherm.climate.Location;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record LocationResponse(
        Long id,
        Long projectId,
        String country,
        String state,
        String district,
        String village,
        BigDecimal latitude,
        BigDecimal longitude,
        BigDecimal elevationM,
        LocalDateTime createdAt
) {

    public static LocationResponse from(Location location) {
        return new LocationResponse(
                location.getId(),
                location.getProject().getId(),
                location.getCountry(),
                location.getState(),
                location.getDistrict(),
                location.getVillage(),
                location.getLatitude(),
                location.getLongitude(),
                location.getElevationM(),
                location.getCreatedAt()
        );
    }
}
