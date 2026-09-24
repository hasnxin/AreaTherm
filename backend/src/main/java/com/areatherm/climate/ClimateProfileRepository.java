package com.areatherm.climate;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClimateProfileRepository extends JpaRepository<ClimateProfile, Long> {

    List<ClimateProfile> findByLocationId(Long locationId);
}
