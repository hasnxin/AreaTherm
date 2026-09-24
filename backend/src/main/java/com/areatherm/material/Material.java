package com.areatherm.material;

import com.areatherm.security.AppUser;
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
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "material")
@Getter
@Setter
@NoArgsConstructor
public class Material {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    // Stable string identifier from app/js/data.js (e.g. "wall_stone") --
    // the optimizer's fixed candidate systems resolve materials by this,
    // not by the auto-increment id. See V1__init.sql's comment on this column.
    @Column(name = "slug", nullable = false, unique = true, length = 50)
    private String slug;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 20)
    private MaterialCategory category;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "density_kg_m3", precision = 8, scale = 2)
    private BigDecimal densityKgM3;

    @Column(name = "thermal_conductivity_w_mk", precision = 8, scale = 4)
    private BigDecimal thermalConductivityWMk;

    @Column(name = "specific_heat_j_kgk", precision = 8, scale = 2)
    private BigDecimal specificHeatJKgK;

    @Column(name = "default_thickness_mm", precision = 8, scale = 2)
    private BigDecimal defaultThicknessMm;

    @Column(name = "u_value_w_m2k", precision = 8, scale = 4)
    private BigDecimal uValueWM2k;

    @Column(name = "solar_absorptivity", precision = 4, scale = 3)
    private BigDecimal solarAbsorptivity;

    @Column(name = "solar_reflectivity", precision = 4, scale = 3)
    private BigDecimal solarReflectivity;

    @Column(name = "emissivity", precision = 4, scale = 3)
    private BigDecimal emissivity;

    // Window materials only.
    @Column(name = "shgc", precision = 4, scale = 3)
    private BigDecimal shgc;

    // PCM-only (category = THERMAL_MASS materials with a melt point set, e.g.
    // mass_pcm/mass_composite). This is the single source of truth the
    // physics engine reads PCM parameters from -- thermal_mass.isPcm is a
    // derived read-convenience flag only, never an independent value.
    @Column(name = "pcm_melt_temp_c", precision = 5, scale = 2)
    private BigDecimal pcmMeltTempC;

    @Column(name = "pcm_latent_heat_j_kg", precision = 10, scale = 2)
    private BigDecimal pcmLatentHeatJKg;

    // Unit switches with category: per-m2 for WALL/ROOF/FLOOR/INSULATION/
    // WINDOW, per-kg for THERMAL_MASS.
    @Column(name = "moisture_notes", length = 500)
    private String moistureNotes;

    @Column(name = "cost_estimate_inr_per_unit", precision = 10, scale = 2)
    private BigDecimal costEstimateInrPerUnit;

    @Enumerated(EnumType.STRING)
    @Column(name = "sustainability_indicator", nullable = false, length = 10)
    private SustainabilityIndicator sustainabilityIndicator = SustainabilityIndicator.MEDIUM;

    @Column(name = "is_custom", nullable = false)
    private boolean isCustom = false;

    // "verify for actual construction" flag.
    @Column(name = "is_engineering_db_value", nullable = false)
    private boolean isEngineeringDbValue = true;

    @Column(name = "version", nullable = false, length = 50)
    private String version = "1.0";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private AppUser createdBy;

    public enum MaterialCategory {
        WALL, ROOF, FLOOR, INSULATION, THERMAL_MASS, WINDOW
    }

    public enum SustainabilityIndicator {
        LOW, MEDIUM, HIGH
    }
}
