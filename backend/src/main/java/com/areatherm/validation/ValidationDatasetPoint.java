package com.areatherm.validation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

/**
 * An uploaded validation dataset's measured/predicted time series. Like
 * {@code climate_profile_hourly} and {@code simulation_result}, this can
 * hold a large number of rows per parent, so -- by the same reasoning
 * applied to those two tables -- there is no mapped collection on
 * {@link ValidationDataset}; read only via
 * {@link ValidationDatasetPointRepository}'s paged finder.
 */
@Entity
@Table(name = "validation_dataset_point")
@Getter
@Setter
@NoArgsConstructor
public class ValidationDatasetPoint {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "validation_dataset_id", nullable = false)
    private ValidationDataset validationDataset;

    @Column(name = "ts", nullable = false)
    private LocalDateTime ts;

    @Column(name = "ambient_temp_c", precision = 5, scale = 2)
    private BigDecimal ambientTempC;

    @Column(name = "measured_indoor_temp_c", nullable = false, precision = 5, scale = 2)
    private BigDecimal measuredIndoorTempC;

    @Column(name = "predicted_indoor_temp_c", precision = 5, scale = 2)
    private BigDecimal predictedIndoorTempC;

    @Column(name = "solar_radiation_wm2", precision = 7, scale = 2)
    private BigDecimal solarRadiationWm2;

    @Column(name = "wind_speed_ms", precision = 5, scale = 2)
    private BigDecimal windSpeedMs;

    @Column(name = "relative_humidity_pct", precision = 5, scale = 2)
    private BigDecimal relativeHumidityPct;
}
