package com.areatherm.optimizationrun;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OptimizationRunRepository extends JpaRepository<OptimizationRun, Long> {

    List<OptimizationRun> findByProjectId(Long projectId);
}
