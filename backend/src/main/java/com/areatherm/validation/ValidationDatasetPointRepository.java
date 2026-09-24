package com.areatherm.validation;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ValidationDatasetPointRepository extends JpaRepository<ValidationDatasetPoint, Long> {

    Page<ValidationDatasetPoint> findByValidationDatasetIdOrderByTsAsc(Long validationDatasetId, Pageable pageable);
}
