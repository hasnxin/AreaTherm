package com.areatherm.climate;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClimateProfileHourlyRepository extends JpaRepository<ClimateProfileHourly, Long> {

    // Deliberately paged -- a climate profile's hourly series can run to
    // thousands of rows and must never be loaded via an unbounded List.
    Page<ClimateProfileHourly> findByClimateProfileIdOrderByTsOffsetMinutesAsc(
            Long climateProfileId, Pageable pageable);
}
