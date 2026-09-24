package com.areatherm.design;

import com.areatherm.material.Material;
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
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The engine models exactly one thermal-mass node per design; the DB's
 * UNIQUE constraint on {@code shelter_design_id} keeps this table 0..1 rows
 * per design. Mapped as {@code @OneToOne} on both sides (never
 * {@code @OneToMany}) -- see {@link ShelterDesign#getThermalMass()} for the
 * inverse side.
 */
@Entity
@Table(name = "thermal_mass")
@Getter
@Setter
@NoArgsConstructor
public class ThermalMass {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    // Owning side of the relationship. A unique+not-null FK (rather than
    // @MapsId) mirrors the DDL, which gives this table its own independent
    // auto-increment id alongside a separate unique shelter_design_id
    // column -- @MapsId would instead require this entity's id to equal the
    // shelter design's id, which does not match the actual schema shape.
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shelter_design_id", nullable = false, unique = true)
    private ShelterDesign shelterDesign;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "material_id", nullable = false)
    private Material material;

    @Column(name = "mass_kg", nullable = false, precision = 10, scale = 2)
    private BigDecimal massKg;

    @Column(name = "surface_area_m2", nullable = false, precision = 8, scale = 2)
    private BigDecimal surfaceAreaM2;

    // See config.js THERMAL_MASS_EXPOSURE_H_VALUES.
    @Enumerated(EnumType.STRING)
    @Column(name = "exposure", nullable = false, length = 10)
    private Exposure exposure = Exposure.FLOOR;

    @Enumerated(EnumType.STRING)
    @Column(name = "location_in_shelter", length = 20)
    private LocationInShelter locationInShelter = LocationInShelter.FLOOR;

    // Derived read-convenience flag only -- the engine always resolves PCM
    // parameters from the linked Material (pcmMeltTempC/pcmLatentHeatJKg),
    // never from an instance-level override, so no PCM columns live here.
    @Column(name = "is_pcm", nullable = false)
    private boolean isPcm = false;

    public enum Exposure {
        FLOOR, WALL, DEDICATED, BURIED
    }

    public enum LocationInShelter {
        FLOOR, WALL_INTERNAL, DEDICATED_MASS_WALL, OTHER
    }
}
