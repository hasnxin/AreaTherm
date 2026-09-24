package com.areatherm.material;

import com.areatherm.optimization.model.MaterialCatalog;
import com.areatherm.thermal.model.MaterialProperties;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Bridges the material JPA entity to the physics engine's plain
 * MaterialProperties value object -- the ONLY place that mapping happens,
 * so thermal/optimization never need to know Material (or JPA) exists.
 * Small, largely-static table read on every simulation -- cached.
 */
@Service
public class MaterialLibraryService {

    private final MaterialRepository repository;

    public MaterialLibraryService(MaterialRepository repository) {
        this.repository = repository;
    }

    /** Builds the full resolved catalog the optimizer needs once per run (never looked up per-candidate). */
    @Cacheable("materialCatalog")
    public MaterialCatalog buildCatalog() {
        Map<String, MaterialProperties> bySlug = repository.findAll().stream()
            .collect(Collectors.toMap(Material::getSlug, MaterialLibraryService::toMaterialProperties));
        return new MaterialCatalog(bySlug);
    }

    public MaterialProperties requireBySlug(String slug) {
        return toMaterialProperties(requireEntityBySlug(slug));
    }

    /** For the reverse (physics-record -> entity) direction -- e.g. persisting an optimizer candidate as a real ShelterDesign row. */
    public Material requireEntityBySlug(String slug) {
        return repository.findBySlug(slug)
            .orElseThrow(() -> new IllegalArgumentException("Unknown material slug: " + slug));
    }

    public List<Material> listByCategory(Material.MaterialCategory category) {
        return repository.findByCategory(category);
    }

    /**
     * Maps the entity's single, unit-switching cost_estimate_inr_per_unit
     * column (per-m2 for every category except THERMAL_MASS, per-kg for
     * THERMAL_MASS -- matches app/js/data.js's costPerM2/costPerKg split)
     * into MaterialProperties' two separate, always-unambiguous fields.
     */
    static MaterialProperties toMaterialProperties(Material m) {
        boolean isMass = m.getCategory() == Material.MaterialCategory.THERMAL_MASS;
        Double costPerM2 = !isMass ? toDouble(m.getCostEstimateInrPerUnit()) : null;
        Double costPerKg = isMass ? toDouble(m.getCostEstimateInrPerUnit()) : null;
        return new MaterialProperties(
            m.getSlug(), m.getCategory().name(),
            toDouble(m.getDensityKgM3()), toDouble(m.getThermalConductivityWMk()), toDouble(m.getSpecificHeatJKgK()),
            toDouble(m.getDefaultThicknessMm()), toDouble(m.getSolarAbsorptivity()), toDouble(m.getSolarReflectivity()),
            toDouble(m.getEmissivity()), toDouble(m.getUValueWM2k()), toDouble(m.getShgc()),
            toDouble(m.getPcmMeltTempC()), toDouble(m.getPcmLatentHeatJKg()),
            costPerM2, costPerKg, m.getSustainabilityIndicator().name()
        );
    }

    private static Double toDouble(BigDecimal v) {
        return v != null ? v.doubleValue() : null;
    }
}
