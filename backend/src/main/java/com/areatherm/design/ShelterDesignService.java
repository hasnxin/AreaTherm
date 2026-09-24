package com.areatherm.design;

import com.areatherm.material.Material;
import com.areatherm.material.MaterialLibraryService;
import com.areatherm.project.Project;
import com.areatherm.thermal.model.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Bridges the shelter-design JPA entities (ShelterDesign, Opening,
 * ThermalMass, ComfortProfile) to the physics engine's plain Design value
 * object -- the ONLY place that mapping happens, so thermal/optimization
 * never need to know these entities (or JPA) exist.
 */
@Service
public class ShelterDesignService {

    // Mirrors app/js/data.js's ACTIVITY_LEVELS exactly. Not DB-backed --
    // like config.js's own physics constants, this is a small, genuinely
    // fixed reference table, not project- or user-editable data.
    private static final Map<ShelterDesign.OccupancyActivity, ActivityLevelSpec> ACTIVITY_LEVELS = Map.of(
        ShelterDesign.OccupancyActivity.SLEEPING, new ActivityLevelSpec("SLEEPING", "Sleeping", 85, 0.90),
        ShelterDesign.OccupancyActivity.SEATED, new ActivityLevelSpec("SEATED", "Resting / Seated", 120, 0.75),
        ShelterDesign.OccupancyActivity.LIGHT, new ActivityLevelSpec("LIGHT", "Light activity", 180, 0.65),
        ShelterDesign.OccupancyActivity.MODERATE, new ActivityLevelSpec("MODERATE", "Moderate activity", 240, 0.55),
        ShelterDesign.OccupancyActivity.HEAVY, new ActivityLevelSpec("HEAVY", "Heavy activity", 360, 0.45)
    );

    private final ShelterDesignRepository shelterDesignRepository;
    private final OpeningRepository openingRepository;
    private final ThermalMassRepository thermalMassRepository;
    private final OccupancyScheduleHourRepository occupancyScheduleHourRepository;
    private final MaterialLibraryService materialLibraryService;

    public ShelterDesignService(ShelterDesignRepository shelterDesignRepository, OpeningRepository openingRepository,
                                 ThermalMassRepository thermalMassRepository, OccupancyScheduleHourRepository occupancyScheduleHourRepository,
                                 MaterialLibraryService materialLibraryService) {
        this.shelterDesignRepository = shelterDesignRepository;
        this.openingRepository = openingRepository;
        this.thermalMassRepository = thermalMassRepository;
        this.occupancyScheduleHourRepository = occupancyScheduleHourRepository;
        this.materialLibraryService = materialLibraryService;
    }

    public Design toDesign(ShelterDesign entity) {
        List<Opening> openings = openingRepository.findByShelterDesignId(entity.getId());
        List<com.areatherm.thermal.model.Opening> windows = openings.stream()
            .filter(o -> o.getOpeningType() == Opening.OpeningType.WINDOW)
            .map(this::toEngineOpening)
            .toList();
        List<com.areatherm.thermal.model.Opening> doors = openings.stream()
            .filter(o -> o.getOpeningType() == Opening.OpeningType.DOOR)
            .map(this::toEngineOpening)
            .toList();
        // VENT-type openings are recorded but not separately modelled by the
        // physics engine -- matches the JS app, where ventilation comes only
        // from airLeakageAch + occupancy, never a per-opening vent term.

        ThermalMassSpec thermalMass = thermalMassRepository.findByShelterDesignId(entity.getId())
            .map(this::toThermalMassSpec)
            .orElse(null);

        ComfortProfile comfortProfile = entity.getComfortProfile();
        // comfort_profile.comfort_min_c is the already-EFFECTIVE minimum --
        // any clothing-level/activity-level shift (app/js/data.js's
        // effectiveComfortMin) happens when a comfort profile is created or
        // updated, not stored as separate raw inputs (the schema has no
        // clothing/activity columns, matching how store.js's defaultDesign()
        // itself only ever persists the already-shifted `min`).
        ComfortSpec comfort = new ComfortSpec(
            comfortProfile.getComfortMinC().doubleValue(), comfortProfile.getComfortMaxC().doubleValue()
        );

        ActivityLevelSpec activity = ACTIVITY_LEVELS.get(
            entity.getOccupancyActivity() != null ? entity.getOccupancyActivity() : ShelterDesign.OccupancyActivity.SEATED
        );

        // 0 rows (the common case) -> null, meaning "use the flat
        // occupancy/occupancyActivity above for the whole run" -- see
        // ThermalEngine.occupancyForHour(). Exactly 24 rows or nothing:
        // there's no partial-schedule concept, matching how the frontend
        // only ever writes a full 24-entry array (see data.js
        // OCCUPANCY_SCHEDULES) or leaves the field unset entirely.
        List<OccupancyScheduleHour> scheduleRows = occupancyScheduleHourRepository.findByShelterDesignIdOrderByHourOfDay(entity.getId());
        List<OccupancyScheduleEntry> occupancySchedule = scheduleRows.isEmpty() ? null : scheduleRows.stream()
            .map(row -> new OccupancyScheduleEntry(row.getOccupancyCount(), ACTIVITY_LEVELS.get(row.getOccupancyActivity())))
            .toList();

        return new Design(
            entity.getName(), toShape(entity.getShape()),
            toDouble(entity.getLengthM()), toDouble(entity.getWidthM()), toDouble(entity.getHeightM()), toDouble(entity.getDiameterM()),
            toDouble(entity.getLengthAM()), toDouble(entity.getWidthAM()), toDouble(entity.getLengthBM()), toDouble(entity.getWidthBM()),
            toOrientation(entity.getOrientation()), toDouble(entity.getAzimuthDeg()),
            toEnvelopeLayer(entity.getWallMaterial(), entity.getWallThicknessMm(), entity.getWallInsulationMaterial(), entity.getWallInsulationThicknessMm()),
            toEnvelopeLayer(entity.getRoofMaterial(), entity.getRoofThicknessMm(), entity.getRoofInsulationMaterial(), entity.getRoofInsulationThicknessMm()),
            new FloorLayer(materialLibraryService.requireBySlug(entity.getFloorMaterial().getSlug()), toDouble(entity.getFloorThicknessMm())),
            windows, doors,
            entity.getAirLeakageAch() != null ? entity.getAirLeakageAch().doubleValue() : null,
            thermalMass,
            entity.getOccupancyCount() != null ? entity.getOccupancyCount() : 0,
            activity,
            entity.getInternalHeatGainW() != null ? entity.getInternalHeatGainW().doubleValue() : 0,
            entity.getGroundTempC() != null ? entity.getGroundTempC().doubleValue() : null,
            comfort, occupancySchedule
        );
    }

    /**
     * The reverse direction: persists a physics-engine Design (e.g. one of
     * the optimizer's 567 evaluated candidates) as a real ShelterDesign row
     * -- design_candidate.shelter_design_id is NOT NULL, so every evaluated
     * candidate needs one, even though most never get a full Simulation
     * (see DesignCandidate's javadoc). name/project/comfortProfile are
     * supplied by the caller since a candidate design's Design record
     * itself carries no project/comfort-profile reference (thermal/ has no
     * concept of either).
     */
    @Transactional
    public ShelterDesign persistFromDesign(Design design, String name, Project project, ComfortProfile comfortProfile) {
        ShelterDesign entity = new ShelterDesign();
        entity.setProject(project);
        entity.setName(name);
        entity.setShape(ShelterDesign.Shape.valueOf(design.shape().name()));
        entity.setLengthM(toBigDecimal(design.length()));
        entity.setWidthM(toBigDecimal(design.width()));
        entity.setHeightM(toBigDecimal(design.height()));
        entity.setDiameterM(toBigDecimal(design.diameter()));
        entity.setLengthAM(toBigDecimal(design.lengthA()));
        entity.setWidthAM(toBigDecimal(design.widthA()));
        entity.setLengthBM(toBigDecimal(design.lengthB()));
        entity.setWidthBM(toBigDecimal(design.widthB()));
        entity.setOrientation(ShelterDesign.Orientation.valueOf(design.orientation().name()));
        entity.setAzimuthDeg(toBigDecimal(design.azimuthDeg()));
        entity.setWallMaterial(materialLibraryService.requireEntityBySlug(design.wall().material().id()));
        entity.setWallThicknessMm(BigDecimal.valueOf(design.wall().thicknessMm()));
        entity.setRoofMaterial(materialLibraryService.requireEntityBySlug(design.roof().material().id()));
        entity.setRoofThicknessMm(BigDecimal.valueOf(design.roof().thicknessMm()));
        entity.setFloorMaterial(materialLibraryService.requireEntityBySlug(design.floor().material().id()));
        entity.setFloorThicknessMm(toBigDecimal(design.floor().thicknessMm()));
        if (design.wall().insulationMaterial() != null) {
            entity.setWallInsulationMaterial(materialLibraryService.requireEntityBySlug(design.wall().insulationMaterial().id()));
            entity.setWallInsulationThicknessMm(toBigDecimal(design.wall().insulationThicknessMm()));
        }
        if (design.roof().insulationMaterial() != null) {
            entity.setRoofInsulationMaterial(materialLibraryService.requireEntityBySlug(design.roof().insulationMaterial().id()));
            entity.setRoofInsulationThicknessMm(toBigDecimal(design.roof().insulationThicknessMm()));
        }
        entity.setAirLeakageAch(toBigDecimal(design.airLeakageAch()));
        entity.setComfortProfile(comfortProfile);
        entity.setOccupancyCount(design.occupancy());
        entity.setOccupancyActivity(ShelterDesign.OccupancyActivity.valueOf(design.occupancyActivity().id()));
        entity.setInternalHeatGainW(BigDecimal.valueOf(design.internalHeatGainW()));
        entity.setGroundTempC(toBigDecimal(design.groundTempC()));
        ShelterDesign saved = shelterDesignRepository.save(entity);

        for (com.areatherm.thermal.model.Opening w : design.windows()) {
            openingRepository.save(toOpeningEntity(saved, Opening.OpeningType.WINDOW, w));
        }
        for (com.areatherm.thermal.model.Opening d : design.doors()) {
            openingRepository.save(toOpeningEntity(saved, Opening.OpeningType.DOOR, d));
        }
        if (design.thermalMass() != null) {
            ThermalMass tm = new ThermalMass();
            tm.setShelterDesign(saved);
            tm.setMaterial(materialLibraryService.requireEntityBySlug(design.thermalMass().material().id()));
            tm.setMassKg(BigDecimal.valueOf(design.thermalMass().massKg()));
            tm.setSurfaceAreaM2(BigDecimal.valueOf(design.thermalMass().surfaceAreaM2()));
            tm.setExposure(ThermalMass.Exposure.valueOf(design.thermalMass().exposure().name()));
            tm.setPcm(design.thermalMass().material().pcmMeltC() != null);
            thermalMassRepository.save(tm);
        }
        if (design.occupancySchedule() != null) {
            for (int h = 0; h < design.occupancySchedule().size(); h++) {
                OccupancyScheduleEntry entry = design.occupancySchedule().get(h);
                OccupancyScheduleHour row = new OccupancyScheduleHour();
                row.setShelterDesign(saved);
                row.setHourOfDay(h);
                row.setOccupancyCount(entry.persons());
                row.setOccupancyActivity(ShelterDesign.OccupancyActivity.valueOf(entry.activity().id()));
                occupancyScheduleHourRepository.save(row);
            }
        }
        return saved;
    }

    private Opening toOpeningEntity(ShelterDesign shelterDesign, Opening.OpeningType type, com.areatherm.thermal.model.Opening src) {
        Opening o = new Opening();
        o.setShelterDesign(shelterDesign);
        o.setOpeningType(type);
        o.setCount(src.count());
        o.setAreaEachM2(BigDecimal.valueOf(src.areaEach()));
        o.setOrientation(Opening.OpeningOrientation.valueOf(src.face().name()));
        if (src.glazingMaterial() != null) {
            o.setGlazingMaterial(materialLibraryService.requireEntityBySlug(src.glazingMaterial().id()));
        }
        return o;
    }

    private static BigDecimal toBigDecimal(Double v) {
        return v != null ? BigDecimal.valueOf(v) : null;
    }

    private EnvelopeLayer toEnvelopeLayer(com.areatherm.material.Material material, BigDecimal thicknessMm,
                                           com.areatherm.material.Material insulationMaterial, BigDecimal insulationThicknessMm) {
        return new EnvelopeLayer(
            materialLibraryService.requireBySlug(material.getSlug()), toDouble(thicknessMm),
            insulationMaterial != null ? materialLibraryService.requireBySlug(insulationMaterial.getSlug()) : null,
            insulationThicknessMm != null ? insulationThicknessMm.doubleValue() : null
        );
    }

    private com.areatherm.thermal.model.Opening toEngineOpening(Opening o) {
        MaterialProperties glazing = o.getGlazingMaterial() != null
            ? materialLibraryService.requireBySlug(o.getGlazingMaterial().getSlug()) : null;
        return new com.areatherm.thermal.model.Opening(
            o.getAreaEachM2().doubleValue(), o.getCount(), toOpeningFace(o.getOrientation()), glazing
        );
    }

    private ThermalMassSpec toThermalMassSpec(ThermalMass tm) {
        return new ThermalMassSpec(
            materialLibraryService.requireBySlug(tm.getMaterial().getSlug()),
            tm.getMassKg().doubleValue(), tm.getSurfaceAreaM2().doubleValue(), toMassExposure(tm.getExposure())
        );
    }

    private static Shape toShape(ShelterDesign.Shape s) {
        return Shape.valueOf(s.name());
    }

    private static CompassOrientation toOrientation(ShelterDesign.Orientation o) {
        return CompassOrientation.valueOf(o.name());
    }

    private static OpeningFace toOpeningFace(Opening.OpeningOrientation o) {
        return OpeningFace.valueOf(o.name());
    }

    private static MassExposure toMassExposure(ThermalMass.Exposure e) {
        return MassExposure.valueOf(e.name());
    }

    private static Double toDouble(BigDecimal v) {
        return v != null ? v.doubleValue() : null;
    }
}
