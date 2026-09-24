package com.areatherm.climate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/**
 * One profile per location per data version (demo / user-provided / future
 * live-API-sourced). {@link #isIllustrative} is {@code true} for shipped
 * demo datasets.
 */
@Entity
@Table(name = "climate_profile")
@Getter
@Setter
@NoArgsConstructor
public class ClimateProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "location_id", nullable = false)
    private Location location;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 20)
    private ClimateSource source;

    // Free text ('DEMO' | 'OPEN_METEO' | 'USER_PROVIDED' | ...) -- no CHECK
    // constraint on this column (unlike `source` above), so it stays a plain
    // String rather than an enum. Read by the frontend's data-source
    // transparency badge together with apiSource/dataValidationStatus.
    @Column(name = "data_source", nullable = false, length = 50)
    private String dataSource = "DEMO";

    @Column(name = "api_source", length = 50)
    private String apiSource;

    @Enumerated(EnumType.STRING)
    @Column(name = "data_validation_status", nullable = false, length = 20)
    private DataValidationStatus dataValidationStatus = DataValidationStatus.ILLUSTRATIVE;

    @Column(name = "last_fetched")
    private LocalDateTime lastFetched;

    @Column(name = "version", nullable = false, length = 50)
    private String version;

    @Column(name = "is_illustrative", nullable = false)
    private boolean isIllustrative = true;

    @Column(name = "ambient_temp_min_c", precision = 5, scale = 2)
    private BigDecimal ambientTempMinC;

    @Column(name = "ambient_temp_max_c", precision = 5, scale = 2)
    private BigDecimal ambientTempMaxC;

    // Needed by engine.js's estimateGroundTempC() annual fallback -- a
    // DB-backed simulation reproduces the reference numbers only if this is
    // available directly, without recomputing from min/max.
    @Column(name = "avg_temp_c_annual", precision = 5, scale = 2)
    private BigDecimal avgTempCAnnual;

    @Column(name = "solar_irradiance_kwh_m2_yr", precision = 7, scale = 2)
    private BigDecimal solarIrradianceKwhM2Yr;

    @Column(name = "sunshine_hours_per_day", precision = 4, scale = 2)
    private BigDecimal sunshineHoursPerDay;

    @Column(name = "avg_wind_speed_ms", precision = 5, scale = 2)
    private BigDecimal avgWindSpeedMs;

    @Column(name = "avg_relative_humidity_pct", precision = 5, scale = 2)
    private BigDecimal avgRelativeHumidityPct;

    @Column(name = "avg_cloud_cover_pct", precision = 5, scale = 2)
    private BigDecimal avgCloudCoverPct;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public enum ClimateSource {
        DEMO_ILLUSTRATIVE, USER_PROVIDED, OPEN_METEO, NASA_POWER, ERA5, IMD
    }

    public enum DataValidationStatus {
        REAL, ILLUSTRATIVE
    }
}
