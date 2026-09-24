package com.areatherm.api;

import com.areatherm.material.Material;
import com.areatherm.material.MaterialLibraryService;
import com.areatherm.material.MaterialRepository;
import com.areatherm.material.dto.CreateMaterialRequest;
import com.areatherm.material.dto.MaterialResponse;
import com.areatherm.material.dto.UpdateMaterialRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/v1/materials")
@Tag(name = "Materials")
public class MaterialController {

    private final MaterialRepository materialRepository;
    private final MaterialLibraryService materialLibraryService;

    public MaterialController(MaterialRepository materialRepository, MaterialLibraryService materialLibraryService) {
        this.materialRepository = materialRepository;
        this.materialLibraryService = materialLibraryService;
    }

    @GetMapping
    @Operation(summary = "List materials, optionally filtered by category",
            description = "category is optional; omitting it returns every material regardless of category.")
    public List<MaterialResponse> list(@RequestParam(required = false) Material.MaterialCategory category) {
        List<Material> materials = category != null
                ? materialLibraryService.listByCategory(category)
                : materialRepository.findAll();
        return materials.stream().map(MaterialResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add a custom material",
            description = "Always persisted with isCustom=true, isEngineeringDbValue=false regardless of request content.")
    public MaterialResponse create(@Valid @RequestBody CreateMaterialRequest request) {
        Material material = new Material();
        applyCommonFields(material, request.slug(), request.category(), request.name(),
                request.densityKgM3(), request.thermalConductivityWMk(), request.specificHeatJKgK(),
                request.defaultThicknessMm(), request.uValueWM2k(), request.solarAbsorptivity(),
                request.solarReflectivity(), request.emissivity(), request.shgc(),
                request.pcmMeltTempC(), request.pcmLatentHeatJKg(), request.moistureNotes(),
                request.costEstimateInrPerUnit(), request.sustainabilityIndicator(), request.version());

        // Never trust client input for provenance flags -- a POSTed material
        // is always custom and always unverified against the engineering DB.
        material.setCustom(true);
        material.setEngineeringDbValue(false);

        return MaterialResponse.from(materialRepository.save(material));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit any material's engineering values",
            description = "Works on engineering-DB materials too, not just custom ones. isCustom/isEngineeringDbValue are left untouched.")
    public MaterialResponse update(@PathVariable Long id, @Valid @RequestBody UpdateMaterialRequest request) {
        Material material = materialRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Material " + id + " not found"));

        applyCommonFields(material, request.slug(), request.category(), request.name(),
                request.densityKgM3(), request.thermalConductivityWMk(), request.specificHeatJKgK(),
                request.defaultThicknessMm(), request.uValueWM2k(), request.solarAbsorptivity(),
                request.solarReflectivity(), request.emissivity(), request.shgc(),
                request.pcmMeltTempC(), request.pcmLatentHeatJKg(), request.moistureNotes(),
                request.costEstimateInrPerUnit(), request.sustainabilityIndicator(), request.version());
        // isCustom / isEngineeringDbValue intentionally untouched -- see
        // UpdateMaterialRequest's javadoc.

        return MaterialResponse.from(materialRepository.save(material));
    }

    /**
     * Shared create/update field mapping. {@code sustainabilityIndicator}
     * and {@code version} are NOT NULL columns with a default -- when the
     * request omits them, the existing value (or, for a new Material, the
     * entity's Java-side default) is left in place rather than being reset,
     * since setting a NOT NULL column to null would fail at the DB level
     * anyway. Every other field here is nullable, so it is always set
     * exactly as given, null included, matching PUT's full-replace semantics.
     */
    private void applyCommonFields(Material material, String slug, Material.MaterialCategory category, String name,
                                    BigDecimal densityKgM3, BigDecimal thermalConductivityWMk,
                                    BigDecimal specificHeatJKgK, BigDecimal defaultThicknessMm,
                                    BigDecimal uValueWM2k, BigDecimal solarAbsorptivity,
                                    BigDecimal solarReflectivity, BigDecimal emissivity,
                                    BigDecimal shgc, BigDecimal pcmMeltTempC,
                                    BigDecimal pcmLatentHeatJKg, String moistureNotes,
                                    BigDecimal costEstimateInrPerUnit,
                                    Material.SustainabilityIndicator sustainabilityIndicator, String version) {
        material.setSlug(slug);
        material.setCategory(category);
        material.setName(name);
        material.setDensityKgM3(densityKgM3);
        material.setThermalConductivityWMk(thermalConductivityWMk);
        material.setSpecificHeatJKgK(specificHeatJKgK);
        material.setDefaultThicknessMm(defaultThicknessMm);
        material.setUValueWM2k(uValueWM2k);
        material.setSolarAbsorptivity(solarAbsorptivity);
        material.setSolarReflectivity(solarReflectivity);
        material.setEmissivity(emissivity);
        material.setShgc(shgc);
        material.setPcmMeltTempC(pcmMeltTempC);
        material.setPcmLatentHeatJKg(pcmLatentHeatJKg);
        material.setMoistureNotes(moistureNotes);
        material.setCostEstimateInrPerUnit(costEstimateInrPerUnit);
        if (sustainabilityIndicator != null) {
            material.setSustainabilityIndicator(sustainabilityIndicator);
        }
        if (version != null && !version.isBlank()) {
            material.setVersion(version);
        }
    }
}
