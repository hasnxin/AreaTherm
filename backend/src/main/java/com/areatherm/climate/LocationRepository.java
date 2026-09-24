package com.areatherm.climate;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocationRepository extends JpaRepository<Location, Long> {

    List<Location> findByProjectId(Long projectId);

    boolean existsByProjectId(Long projectId);
}
