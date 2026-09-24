package com.areatherm.design;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShelterDesignRepository extends JpaRepository<ShelterDesign, Long> {

    List<ShelterDesign> findByProjectId(Long projectId);

    boolean existsByProjectId(Long projectId);

    /**
     * Lightweight row for a project's shelter-design list view. Resolves the
     * wall material's name in the same query instead of leaving
     * {@link ShelterDesign#getWallMaterial()} lazy and N+1-ing it per row.
     * Not wired into any controller yet (no service/controller layer
     * exists) -- this is a repository-level example of the DTO-projection
     * pattern a future list endpoint should follow.
     */
    @Query(
            "select new com.areatherm.design.ShelterDesignSummary(d.id, d.name, d.shape, wm.name) "
                    + "from ShelterDesign d "
                    + "left join d.wallMaterial wm "
                    + "where d.project.id = :projectId "
                    + "order by d.name asc")
    List<ShelterDesignSummary> findSummariesByProjectId(@Param("projectId") Long projectId);

    /**
     * Single-design summary resolving all three primary envelope materials
     * (wall/roof/floor) up front, e.g. for a design detail header that would
     * otherwise trigger three separate lazy fetches.
     */
    @Query(
            "select new com.areatherm.design.ShelterDesignMaterialsSummary("
                    + "d.id, d.name, wm.name, rm.name, fm.name) "
                    + "from ShelterDesign d "
                    + "left join d.wallMaterial wm "
                    + "left join d.roofMaterial rm "
                    + "left join d.floorMaterial fm "
                    + "where d.id = :id")
    Optional<ShelterDesignMaterialsSummary> findMaterialsSummaryById(@Param("id") Long id);

    /**
     * Bulk fetch across many designs (e.g. an optimization run's ~567
     * candidates) in one query, with wall/roof/wall-insulation/roof-
     * insulation materials eagerly joined so a caller reading those
     * associations for every returned design never N+1's -- one query
     * total regardless of how many ids are passed. Opening and ThermalMass
     * child rows are a separate 1:many / 1:0..1 relationship each, so they
     * are batch-fetched separately (see OpeningRepository#findByShelterDesignIdInWithGlazing,
     * ThermalMassRepository#findByShelterDesignIdIn) rather than folded into
     * this same query, which would otherwise multiply rows per opening.
     */
    @Query(
            "select d from ShelterDesign d "
                    + "left join fetch d.wallMaterial "
                    + "left join fetch d.roofMaterial "
                    + "left join fetch d.wallInsulationMaterial "
                    + "left join fetch d.roofInsulationMaterial "
                    + "where d.id in :ids")
    List<ShelterDesign> findByIdInWithMaterials(@Param("ids") List<Long> ids);
}

/**
 * Repository-local projection DTOs for {@link ShelterDesignRepository}'s
 * summary queries (see the JPA persistence-layer task's list/summary-query
 * guidance) -- package-private, not intended for reuse outside this
 * repository. Declared as additional top-level types in this file (rather
 * than nested inside the interface) so the JPQL "select new ..." class name
 * is an unambiguous top-level binary name.
 */
record ShelterDesignSummary(Long id, String name, ShelterDesign.Shape shape, String wallMaterialName) {
}

record ShelterDesignMaterialsSummary(
        Long id, String name, String wallMaterialName, String roofMaterialName, String floorMaterialName) {
}
