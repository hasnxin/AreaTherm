package com.areatherm.optimizationrun;

import com.areatherm.design.ShelterDesign;
import com.areatherm.simulation.Simulation;
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
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "design_candidate")
@Getter
@Setter
@NoArgsConstructor
public class DesignCandidate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "optimization_run_id", nullable = false)
    private OptimizationRun optimizationRun;

    // 'A', 'B', 'C', ...
    @Column(name = "label", nullable = false, length = 10)
    private String label;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shelter_design_id", nullable = false)
    private ShelterDesign shelterDesign;

    // NULL for the vast majority of the (e.g. 567) evaluated candidates --
    // the optimizer never persists a full Simulation+SimulationResultPoint
    // graph per candidate (matching the JS engine, which discards each
    // candidate's hourly series immediately after scoring). Only set for a
    // candidate a user explicitly promotes to a real, inspectable
    // simulation, hence optional/no nullable = false here.
    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "simulation_id")
    private Simulation simulation;

    @Column(name = "comfort_score", precision = 5, scale = 2)
    private BigDecimal comfortScore;

    @Column(name = "retention_score", precision = 5, scale = 2)
    private BigDecimal retentionScore;

    @Column(name = "solar_score", precision = 5, scale = 2)
    private BigDecimal solarScore;

    @Column(name = "energy_score", precision = 5, scale = 2)
    private BigDecimal energyScore;

    @Column(name = "cost_score", precision = 5, scale = 2)
    private BigDecimal costScore;

    @Column(name = "weighted_total_score", precision = 5, scale = 2)
    private BigDecimal weightedTotalScore;

    @Column(name = "estimated_cost_inr", precision = 12, scale = 2)
    private BigDecimal estimatedCostInr;

    @Column(name = "is_recommended", nullable = false)
    private boolean isRecommended = false;
}
