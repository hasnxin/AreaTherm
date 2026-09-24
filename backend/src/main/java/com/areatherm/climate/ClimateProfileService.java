package com.areatherm.climate;

import com.areatherm.thermal.model.Season;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

/**
 * Bridges the climate-profile JPA entities to the physics engine's plain
 * Season value object -- the ONLY place that mapping happens, so
 * thermal/optimization never need to know ClimateProfile (or JPA) exists.
 *
 * A profile with a real 24-point hourly series (climate_profile_hourly --
 * matches API_SPEC.md's "POST /climate-profiles ... (+ hourly series)")
 * drives runSimulation() hour-by-hour exactly as recorded, same as the
 * frontend's "Live" Open-Meteo path. A profile without one falls back to
 * the same synthetic sinusoidal/bell-curve model the JS engine uses for a
 * seasonal (non-live) profile -- see ThermalEngine.ambientTempAt/
 * solarIrradianceAt, which check season.hourly() first either way.
 */
@Service
public class ClimateProfileService {

    private final ClimateProfileRepository climateProfileRepository;
    private final ClimateProfileHourlyRepository hourlyRepository;
    private final ClimateProfileMonthlyRepository monthlyRepository;

    public ClimateProfileService(ClimateProfileRepository climateProfileRepository,
                                  ClimateProfileHourlyRepository hourlyRepository,
                                  ClimateProfileMonthlyRepository monthlyRepository) {
        this.climateProfileRepository = climateProfileRepository;
        this.hourlyRepository = hourlyRepository;
        this.monthlyRepository = monthlyRepository;
    }

    public Season toSeason(ClimateProfile profile) {
        Location location = profile.getLocation();
        double latitude = location.getLatitude().doubleValue();

        List<ClimateProfileHourly> hourlyRows = loadHourly(profile.getId());
        List<Season.HourlyPoint> hourly = hourlyRows.size() == 24
            ? hourlyRows.stream().map(ClimateProfileService::toHourlyPoint).toList()
            : null; // anything other than exactly 24 rows can't drive interpHourly's hour-indexed lookup

        double tMin = toDouble(profile.getAmbientTempMinC(), 0);
        double tMax = toDouble(profile.getAmbientTempMaxC(), 0);

        // Only meaningful when `hourly` is null (the synthetic-fallback path)
        // -- annual-to-daily/symmetric-day approximations, clearly not real
        // per-day figures, exactly like a demo/illustrative JS season.
        double solarKwhDay = toDouble(profile.getSolarIrradianceKwhM2Yr(), 0) / 365.0;
        double sunshineHours = toDouble(profile.getSunshineHoursPerDay(), 10);
        double sunrise = 12 - sunshineHours / 2;
        double sunset = 12 + sunshineHours / 2;

        List<ClimateProfileMonthly> monthlyRows = monthlyRepository.findByClimateProfileIdOrderByMonthNumberAsc(profile.getId());
        List<Season.MonthlyTemp> monthlyTemp = monthlyRows.size() == 12
            ? monthlyRows.stream().map(m -> new Season.MonthlyTemp(m.getAvgTempC().doubleValue())).toList()
            : null;

        Double avgTempCAnnual = profile.getAvgTempCAnnual() != null ? profile.getAvgTempCAnnual().doubleValue() : null;

        return new Season(
            tMin, tMax, solarKwhDay, sunrise, sunset,
            toDouble(profile.getAvgWindSpeedMs(), 2), toDouble(profile.getAvgRelativeHumidityPct(), 40),
            toDouble(profile.getAvgCloudCoverPct(), 30),
            latitude, avgTempCAnnual, monthlyTemp, hourly
        );
    }

    private List<ClimateProfileHourly> loadHourly(Long climateProfileId) {
        // A profile's real driving series is exactly one day (24 hourly
        // points, see class javadoc) -- a page of 24 sorted by offset covers
        // it without risking an unbounded load for a profile that (by
        // mistake or by carrying a longer series for a different purpose)
        // has more rows than that.
        Page<ClimateProfileHourly> page = hourlyRepository.findByClimateProfileIdOrderByTsOffsetMinutesAsc(
            climateProfileId, PageRequest.of(0, 24, Sort.by("tsOffsetMinutes").ascending())
        );
        return page.getContent();
    }

    private static Season.HourlyPoint toHourlyPoint(ClimateProfileHourly row) {
        return new Season.HourlyPoint(
            row.getAmbientTempC().doubleValue(),
            row.getSolarIrradianceWm2().doubleValue(),
            row.getWindSpeedMs() != null ? row.getWindSpeedMs().doubleValue() : 0
        );
    }

    private static double toDouble(BigDecimal v, double fallback) {
        return v != null ? v.doubleValue() : fallback;
    }
}
