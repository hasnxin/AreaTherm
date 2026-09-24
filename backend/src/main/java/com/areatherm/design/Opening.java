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
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "opening")
@Getter
@Setter
@NoArgsConstructor
public class Opening {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shelter_design_id", nullable = false)
    private ShelterDesign shelterDesign;

    @Enumerated(EnumType.STRING)
    @Column(name = "opening_type", nullable = false, length = 10)
    private OpeningType openingType;

    @Column(name = "count", nullable = false)
    private int count = 1;

    @Column(name = "area_each_m2", nullable = false, precision = 6, scale = 2)
    private BigDecimal areaEachM2;

    // Stores the engine's own relative-face labels (FRONT/BACK/LEFT/RIGHT
    // for a rectangular design; CURVED_WALL/L_WALL for the single-face
    // round/L-shape geometries) rather than compass points -- this is what
    // runSimulation's per-face opening-area matching actually keys on
    // (openingAreaByFace / solidFaceAreas). Storing compass directions here
    // would require a lossy compass-to-face translation layer at the API
    // boundary for no benefit.
    @Enumerated(EnumType.STRING)
    @Column(name = "orientation", nullable = false, length = 15)
    private OpeningOrientation orientation;

    @Column(name = "azimuth_deg", precision = 5, scale = 1)
    private BigDecimal azimuthDeg;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "glazing_material_id")
    private Material glazingMaterial;

    public enum OpeningType {
        WINDOW, DOOR, VENT
    }

    public enum OpeningOrientation {
        FRONT, BACK, LEFT, RIGHT, CURVED_WALL, L_WALL
    }
}
