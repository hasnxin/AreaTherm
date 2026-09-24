package com.areatherm.climate;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PredefinedLocationRepository extends JpaRepository<PredefinedLocation, Long> {

    Optional<PredefinedLocation> findBySlug(String slug);
}
