package com.areatherm.design;

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
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A named comfort/temperature band a {@link ShelterDesign} is evaluated
 * against (human occupancy, agricultural produce, livestock, ...). Kept in
 * this package, alongside {@code ShelterDesign}, rather than a package of
 * its own -- a design references exactly one comfort_profile via FK.
 */
@Entity
@Table(name = "comfort_profile")
@Getter
@Setter
@NoArgsConstructor
public class ComfortProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Enumerated(EnumType.STRING)
    @Column(name = "profile_type", nullable = false, length = 20)
    private ProfileType profileType;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "comfort_min_c", nullable = false, precision = 5, scale = 2)
    private BigDecimal comfortMinC;

    @Column(name = "comfort_max_c", nullable = false, precision = 5, scale = 2)
    private BigDecimal comfortMaxC;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    public enum ProfileType {
        HUMAN_OCCUPANCY, AGRI_PRODUCE, LIVESTOCK, SEED_STORAGE, NURSERY, EQUIPMENT, CUSTOM
    }
}
