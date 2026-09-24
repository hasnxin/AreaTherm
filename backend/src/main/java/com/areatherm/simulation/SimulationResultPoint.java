package com.areatherm.simulation;

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
 * Maps the {@code simulation_result} table. Named {@code SimulationResultPoint}
 * rather than {@code SimulationResult} so it can never be confused with (or
 * collide with) the unrelated pure-physics record
 * {@link com.areatherm.thermal.model.SimulationResult}.
 *
 * <p>This table can hold thousands of rows per simulation, so there is
 * deliberately no mapped collection on the {@link Simulation} side -- see
 * {@link SimulationResultPointRepository}'s paged finder, the only supported
 * way to read this data (backs {@code GET /simulations/{id}/series}).
 */
@Entity
@Table(
        name = "simulation_result",
        indexes = @Index(name = "idx_sr_sim_offset", columnList = "simulation_id, ts_offset_minutes"))
@Getter
@Setter
@NoArgsConstructor
public class SimulationResultPoint {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "simulation_id", nullable = false)
    private Simulation simulation;

    @Column(name = "ts_offset_minutes", nullable = false)
    private int tsOffsetMinutes;

    @Column(name = "ambient_temp_c", precision = 5, scale = 2)
    private BigDecimal ambientTempC;

    @Column(name = "indoor_temp_c", precision = 5, scale = 2)
    private BigDecimal indoorTempC;

    @Column(name = "mass_temp_c", precision = 5, scale = 2)
    private BigDecimal massTempC;

    @Column(name = "solar_gain_w", precision = 9, scale = 2)
    private BigDecimal solarGainW;

    @Column(name = "wall_loss_w", precision = 9, scale = 2)
    private BigDecimal wallLossW;

    @Column(name = "roof_loss_w", precision = 9, scale = 2)
    private BigDecimal roofLossW;

    @Column(name = "floor_loss_w", precision = 9, scale = 2)
    private BigDecimal floorLossW;

    @Column(name = "opening_loss_w", precision = 9, scale = 2)
    private BigDecimal openingLossW;

    @Column(name = "vent_loss_w", precision = 9, scale = 2)
    private BigDecimal ventLossW;

    @Column(name = "mass_exchange_w", precision = 9, scale = 2)
    private BigDecimal massExchangeW;

    @Column(name = "net_balance_w", precision = 9, scale = 2)
    private BigDecimal netBalanceW;

    @Column(name = "in_comfort_band")
    private Boolean inComfortBand;
}
