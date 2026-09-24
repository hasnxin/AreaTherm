package com.areatherm.design;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ComfortProfileRepository extends JpaRepository<ComfortProfile, Long> {

    List<ComfortProfile> findByProjectId(Long projectId);
}
