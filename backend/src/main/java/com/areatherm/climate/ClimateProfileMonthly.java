package com.areatherm.climate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 12-row monthly climatology normal, keyed by calendar month (1-12) -- the
 * lagged-month path of engine.js's estimateGroundTempC() reads this when
 * present, falling back to avgTempCAnnual and then to (min+max)/2.
 */
@Entity
@Table(
        name = "climate_profile_monthly",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_climate_profile_monthly_profile_month",
                        columnNames = {"climate_profile_id", "month_number"}))
@Getter
@Setter
@NoArgsConstructor
public class ClimateProfileMonthly {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "climate_profile_id", nullable = false)
    private ClimateProfile climateProfile;

    @Column(name = "month_number", nullable = false)
    private int monthNumber;

    @Column(name = "avg_temp_c", nullable = false, precision = 5, scale = 2)
    private BigDecimal avgTempC;
}
