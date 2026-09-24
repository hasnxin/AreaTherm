package com.areatherm.design;

import com.areatherm.material.Material;
import com.areatherm.project.Project;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "shelter_design")
@Getter
@Setter
@NoArgsConstructor
public class ShelterDesign {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "shape", nullable = false, length = 20)
    private Shape shape;

    @Column(name = "length_m", precision = 6, scale = 2)
    private BigDecimal lengthM;

    @Column(name = "width_m", precision = 6, scale = 2)
    private BigDecimal widthM;

    @Column(name = "height_m", precision = 6, scale = 2)
    private BigDecimal heightM;

    @Column(name = "diameter_m", precision = 6, scale = 2)
    private BigDecimal diameterM;

    // L_SHAPE only -- two rectangular wings sharing a corner, see engine.js
    // computeGeometry's isLShape branch.
    @Column(name = "length_a_m", precision = 6, scale = 2)
    private BigDecimal lengthAM;

    @Column(name = "width_a_m", precision = 6, scale = 2)
    private BigDecimal widthAM;

    @Column(name = "length_b_m", precision = 6, scale = 2)
    private BigDecimal lengthBM;

    @Column(name = "width_b_m", precision = 6, scale = 2)
    private BigDecimal widthBM;

    // All 8 compass points + CUSTOM (matches engine.js's ORIENT_OFFSET table).
    @Enumerated(EnumType.STRING)
    @Column(name = "orientation", nullable = false, length = 10)
    private Orientation orientation;

    @Column(name = "azimuth_deg", precision = 5, scale = 1)
    private BigDecimal azimuthDeg;

    @Column(name = "floor_area_m2", precision = 8, scale = 2)
    private BigDecimal floorAreaM2;

    @Column(name = "volume_m3", precision = 9, scale = 2)
    private BigDecimal volumeM3;

    @Column(name = "roof_area_m2", precision = 8, scale = 2)
    private BigDecimal roofAreaM2;

    @Column(name = "wall_area_m2", precision = 8, scale = 2)
    private BigDecimal wallAreaM2;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "wall_material_id")
    private Material wallMaterial;

    @Column(name = "wall_thickness_mm", precision = 8, scale = 2)
    private BigDecimal wallThicknessMm;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "roof_material_id")
    private Material roofMaterial;

    @Column(name = "roof_thickness_mm", precision = 8, scale = 2)
    private BigDecimal roofThicknessMm;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "floor_material_id")
    private Material floorMaterial;

    // floorUValue() reads this directly (defaulting to 150mm otherwise).
    @Column(name = "floor_thickness_mm", precision = 8, scale = 2)
    private BigDecimal floorThicknessMm;

    // Wall and roof insulation are independent in the physics model (the
    // reference baseline design uses 35mm on the wall vs 69mm on the roof) --
    // two full material+thickness pairs, matching the schema's flat-column
    // style, deliberately not a shared insulation_material_id/thickness_mm
    // pair or a generic material-layer join table. See the DDL comment above
    // these columns in V1__init.sql.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "wall_insulation_material_id")
    private Material wallInsulationMaterial;

    @Column(name = "wall_insulation_thickness_mm", precision = 8, scale = 2)
    private BigDecimal wallInsulationThicknessMm;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "roof_insulation_material_id")
    private Material roofInsulationMaterial;

    @Column(name = "roof_insulation_thickness_mm", precision = 8, scale = 2)
    private BigDecimal roofInsulationThicknessMm;

    @Column(name = "air_leakage_ach", precision = 5, scale = 2)
    private BigDecimal airLeakageAch;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comfort_profile_id")
    private ComfortProfile comfortProfile;

    @Column(name = "occupancy_count")
    private Integer occupancyCount = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "occupancy_activity", length = 20)
    private OccupancyActivity occupancyActivity = OccupancyActivity.SEATED;

    @Column(name = "internal_heat_gain_w", precision = 8, scale = 2)
    private BigDecimal internalHeatGainW = BigDecimal.ZERO;

    // Explicit override; NULL uses the physics engine's estimateGroundTempC().
    @Column(name = "ground_temp_c", precision = 5, scale = 2)
    private BigDecimal groundTempC;

    // Optimistic locking -- this entity is interactively edited.
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // Inverse side of the 0..1 thermal-mass relationship -- ThermalMass owns
    // the FK (see ThermalMass.shelterDesign). Deliberately a single
    // @OneToOne, never a @OneToMany: the engine models exactly one
    // thermal-mass node per design, matching the DB's UNIQUE constraint.
    @OneToOne(mappedBy = "shelterDesign", fetch = FetchType.LAZY)
    private ThermalMass thermalMass;

    public enum Shape {
        RECTANGULAR, SQUARE, CIRCULAR, DOME, SEMI_CIRCULAR, L_SHAPE, CUSTOM
    }

    public enum Orientation {
        NORTH, SOUTH, EAST, WEST, NE, NW, SE, SW, CUSTOM
    }

    public enum OccupancyActivity {
        SLEEPING, SEATED, LIGHT, MODERATE, HEAVY
    }
}
