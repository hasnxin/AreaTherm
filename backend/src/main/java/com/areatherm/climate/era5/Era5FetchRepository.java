package com.areatherm.climate.era5;

import java.math.BigDecimal;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface Era5FetchRepository extends JpaRepository<Era5Fetch, Long> {

    Optional<Era5Fetch> findByLatitudeAndLongitudeAndYearAndMonth(BigDecimal latitude, BigDecimal longitude, int year, int month);
}
