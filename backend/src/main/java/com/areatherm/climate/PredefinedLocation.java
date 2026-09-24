package com.areatherm.climate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Curated site-selection shortcuts shown in the location picker (Guided
 * Setup step 1 and the Location &amp; Climate screen) -- distinct from
 * {@link Location}, which is a location actually attached to a project.
 */
@Entity
@Table(name = "predefined_location")
@Getter
@Setter
@NoArgsConstructor
public class PredefinedLocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "slug", nullable = false, unique = true, length = 50)
    private String slug;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "latitude", nullable = false, precision = 8, scale = 5)
    private BigDecimal latitude;

    @Column(name = "longitude", nullable = false, precision = 8, scale = 5)
    private BigDecimal longitude;

    @Column(name = "elevation_m")
    private Integer elevationM;

    @Column(name = "region", length = 100)
    private String region;

    // Free-text grouping label ('Cold desert', 'Gangetic plain', ...) -- no
    // CHECK constraint in the DDL, so this stays a plain String, not an enum.
    @Column(name = "category", length = 50)
    private String category;

    @Column(name = "has_illustrative_profile", nullable = false)
    private boolean hasIllustrativeProfile = false;
}
