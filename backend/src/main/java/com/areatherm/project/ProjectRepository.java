package com.areatherm.project;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, Long> {

    List<Project> findByOwnerId(Long ownerId);

    /** Used to scope a single-project lookup (e.g. delete) to its owner: a project owned by someone else is treated as not found. */
    Optional<Project> findByIdAndOwnerId(Long id, Long ownerId);
}
