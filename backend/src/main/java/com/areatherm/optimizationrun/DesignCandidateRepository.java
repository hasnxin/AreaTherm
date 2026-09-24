package com.areatherm.optimizationrun;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DesignCandidateRepository extends JpaRepository<DesignCandidate, Long> {

    List<DesignCandidate> findByOptimizationRunIdOrderByLabelAsc(Long optimizationRunId);
}
