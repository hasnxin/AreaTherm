package com.areatherm.thermal;

import com.areatherm.thermal.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.util.Iterator;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Verifies ThermalEngine against real outputs captured from the actual
 * app/js/engine.js (see src/test/resources/physics/physics_fixtures.json
 * and the scratchpad's generate_physics_fixtures.js that produced it) --
 * this is the concrete proof the Java port didn't change the physics.
 *
 * Field-by-field, not just headline scores -- a wrong ventilation term and
 * a wrong solar-to-mass fraction could otherwise coincidentally cancel out
 * in thermalComfortScore alone.
 */
class ThermalEngineGoldenFileTest {

    private static final double TOL = 0.05; // JS values are already round2()'d to 2dp

    private final ObjectMapper mapper = new ObjectMapper();

    private static ActivityLevelSpec seated() {
        return new ActivityLevelSpec("SEATED", "Resting / Seated", 120, 0.75);
    }

    private static ActivityLevelSpec sleeping() {
        return new ActivityLevelSpec("SLEEPING", "Sleeping", 85, 0.90);
    }

    /** Matches tools/generate_physics_fixtures.js's observationPostSchedule() exactly. */
    private static List<OccupancyScheduleEntry> observationPostSchedule() {
        List<OccupancyScheduleEntry> sched = new java.util.ArrayList<>();
        for (int h = 0; h < 24; h++) {
            sched.add((h >= 6 && h < 22) ? new OccupancyScheduleEntry(2, seated()) : new OccupancyScheduleEntry(1, sleeping()));
        }
        return sched;
    }

    /** app/js/store.js's defaultDesign() -- the reference baseline used for every fixture except the PCM/round variants. */
    private static Design baselineDesign() {
        EnvelopeLayer wall = new EnvelopeLayer(TestMaterials.wallInsulatedPanel(), 186, TestMaterials.insPuf(), 35.0);
        EnvelopeLayer roof = new EnvelopeLayer(TestMaterials.roofInsulatedMetal(), 101, TestMaterials.insPuf(), 69.0);
        FloorLayer floor = new FloorLayer(TestMaterials.wallConcrete(), 100.0);
        Opening window = new Opening(2.91, 1, OpeningFace.FRONT, TestMaterials.glazeSingle());
        Opening door = new Opening(1.8, 1, OpeningFace.FRONT, null);
        ThermalMassSpec mass = new ThermalMassSpec(TestMaterials.massConcrete(), 1622, 5.406666666666666, MassExposure.FLOOR);
        ComfortSpec comfort = new ComfortSpec(15, 27);
        return new Design(
            "Baseline Shelter", Shape.RECTANGULAR, 6.0, 4.0, 3.0, null,
            null, null, null, null,
            CompassOrientation.SOUTH, 0.0,
            wall, roof, floor, List.of(window), List.of(door),
            0.8, mass, 2, seated(), 150, null, comfort, null
        );
    }

    private static Season winterSeason() {
        return new Season(4.4, 16.1, 5.4, 5.9, 18.9, 2.3, 33, 20, 34.15, -2.75, null, null);
    }

    private static Season summerSeason() {
        return new Season(12.0, 28.5, 7.2, 5.2, 19.6, 1.8, 28, 15, 34.15, -2.75, null, null);
    }

    private JsonNode fixtures() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/physics/physics_fixtures.json")) {
            assertNotNull(in, "physics_fixtures.json must be on the test classpath");
            return mapper.readTree(in);
        }
    }

    /** Mirrors generate_physics_fixtures.js's summarize() exactly, so the two are directly comparable. */
    private ObjectNode toComparableJson(SimulationResult result) {
        ObjectNode node = mapper.valueToTree(result);
        node.remove("series");
        node.put("seriesLength", result.series().size());
        List<Integer> sampleIdx = List.of(0, result.series().size() / 4, result.series().size() / 2, result.series().size() - 1);
        var sample = mapper.createArrayNode();
        for (int i : sampleIdx) sample.add(mapper.valueToTree(result.series().get(i)));
        node.set("seriesSample", sample);
        node.remove("name");
        return node;
    }

    /** Collects every mismatch (does not stop at the first) so a real divergence's full extent is visible at once. */
    private void collectDiffs(String path, JsonNode expected, JsonNode actual, List<String> diffs) {
        if (expected == null || expected.isNull()) {
            if (!(actual == null || actual.isNull())) diffs.add(path + ": expected null, got " + actual);
        } else if (expected.isObject()) {
            if (actual == null || !actual.isObject()) { diffs.add(path + ": expected object, got " + actual); return; }
            Iterator<String> names = expected.fieldNames();
            while (names.hasNext()) {
                String name = names.next();
                if (name.equals("name")) continue;
                collectDiffs(path + "." + name, expected.get(name), actual.get(name), diffs);
            }
        } else if (expected.isArray()) {
            if (actual == null || !actual.isArray() || expected.size() != actual.size()) {
                diffs.add(path + ": array size expected " + expected.size() + " got " + (actual == null ? "null" : actual.size()));
                return;
            }
            for (int i = 0; i < expected.size(); i++) collectDiffs(path + "[" + i + "]", expected.get(i), actual.get(i), diffs);
        } else if (expected.isNumber()) {
            if (actual == null || !actual.isNumber() || Math.abs(expected.asDouble() - actual.asDouble()) > TOL) {
                diffs.add(path + ": expected " + expected.asDouble() + " got " + (actual == null ? "null" : actual.asDouble()));
            }
        } else if (expected.isBoolean()) {
            if (actual == null || expected.asBoolean() != actual.asBoolean()) diffs.add(path + ": expected " + expected.asBoolean() + " got " + actual);
        } else {
            if (actual == null || !expected.asText().equals(actual.asText())) diffs.add(path + ": expected " + expected.asText() + " got " + actual);
        }
    }

    private void assertJsonClose(String path, JsonNode expected, JsonNode actual) {
        List<String> diffs = new java.util.ArrayList<>();
        collectDiffs(path, expected, actual, diffs);
        if (!diffs.isEmpty()) fail(diffs.size() + " mismatch(es):\n" + String.join("\n", diffs));
    }

    @Test
    void fixture0_60min_winter_baseline() throws Exception {
        SimulationResult result = ThermalEngine.runSimulation(baselineDesign(), winterSeason(), new SimConfig(60, SimConfig.PeriodType.TWENTY_FOUR_HOUR, 1));
        assertJsonClose("fixture0", fixtures().get("fixture0_60min_winter_baseline"), toComparableJson(result));
        // The exact headline numbers already independently verified earlier this session.
        assertEquals(69, result.scores().thermalComfortScore());
        assertEquals(41.27, result.scores().comfortScore(), TOL);
        assertEquals(5.97, result.comfort().minIndoor(), TOL);
        assertEquals(23.79, result.comfort().maxIndoor(), TOL);
    }

    @Test
    void fixture1_15min_winter_rectangular_catchesIntegerDivisionRisk() throws Exception {
        SimulationResult result = ThermalEngine.runSimulation(baselineDesign(), winterSeason(), new SimConfig(15, SimConfig.PeriodType.TWENTY_FOUR_HOUR, 1));
        assertEquals(96, result.series().size(), "24h at 15-min steps must be 96 steps");
        assertJsonClose("fixture1", fixtures().get("fixture1_15min_winter_rectangular"), toComparableJson(result));
    }

    @Test
    void fixture2_60min_winter_pcm_mass() throws Exception {
        Design base = baselineDesign();
        Design pcmDesign = new Design(
            base.name(), base.shape(), base.length(), base.width(), base.height(), base.diameter(),
            base.lengthA(), base.widthA(), base.lengthB(), base.widthB(),
            base.orientation(), base.azimuthDeg(), base.wall(), base.roof(), base.floor(), base.windows(), base.doors(),
            base.airLeakageAch(), new ThermalMassSpec(TestMaterials.massPcm(), 400, 5, MassExposure.WALL),
            base.occupancy(), base.occupancyActivity(), base.internalHeatGainW(), base.groundTempC(), base.comfort(), null
        );
        SimulationResult result = ThermalEngine.runSimulation(pcmDesign, winterSeason(), new SimConfig(60, SimConfig.PeriodType.TWENTY_FOUR_HOUR, 1));
        assertJsonClose("fixture2", fixtures().get("fixture2_60min_winter_pcm"), toComparableJson(result));
    }

    @Test
    void fixture3_60min_winter_round_shape() throws Exception {
        Design base = baselineDesign();
        Design roundDesign = new Design(
            base.name(), Shape.CIRCULAR, null, null, base.height(), 6.0,
            base.lengthA(), base.widthA(), base.lengthB(), base.widthB(),
            base.orientation(), base.azimuthDeg(), base.wall(), base.roof(), base.floor(), base.windows(), base.doors(),
            base.airLeakageAch(), base.thermalMass(), base.occupancy(), base.occupancyActivity(),
            base.internalHeatGainW(), base.groundTempC(), base.comfort(), null
        );
        SimulationResult result = ThermalEngine.runSimulation(roundDesign, winterSeason(), new SimConfig(60, SimConfig.PeriodType.TWENTY_FOUR_HOUR, 1));
        assertJsonClose("fixture3", fixtures().get("fixture3_60min_winter_round"), toComparableJson(result));
    }

    @Test
    void fixture4_60min_summer_coolingDominant() throws Exception {
        SimulationResult result = ThermalEngine.runSimulation(baselineDesign(), summerSeason(), new SimConfig(60, SimConfig.PeriodType.TWENTY_FOUR_HOUR, 1));
        assertTrue(result.daily().coolingReqKwh() > 0, "summer fixture must exercise the cooling-dominant path");
        assertJsonClose("fixture4", fixtures().get("fixture4_60min_summer_rectangular"), toComparableJson(result));
    }

    /**
     * Exercises Design.occupancySchedule() -- an observation-post pattern
     * (2 persons SEATED 06:00-22:00, 1 person SLEEPING overnight),
     * deliberately different from the flat baseline (occupancy=2, SEATED
     * always) so this actually proves the hour-varying path, not just that
     * it falls back correctly. Captured from the real app/js/engine.js by
     * tools/generate_physics_fixtures.js -- see that script's
     * observationPostSchedule() for the exact JS-side equivalent.
     */
    @Test
    void fixture5_60min_winter_occupancySchedule() throws Exception {
        Design base = baselineDesign();
        Design scheduleDesign = new Design(
            base.name(), base.shape(), base.length(), base.width(), base.height(), base.diameter(),
            base.lengthA(), base.widthA(), base.lengthB(), base.widthB(),
            base.orientation(), base.azimuthDeg(), base.wall(), base.roof(), base.floor(), base.windows(), base.doors(),
            base.airLeakageAch(), base.thermalMass(), base.occupancy(), base.occupancyActivity(),
            base.internalHeatGainW(), base.groundTempC(), base.comfort(), observationPostSchedule()
        );
        SimulationResult result = ThermalEngine.runSimulation(scheduleDesign, winterSeason(), new SimConfig(60, SimConfig.PeriodType.TWENTY_FOUR_HOUR, 1));
        assertTrue(result.occupancy().scheduled(), "schedule-bearing design must report occupancy.scheduled=true");
        assertJsonClose("fixture5", fixtures().get("fixture5_60min_winter_occupancySchedule"), toComparableJson(result));
    }
}
