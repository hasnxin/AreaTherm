package com.areatherm.design;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OpeningRepository extends JpaRepository<Opening, Long> {

    List<Opening> findByShelterDesignId(Long shelterDesignId);

    /**
     * Bulk fetch across many designs' openings in one query, with
     * glazingMaterial eagerly joined so a caller mapping many designs at
     * once (e.g. an optimization run's ~567 candidates) never lazy-loads
     * glazing material per opening. See {@link ShelterDesignRepository#findByIdInWithMaterials}.
     */
    @Query("select o from Opening o left join fetch o.glazingMaterial where o.shelterDesign.id in :shelterDesignIds")
    List<Opening> findByShelterDesignIdInWithGlazing(@Param("shelterDesignIds") List<Long> shelterDesignIds);
}
