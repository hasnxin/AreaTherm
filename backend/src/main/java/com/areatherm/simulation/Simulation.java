package com.areatherm.simulation;

import com.areatherm.climate.ClimateProfile;
import com.areatherm.design.ShelterDesign;
import com.areatherm.project.Project;
import com.areatherm.security.AppUser;
import com.areatherm.thermal.model.SimConfig;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "simulation")
@Getter
@Setter
@NoArgsConstructor
public class Simulation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shelter_design_id", nullable = false)
    private ShelterDesign shelterDesign;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "climate_profile_id", nullable = false)
    private ClimateProfile climateProfile;

    // Plain INT, not an enum -- '15'/'30'/'60' aren't valid Java
    // enum-constant identifiers. The DB CHECK constraint restricts this to
    // {15, 30, 60}; re-validating that belongs to a future service layer.
    @Column(name = "time_step_minutes", nullable = false)
    private int timeStepMinutes = 60;

    // Reuses the physics engine's own SimConfig.PeriodType rather than a
    // duplicate persistence-layer enum. '24H' isn't a valid enum-constant
    // name, so EnumType.STRING can't be used here -- see PeriodTypeConverter.
    @Convert(converter = PeriodTypeConverter.class)
    @Column(name = "period_type", nullable = false, length = 10)
    private SimConfig.PeriodType periodType;

    @Column(name = "start_at", nullable = false)
    private LocalDateTime startAt;

    @Column(name = "end_at", nullable = false)
    private LocalDateTime endAt;

    @Column(name = "model_version", nullable = false, length = 50)
    private String modelVersion = "1.0";

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private Status status = Status.QUEUED;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "run_by")
    private AppUser runBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // The non-series output of the one authoritative ThermalEngine.runSimulation()
    // call (geometry/uValues/ach/occupancy/daily/comfort/scores), serialized
    // once as JSON -- see V3__add_simulation_summary.sql's comment for why
    // this isn't re-derived from simulation_result's raw rows instead.
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "summary_json", columnDefinition = "json")
    private String summaryJson;

    public enum Status {
        QUEUED, RUNNING, COMPLETE, FAILED
    }
}
