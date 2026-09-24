package com.areatherm.api;

import com.areatherm.climate.ClimateProfile;
import com.areatherm.climate.ClimateProfileHourly;
import com.areatherm.climate.ClimateProfileHourlyRepository;
import com.areatherm.climate.ClimateProfileRepository;
import com.areatherm.climate.Location;
import com.areatherm.climate.LocationRepository;
import com.areatherm.climate.dto.ClimateProfileResponse;
import com.areatherm.climate.dto.CreateClimateProfileRequest;
import com.areatherm.climate.dto.HourlyPointRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Note: {@code GET /climate-profiles/live} (Open-Meteo/NASA POWER fetch) is
 * deliberately not implemented here -- it is a separately-owned, stubbed
 * concern per this pass's scope.
 */
@RestController
@RequestMapping("/api/v1/climate-profiles")
@Tag(name = "Climate Profiles")
public class ClimateProfileController {

    private final ClimateProfileRepository climateProfileRepository;
    private final ClimateProfileHourlyRepository hourlyRepository;
    private final LocationRepository locationRepository;

    public ClimateProfileController(ClimateProfileRepository climateProfileRepository,
                                     ClimateProfileHourlyRepository hourlyRepository,
                                     LocationRepository locationRepository) {
        this.climateProfileRepository = climateProfileRepository;
        this.hourlyRepository = hourlyRepository;
        this.locationRepository = locationRepository;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a user-provided climate profile (+ optional hourly series)")
    public ClimateProfileResponse create(@Valid @RequestBody CreateClimateProfileRequest request) {
        Location location = locationRepository.findById(request.locationId())
                .orElseThrow(() -> new ResourceNotFoundException("Location " + request.locationId() + " not found"));

        ClimateProfile profile = new ClimateProfile();
        profile.setLocation(location);
        profile.setSource(ClimateProfile.ClimateSource.USER_PROVIDED);
        // dataSource/dataValidationStatus/isIllustrative default to the
        // shipped-demo values (DEMO / ILLUSTRATIVE / true) -- override them
        // here so the frontend's data-source transparency badge reflects
        // that this is real, caller-supplied data, not illustrative demo data.
        profile.setDataSource("USER_PROVIDED");
        profile.setDataValidationStatus(ClimateProfile.DataValidationStatus.REAL);
        profile.setIllustrative(false);
        profile.setVersion(request.version());
        profile.setAmbientTempMinC(request.ambientTempMinC());
        profile.setAmbientTempMaxC(request.ambientTempMaxC());
        profile.setAvgTempCAnnual(request.avgTempCAnnual());
        profile.setSolarIrradianceKwhM2Yr(request.solarIrradianceKwhM2Yr());
        profile.setSunshineHoursPerDay(request.sunshineHoursPerDay());
        profile.setAvgWindSpeedMs(request.avgWindSpeedMs());
        profile.setAvgRelativeHumidityPct(request.avgRelativeHumidityPct());
        profile.setAvgCloudCoverPct(request.avgCloudCoverPct());

        ClimateProfile saved = climateProfileRepository.save(profile);

        int hourlyPointsSaved = 0;
        List<HourlyPointRequest> hourly = request.hourly();
        if (hourly != null && !hourly.isEmpty()) {
            List<ClimateProfileHourly> rows = hourly.stream().map(point -> {
                ClimateProfileHourly row = new ClimateProfileHourly();
                row.setClimateProfile(saved);
                row.setTsOffsetMinutes(point.tsOffsetMinutes());
                row.setAmbientTempC(point.ambientTempC());
                row.setSolarIrradianceWm2(point.solarIrradianceWm2());
                row.setWindSpeedMs(point.windSpeedMs());
                row.setRelativeHumidityPct(point.relativeHumidityPct());
                return row;
            }).toList();
            hourlyRepository.saveAll(rows);
            hourlyPointsSaved = rows.size();
        }

        return ClimateProfileResponse.from(saved, hourlyPointsSaved);
    }
}
