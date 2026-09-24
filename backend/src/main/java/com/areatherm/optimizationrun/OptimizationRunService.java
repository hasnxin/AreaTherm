package com.areatherm.optimizationrun;

import com.areatherm.climate.ClimateProfile;
import com.areatherm.climate.ClimateProfileRepository;
import com.areatherm.climate.ClimateProfileService;
import com.areatherm.design.Opening;
import com.areatherm.design.OpeningRepository;
import com.areatherm.design.ShelterDesign;
import com.areatherm.design.ShelterDesignRepository;
import com.areatherm.design.ShelterDesignService;
import com.areatherm.design.ThermalMass;
import com.areatherm.design.ThermalMassRepository;
import com.areatherm.material.Material;
import com.areatherm.material.MaterialLibraryService;
import com.areatherm.ml.SurrogatePredictor;
import com.areatherm.optimization.OptimizationEngine;
import com.areatherm.optimization.model.MaterialCatalog;
import com.areatherm.optimization.model.OptimizationResult;
import com.areatherm.optimization.model.Weights;
import com.areatherm.project.Project;
import com.areatherm.project.ProjectRepository;
import com.areatherm.thermal.ThermalEngine;
import com.areatherm.thermal.model.Design;
import com.areatherm.thermal.model.SimConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Orchestrates an optimization run: loads the base design/climate profile,
 * builds the resolved MaterialCatalog OptimizationEngine's 567-candidate
 * search needs, runs it, and persists every evaluated candidate as a real
 * ShelterDesign + DesignCandidate row (design_candidate.shelter_design_id
 * is NOT NULL -- see DesignCandidate's javadoc for why most never get a
 * full Simulation too).
 */
@Service
public class OptimizationRunService {

    private static final Logger log = LoggerFactory.getLogger(OptimizationRunService.class);
    private static final String[] TOP_LABELS = {"A", "B", "C", "D", "E"};

    private final OptimizationRunRepository optimizationRunRepository;
    private final DesignCandidateRepository designCandidateRepository;
    private final ShelterDesignRepository shelterDesignRepository;
    private final OpeningRepository openingRepository;
    private final ThermalMassRepository thermalMassRepository;
    private final ClimateProfileRepository climateProfileRepository;
    private final ProjectRepository projectRepository;
    private final ShelterDesignService shelterDesignService;
    private final ClimateProfileService climateProfileService;
    private final MaterialLibraryService materialLibraryService;
    private final SurrogatePredictor surrogatePredictor;

    public OptimizationRunService(OptimizationRunRepository optimizationRunRepository,
                                   DesignCandidateRepository designCandidateRepository,
                                   ShelterDesignRepository shelterDesignRepository,
                                   OpeningRepository openingRepository,
                                   ThermalMassRepository thermalMassRepository,
                                   ClimateProfileRepository climateProfileRepository,
                                   ProjectRepository projectRepository,
                                   ShelterDesignService shelterDesignService,
                                   ClimateProfileService climateProfileService,
                                   MaterialLibraryService materialLibraryService,
                                   SurrogatePredictor surrogatePredictor) {
        this.optimizationRunRepository = optimizationRunRepository;
        this.designCandidateRepository = designCandidateRepository;
        this.shelterDesignRepository = shelterDesignRepository;
        this.openingRepository = openingRepository;
        this.thermalMassRepository = thermalMassRepository;
        this.climateProfileRepository = climateProfileRepository;
        this.projectRepository = projectRepository;
        this.shelterDesignService = shelterDesignService;
        this.climateProfileService = climateProfileService;
        this.materialLibraryService = materialLibraryService;
        this.surrogatePredictor = surrogatePredictor;
    }

    @Transactional
    public OptimizationRun createQueued(Long projectId, Long baseShelterDesignId, Long climateProfileId,
                                         int timeStepMinutes, SimConfig.PeriodType periodType,
                                         Weights weights, boolean broaderSearchRequested) {
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown project: " + projectId));
        ShelterDesign baseDesign = shelterDesignRepository.findById(baseShelterDesignId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown shelter design: " + baseShelterDesignId));
        ClimateProfile climateProfile = climateProfileRepository.findById(climateProfileId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown climate profile: " + climateProfileId));

        if (broaderSearchRequested) {
            // Accepted, not rejected -- the ml/ package's surrogate is a
            // deliberate stub this round (see SurrogatePredictor.isAvailable()),
            // so every request falls back to the deterministic grid search,
            // exactly like the frontend's own opts.broaderSearch does when
            // window.APP_ML.isAvailable() is false. usedMlScreening stays
            // FALSE regardless of what was requested.
            log.info("broaderSearch requested for project {} but no surrogate is configured -- using the grid search", projectId);
        }

        OptimizationRun run = new OptimizationRun();
        run.setProject(project);
        run.setBaseShelterDesign(baseDesign);
        run.setClimateProfile(climateProfile);
        run.setTimeStepMinutes(timeStepMinutes);
        run.setPeriodType(periodType);
        run.setWeightComfort(BigDecimal.valueOf(weights.comfort()));
        run.setWeightRetention(BigDecimal.valueOf(weights.retention()));
        run.setWeightSolar(BigDecimal.valueOf(weights.solar()));
        run.setWeightEnergy(BigDecimal.valueOf(weights.energy()));
        run.setWeightCost(BigDecimal.valueOf(weights.cost()));
        run.setUsedMlScreening(false);
        run.setStatus(OptimizationRun.Status.QUEUED);
        return optimizationRunRepository.save(run);
    }

    // See SimulationService.runAsync's javadoc for why this whole method
    // needs one ambient transaction: it runs on its own @Async thread, and
    // without one, every lazy association (design materials, opening
    // glazing, etc.) traversed after the first repository call has already
    // returned would fail with LazyInitializationException.
    @Async("engineTaskExecutor")
    @Transactional
    public void runAsync(Long optimizationRunId) {
        OptimizationRun run = optimizationRunRepository.findById(optimizationRunId).orElse(null);
        if (run == null) {
            log.warn("runAsync: optimization run {} no longer exists", optimizationRunId);
            return;
        }
        run.setStatus(OptimizationRun.Status.RUNNING);
        optimizationRunRepository.save(run);

        try {
            Design baseDesign = shelterDesignService.toDesign(run.getBaseShelterDesign());
            var season = climateProfileService.toSeason(run.getClimateProfile());
            // No start/end window on optimization_run (unlike simulation) --
            // days is derived from periodType alone; SEASONAL uses a
            // documented ~3-month approximation, CUSTOM defaults to 1 in the
            // absence of any other window to derive it from.
            int days = switch (run.getPeriodType()) {
                case TWENTY_FOUR_HOUR -> 1;
                case SEVEN_DAY -> 7;
                case THIRTY_DAY -> 30;
                case SEASONAL -> 90;
                case CUSTOM -> 1;
            };
            SimConfig simConfig = new SimConfig(run.getTimeStepMinutes(), run.getPeriodType(), days);
            Weights weights = new Weights(
                run.getWeightComfort().doubleValue(), run.getWeightRetention().doubleValue(),
                run.getWeightSolar().doubleValue(), run.getWeightEnergy().doubleValue(), run.getWeightCost().doubleValue()
            );
            MaterialCatalog catalog = materialLibraryService.buildCatalog();

            OptimizationResult result = OptimizationEngine.runOptimization(
                baseDesign, season, simConfig, weights, catalog, surrogatePredictor.isAvailable()
            );

            persistCandidates(run, result);

            run.setCandidatesEvaluated(result.candidatesEvaluated());
            run.setStatus(OptimizationRun.Status.COMPLETE);
            optimizationRunRepository.save(run);
        } catch (Exception e) {
            log.error("Optimization run {} failed", optimizationRunId, e);
            run.setStatus(OptimizationRun.Status.FAILED);
            optimizationRunRepository.save(run);
        }
    }

    @Transactional
    protected void persistCandidates(OptimizationRun run, OptimizationResult result) {
        List<OptimizationResult.ScoredCandidate> all = result.all();
        for (int i = 0; i < all.size(); i++) {
            OptimizationResult.ScoredCandidate c = all.get(i);
            ShelterDesign persistedDesign = shelterDesignService.persistFromDesign(
                c.design(), run.getBaseShelterDesign().getName() + " (candidate " + c.rank() + ")",
                run.getProject(), run.getBaseShelterDesign().getComfortProfile()
            );

            DesignCandidate dc = new DesignCandidate();
            dc.setOptimizationRun(run);
            dc.setLabel(c.label() != null ? c.label() : String.valueOf(c.rank()));
            dc.setShelterDesign(persistedDesign);
            dc.setComfortScore(BigDecimal.valueOf(c.score().comfort()));
            dc.setRetentionScore(BigDecimal.valueOf(c.score().retention()));
            dc.setSolarScore(BigDecimal.valueOf(c.score().solar()));
            dc.setEnergyScore(BigDecimal.valueOf(c.score().energyScore()));
            dc.setCostScore(BigDecimal.valueOf(c.score().costScore()));
            dc.setWeightedTotalScore(BigDecimal.valueOf(c.score().total()));
            dc.setEstimatedCostInr(BigDecimal.valueOf(c.cost()));
            dc.setRecommended(c.isRecommended());
            designCandidateRepository.save(dc);
        }
    }

    public Optional<OptimizationRun> findById(Long id) {
        return optimizationRunRepository.findById(id);
    }

    public List<DesignCandidate> getCandidates(Long optimizationRunId) {
        return designCandidateRepository.findByOptimizationRunIdOrderByLabelAsc(optimizationRunId);
    }

    /**
     * Bulk-computes a lightweight design summary (material slugs, orientation,
     * insulation thickness, window area/percentage, thermal mass) for every
     * candidate in {@code candidates}, keyed by DesignCandidate id -- e.g. for
     * a run's full ~567-candidate {@code all} list in the API response.
     * Deliberately NOT one repository call per candidate: the underlying
     * ShelterDesign rows (with materials), Opening rows (with glazing) and
     * ThermalMass rows are each fetched in a single batched query keyed on
     * the full id list, then joined in memory.
     * <p>
     * Re-fetches the OptimizationRun by id (rather than taking the entity a
     * caller may already hold) specifically so {@code run.getBaseShelterDesign()}
     * is a lazy association bound to THIS method's own transaction --
     * a detached run's association would still be tied to whatever
     * (possibly already-closed) session first loaded it.
     */
    @Transactional(readOnly = true)
    public Map<Long, DesignCandidateSummary> getDesignSummaries(Long optimizationRunId, List<DesignCandidate> candidates) {
        if (candidates.isEmpty()) {
            return Map.of();
        }
        OptimizationRun run = optimizationRunRepository.findById(optimizationRunId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown optimization run: " + optimizationRunId));

        List<Long> designIds = candidates.stream().map(c -> c.getShelterDesign().getId()).distinct().toList();

        Map<Long, ShelterDesign> designsById = shelterDesignRepository.findByIdInWithMaterials(designIds).stream()
            .collect(Collectors.toMap(ShelterDesign::getId, d -> d));
        Map<Long, List<Opening>> openingsByDesignId = openingRepository.findByShelterDesignIdInWithGlazing(designIds).stream()
            .collect(Collectors.groupingBy(o -> o.getShelterDesign().getId()));
        Map<Long, ThermalMass> thermalMassByDesignId = thermalMassRepository.findByShelterDesignIdIn(designIds).stream()
            .collect(Collectors.toMap(tm -> tm.getShelterDesign().getId(), tm -> tm));

        // Every candidate in a run shares the base design's shape/dimensions
        // -- OptimizationEngine.buildCandidate only ever varies wall/roof
        // material, orientation, windows and mass, never shape or dimensions
        // -- so total wall area is identical across all of a run's
        // candidates and only needs computing once, from the base design,
        // rather than per candidate.
        Double wallAreaM2 = run.getBaseShelterDesign() != null
            ? ThermalEngine.computeGeometry(shelterDesignService.toDesign(run.getBaseShelterDesign())).wallArea()
            : null;

        Map<Long, DesignCandidateSummary> result = new HashMap<>();
        for (DesignCandidate c : candidates) {
            Long designId = c.getShelterDesign().getId();
            ShelterDesign design = designsById.get(designId);
            if (design == null) {
                continue;
            }
            List<Opening> openings = openingsByDesignId.getOrDefault(designId, List.of());
            ThermalMass thermalMass = thermalMassByDesignId.get(designId);
            result.put(c.getId(), buildDesignSummary(design, openings, thermalMass, wallAreaM2));
        }
        return result;
    }

    private static DesignCandidateSummary buildDesignSummary(ShelterDesign design, List<Opening> openings,
                                                               ThermalMass thermalMass, Double wallAreaM2) {
        List<Opening> windows = openings.stream().filter(o -> o.getOpeningType() == Opening.OpeningType.WINDOW).toList();
        BigDecimal windowAreaM2 = windows.stream()
            .map(o -> o.getAreaEachM2().multiply(BigDecimal.valueOf(o.getCount())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        int windowCount = windows.stream().mapToInt(Opening::getCount).sum();
        String glazingSlug = windows.stream()
            .map(Opening::getGlazingMaterial)
            .filter(m -> m != null)
            .map(Material::getSlug)
            .findFirst().orElse(null);
        Double windowPercentOfWallArea = (wallAreaM2 != null && wallAreaM2 > 0)
            ? windowAreaM2.doubleValue() / wallAreaM2 : null;

        return new DesignCandidateSummary(
            design.getWallMaterial() != null ? design.getWallMaterial().getSlug() : null,
            design.getRoofMaterial() != null ? design.getRoofMaterial().getSlug() : null,
            design.getWallInsulationMaterial() != null ? design.getWallInsulationMaterial().getSlug() : null,
            design.getWallInsulationThicknessMm(),
            design.getRoofInsulationMaterial() != null ? design.getRoofInsulationMaterial().getSlug() : null,
            design.getRoofInsulationThicknessMm(),
            glazingSlug,
            design.getOrientation() != null ? design.getOrientation().name() : null,
            windowAreaM2,
            windowPercentOfWallArea,
            windowCount,
            thermalMass != null ? thermalMass.getMassKg() : null,
            thermalMass != null && thermalMass.getMaterial() != null ? thermalMass.getMaterial().getSlug() : null
        );
    }
}
