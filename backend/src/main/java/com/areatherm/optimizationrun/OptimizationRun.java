package com.areatherm.optimizationrun;

import com.areatherm.climate.ClimateProfile;
import com.areatherm.design.ShelterDesign;
import com.areatherm.project.Project;
import com.areatherm.simulation.PeriodTypeConverter;
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
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/**
 * Deliberately NOT nested under {@code com.areatherm.optimization} -- that
 * package is the physics/optimizer engine only, and
 * {@code ArchitecturePurityTest}'s package-prefix match
 * ({@code com.areatherm.optimization..}) would flag any JPA-annotated class
 * placed there.
 */
@Entity
@Table(name = "optimization_run")
@Getter
@Setter
@NoArgsConstructor
public class OptimizationRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "base_shelter_design_id")
    private ShelterDesign baseShelterDesign;

    // The season an optimization run evaluates candidates against --
    // OptimizationEngine.runOptimization needs a real Season just like a
    // plain simulation does.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "climate_profile_id")
    private ClimateProfile climateProfile;

    // Every candidate the search evaluates is a real runSimulation() call,
    // which needs a real time step + period -- same fields simulation has,
    // for the same reason. Reuses Simulation's own PeriodTypeConverter/
    // SimConfig.PeriodType rather than duplicating either.
    @Column(name = "time_step_minutes", nullable = false)
    private int timeStepMinutes = 60;

    @Convert(converter = PeriodTypeConverter.class)
    @Column(name = "period_type", nullable = false, length = 10)
    private SimConfig.PeriodType periodType = SimConfig.PeriodType.TWENTY_FOUR_HOUR;

    @Column(name = "algorithm_version", nullable = false, length = 50)
    private String algorithmVersion = "1.0";

    @Column(name = "weight_comfort", nullable = false, precision = 4, scale = 3)
    private BigDecimal weightComfort = new BigDecimal("0.40");

    @Column(name = "weight_retention", nullable = false, precision = 4, scale = 3)
    private BigDecimal weightRetention = new BigDecimal("0.25");

    @Column(name = "weight_solar", nullable = false, precision = 4, scale = 3)
    private BigDecimal weightSolar = new BigDecimal("0.15");

    @Column(name = "weight_energy", nullable = false, precision = 4, scale = 3)
    private BigDecimal weightEnergy = new BigDecimal("0.10");

    @Column(name = "weight_cost", nullable = false, precision = 4, scale = 3)
    private BigDecimal weightCost = new BigDecimal("0.10");

    @Column(name = "candidates_evaluated")
    private Integer candidatesEvaluated;

    // Whether a broaderSearch/ML-screened request was honored -- always
    // FALSE in this backend (the deterministic grid search is the only
    // implemented path; see ARCHITECTURE.md SS9 and the ml/ package), kept
    // as a real column so the response contract already matches a future
    // ML-enabled build without a breaking change.
    @Column(name = "used_ml_screening", nullable = false)
    private boolean usedMlScreening = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private Status status = Status.QUEUED;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public enum Status {
        QUEUED, RUNNING, COMPLETE, FAILED
    }
}
