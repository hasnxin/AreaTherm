package com.areatherm.design;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ThermalMassRepository extends JpaRepository<ThermalMass, Long> {

    Optional<ThermalMass> findByShelterDesignId(Long shelterDesignId);

    /** Bulk fetch across many designs' thermal-mass rows (0..1 each) in one query -- see ShelterDesignRepository#findByIdInWithMaterials. */
    List<ThermalMass> findByShelterDesignIdIn(List<Long> shelterDesignIds);
}
