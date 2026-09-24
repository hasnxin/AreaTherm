package com.areatherm.material;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MaterialRepository extends JpaRepository<Material, Long> {

    List<Material> findByCategory(Material.MaterialCategory category);

    Optional<Material> findBySlug(String slug);
}
