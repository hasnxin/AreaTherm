package com.areatherm.thermal;

import com.areatherm.thermal.model.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.ToDoubleFunction;

/**
 * Faithful, function-for-function port of app/js/engine.js's physics
 * (everything up to, but not including, the optimizer -- see
 * com.areatherm.optimization.OptimizationEngine for that). Pure static
 * methods, zero framework dependencies (enforced by an ArchUnit test) --
 * every material/activity-level reference is a pre-resolved value object,
 * never looked up here (see MaterialProperties' javadoc).
 *
 * Do not "improve" any formula here without updating app/js/engine.js
 * first and re-verifying both -- this class's only job is numerical
 * fidelity to the JS engine, verified against real captured JS outputs in
 * src/test/resources/physics (see ThermalEngineGoldenFileTest).
 */
public final class ThermalEngine {

    private ThermalEngine() {
    }

    // ---- Physics constants (see app/js/config.js PHYSICS) -----------------
    private static final double AIR_RHO = 1.2;
    private static final double AIR_CP = 1005.0;
    private static final double H_O = 23.0;
    private static final double MASS_FILM_COEFF_DEFAULT = 8.0;
    private static final double RSI_WALL = 0.13, RSI_ROOF = 0.10, R_GROUND = 0.50;
    private static final double WIND_FILM_COEFF_BASE = 5.8;
    private static final double WIND_FILM_COEFF_PER_MS = 3.9;
    private static final double FURNISHING_CAPACITANCE_FACTOR = 1.0;
    private static final double OCCUPANT_FRESH_AIR_LPS = 7.5;
    private static final double WATER_LATENT_HEAT_J_KG = 2_454_000.0;
    private static final double DOOR_U_VALUE = 1.8; // typical insulated door, documented assumption

    private static final Map<CompassOrientation, Double> ORIENT_OFFSET = Map.of(
        CompassOrientation.SOUTH, 0.0, CompassOrientation.SE, 45.0, CompassOrientation.EAST, 90.0,
        CompassOrientation.NE, 135.0, CompassOrientation.NORTH, 180.0, CompassOrientation.NW, 135.0,
        CompassOrientation.WEST, 90.0, CompassOrientation.SW, 45.0
    );
    private static final double[][] FACTOR_TABLE_HIGH_LAT = {{0, 1.00}, {45, 0.85}, {90, 0.55}, {135, 0.30}, {180, 0.15}};
    private static final double[][] FACTOR_TABLE_LOW_LAT = {{0, 1.00}, {45, 0.90}, {90, 0.75}, {135, 0.55}, {180, 0.35}};
    private static final Map<MassExposure, Double> THERMAL_MASS_EXPOSURE_H_VALUES = Map.of(
        MassExposure.FLOOR, 8.0, MassExposure.WALL, 12.0, MassExposure.DEDICATED, 15.0, MassExposure.BURIED, 6.0
    );

    // ---- Orientation factor table ------------------------------------------
    static double[][] orientationFactorTableForLatitude(Double latitude) {
        if (latitude == null || !Double.isFinite(latitude)) return FACTOR_TABLE_HIGH_LAT;
        double latAbs = Math.abs(latitude);
        double t = clamp((latAbs - 20) / (34 - 20), 0, 1);
        double[][] out = new double[FACTOR_TABLE_HIGH_LAT.length][2];
        for (int i = 0; i < FACTOR_TABLE_HIGH_LAT.length; i++) {
            double[] pt = FACTOR_TABLE_HIGH_LAT[i];
            double[] lowPt = FACTOR_TABLE_LOW_LAT[i];
            out[i][0] = pt[0];
            out[i][1] = lowPt[1] + t * (pt[1] - lowPt[1]);
        }
        return out;
    }

    static double orientationFactorFromAngle(double angle0to180, Double latitude) {
        double[][] table = orientationFactorTableForLatitude(latitude);
        double a = Math.max(0, Math.min(180, angle0to180));
        for (int i = 0; i < table.length - 1; i++) {
            double a0 = table[i][0], f0 = table[i][1];
            double a1 = table[i + 1][0], f1 = table[i + 1][1];
            if (a >= a0 && a <= a1) {
                double t = (a - a0) / (a1 - a0);
                return f0 + t * (f1 - f0);
            }
        }
        return table[table.length - 1][1];
    }

    public static double frontAzimuthOf(Design design) {
        if (design.orientation() == CompassOrientation.CUSTOM) {
            double az = design.azimuthDeg() == null ? 0 : design.azimuthDeg();
            return ((az % 360) + 360) % 360;
        }
        Double off = ORIENT_OFFSET.get(design.orientation());
        return off != null ? off : 0.0;
    }

    public static double faceFactor(double frontAzimuth, double relativeOffsetDeg, Double latitude) {
        double abs = ((frontAzimuth + relativeOffsetDeg) % 360 + 360) % 360;
        double angle = abs <= 180 ? abs : 360 - abs;
        return orientationFactorFromAngle(angle, latitude);
    }

    // ---- Input validation ---------------------------------------------------
    public static ValidationResult validateDesign(Design design) {
        List<String> errors = new ArrayList<>();
        if (design == null) return new ValidationResult(false, List.of("No shelter design is set."));
        boolean isRound = design.shape() == Shape.CIRCULAR || design.shape() == Shape.DOME || design.shape() == Shape.SEMI_CIRCULAR;
        if (isRound) {
            if (!(nz(design.diameter()) > 0)) errors.add("Diameter must be a positive number.");
        } else {
            if (!(nz(design.length()) > 0)) errors.add("Length must be a positive number.");
            if (!(nz(design.width()) > 0) && design.shape() != Shape.SQUARE) errors.add("Width must be a positive number.");
        }
        if (!(nz(design.height()) > 0)) errors.add("Height must be a positive number.");
        if (design.wall() == null || !(design.wall().thicknessMm() > 0)) errors.add("Wall thickness must be a positive number.");
        if (design.roof() == null || !(design.roof().thicknessMm() > 0)) errors.add("Roof thickness must be a positive number.");
        if (design.wall() != null && design.wall().insulationThicknessMm() != null && design.wall().insulationThicknessMm() < 0)
            errors.add("Wall insulation thickness cannot be negative.");
        if (design.roof() != null && design.roof().insulationThicknessMm() != null && design.roof().insulationThicknessMm() < 0)
            errors.add("Roof insulation thickness cannot be negative.");
        if (design.airLeakageAch() != null && design.airLeakageAch() < 0) errors.add("Air leakage (ACH) cannot be negative.");
        if (design.occupancy() < 0) errors.add("Occupancy cannot be negative.");
        List<Opening> windows = design.windows() == null ? List.of() : design.windows();
        for (int i = 0; i < windows.size(); i++) {
            Opening w = windows.get(i);
            if (w.areaEach() < 0) errors.add("Window " + (i + 1) + ": area cannot be negative.");
            if (w.count() < 0) errors.add("Window " + (i + 1) + ": count cannot be negative.");
        }
        List<Opening> doors = design.doors() == null ? List.of() : design.doors();
        for (int i = 0; i < doors.size(); i++) {
            if (doors.get(i).areaEach() < 0) errors.add("Door " + (i + 1) + ": area cannot be negative.");
        }
        if (design.thermalMass() != null && design.thermalMass().massKg() < 0) errors.add("Thermal mass cannot be negative.");
        if (design.comfort() != null) {
            if (!Double.isFinite(design.comfort().min()) || !Double.isFinite(design.comfort().max()))
                errors.add("Comfort range must be numeric.");
            else if (design.comfort().min() >= design.comfort().max())
                errors.add("Comfort minimum must be lower than comfort maximum.");
        }
        return new ValidationResult(errors.isEmpty(), errors);
    }

    public static ValidationResult validateCoordinates(double lat, double lon) {
        List<String> errors = new ArrayList<>();
        if (!Double.isFinite(lat) || lat < -90 || lat > 90) errors.add("Latitude must be a number between -90 and 90.");
        if (!Double.isFinite(lon) || lon < -180 || lon > 180) errors.add("Longitude must be a number between -180 and 180.");
        return new ValidationResult(errors.isEmpty(), errors);
    }

    // ---- Geometry ------------------------------------------------------------
    public static SimulationResult.Geometry computeGeometry(Design design) {
        return computeGeometry(design, null);
    }

    public static SimulationResult.Geometry computeGeometry(Design design, Double latitude) {
        double L = orDefault(design.length(), 6), W = orDefault(design.width(), 4), H = orDefault(design.height(), 3);
        double floorArea, roofArea, perimeter;
        boolean isSemiCircular = design.shape() == Shape.SEMI_CIRCULAR;
        boolean isRound = design.shape() == Shape.CIRCULAR || design.shape() == Shape.DOME || isSemiCircular;
        boolean isLShape = design.shape() == Shape.L_SHAPE;

        if (isRound) {
            // JS: design.diameter || Math.max(L,W) || 5 -- `||` treats 0 as
            // falsy too, so a 0 diameter must fall through, not just null/undefined.
            double maxLW = Math.max(L, W);
            double d = orDefault(design.diameter(), maxLW != 0 ? maxLW : 5);
            double r = d / 2;
            if (isSemiCircular) {
                floorArea = (Math.PI * r * r) / 2;
                perimeter = d + Math.PI * r;
                roofArea = floorArea;
                L = d;
                W = r;
            } else {
                floorArea = Math.PI * r * r;
                perimeter = Math.PI * d;
                roofArea = (design.shape() == Shape.DOME) ? 2 * Math.PI * r * r : floorArea;
                L = d;
                W = d;
            }
        } else if (isLShape) {
            double lA = orDefault(design.lengthA(), 4), wA = orDefault(design.widthA(), 4);
            double lB = orDefault(design.lengthB(), 3), wB = orDefault(design.widthB(), 3);
            floorArea = lA * wA + lB * wB;
            perimeter = 2 * (lA + wA + lB);
            roofArea = floorArea;
            L = lA;
            W = wA;
        } else { // RECTANGULAR / SQUARE / CUSTOM
            if (design.shape() == Shape.SQUARE) W = L;
            floorArea = L * W;
            perimeter = 2 * (L + W);
            roofArea = L * W;
        }

        double volume = floorArea * H;
        double frontAzimuth = frontAzimuthOf(design);
        List<SimulationResult.Face> faces;
        if (isRound) {
            double wallArea = perimeter * H;
            faces = List.of(new SimulationResult.Face("CURVED_WALL", wallArea, faceFactor(frontAzimuth, 0, latitude)));
        } else if (isLShape) {
            double wallArea = perimeter * H;
            faces = List.of(new SimulationResult.Face("L_WALL", wallArea, faceFactor(frontAzimuth, 0, latitude)));
        } else {
            faces = List.of(
                new SimulationResult.Face("FRONT", L * H, faceFactor(frontAzimuth, 0, latitude)),
                new SimulationResult.Face("BACK", L * H, faceFactor(frontAzimuth, 180, latitude)),
                new SimulationResult.Face("LEFT", W * H, faceFactor(frontAzimuth, -90, latitude)),
                new SimulationResult.Face("RIGHT", W * H, faceFactor(frontAzimuth, 90, latitude))
            );
        }
        double wallArea = faces.stream().mapToDouble(SimulationResult.Face::areaM2).sum();
        return new SimulationResult.Geometry(L, W, H, floorArea, roofArea, wallArea, volume, faces, frontAzimuth);
    }

    // ---- U-values --------------------------------------------------------
    private static double layerResistance(MaterialProperties m, double thicknessMm) {
        if (m == null || m.k() == null || m.k() == 0) return 0;
        return (thicknessMm / 1000.0) / m.k();
    }

    public static double wallUValue(Design design) {
        double R = RSI_WALL + 1 / H_O;
        R += layerResistance(design.wall().material(), design.wall().thicknessMm());
        if (design.wall().insulationMaterial() != null && design.wall().insulationThicknessMm() != null) {
            R += layerResistance(design.wall().insulationMaterial(), design.wall().insulationThicknessMm());
        }
        return 1 / R;
    }

    public static double roofUValue(Design design) {
        double R = RSI_ROOF + 1 / H_O;
        R += layerResistance(design.roof().material(), design.roof().thicknessMm());
        if (design.roof().insulationMaterial() != null && design.roof().insulationThicknessMm() != null) {
            R += layerResistance(design.roof().insulationMaterial(), design.roof().insulationThicknessMm());
        }
        return 1 / R;
    }

    public static double floorUValue(Design design) {
        MaterialProperties mat = design.floor().material();
        // JS: design.floor.thicknessMm || 150 -- 0 is falsy too (validateDesign
        // doesn't actually enforce floor thickness > 0, so this fallback is reachable).
        double thicknessMm = orDefault(design.floor().thicknessMm(), 150);
        double R = R_GROUND + ((mat != null && mat.k() != null && mat.k() != 0) ? (thicknessMm / 1000.0) / mat.k() : 0.1);
        return 1 / R;
    }

    public static double windowUValue(Opening win) {
        MaterialProperties g = win.glazingMaterial();
        return (g != null && g.uValue() != null) ? g.uValue() : 2.8;
    }

    public static double windAdjustedInfiltrationAch(Design design, Season season) {
        // JS: (season.windMs || 2) * 0.06 -- a literal 0 windMs is falsy in JS
        // too, so it falls back to the 2 m/s default just like a missing value.
        double windMs = season.windMs() != 0 ? season.windMs() : 2;
        double windFactor = 1 + Math.min(0.6, windMs * 0.06);
        // JS: design.airLeakageAch || 0.6 -- 0 is falsy too, matches orDefault.
        double baseAch = orDefault(design.airLeakageAch(), 0.6);
        return baseAch * windFactor;
    }

    public static double ventUAFromAch(double achV, double volumeM3) {
        return (achV * volumeM3 / 3600.0) * AIR_RHO * AIR_CP;
    }

    // ---- Occupancy heat model ------------------------------------------------
    public static OccupancyHeatResult computeOccupancyHeat(Design design) {
        ActivityLevelSpec activity = design.occupancyActivity();
        int persons = Math.max(0, design.occupancy());
        double totalW = persons * activity.watts();
        double sensibleW = totalW * activity.sensibleFrac();
        double latentW = totalW - sensibleW;
        double equipmentW = Math.max(0, design.internalHeatGainW());
        double totalSensibleW = sensibleW + equipmentW;
        double latentKgPerHour = (latentW * 3600) / WATER_LATENT_HEAT_J_KG;
        return new OccupancyHeatResult(activity, persons, totalW, sensibleW, latentW, equipmentW, totalSensibleW, latentKgPerHour);
    }

    private static Design withOccupancy(Design design, int persons, ActivityLevelSpec activity) {
        return new Design(
            design.name(), design.shape(), design.length(), design.width(), design.height(), design.diameter(),
            design.lengthA(), design.widthA(), design.lengthB(), design.widthB(),
            design.orientation(), design.azimuthDeg(), design.wall(), design.roof(), design.floor(),
            design.windows(), design.doors(), design.airLeakageAch(), design.thermalMass(),
            persons, activity, design.internalHeatGainW(), design.groundTempC(), design.comfort(),
            design.occupancySchedule()
        );
    }

    /**
     * computeOccupancyHeat(design) is pure in design's occupancy/
     * occupancyActivity fields, so when design.occupancySchedule() (24
     * hour-indexed entries) is present, this recomputes it fresh for the
     * given hour -- called from inside runSimulation's loop below instead
     * of hoisting a single call above it, so both occupant heat gain and
     * occupancy-linked ventilation load vary hour by hour, mirroring
     * engine.js's occupancyForHour(). With no schedule this just calls
     * computeOccupancyHeat on the unchanged design every time, reproducing
     * the exact same numbers as computing it once and reusing (verified
     * by the golden fixtures).
     */
    private static OccupancyHeatResult occupancyForHour(Design design, double hourDecimal) {
        List<OccupancyScheduleEntry> sched = design.occupancySchedule();
        if (sched != null && sched.size() == 24) {
            int h = (int) Math.floor(((hourDecimal % 24) + 24) % 24);
            OccupancyScheduleEntry entry = sched.get(h);
            return computeOccupancyHeat(withOccupancy(design, entry.persons(), entry.activity()));
        }
        return computeOccupancyHeat(design);
    }

    private record OccupancySummary(int persons, double avgPersons, String activityLabel, double totalW,
                                     double sensibleW, double latentW, double equipmentW, double latentKgPerHour,
                                     boolean scheduled) {
    }

    /**
     * Schedule-averaged summary for runSimulation's top-level occupancy/ach
     * report fields ONLY -- the loop always uses occupancyForHour for the
     * actual physics, never this. Mirrors engine.js's occSummary.
     */
    private static OccupancySummary occupancySummary(Design design) {
        List<OccupancyScheduleEntry> sched = design.occupancySchedule();
        if (sched != null && sched.size() == 24) {
            List<OccupancyHeatResult> perHour = sched.stream()
                .map(e -> computeOccupancyHeat(withOccupancy(design, e.persons(), e.activity())))
                .toList();
            int peak = perHour.stream().mapToInt(OccupancyHeatResult::persons).max().orElse(0);
            double avgPersons = perHour.stream().mapToInt(OccupancyHeatResult::persons).average().orElse(0);
            double avgTotalW = perHour.stream().mapToDouble(OccupancyHeatResult::totalW).average().orElse(0);
            double avgSensibleW = perHour.stream().mapToDouble(OccupancyHeatResult::sensibleW).average().orElse(0);
            double avgLatentW = perHour.stream().mapToDouble(OccupancyHeatResult::latentW).average().orElse(0);
            double avgLatentKgPerHour = perHour.stream().mapToDouble(OccupancyHeatResult::latentKgPerHour).average().orElse(0);
            double equipmentW = perHour.get(0).equipmentW(); // not schedule-driven, same every hour
            return new OccupancySummary(peak, avgPersons, "Scheduled (varies by hour)", avgTotalW, avgSensibleW, avgLatentW, equipmentW, avgLatentKgPerHour, true);
        }
        OccupancyHeatResult flat = computeOccupancyHeat(design);
        return new OccupancySummary(flat.persons(), flat.persons(), flat.activity().label(), flat.totalW(), flat.sensibleW(),
            flat.latentW(), flat.equipmentW(), flat.latentKgPerHour(), false);
    }

    public static double occupancyAchIncrement(double persons, double volumeM3) {
        if (!(persons > 0) || !(volumeM3 > 0)) return 0;
        double lps = persons * OCCUPANT_FRESH_AIR_LPS;
        double m3PerHour = lps * 3.6;
        return m3PerHour / volumeM3;
    }

    // ---- Diurnal ambient temperature & solar irradiance -------------------
    private static double interpHourly(List<Season.HourlyPoint> hourly, ToDoubleFunction<Season.HourlyPoint> field, double hourDecimal) {
        double h = ((hourDecimal % 24) + 24) % 24;
        int i0 = ((int) Math.floor(h)) % 24;
        int i1 = (i0 + 1) % 24;
        double frac = h - Math.floor(h);
        double v0 = field.applyAsDouble(hourly.get(i0));
        double v1 = field.applyAsDouble(hourly.get(i1));
        return v0 + (v1 - v0) * frac;
    }

    public static double ambientTempAt(Season season, double hourDecimal) {
        if (season.hourly() != null) return interpHourly(season.hourly(), Season.HourlyPoint::temp, hourDecimal);
        double mean = (season.tMin() + season.tMax()) / 2;
        double amp = (season.tMax() - season.tMin()) / 2;
        double rad = ((hourDecimal - 15) / 24) * 2 * Math.PI;
        return mean + amp * Math.cos(rad);
    }

    public static double solarIrradianceAt(Season season, double hourDecimal) {
        if (season.hourly() != null) return Math.max(0, interpHourly(season.hourly(), Season.HourlyPoint::solar, hourDecimal));
        double sunrise = season.sunrise(), sunset = season.sunset(), solarKwhDay = season.solarKwhDay();
        if (hourDecimal <= sunrise || hourDecimal >= sunset) return 0;
        double dayLen = sunset - sunrise;
        double x = (hourDecimal - sunrise) / dayLen;
        double shape = Math.sin(Math.PI * x);
        double peakWm2 = (solarKwhDay * 1000) / (dayLen * (2 / Math.PI));
        return Math.max(0, shape * peakWm2);
    }

    public static double windSpeedAt(Season season, double hourDecimal) {
        if (season.hourly() != null) return Math.max(0, interpHourly(season.hourly(), Season.HourlyPoint::windMs, hourDecimal));
        return Math.max(0, season.windMs());
    }

    static double windAdjustedFilmCoefficient(double windMs) {
        return WIND_FILM_COEFF_BASE + WIND_FILM_COEFF_PER_MS * Math.max(0, windMs);
    }

    /**
     * JS uses 0-based Date.getMonth() (Jan=0); Java's LocalDate.getMonthValue()
     * is 1-based (Jan=1). laggedIdx = (jsMonth0based - 1 + 12) % 12 becomes,
     * substituting jsMonth0based = javaMonthValue - 1: (javaMonthValue + 10) % 12.
     * Verified: March (java=3) -> (3+10)%12=1 (February, monthlyTemp[1]) --
     * matches JS's (2-1+12)%12=1 exactly.
     */
    public static double estimateGroundTempC(Season season) {
        return estimateGroundTempC(season, LocalDate.now());
    }

    public static double estimateGroundTempC(Season season, LocalDate atDate) {
        List<Season.MonthlyTemp> monthly = season.monthlyTemp();
        if (monthly != null && monthly.size() == 12) {
            LocalDate now = atDate != null ? atDate : LocalDate.now();
            int laggedIdx = (now.getMonthValue() + 10) % 12;
            double v = monthly.get(laggedIdx).tempC();
            if (Double.isFinite(v)) return v;
        }
        if (season.avgTempCAnnual() != null && Double.isFinite(season.avgTempCAnnual())) return season.avgTempCAnnual();
        return (season.tMin() + season.tMax()) / 2;
    }

    static double massFilmCoefficient(MassExposure exposure) {
        Double v = THERMAL_MASS_EXPOSURE_H_VALUES.get(exposure);
        return v != null ? v : MASS_FILM_COEFF_DEFAULT;
    }

    // ---- Core hourly simulation --------------------------------------------
    public static SimulationResult runSimulation(Design design, Season season, SimConfig simConfig) {
        SimulationResult.Geometry geom = computeGeometry(design, season.latitude());
        double uWall = wallUValue(design), uRoof = roofUValue(design), uFloor = floorUValue(design);

        List<Opening> windows = design.windows() == null ? List.of() : design.windows();
        List<Opening> doors = design.doors() == null ? List.of() : design.doors();

        record WindowGroup(Opening opening, double uValue, double shgc, double totalArea) {
        }
        List<WindowGroup> windowGroups = new ArrayList<>();
        for (Opening w : windows) {
            // JS: (glazing || {}).shgc || 0.7 -- falsy-on-zero, matches orDefault.
            double shgc = w.glazingMaterial() != null ? orDefault(w.glazingMaterial().shgc(), 0.7) : 0.7;
            windowGroups.add(new WindowGroup(w, windowUValue(w), shgc, w.totalArea()));
        }
        double doorArea = doors.stream().mapToDouble(Opening::totalArea).sum();
        double windowArea = windowGroups.stream().mapToDouble(WindowGroup::totalArea).sum();

        boolean isSingleFaceShape = geom.faces().size() == 1;
        Map<OpeningFace, Double> openingAreaByFace = new LinkedHashMap<>();
        for (WindowGroup w : windowGroups) {
            openingAreaByFace.merge(w.opening().face(), w.totalArea(), Double::sum);
        }
        for (Opening d : doors) {
            OpeningFace face = d.face() != null ? d.face() : OpeningFace.FRONT;
            openingAreaByFace.merge(face, d.totalArea(), Double::sum);
        }
        double[] solidFaceAreas = new double[geom.faces().size()];
        for (int fi = 0; fi < geom.faces().size(); fi++) {
            SimulationResult.Face f = geom.faces().get(fi);
            double openingsHere = isSingleFaceShape ? (windowArea + doorArea)
                : openingAreaByFace.getOrDefault(faceNameToEnum(f.name()), 0.0);
            solidFaceAreas[fi] = Math.max(0, f.areaM2() - openingsHere);
        }

        OccupancySummary occSummary = occupancySummary(design);
        double infiltrationAch = windAdjustedInfiltrationAch(design, season);
        double occupancyAch = occupancyAchIncrement(occSummary.avgPersons(), geom.volume()); // reporting only -- see occupancyForHour/occupancySummary above
        double ach = infiltrationAch + occupancyAch;
        // infiltrationUA is constant for the whole run; occupancy's own
        // share of ventilation (occupancyVentUA/ventUA) is NOT, unlike
        // before -- both are computed fresh inside the loop every hour
        // now, same as every other UA/ref term there, so an hour-varying
        // schedule's ventilation load is exact rather than averaged.
        double infiltrationUA = ventUAFromAch(infiltrationAch, geom.volume());

        ThermalMassSpec tm = design.thermalMass();
        boolean massActive = tm != null && tm.massKg() > 0;
        MaterialProperties massMat = massActive ? tm.material() : null;
        // JS: massMat.cp || 900 / tm.surfaceAreaM2 || 5 -- both falsy-on-zero.
        double cMass = massActive ? tm.massKg() * orDefault(massMat.cp(), 900) : 0;
        double massArea = massActive ? orDefault(tm.surfaceAreaM2(), 5) : 0;
        double massH = massActive ? massFilmCoefficient(tm.exposure()) : 0;
        boolean isPcm = massActive && massMat != null && massMat.pcmMeltC() != null;

        double cAir = geom.volume() * AIR_RHO * AIR_CP * FURNISHING_CAPACITANCE_FACTOR;

        MaterialProperties wallMat = design.wall().material();
        double wallAbsorptivity = wallMat != null ? wallMat.absorptivityOrDefault(0.6) : 0.6;
        MaterialProperties roofMat = design.roof().material();
        double roofAbsorptivity = roofMat != null ? roofMat.absorptivityOrDefault(0.6) : 0.6;
        double tGround = design.groundTempC() != null ? design.groundTempC() : estimateGroundTempC(season);

        int timeStepMinutes = simConfig.timeStepMinutes() > 0 ? simConfig.timeStepMinutes() : 60;
        double dtSec = timeStepMinutes * 60.0;
        int stepsPerDay = (int) Math.round(24 * 3600 / dtSec);
        int days = simConfig.days() > 0 ? simConfig.days() : 1;
        int totalSteps = stepsPerDay * days;

        double tAir = (season.tMin() + season.tMax()) / 2;
        double tMass = tAir;
        List<SimulationResult.SeriesPoint> series = new ArrayList<>(totalSteps);

        double solarKwh = 0, wallLossKwh = 0, roofLossKwh = 0, floorLossKwh = 0, openingCondLossKwh = 0,
            ventLossKwh = 0, occupancyVentLossKwh = 0, massExchangeKwh = 0, internalKwh = 0,
            occupantSensibleKwh = 0, equipmentKwh = 0, heatingReqKwh = 0, coolingReqKwh = 0, incidentOnWindowKwh = 0;

        for (int i = 0; i < totalSteps; i++) {
            // Floating-point division throughout -- at 60-min steps i*dtSec/3600
            // has zero remainder by coincidence, so an accidental integer-division
            // bug here would NOT show up at 60-min but would at 15/30-min (see
            // ThermalEngineGoldenFileTest's 15-min fixture).
            double hourDecimal = (i * dtSec / 3600.0) % 24;
            double tAmb = ambientTempAt(season, hourDecimal);
            double gHoriz = solarIrradianceAt(season, hourDecimal);
            double hOuterNow = windAdjustedFilmCoefficient(windSpeedAt(season, hourDecimal));

            double wallUA = 0, wallRefSum = 0;
            for (int fi = 0; fi < geom.faces().size(); fi++) {
                SimulationResult.Face f = geom.faces().get(fi);
                double solidArea = solidFaceAreas[fi];
                double gFace = gHoriz * f.factor();
                double tSolAir = tAmb + (wallAbsorptivity * gFace) / hOuterNow;
                wallUA += uWall * solidArea;
                wallRefSum += uWall * solidArea * tSolAir;
            }
            double tSolAirRoof = tAmb + (roofAbsorptivity * gHoriz) / hOuterNow;
            double roofUA = uRoof * geom.roofArea(), roofRef = roofUA * tSolAirRoof;
            double floorUA = uFloor * geom.floorArea(), floorRef = floorUA * tGround;

            double qSolarWindow = 0, windowCondUA = 0;
            for (WindowGroup w : windowGroups) {
                double off = switch (w.opening().face()) {
                    case FRONT, CURVED_WALL, L_WALL -> 0;
                    case BACK -> 180;
                    case LEFT -> -90;
                    case RIGHT -> 90;
                };
                double f = faceFactor(geom.frontAzimuth(), off, season.latitude());
                qSolarWindow += w.totalArea() * gHoriz * f * w.shgc();
                windowCondUA += w.uValue() * w.totalArea();
            }
            double windowCondRef = windowCondUA * tAmb;
            double doorUA = DOOR_U_VALUE * doorArea, doorRef = doorUA * tAmb;
            OccupancyHeatResult occ = occupancyForHour(design, hourDecimal);
            double occupancyVentUA = ventUAFromAch(occupancyAchIncrement(occ.persons(), geom.volume()), geom.volume());
            double ventUA = infiltrationUA + occupancyVentUA; // infiltration hoisted above the loop, occupancy's share is not -- see occupancyForHour above
            double ventRef = ventUA * tAmb;
            double qInternal = occ.totalSensibleW();
            double massUA = massActive ? massH * massArea : 0, massRef = massUA * tMass;

            double totalUA = wallUA + roofUA + floorUA + windowCondUA + doorUA + ventUA + massUA;
            double totalRef = wallRefSum + roofRef + floorRef + windowCondRef + doorRef + ventRef + massRef + qSolarWindow + qInternal;
            double cDt = cAir / dtSec;
            double nextTair = (cDt * tAir + totalRef) / (cDt + totalUA);

            double qWall = wallUA * nextTair - wallRefSum;
            double qRoof = roofUA * nextTair - roofRef;
            double qFloor = floorUA * nextTair - floorRef;
            double qWindowCond = windowCondUA * nextTair - windowCondRef;
            double qDoorCond = doorUA * nextTair - doorRef;
            double qVent = ventUA * nextTair - ventRef;
            double qVentOccupancy = occupancyVentUA * (nextTair - tAmb);
            double qMassExchange = massUA * (nextTair - tMass);

            double nextTmass = tMass;
            if (massActive) {
                double solarToMass = 0.25 * qSolarWindow;
                double effectiveCMass = cMass;
                if (isPcm && Math.abs(tMass - massMat.pcmMeltC()) < 1.5) {
                    effectiveCMass = cMass + (tm.massKg() * massMat.pcmLatentJKg()) / 3;
                }
                double cMassDt = effectiveCMass / dtSec;
                nextTmass = (cMassDt * tMass + massUA * nextTair + solarToMass) / (cMassDt + massUA);
            }

            boolean inComfort = nextTair >= design.comfort().min() && nextTair <= design.comfort().max();
            if (nextTair < design.comfort().min()) {
                heatingReqKwh += ((uWall * geom.wallArea() + uRoof * geom.roofArea() + uFloor * geom.floorArea() + ventUA)
                    * (design.comfort().min() - nextTair) * dtSec) / 3.6e6;
            }
            if (nextTair > design.comfort().max()) {
                coolingReqKwh += ((uWall * geom.wallArea() + uRoof * geom.roofArea()) * (nextTair - design.comfort().max()) * dtSec) / 3.6e6;
            }

            double qNetAir = qSolarWindow + qInternal - qMassExchange - qWall - qRoof - qFloor - qWindowCond - qDoorCond - qVent;
            series.add(new SimulationResult.SeriesPoint(
                hourDecimal, i, round2(tAmb), round2(nextTair), round2(nextTmass), round2(gHoriz),
                round2(qSolarWindow), round2(qWall), round2(qRoof), round2(qFloor), round2(qWindowCond),
                round2(qDoorCond), round2(qVent), round2(qMassExchange), round2(qInternal), round2(qNetAir), inComfort
            ));

            solarKwh += (qSolarWindow * dtSec) / 3.6e6;
            wallLossKwh += Math.max(0, (qWall * dtSec) / 3.6e6);
            roofLossKwh += Math.max(0, (qRoof * dtSec) / 3.6e6);
            floorLossKwh += Math.max(0, (qFloor * dtSec) / 3.6e6);
            openingCondLossKwh += Math.max(0, ((qWindowCond + qDoorCond) * dtSec) / 3.6e6);
            ventLossKwh += Math.max(0, (qVent * dtSec) / 3.6e6);
            occupancyVentLossKwh += Math.max(0, (qVentOccupancy * dtSec) / 3.6e6);
            massExchangeKwh += (qMassExchange * dtSec) / 3.6e6;
            internalKwh += (qInternal * dtSec) / 3.6e6;
            occupantSensibleKwh += (occ.sensibleW() * dtSec) / 3.6e6;
            equipmentKwh += (occ.equipmentW() * dtSec) / 3.6e6;
            incidentOnWindowKwh += (gHoriz * windowArea * dtSec) / 3.6e6;

            tAir = nextTair;
            tMass = nextTmass;
        }

        int totalDays = days;
        double comfortSteps = series.stream().filter(SimulationResult.SeriesPoint::inComfort).count();
        double comfortHoursPerDay = (comfortSteps * (dtSec / 3600.0)) / totalDays;
        List<SimulationResult.SeriesPoint> nightSteps = series.stream().filter(s -> s.hourDecimal() < 6 || s.hourDecimal() >= 20).toList();
        List<SimulationResult.SeriesPoint> daySteps = series.stream().filter(s -> s.hourDecimal() >= 6 && s.hourDecimal() < 20).toList();
        double nightComfortPct = pct(nightSteps.stream().filter(SimulationResult.SeriesPoint::inComfort).count(), nightSteps.size());
        double dayComfortPct = pct(daySteps.stream().filter(SimulationResult.SeriesPoint::inComfort).count(), daySteps.size());

        double totalLossKwh = wallLossKwh + roofLossKwh + floorLossKwh + openingCondLossKwh + ventLossKwh;
        double solarUtilizationPct = incidentOnWindowKwh > 0.001 ? clamp(pct(solarKwh, incidentOnWindowKwh), 0, 100) : 0;
        double heatRetentionPct = clamp(pct(solarKwh + internalKwh + Math.max(0, -massExchangeKwh), totalLossKwh), 0, 100);

        double inBandPct = clamp(0.5 * dayComfortPct + 0.5 * nightComfortPct, 0, 100);
        List<SimulationResult.SeriesPoint> outOfBandSteps = series.stream().filter(s -> !s.inComfort()).toList();
        double outOfBandDegSum = outOfBandSteps.stream().mapToDouble(s ->
            Math.max(0, design.comfort().min() - s.tIndoor()) + Math.max(0, s.tIndoor() - design.comfort().max())
        ).sum();
        double avgExcessOutOfBandC = !outOfBandSteps.isEmpty() ? outOfBandDegSum / outOfBandSteps.size() : 0;
        double comfortBandWidthC = design.comfort().max() - design.comfort().min();
        double severityRatio = comfortBandWidthC > 0 ? clamp(avgExcessOutOfBandC / comfortBandWidthC, 0, 1) : 0;
        double severityComponent = 100 * (1 - severityRatio);
        double comfortScore = clamp(0.6 * inBandPct + 0.4 * severityComponent, 0, 100);
        double energyDemandPerDay = (heatingReqKwh + coolingReqKwh) / totalDays;
        double energyAdequacyPct = clamp(100 - energyDemandPerDay * 1.5, 0, 100);
        int thermalComfortScore = (int) Math.round(0.45 * comfortScore + 0.25 * heatRetentionPct + 0.20 * solarUtilizationPct + 0.10 * energyAdequacyPct);
        thermalComfortScore = (int) clamp(thermalComfortScore, 0, 100);

        double minIndoor = series.stream().mapToDouble(SimulationResult.SeriesPoint::tIndoor).min().orElse(0);
        double maxIndoor = series.stream().mapToDouble(SimulationResult.SeriesPoint::tIndoor).max().orElse(0);
        double avgIndoor = round2(series.stream().mapToDouble(SimulationResult.SeriesPoint::tIndoor).average().orElse(0));

        double occupantSensibleKwhPerDay = round2(occupantSensibleKwh / totalDays);
        double occupancyVentLossKwhPerDay = round2(occupancyVentLossKwh / totalDays);
        double netOccupancyEffectKwh = round2(occupantSensibleKwhPerDay - occupancyVentLossKwhPerDay);
        String occupancyNote = null;
        if (occSummary.persons() > 0) {
            occupancyNote = netOccupancyEffectKwh <= 0.05
                ? "Ventilation increase from " + occSummary.persons() + " occupant(s) offsets most or all of their body-heat gain (net "
                    + (netOccupancyEffectKwh >= 0 ? "+" : "") + netOccupancyEffectKwh + " kWh/day) -- a modelled trade-off, not an error."
                : "Occupants add more sensible heat than the occupancy-linked ventilation removes (net +" + netOccupancyEffectKwh + " kWh/day).";
        }

        return new SimulationResult(
            geom,
            new SimulationResult.UValues(uWall, uRoof, uFloor),
            Math.max(0, geom.wallArea() - windowArea - doorArea), windowArea, doorArea,
            series,
            new SimulationResult.Ach(round2(infiltrationAch), round2(occupancyAch), round2(ach)),
            new SimulationResult.OccupancyResult(
                occSummary.persons(), occSummary.activityLabel(), round2(occSummary.totalW()), round2(occSummary.sensibleW()),
                round2(occSummary.latentW()), round2(occSummary.equipmentW()), Math.round(occSummary.latentKgPerHour() * 1000) / 1000.0,
                occupantSensibleKwhPerDay, occupancyVentLossKwhPerDay, netOccupancyEffectKwh, occupancyNote, occSummary.scheduled()
            ),
            new SimulationResult.DailyResult(
                round2(solarKwh / totalDays), round2(wallLossKwh / totalDays), round2(roofLossKwh / totalDays),
                round2(floorLossKwh / totalDays), round2(openingCondLossKwh / totalDays), round2(ventLossKwh / totalDays),
                occupancyVentLossKwhPerDay, round2(massExchangeKwh / totalDays), round2(internalKwh / totalDays),
                round2(equipmentKwh / totalDays), occupantSensibleKwhPerDay, round2(totalLossKwh / totalDays),
                round2((solarKwh + internalKwh - totalLossKwh) / totalDays), round2(heatingReqKwh / totalDays), round2(coolingReqKwh / totalDays)
            ),
            new SimulationResult.ComfortResult(
                round2(comfortHoursPerDay), round2(dayComfortPct), round2(nightComfortPct), round2(minIndoor),
                round2(maxIndoor), avgIndoor, round2(avgExcessOutOfBandC), round2(inBandPct)
            ),
            new SimulationResult.Scores(round2(comfortScore), round2(heatRetentionPct), round2(solarUtilizationPct), thermalComfortScore)
        );
    }

    /** Round-tripping a Face's display name back to the OpeningFace enum used by openingAreaByFace. */
    private static OpeningFace faceNameToEnum(String name) {
        return OpeningFace.valueOf(name);
    }

    // ---- Estimated cost (simple materials-based estimate, INR) -------------
    // Only wall insulation is costed -- roof insulation cost is never added,
    // exactly matching app/js/engine.js's estimateCost(). This looks like an
    // omission but is a faithful port, not a bug to "fix" here.
    public static long estimateCost(Design design) {
        SimulationResult.Geometry geom = computeGeometry(design);
        MaterialProperties wallMat = design.wall().material();
        MaterialProperties roofMat = design.roof().material();
        MaterialProperties insMat = design.wall().insulationMaterial();
        double cost = 0;
        cost += (wallMat != null && wallMat.costPerM2() != null ? wallMat.costPerM2() : 1000) * geom.wallArea();
        cost += (roofMat != null && roofMat.costPerM2() != null ? roofMat.costPerM2() : 1200) * geom.roofArea();
        if (insMat != null) {
            double insThickness = design.wall().insulationThicknessMm() != null ? design.wall().insulationThicknessMm() : 0;
            cost += (insMat.costPerM2() != null ? insMat.costPerM2() : 500) * geom.wallArea() * (insThickness / 75.0);
        }
        List<Opening> windows = design.windows() == null ? List.of() : design.windows();
        for (Opening w : windows) {
            MaterialProperties g = w.glazingMaterial();
            double costPerM2 = g != null && g.costPerM2() != null ? g.costPerM2() : 2000;
            cost += costPerM2 * w.areaEach() * w.count();
        }
        if (design.thermalMass() != null && design.thermalMass().massKg() > 0) {
            MaterialProperties m = design.thermalMass().material();
            double costPerKg = m != null && m.costPerKg() != null ? m.costPerKg() : 5;
            cost += costPerKg * design.thermalMass().massKg();
        }
        final double WASTE_FACTOR = 0.10;
        cost *= (1 + WASTE_FACTOR);
        return Math.round(cost);
    }

    // ---- Regional material availability (see app/js/data.js materialAvailability) ----
    // A rule-based estimate from a material's sustainability tag and the
    // site's elevation (a remoteness proxy) -- not a supplier directory, no
    // specific supplier names invented. Ported alongside estimateCostBreakdown
    // below since nothing in this package needed it until now.
    public static MaterialAvailability materialAvailability(MaterialProperties material, double elevationM) {
        double remoteness = Math.min(1, Math.max(0, elevationM) / 4000.0);
        int baseLeadDays;
        boolean availableLocally;
        String sustainability = material != null ? material.sustainability() : null;
        if ("HIGH".equals(sustainability)) { baseLeadDays = 3; availableLocally = true; }
        else if ("MEDIUM".equals(sustainability)) { baseLeadDays = 10; availableLocally = remoteness < 0.5; }
        else { baseLeadDays = 21; availableLocally = false; }
        int leadTimeDays = (int) Math.round(baseLeadDays * (1 + remoteness * 1.5));
        double transportMultiplier = Math.round((1 + remoteness * 0.6) * 100) / 100.0;
        return new MaterialAvailability(availableLocally, leadTimeDays, transportMultiplier);
    }

    // ---- Estimated cost breakdown (location-aware, INR) --------------------
    // Same per-component costing as estimateCost() above -- added alongside
    // it, not replacing it, so estimateCost's existing callers in
    // OptimizationEngine are unaffected -- but broken into line items and
    // adjusted by each material's regional transport multiplier (see
    // materialAvailability above). Labor multiplier is a smaller heuristic
    // scaling off that same remoteness signal, same rule-based-estimate
    // basis as materialAvailability, not sourced pricing data. Mirrors
    // app/js/engine.js's estimateCostBreakdown() exactly -- at zero
    // remoteness (or elevationM <= 0) every multiplier is 1 and this
    // returns the same total as estimateCost().
    public static CostBreakdownResult estimateCostBreakdown(Design design, double elevationM) {
        SimulationResult.Geometry geom = computeGeometry(design);
        MaterialProperties wallMat = design.wall().material();
        MaterialProperties roofMat = design.roof().material();
        MaterialProperties insMat = design.wall().insulationMaterial();

        List<CostBreakdownResult.LineItem> items = new ArrayList<>();
        double[] subtotal = {0};

        addLineItem(items, subtotal, "Wall material", wallMat, elevationM,
            (wallMat != null && wallMat.costPerM2() != null ? wallMat.costPerM2() : 1000) * geom.wallArea());
        addLineItem(items, subtotal, "Roof material", roofMat, elevationM,
            (roofMat != null && roofMat.costPerM2() != null ? roofMat.costPerM2() : 1200) * geom.roofArea());
        if (insMat != null) {
            double insThickness = design.wall().insulationThicknessMm() != null ? design.wall().insulationThicknessMm() : 0;
            addLineItem(items, subtotal, "Wall insulation", insMat, elevationM,
                (insMat.costPerM2() != null ? insMat.costPerM2() : 500) * geom.wallArea() * (insThickness / 75.0));
        }
        List<Opening> windows = design.windows() == null ? List.of() : design.windows();
        double glazingCost = 0;
        MaterialProperties glazingMat = null;
        for (Opening w : windows) {
            MaterialProperties g = w.glazingMaterial();
            double costPerM2 = g != null && g.costPerM2() != null ? g.costPerM2() : 2000;
            glazingCost += costPerM2 * w.areaEach() * w.count();
            if (glazingMat == null) glazingMat = g;
        }
        addLineItem(items, subtotal, "Glazing", glazingMat, elevationM, glazingCost);
        if (design.thermalMass() != null && design.thermalMass().massKg() > 0) {
            MaterialProperties m = design.thermalMass().material();
            double costPerKg = m != null && m.costPerKg() != null ? m.costPerKg() : 5;
            addLineItem(items, subtotal, "Thermal mass", m, elevationM, costPerKg * design.thermalMass().massKg());
        }

        final double WASTE_FACTOR = 0.10;
        long total = Math.round(subtotal[0] * (1 + WASTE_FACTOR));
        return new CostBreakdownResult(items, WASTE_FACTOR, Math.round(subtotal[0]), total);
    }

    private static void addLineItem(List<CostBreakdownResult.LineItem> items, double[] subtotal,
                                     String label, MaterialProperties material, double elevationM, double baseCost) {
        if (!(baseCost > 0)) return;
        MaterialAvailability avail = material != null ? materialAvailability(material, elevationM) : null;
        double transportMultiplier = avail != null ? avail.transportMultiplier() : 1;
        double laborMultiplier = Math.round((1 + (transportMultiplier - 1) * 0.5) * 100) / 100.0;
        double rawTotal = baseCost * transportMultiplier * laborMultiplier;
        subtotal[0] += rawTotal;
        items.add(new CostBreakdownResult.LineItem(label, Math.round(baseCost), transportMultiplier, laborMultiplier, Math.round(rawTotal)));
    }

    // ---- Validation stats ----------------------------------------------------
    public static ValidationStatsResult validationStats(List<ValidationStatsResult.Point> points) {
        int n = points.size();
        if (n == 0) return null;
        double[] errs = points.stream().mapToDouble(p -> p.predicted() - p.measured()).toArray();
        double mae = 0, sse = 0, mape = 0;
        for (int i = 0; i < n; i++) {
            mae += Math.abs(errs[i]);
            sse += errs[i] * errs[i];
        }
        mae /= n;
        double rmse = Math.sqrt(sse / n);
        for (ValidationStatsResult.Point p : points) {
            double denom = p.measured() != 0 ? p.measured() : 1e-6;
            mape += Math.abs((p.predicted() - p.measured()) / denom);
        }
        mape = mape / n * 100;
        double meanMeasured = points.stream().mapToDouble(ValidationStatsResult.Point::measured).average().orElse(0);
        double ssTot = points.stream().mapToDouble(p -> Math.pow(p.measured() - meanMeasured, 2)).sum();
        double ssRes = points.stream().mapToDouble(p -> Math.pow(p.measured() - p.predicted(), 2)).sum();
        Double r2 = ssTot > 0 ? Math.round((1 - ssRes / ssTot) * 1000) / 1000.0 : null;
        return new ValidationStatsResult(round2(mae), round2(rmse), round2(mape), r2, n);
    }

    // ---- Shared small helpers ------------------------------------------------
    // THE critical translation fix: Math.round(double) returns long in Java,
    // and long / 100 (int literal) is integer division -- Math.round(23.789*100)
    // -> 2379L, then 2379L / 100 -> 23, silently truncating almost every
    // rounded value in this whole engine. The 100.0 (double) divisor is required.
    public static double round2(double x) {
        return Math.round(x * 100) / 100.0;
    }

    public static double pct(double n, double d) {
        return d > 0 ? (100 * n / d) : 0;
    }

    public static double clamp(double x, double lo, double hi) {
        return Math.max(lo, Math.min(hi, x));
    }

    private static double nz(Double v) {
        return v != null ? v : 0;
    }

    /** Emulates JS's `value || fallback` -- null AND a literal 0 both fall through, matching JS falsy semantics. */
    public static double orDefault(Double v, double fallback) {
        return (v != null && v != 0) ? v : fallback;
    }
}
