package com.areatherm.climate;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClimateProfileMonthlyRepository extends JpaRepository<ClimateProfileMonthly, Long> {

    List<ClimateProfileMonthly> findByClimateProfileIdOrderByMonthNumberAsc(Long climateProfileId);
}
