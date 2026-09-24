package com.areatherm.validation;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ValidationDatasetRepository extends JpaRepository<ValidationDataset, Long> {

    List<ValidationDataset> findByProjectId(Long projectId);
}
