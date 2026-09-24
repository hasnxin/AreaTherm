package com.areatherm.simulation;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SimulationRepository extends JpaRepository<Simulation, Long> {

    List<Simulation> findByProjectId(Long projectId);

    List<Simulation> findByShelterDesignId(Long shelterDesignId);
}
