package com.areatherm.climate.era5;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/**
 * One CDS retrieval job for one (lat, lon, year, month) -- same
 * QUEUED/RUNNING/COMPLETE/FAILED lifecycle as Simulation/OptimizationRun
 * (see SimulationService.runAsync's javadoc), except this one's own "work"
 * is itself a submit-then-poll cycle against an external API rather than a
 * local physics computation. Deliberately NOT scoped to a Project: ERA5
 * data for a given point/month is objective public climate data, so every
 * user sharing a fetch for the same (rounded) coordinates avoids a
 * redundant CDS call -- see the unique constraint below.
 */
@Entity
@Table(name = "era5_fetch", uniqueConstraints = @UniqueConstraint(
    name = "uq_era5_fetch_point_month", columnNames = {"latitude", "longitude", "fetch_year", "fetch_month"}))
@Getter
@Setter
@NoArgsConstructor
public class Era5Fetch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    // Rounded to 2dp (~1km) at write time -- see Era5Service -- so nearby
    // requests for "the same place" actually hit the unique constraint and
    // share a cached fetch, instead of each slightly-different raw
    // coordinate silently bypassing the cache.
    @Column(name = "latitude", nullable = false, precision = 6, scale = 2)
    private BigDecimal latitude;

    @Column(name = "longitude", nullable = false, precision = 6, scale = 2)
    private BigDecimal longitude;

    @Column(name = "fetch_year", nullable = false)
    private int year;

    @Column(name = "fetch_month", nullable = false)
    private int month;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private Status status = Status.QUEUED;

    /** The external CDS job id while QUEUED/RUNNING -- needed to resume polling if this backend restarts mid-poll. */
    @Column(name = "cds_job_id", length = 100)
    private String cdsJobId;

    // Era5NetcdfParser.MonthlyHourlyProfile, serialized -- see
    // Simulation.summaryJson's javadoc for why a JSON blob rather than a
    // fully normalized child-row shape (same reasoning applies here: this
    // is read back whole, never queried by its internal fields).
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "result_json", columnDefinition = "json")
    private String resultJson;

    @Column(name = "error_message", length = 4000)
    private String errorMessage;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    public enum Status {
        QUEUED, RUNNING, COMPLETE, FAILED
    }
}
