package com.areatherm.design;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One hour of an optional occupancy schedule on a {@link ShelterDesign} --
 * 0 or 24 rows per design (0 meaning "use the flat occupancyCount/
 * occupancyActivity for the whole run", exactly as before this existed).
 * Same child-table shape as {@link ThermalMass}/{@link Opening}, not a
 * single JSON column, for consistency with how this codebase already
 * persists per-hour data (see climate.ClimateProfileHourly).
 */
@Entity
@Table(name = "occupancy_schedule_hour",
    indexes = @Index(name = "idx_osh_design_hour", columnList = "shelter_design_id, hour_of_day"))
@Getter
@Setter
@NoArgsConstructor
public class OccupancyScheduleHour {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shelter_design_id", nullable = false)
    private ShelterDesign shelterDesign;

    @Column(name = "hour_of_day", nullable = false)
    private int hourOfDay;

    @Column(name = "occupancy_count", nullable = false)
    private int occupancyCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "occupancy_activity", nullable = false, length = 20)
    private ShelterDesign.OccupancyActivity occupancyActivity;
}
