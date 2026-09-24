package com.areatherm.optimization;

import com.areatherm.optimization.model.*;
import com.areatherm.thermal.ThermalEngine;
import com.areatherm.thermal.model.*;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.BiFunction;

import static com.areatherm.thermal.ThermalEngine.*;

/**
 * Faithful port of app/js/engine.js's optimizer (generateCandidates,
 * scoreCandidate, runOptimization, sensitivityAnalysis,
 * recommendWindowLayout) -- zero framework dependencies, same as
 * ThermalEngine (enforced by the same ArchUnit test).
 *
 * Explicitly NOT ported: the client-side ML surrogate (opts.broaderSearch
 * pre-screening in the JS engine) -- this backend's runOptimization always
 * takes the deterministic 567-candidate grid-search path and always
 * reports usedMlScreening=false, per the approved plan's ml/ package scope.
 */
public final class OptimizationEngine {

    private OptimizationEngine() {
    }

    // ---- Fixed candidate systems (ids match app/js/engine.js exactly) -----
    private record SystemId(String materialId, double insulationThicknessMm) {
    }

    private record MassOptionId(String materialId, double massKg) {
    }

    private static final List<SystemId> WALL_SYSTEM_IDS = List.of(
        new SystemId("wall_stone", 50), new SystemId("wall_stone", 100),
        new SystemId("wall_brick", 75), new SystemId("wall_adobe", 50),
        new SystemId("wall_rammed_earth", 50), new SystemId("wall_mud_block", 50),
        new SystemId("wall_aac", 75), new SystemId("wall_insulated_panel", 50),
        new SystemId("wall_composite", 75), new SystemId("wall_concrete", 100)
    );
    private static final List<SystemId> ROOF_SYSTEM_IDS = List.of(
        new SystemId("roof_rcc", 50), new SystemId("roof_rcc", 100),
        new SystemId("roof_metal", 50), new SystemId("roof_insulated_metal", 50),
        new SystemId("roof_composite", 50), new SystemId("roof_earth", 50)
    );
    // Arrays.asList (not List.of) -- the first entry is a real null, matching
    // JS's MASS_OPTIONS[0]=null ("no thermal mass"); List.of forbids null elements.
    private static final List<MassOptionId> MASS_OPTION_IDS = Arrays.asList(
        null,
        new MassOptionId("mass_stone", 900), new MassOptionId("mass_water", 900),
        new MassOptionId("mass_pcm", 400), new MassOptionId("mass_composite", 900),
        new MassOptionId("mass_earth", 1600), new MassOptionId("mass_concrete", 900)
    );
    private static final List<String> SECONDARY_ORIENTATIONS = List.of("SOUTH", "SE", "SW", "EAST");
    private static final List<Double> SECONDARY_WINDOW_PCT = List.of(0.08, 0.12, 0.16, 0.20);
    private static final List<String> SECONDARY_GLAZINGS = List.of("glaze_single", "glaze_double", "glaze_triple", "glaze_lowe");
    private static final int ENVELOPE_FINALISTS = 1;

    // ---- Candidate construction --------------------------------------------
    private record ResolvedSystem(MaterialProperties material, double thicknessMm, double insulationThicknessMm) {
    }

    private static ResolvedSystem resolveSystem(MaterialCatalog catalog, SystemId id, double defaultThicknessFallback) {
        MaterialProperties mat = catalog.get(id.materialId());
        double thicknessMm = orDefault(mat.defaultThicknessMm(), defaultThicknessFallback);
        return new ResolvedSystem(mat, thicknessMm, id.insulationThicknessMm());
    }

    private record BuiltCandidate(Design design, CandidateParams params) {
    }

    private static BuiltCandidate buildCandidate(Design baseDesign, MaterialCatalog catalog,
                                                  ResolvedSystem wallSys, SystemId wallSysId,
                                                  ResolvedSystem roofSys, SystemId roofSysId,
                                                  String orient, double wpct, String glzId,
                                                  MassOptionId massOpt) {
        CompassOrientation orientation;
        double azimuthDeg;
        switch (orient) {
            case "SOUTH" -> { orientation = CompassOrientation.SOUTH; azimuthDeg = 0; }
            case "EAST" -> { orientation = CompassOrientation.EAST; azimuthDeg = 90; }
            case "SE" -> { orientation = CompassOrientation.CUSTOM; azimuthDeg = 45; }
            case "SW" -> { orientation = CompassOrientation.CUSTOM; azimuthDeg = 315; }
            default -> throw new IllegalArgumentException("Unknown secondary orientation key: " + orient);
        }

        MaterialProperties insPuf = catalog.get("ins_puf");
        MaterialProperties wallInsMat = baseDesign.wall().insulationMaterial() != null ? baseDesign.wall().insulationMaterial() : insPuf;
        MaterialProperties roofInsMat = baseDesign.roof().insulationMaterial() != null ? baseDesign.roof().insulationMaterial() : insPuf;

        EnvelopeLayer wall = new EnvelopeLayer(wallSys.material(), wallSys.thicknessMm(), wallInsMat, wallSys.insulationThicknessMm());
        EnvelopeLayer roof = new EnvelopeLayer(roofSys.material(), roofSys.thicknessMm(), roofInsMat, roofSys.insulationThicknessMm());

        Design withEnvelope = withWallRoofOrientation(baseDesign, wall, roof, orientation, azimuthDeg);

        SimulationResult.Geometry geom0 = ThermalEngine.computeGeometry(withEnvelope);
        double targetWindowArea = geom0.wallArea() * wpct;
        MaterialProperties glz = catalog.get(glzId);
        Opening window = new Opening(round2(targetWindowArea), 1, OpeningFace.FRONT, glz);

        ThermalMassSpec thermalMass = massOpt == null ? null : new ThermalMassSpec(
            catalog.get(massOpt.materialId()), massOpt.massKg(),
            Math.min(geom0.floorArea(), massOpt.massKg() / 300.0), MassExposure.FLOOR
        );

        Design finalDesign = withWindowsAndMass(withEnvelope, List.of(window), thermalMass);

        CandidateParams params = new CandidateParams(
            orient, wallSysId.insulationThicknessMm(), wpct, glzId,
            massOpt != null ? massOpt.massKg() : 0, wallSysId.materialId(), roofSysId.materialId(),
            massOpt != null ? massOpt.materialId() : null
        );
        return new BuiltCandidate(finalDesign, params);
    }

    private static Design withWallRoofOrientation(Design d, EnvelopeLayer wall, EnvelopeLayer roof, CompassOrientation orientation, double azimuthDeg) {
        return new Design(
            d.name(), d.shape(), d.length(), d.width(), d.height(), d.diameter(),
            d.lengthA(), d.widthA(), d.lengthB(), d.widthB(),
            orientation, azimuthDeg, wall, roof, d.floor(), d.windows(), d.doors(),
            d.airLeakageAch(), d.thermalMass(), d.occupancy(), d.occupancyActivity(),
            d.internalHeatGainW(), d.groundTempC(), d.comfort(), d.occupancySchedule()
        );
    }

    private static Design withWindowsAndMass(Design d, List<Opening> windows, ThermalMassSpec thermalMass) {
        return new Design(
            d.name(), d.shape(), d.length(), d.width(), d.height(), d.diameter(),
            d.lengthA(), d.widthA(), d.lengthB(), d.widthB(),
            d.orientation(), d.azimuthDeg(), d.wall(), d.roof(), d.floor(), windows, d.doors(),
            d.airLeakageAch(), thermalMass, d.occupancy(), d.occupancyActivity(),
            d.internalHeatGainW(), d.groundTempC(), d.comfort(), d.occupancySchedule()
        );
    }

    private static MassOptionId massOptionByMaterialId(String materialId) {
        if (materialId == null) return null;
        for (MassOptionId m : MASS_OPTION_IDS) {
            if (m != null && m.materialId().equals(materialId)) return m;
        }
        return null;
    }

    // Snap baseDesign's own current secondary settings onto the fixed option
    // sets, so Stage 1 searches wall x roof against what the shelter actually
    // has right now, not an arbitrary default.
    private static String currentOrientationKey(Design baseDesign) {
        double az = ThermalEngine.frontAzimuthOf(baseDesign);
        String[][] options = {{"SOUTH", "0"}, {"SE", "45"}, {"EAST", "90"}, {"SW", "315"}};
        String best = options[0][0];
        double bestAz = Double.parseDouble(options[0][1]);
        for (String[] opt : options) {
            double optAz = Double.parseDouble(opt[1]);
            double diff = Math.min(Math.abs(az - optAz), 360 - Math.abs(az - optAz));
            double bestDiff = Math.min(Math.abs(az - bestAz), 360 - Math.abs(az - bestAz));
            if (diff < bestDiff) { best = opt[0]; bestAz = optAz; }
        }
        return best;
    }

    private static double currentWindowPctOf(Design baseDesign) {
        SimulationResult.Geometry geom = ThermalEngine.computeGeometry(baseDesign);
        List<Opening> windows = baseDesign.windows() == null ? List.of() : baseDesign.windows();
        double windowArea = windows.stream().mapToDouble(Opening::totalArea).sum();
        double raw = geom.wallArea() > 0 ? windowArea / geom.wallArea() : 0.12;
        double best = SECONDARY_WINDOW_PCT.get(0);
        for (double b : SECONDARY_WINDOW_PCT) {
            if (Math.abs(b - raw) < Math.abs(best - raw)) best = b;
        }
        return best;
    }

    private static String currentGlazingOf(Design baseDesign) {
        List<Opening> windows = baseDesign.windows();
        String glzId = (windows != null && !windows.isEmpty() && windows.get(0).glazingMaterial() != null)
            ? windows.get(0).glazingMaterial().id() : null;
        // glzId is legitimately null when a window has no glazing material set
        // (nullable at the API level - CreateShelterDesignRequest.OpeningRequest
        // doesn't require one). List.of(...).contains(null) throws NPE in Java,
        // unlike JS's Array.includes(null), which just returns false - guard it
        // explicitly rather than relying on short-circuiting inside .contains().
        return glzId != null && SECONDARY_GLAZINGS.contains(glzId) ? glzId : "glaze_double";
    }

    private static MassOptionId currentMassOptionOf(Design baseDesign) {
        if (baseDesign.thermalMass() == null || !(baseDesign.thermalMass().massKg() > 0)) return null;
        MassOptionId byId = massOptionByMaterialId(baseDesign.thermalMass().material().id());
        return byId != null ? byId : MASS_OPTION_IDS.get(1);
    }

    private record EnvelopePair(SystemId wallSysId, SystemId roofSysId, ResolvedSystem wallSys, ResolvedSystem roofSys) {
    }

    private static List<EnvelopePairCandidate> buildEnvelopeCandidates(Design baseDesign, MaterialCatalog catalog) {
        String orient = currentOrientationKey(baseDesign);
        double wpct = currentWindowPctOf(baseDesign);
        String glz = currentGlazingOf(baseDesign);
        MassOptionId massOpt = currentMassOptionOf(baseDesign);
        List<EnvelopePairCandidate> out = new ArrayList<>();
        for (SystemId wallSysId : WALL_SYSTEM_IDS) {
            ResolvedSystem wallSys = resolveSystem(catalog, wallSysId, 300);
            for (SystemId roofSysId : ROOF_SYSTEM_IDS) {
                ResolvedSystem roofSys = resolveSystem(catalog, roofSysId, 150);
                BuiltCandidate c = buildCandidate(baseDesign, catalog, wallSys, wallSysId, roofSys, roofSysId, orient, wpct, glz, massOpt);
                out.add(new EnvelopePairCandidate(new EnvelopePair(wallSysId, roofSysId, wallSys, roofSys), c));
            }
        }
        return out;
    }

    private record EnvelopePairCandidate(EnvelopePair pair, BuiltCandidate candidate) {
    }

    private static List<BuiltCandidate> buildSecondaryCandidates(Design baseDesign, MaterialCatalog catalog, EnvelopePair pair) {
        List<BuiltCandidate> out = new ArrayList<>();
        for (String orient : SECONDARY_ORIENTATIONS) {
            for (double wpct : SECONDARY_WINDOW_PCT) {
                for (String glz : SECONDARY_GLAZINGS) {
                    for (MassOptionId massOpt : MASS_OPTION_IDS) {
                        out.add(buildCandidate(baseDesign, catalog, pair.wallSys(), pair.wallSysId(), pair.roofSys(), pair.roofSysId(), orient, wpct, glz, massOpt));
                    }
                }
            }
        }
        return out;
    }

    // ---- Evaluation + scoring -----------------------------------------------
    private record Evaluated(Design design, CandidateParams params, SimulationResult result, long cost) {
    }

    private static Evaluated evaluate(BuiltCandidate c, Season season, SimConfig simConfig) {
        SimulationResult result = ThermalEngine.runSimulation(c.design(), season, simConfig);
        // No optimization-candidate consumer ever reads a per-candidate hourly
        // series -- dropping it here mirrors the JS `delete result.series`
        // (there, a localStorage-quota concern; here, no reason to keep
        // ~500 full series in memory/response either).
        SimulationResult withoutSeries = new SimulationResult(
            result.geometry(), result.uValues(), result.netWallArea(), result.windowArea(), result.doorArea(),
            List.of(), result.ach(), result.occupancy(), result.daily(), result.comfort(), result.scores()
        );
        long cost = ThermalEngine.estimateCost(c.design());
        return new Evaluated(c.design(), c.params(), withoutSeries, cost);
    }

    private record Range(double min, double max) {
    }

    private static Range costRangeOf(List<Evaluated> list) {
        return new Range(list.stream().mapToLong(Evaluated::cost).min().orElse(0), list.stream().mapToLong(Evaluated::cost).max().orElse(0));
    }

    private static Range energyRangeOf(List<Evaluated> list) {
        List<Double> demands = list.stream().map(e -> e.result().daily().heatingReqKwh() + e.result().daily().coolingReqKwh()).toList();
        return new Range(demands.stream().mapToDouble(Double::doubleValue).min().orElse(0), demands.stream().mapToDouble(Double::doubleValue).max().orElse(0));
    }

    public static ScoreBreakdown scoreCandidate(SimulationResult result, long cost, Weights weights, Range costRange, Range energyRange) {
        double comfort = result.scores().comfortScore();
        double retention = result.scores().heatRetentionPct();
        double solar = result.scores().solarUtilizationPct();
        double energyDemand = result.daily().heatingReqKwh() + result.daily().coolingReqKwh();
        Range effectiveEnergyRange = energyRange != null ? energyRange : new Range(energyDemand * 0.7, energyDemand * 1.3);
        double energyScore = effectiveEnergyRange.max() > effectiveEnergyRange.min()
            ? clamp(100 * (1 - (energyDemand - effectiveEnergyRange.min()) / (effectiveEnergyRange.max() - effectiveEnergyRange.min())), 0, 100)
            : 100;
        double costScore = costRange.max() > costRange.min()
            ? clamp(100 * (1 - (cost - costRange.min()) / (costRange.max() - costRange.min())), 0, 100)
            : 100;
        double total = weights.comfort() * comfort + weights.retention() * retention + weights.solar() * solar +
            weights.energy() * energyScore + weights.cost() * costScore;
        return new ScoreBreakdown(comfort, retention, solar, energyScore, costScore, energyDemand, round2(total));
    }

    private static double totalScoreOf(Evaluated e, Range costRange, Range energyRange, Weights weights) {
        return scoreCandidate(e.result(), e.cost(), weights, costRange, energyRange).total();
    }

    /**
     * Staged block-coordinate-ascent search: Stage 1 wall x roof (60) pinned
     * to baseDesign's own current secondary settings; Stage 2 full secondary
     * cross-product (448) for the Stage 1 winner; Stage 3 re-opens the
     * envelope axis (remaining 59 pairs) against the best secondary combo
     * found so far. 567 total candidates -- see engine.js generateCandidates.
     */
    private static List<Evaluated> generateCandidates(Design baseDesign, Season season, SimConfig simConfig, Weights weights, MaterialCatalog catalog) {
        List<EnvelopePairCandidate> stage1Pairs = buildEnvelopeCandidates(baseDesign, catalog);
        record Stage1Zipped(EnvelopePair pair, Evaluated e) {
        }
        List<Stage1Zipped> stage1Zipped = stage1Pairs.stream()
            .map(p -> new Stage1Zipped(p.pair(), evaluate(p.candidate(), season, simConfig)))
            .toList();
        List<Evaluated> stage1 = stage1Zipped.stream().map(Stage1Zipped::e).toList();

        Range r1cost = costRangeOf(stage1), r1energy = energyRangeOf(stage1);
        record ScoredFinalist(EnvelopePair pair, Evaluated e, double total) {
        }
        List<ScoredFinalist> finalists = stage1Zipped.stream()
            .map(z -> new ScoredFinalist(z.pair(), z.e(), totalScoreOf(z.e(), r1cost, r1energy, weights)))
            .sorted((a, b) -> Double.compare(b.total(), a.total()))
            .limit(ENVELOPE_FINALISTS)
            .toList();

        List<Evaluated> stage2 = new ArrayList<>();
        for (ScoredFinalist f : finalists) {
            for (BuiltCandidate c : buildSecondaryCandidates(baseDesign, catalog, f.pair())) {
                stage2.add(evaluate(c, season, simConfig));
            }
        }

        List<Evaluated> pooled12 = new ArrayList<>(stage1);
        pooled12.addAll(stage2);
        Range r12cost = costRangeOf(pooled12), r12energy = energyRangeOf(pooled12);
        Evaluated winner = null;
        double winnerTotal = Double.NEGATIVE_INFINITY;
        for (Evaluated e : pooled12) {
            double t = totalScoreOf(e, r12cost, r12energy, weights);
            if (winner == null || t > winnerTotal) { winner = e; winnerTotal = t; }
        }
        CandidateParams winnerParams = winner.params();
        MassOptionId winnerMassOpt = massOptionByMaterialId(winnerParams.massMat());

        List<Evaluated> stage3 = new ArrayList<>();
        for (SystemId wallSysId : WALL_SYSTEM_IDS) {
            ResolvedSystem wallSys = resolveSystem(catalog, wallSysId, 300);
            for (SystemId roofSysId : ROOF_SYSTEM_IDS) {
                boolean isFinalist = finalists.stream().anyMatch(f -> f.pair().wallSysId().equals(wallSysId) && f.pair().roofSysId().equals(roofSysId));
                if (isFinalist) continue;
                ResolvedSystem roofSys = resolveSystem(catalog, roofSysId, 150);
                BuiltCandidate c = buildCandidate(baseDesign, catalog, wallSys, wallSysId, roofSys, roofSysId,
                    winnerParams.orient(), winnerParams.wpct(), winnerParams.glz(), winnerMassOpt);
                stage3.add(evaluate(c, season, simConfig));
            }
        }

        List<Evaluated> all = new ArrayList<>(stage1);
        all.addAll(stage2);
        all.addAll(stage3);
        return all;
    }

    /**
     * Always takes the deterministic grid-search path -- the client-side ML
     * surrogate pre-screening (opts.broaderSearch in engine.js) is not
     * ported (see class javadoc). broaderSearchRequested is accepted and
     * honored as "fell back to grid search", never silently dropped.
     */
    public static OptimizationResult runOptimization(Design baseDesign, Season season, SimConfig simConfig,
                                                       Weights weights, MaterialCatalog catalog,
                                                       boolean broaderSearchRequested) {
        List<Evaluated> evaluated = generateCandidates(baseDesign, season, simConfig, weights, catalog);
        Range costRange = costRangeOf(evaluated), energyRange = energyRangeOf(evaluated);

        record WithScore(Evaluated e, ScoreBreakdown score) {
        }
        List<WithScore> scored = evaluated.stream()
            .map(e -> new WithScore(e, scoreCandidate(e.result(), e.cost(), weights, costRange, energyRange)))
            .sorted((a, b) -> Double.compare(b.score().total(), a.score().total()))
            .toList();

        String[] labels = {"A", "B", "C", "D", "E"};
        List<OptimizationResult.ScoredCandidate> all = new ArrayList<>();
        for (int i = 0; i < scored.size(); i++) {
            WithScore w = scored.get(i);
            String label = i < labels.length ? labels[i] : null;
            all.add(new OptimizationResult.ScoredCandidate(
                w.e().design(), w.e().params(), w.e().result(), w.e().cost(), w.score(), i + 1, label, i == 0
            ));
        }
        List<OptimizationResult.ScoredCandidate> top = all.subList(0, Math.min(5, all.size()));
        return new OptimizationResult(all.size(), top, top.isEmpty() ? null : top.get(0), all, false, null);
    }

    // ---- Sensitivity analysis -------------------------------------------
    public static SensitivityResult sensitivityAnalysis(Design baseDesign, Season season, SimConfig simConfig,
                                                          Weights weights, MaterialCatalog catalog) {
        SimulationResult baseResult = ThermalEngine.runSimulation(baseDesign, season, simConfig);
        long baseCost = ThermalEngine.estimateCost(baseDesign);
        double baseScore = scoreCandidate(baseResult, baseCost, weights, new Range(baseCost * 0.7, baseCost * 1.3), null).total();

        record Perturbation(String key, java.util.function.UnaryOperator<Design> apply) {
        }
        List<Perturbation> perturbations = List.of(
            new Perturbation("Insulation thickness", d -> new Design(
                d.name(), d.shape(), d.length(), d.width(), d.height(), d.diameter(), d.lengthA(), d.widthA(), d.lengthB(), d.widthB(),
                d.orientation(), d.azimuthDeg(),
                new EnvelopeLayer(d.wall().material(), d.wall().thicknessMm(), d.wall().insulationMaterial(), orDefault(d.wall().insulationThicknessMm(), 75) + 50),
                new EnvelopeLayer(d.roof().material(), d.roof().thicknessMm(), d.roof().insulationMaterial(), orDefault(d.roof().insulationThicknessMm(), 75) + 50),
                d.floor(), d.windows(), d.doors(), d.airLeakageAch(), d.thermalMass(), d.occupancy(), d.occupancyActivity(),
                d.internalHeatGainW(), d.groundTempC(), d.comfort(), d.occupancySchedule()
            )),
            new Perturbation("Orientation", d -> withWallRoofOrientation(d, d.wall(), d.roof(), CompassOrientation.SOUTH, 0.0)),
            new Perturbation("Window area", d -> withWindowsAndMass(d,
                d.windows().stream().map(w -> new Opening(w.areaEach() * 1.5, w.count(), w.face(), w.glazingMaterial())).toList(),
                d.thermalMass())),
            new Perturbation("Thermal mass", d -> withWindowsAndMass(d, d.windows(),
                new ThermalMassSpec(catalog.get("mass_composite"), 1200, 6, MassExposure.FLOOR))),
            new Perturbation("Wall material", d -> new Design(
                d.name(), d.shape(), d.length(), d.width(), d.height(), d.diameter(), d.lengthA(), d.widthA(), d.lengthB(), d.widthB(),
                d.orientation(), d.azimuthDeg(),
                new EnvelopeLayer(catalog.get("wall_composite"), d.wall().thicknessMm(), d.wall().insulationMaterial(), d.wall().insulationThicknessMm()),
                d.roof(), d.floor(), d.windows(), d.doors(), d.airLeakageAch(), d.thermalMass(), d.occupancy(), d.occupancyActivity(),
                d.internalHeatGainW(), d.groundTempC(), d.comfort(), d.occupancySchedule()
            )),
            new Perturbation("Glazing type", d -> withWindowsAndMass(d,
                d.windows().stream().map(w -> new Opening(w.areaEach(), w.count(), w.face(), catalog.get("glaze_triple"))).toList(),
                d.thermalMass())),
            new Perturbation("Shelter volume", d -> new Design(
                d.name(), d.shape(), d.length(), d.width(), orDefault(d.height(), 3) * 1.15, d.diameter(), d.lengthA(), d.widthA(), d.lengthB(), d.widthB(),
                d.orientation(), d.azimuthDeg(), d.wall(), d.roof(), d.floor(), d.windows(), d.doors(),
                d.airLeakageAch(), d.thermalMass(), d.occupancy(), d.occupancyActivity(),
                d.internalHeatGainW(), d.groundTempC(), d.comfort(), d.occupancySchedule()
            ))
        );

        List<SensitivityResult.ParameterImpact> impacts = new ArrayList<>();
        for (Perturbation p : perturbations) {
            Design d = p.apply().apply(baseDesign);
            SimulationResult result = ThermalEngine.runSimulation(d, season, simConfig);
            long cost = ThermalEngine.estimateCost(d);
            double score = scoreCandidate(result, cost, weights, new Range(cost * 0.7, cost * 1.3), null).total();
            impacts.add(new SensitivityResult.ParameterImpact(p.key(), round2(score - baseScore)));
        }
        impacts.sort((a, b) -> Double.compare(Math.abs(b.deltaScore()), Math.abs(a.deltaScore())));
        return new SensitivityResult(round2(baseScore), impacts);
    }

    // ---- Window placement recommendation --------------------------------
    public static WindowLayoutResult recommendWindowLayout(Design design, Season season, SimConfig simConfig) {
        if (season == null) return null;
        SimulationResult.Geometry geom = ThermalEngine.computeGeometry(design, season.latitude());
        List<Opening> groups = design.windows() == null ? List.of() : design.windows();
        double totalArea = groups.stream().mapToDouble(Opening::totalArea).sum();
        int totalCount = groups.stream().mapToInt(Opening::count).sum();
        if (!(totalArea > 0)) return null;
        double typicalSize = totalCount > 0 ? totalArea / totalCount : 1.2;
        MaterialProperties glazingMaterial = !groups.isEmpty() && groups.get(0).glazingMaterial() != null ? groups.get(0).glazingMaterial() : null;

        record FaceOffset(OpeningFace face, double offset) {
        }
        List<FaceOffset> offsets = List.of(
            new FaceOffset(OpeningFace.FRONT, 0), new FaceOffset(OpeningFace.BACK, 180),
            new FaceOffset(OpeningFace.LEFT, -90), new FaceOffset(OpeningFace.RIGHT, 90)
        );
        record RankedFace(OpeningFace face, double factor) {
        }
        List<RankedFace> ranked = offsets.stream()
            .map(o -> new RankedFace(o.face(), faceFactor(geom.frontAzimuth(), o.offset(), season.latitude())))
            .sorted((a, b) -> Double.compare(b.factor(), a.factor()))
            .toList();
        OpeningFace best = ranked.get(0).face(), second = ranked.get(1).face(), third = ranked.get(2).face();

        record Share(OpeningFace face, double area) {
        }
        BiFunction<List<Share>, MaterialProperties, List<Opening>> toGroups = (shares, glz) -> shares.stream()
            .filter(s -> s.area() > 0.05)
            .map(s -> {
                int count = Math.max(1, (int) Math.round(s.area() / typicalSize));
                return new Opening(round2(s.area() / count), count, s.face(), glz);
            })
            .toList();

        record LayoutCandidate(String label, List<Opening> groups) {
        }
        List<LayoutCandidate> candidates = List.of(
            new LayoutCandidate("Current layout", groups),
            new LayoutCandidate("All on " + best, toGroups.apply(List.of(new Share(best, totalArea)), glazingMaterial)),
            new LayoutCandidate(best + " + " + second + " split", toGroups.apply(
                List.of(new Share(best, totalArea * 0.7), new Share(second, totalArea * 0.3)), glazingMaterial)),
            new LayoutCandidate("Spread across " + best + "/" + second + "/" + third, toGroups.apply(
                List.of(new Share(best, totalArea / 3), new Share(second, totalArea / 3), new Share(third, totalArea / 3)), glazingMaterial))
        );

        List<WindowLayoutResult.Option> evaluated = new ArrayList<>();
        for (LayoutCandidate c : candidates) {
            Design d = withWindowsAndMass(design, c.groups(), design.thermalMass());
            SimulationResult result;
            try {
                result = ThermalEngine.runSimulation(d, season, simConfig);
            } catch (RuntimeException e) {
                continue;
            }
            evaluated.add(new WindowLayoutResult.Option(c.label(), c.groups(), result.scores().thermalComfortScore()));
        }
        if (evaluated.isEmpty()) return null;

        WindowLayoutResult.Option current = evaluated.stream().filter(e -> e.label().equals("Current layout")).findFirst().orElse(null);
        List<WindowLayoutResult.Option> ranked2 = evaluated.stream()
            .sorted((a, b) -> Integer.compare(b.score(), a.score()))
            .toList();
        return new WindowLayoutResult(current, ranked2.get(0), ranked2);
    }
}
