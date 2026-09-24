package com.areatherm.climate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Hourly (or sub-hourly) time series backing a {@link ClimateProfile}. This
 * table can hold thousands of rows per profile, so there is deliberately no
 * mapped collection on the {@code ClimateProfile} side -- see
 * {@link ClimateProfileHourlyRepository}'s paged finder, the only supported
 * way to read this data.
 */
@Entity
@Table(
        name = "climate_profile_hourly",
        indexes = @Index(name = "idx_cph_profile_offset", columnList = "climate_profile_id, ts_offset_minutes"))
@Getter
@Setter
@NoArgsConstructor
public class ClimateProfileHourly {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "climate_profile_id", nullable = false)
    private ClimateProfile climateProfile;

    @Column(name = "ts_offset_minutes", nullable = false)
    private int tsOffsetMinutes;

    @Column(name = "ambient_temp_c", nullable = false, precision = 5, scale = 2)
    private BigDecimal ambientTempC;

    @Column(name = "solar_irradiance_wm2", nullable = false, precision = 7, scale = 2)
    private BigDecimal solarIrradianceWm2;

    @Column(name = "wind_speed_ms", precision = 5, scale = 2)
    private BigDecimal windSpeedMs;

    @Column(name = "relative_humidity_pct", precision = 5, scale = 2)
    private BigDecimal relativeHumidityPct;
}
