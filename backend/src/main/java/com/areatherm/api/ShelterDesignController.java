package com.areatherm.api;

import com.areatherm.api.dto.CreateShelterDesignRequest;
import com.areatherm.api.dto.ShelterDesignDetailResponse;
import com.areatherm.climate.Location;
import com.areatherm.climate.LocationRepository;
import com.areatherm.design.*;
import com.areatherm.material.Material;
import com.areatherm.material.MaterialRepository;
import com.areatherm.project.Project;
import com.areatherm.project.ProjectRepository;
import com.areatherm.thermal.ThermalEngine;
import com.areatherm.thermal.model.CostBreakdownResult;
import com.areatherm.thermal.model.Design;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Implements API_SPEC.md's Shelter Design resource. This is the one
 * remaining piece of write-path plumbing SimulationController/
 * OptimizationRunController need a real shelterDesignId to exercise --
 * builds a ShelterDesign + Opening/ThermalMass graph directly from a
 * request (mirrors ShelterDesignService.persistFromDesign's shape, but
 * from raw client input rather than a physics-engine Design record).
 */
@RestController
@RequestMapping("/api/v1")
public class ShelterDesignController {

    private final ShelterDesignRepository shelterDesignRepository;
    private final OpeningRepository openingRepository;
    private final ThermalMassRepository thermalMassRepository;
    private final MaterialRepository materialRepository;
    private final ComfortProfileRepository comfortProfileRepository;
    private final ProjectRepository projectRepository;
    private final LocationRepository locationRepository;
    private final ShelterDesignService shelterDesignService;
    private final OccupancyScheduleHourRepository occupancyScheduleHourRepository;

    public ShelterDesignController(ShelterDesignRepository shelterDesignRepository, OpeningRepository openingRepository,
                                    ThermalMassRepository thermalMassRepository, MaterialRepository materialRepository,
                                    ComfortProfileRepository comfortProfileRepository, ProjectRepository projectRepository,
                                    LocationRepository locationRepository, ShelterDesignService shelterDesignService,
                                    OccupancyScheduleHourRepository occupancyScheduleHourRepository) {
        this.shelterDesignRepository = shelterDesignRepository;
        this.openingRepository = openingRepository;
        this.thermalMassRepository = thermalMassRepository;
        this.materialRepository = materialRepository;
        this.comfortProfileRepository = comfortProfileRepository;
        this.projectRepository = projectRepository;
        this.locationRepository = locationRepository;
        this.shelterDesignService = shelterDesignService;
        this.occupancyScheduleHourRepository = occupancyScheduleHourRepository;
    }

    @GetMapping("/projects/{projectId}/shelter-designs")
    public List<Map<String, Object>> listForProject(@PathVariable Long projectId) {
        return shelterDesignRepository.findByProjectId(projectId).stream()
            .map(d -> Map.<String, Object>of("id", d.getId(), "name", d.getName(), "shape", d.getShape().name()))
            .toList();
    }

    @PostMapping("/projects/{projectId}/shelter-designs")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public ShelterDesignDetailResponse create(@PathVariable Long projectId, @Valid @RequestBody CreateShelterDesignRequest req) {
        if (!projectId.equals(req.projectId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Path projectId does not match body projectId");
        }
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No project with id " + projectId));
        ComfortProfile comfortProfile = comfortProfileRepository.findById(req.comfortProfileId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown comfort profile: " + req.comfortProfileId()));

        ShelterDesign saved = shelterDesignRepository.save(applyRequest(new ShelterDesign(), req, project, comfortProfile));
        ChildRows children = createChildRows(saved, req);

        return ShelterDesignDetailResponse.from(saved, children.windows(), children.doors(), children.thermalMass(), children.occupancySchedule());
    }

    @GetMapping("/shelter-designs/{id}")
    public ShelterDesignDetailResponse get(@PathVariable Long id) {
        ShelterDesign d = shelterDesignRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No shelter design with id " + id));
        List<Opening> openings = openingRepository.findByShelterDesignId(id);
        List<Opening> windows = openings.stream().filter(o -> o.getOpeningType() == Opening.OpeningType.WINDOW).toList();
        List<Opening> doors = openings.stream().filter(o -> o.getOpeningType() == Opening.OpeningType.DOOR).toList();
        ThermalMass thermalMass = thermalMassRepository.findByShelterDesignId(id).orElse(null);
        List<OccupancyScheduleHour> schedule = occupancyScheduleHourRepository.findByShelterDesignIdOrderByHourOfDay(id);
        return ShelterDesignDetailResponse.from(d, windows, doors, thermalMass, schedule);
    }

    // estimateCost/estimateCostBreakdown were previously reachable only
    // from inside a full optimization run (OptimizationEngine's per-
    // candidate scoring) -- this exposes a location-aware cost breakdown
    // for one already-saved design on its own, matching the frontend's own
    // ENGINE.estimateCostBreakdown(design, location) (app/js/engine.js).
    @GetMapping("/shelter-designs/{id}/cost-estimate")
    @Transactional(readOnly = true)
    public CostBreakdownResult costEstimate(@PathVariable Long id) {
        ShelterDesign d = shelterDesignRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No shelter design with id " + id));
        Design design = shelterDesignService.toDesign(d);
        // First location on this design's project, matching how the
        // frontend always has exactly one "current" location in play --
        // a design with no location yet gets elevation 0 (every multiplier
        // reduces to 1, same total as the plain estimateCost()).
        double elevationM = locationRepository.findByProjectId(d.getProject().getId()).stream()
            .findFirst().map(Location::getElevationM).map(BigDecimal::doubleValue).orElse(0.0);
        return ThermalEngine.estimateCostBreakdown(design, elevationM);
    }

    @PutMapping("/shelter-designs/{id}")
    @Transactional
    public ShelterDesignDetailResponse update(@PathVariable Long id, @Valid @RequestBody CreateShelterDesignRequest req) {
        ShelterDesign d = shelterDesignRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No shelter design with id " + id));
        if (!d.getProject().getId().equals(req.projectId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Body projectId does not match this shelter design's project: " + d.getProject().getId());
        }
        ComfortProfile comfortProfile = comfortProfileRepository.findById(req.comfortProfileId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown comfort profile: " + req.comfortProfileId()));

        // Full replace of child rows: delete existing, then re-create from
        // the request below -- simplest correct approach, matches create(),
        // rather than diffing/patching individual openings. Done BEFORE
        // applyRequest()/save() touch d's own fields, for two related reasons:
        //  1. thermal_mass has a UNIQUE constraint on shelter_design_id, and
        //     Opening/ThermalMass both use IDENTITY generation (which forces
        //     an immediate INSERT on save(), unlike the deferred DELETE), so
        //     the deletes must be flushed before any new child row is
        //     inserted for this design, or the new ThermalMass row's insert
        //     hits that unique constraint against the still-present old row.
        //  2. ShelterDesign.thermalMass is @OneToOne(mappedBy=...): without
        //     bytecode enhancement Hibernate can't truly lazy-load the
        //     non-owning side of a one-to-one, so d.thermalMass is already
        //     eagerly populated with the OLD row as soon as d is loaded
        //     above. Deleting that row without also clearing d's own
        //     in-memory reference to it leaves a dangling link that throws
        //     TransientObjectException the moment d becomes dirty (from
        //     applyRequest()) and gets flushed -- Hibernate walks every
        //     association of a dirty entity at flush time, mappedBy ones
        //     included.
        List<Opening> existingOpenings = openingRepository.findByShelterDesignId(id);
        if (!existingOpenings.isEmpty()) {
            openingRepository.deleteAll(existingOpenings);
        }
        thermalMassRepository.findByShelterDesignId(id).ifPresent(tm -> {
            thermalMassRepository.delete(tm);
            d.setThermalMass(null);
        });
        List<OccupancyScheduleHour> existingSchedule = occupancyScheduleHourRepository.findByShelterDesignIdOrderByHourOfDay(id);
        if (!existingSchedule.isEmpty()) {
            occupancyScheduleHourRepository.deleteAll(existingSchedule);
        }
        openingRepository.flush();
        thermalMassRepository.flush();
        occupancyScheduleHourRepository.flush();

        ShelterDesign saved = shelterDesignRepository.save(applyRequest(d, req, d.getProject(), comfortProfile));
        ChildRows children = createChildRows(saved, req);

        return ShelterDesignDetailResponse.from(saved, children.windows(), children.doors(), children.thermalMass(), children.occupancySchedule());
    }

    /** Scalar-field mapping shared by create() and update() -- everything except the child Opening/ThermalMass rows. */
    private ShelterDesign applyRequest(ShelterDesign d, CreateShelterDesignRequest req, Project project, ComfortProfile comfortProfile) {
        d.setProject(project);
        d.setName(req.name());
        d.setShape(parseEnum(ShelterDesign.Shape.class, req.shape(), "shape"));
        d.setLengthM(bd(req.length()));
        d.setWidthM(bd(req.width()));
        d.setHeightM(bd(req.height()));
        d.setDiameterM(bd(req.diameter()));
        d.setLengthAM(bd(req.lengthA()));
        d.setWidthAM(bd(req.widthA()));
        d.setLengthBM(bd(req.lengthB()));
        d.setWidthBM(bd(req.widthB()));
        d.setOrientation(parseEnum(ShelterDesign.Orientation.class, req.orientation(), "orientation"));
        d.setAzimuthDeg(bd(req.azimuthDeg()));
        d.setWallMaterial(requireMaterial(req.wallMaterialId()));
        d.setWallThicknessMm(bd(req.wallThicknessMm()));
        d.setRoofMaterial(requireMaterial(req.roofMaterialId()));
        d.setRoofThicknessMm(bd(req.roofThicknessMm()));
        d.setFloorMaterial(requireMaterial(req.floorMaterialId()));
        d.setFloorThicknessMm(bd(req.floorThicknessMm()));
        // PUT is a full replace: a request that omits insulation must clear
        // any insulation the design previously had, not just leave stale
        // material/thickness in place (a no-op for create(), where these
        // fields are already null on a brand-new entity).
        if (req.wallInsulationMaterialId() != null) {
            d.setWallInsulationMaterial(requireMaterial(req.wallInsulationMaterialId()));
            d.setWallInsulationThicknessMm(bd(req.wallInsulationThicknessMm()));
        } else {
            d.setWallInsulationMaterial(null);
            d.setWallInsulationThicknessMm(null);
        }
        if (req.roofInsulationMaterialId() != null) {
            d.setRoofInsulationMaterial(requireMaterial(req.roofInsulationMaterialId()));
            d.setRoofInsulationThicknessMm(bd(req.roofInsulationThicknessMm()));
        } else {
            d.setRoofInsulationMaterial(null);
            d.setRoofInsulationThicknessMm(null);
        }
        d.setAirLeakageAch(bd(req.airLeakageAch()));
        d.setComfortProfile(comfortProfile);
        d.setOccupancyCount(req.occupancyCount() != null ? req.occupancyCount() : 0);
        d.setOccupancyActivity(req.occupancyActivity() != null
            ? parseEnum(ShelterDesign.OccupancyActivity.class, req.occupancyActivity(), "occupancyActivity")
            : ShelterDesign.OccupancyActivity.SEATED);
        d.setInternalHeatGainW(bd(req.internalHeatGainW() != null ? req.internalHeatGainW() : 0));
        d.setGroundTempC(bd(req.groundTempC()));
        return d;
    }

    private record ChildRows(List<Opening> windows, List<Opening> doors, ThermalMass thermalMass, List<OccupancyScheduleHour> occupancySchedule) {
    }

    /** Creates the Opening/ThermalMass/occupancy-schedule child rows for an already-saved design -- shared by create() and update(). */
    private ChildRows createChildRows(ShelterDesign saved, CreateShelterDesignRequest req) {
        List<Opening> windows = new ArrayList<>();
        for (CreateShelterDesignRequest.OpeningRequest w : req.windows() != null ? req.windows() : List.<CreateShelterDesignRequest.OpeningRequest>of()) {
            windows.add(openingRepository.save(toOpening(saved, Opening.OpeningType.WINDOW, w)));
        }
        List<Opening> doors = new ArrayList<>();
        for (CreateShelterDesignRequest.OpeningRequest doorReq : req.doors() != null ? req.doors() : List.<CreateShelterDesignRequest.OpeningRequest>of()) {
            doors.add(openingRepository.save(toOpening(saved, Opening.OpeningType.DOOR, doorReq)));
        }
        ThermalMass thermalMass = null;
        if (req.thermalMass() != null) {
            ThermalMass tm = new ThermalMass();
            tm.setShelterDesign(saved);
            tm.setMaterial(requireMaterial(req.thermalMass().materialId()));
            tm.setMassKg(bd(req.thermalMass().massKg()));
            tm.setSurfaceAreaM2(bd(req.thermalMass().surfaceAreaM2()));
            tm.setExposure(req.thermalMass().exposure() != null
                ? parseEnum(ThermalMass.Exposure.class, req.thermalMass().exposure(), "thermalMass.exposure")
                : ThermalMass.Exposure.FLOOR);
            tm.setPcm(tm.getMaterial().getPcmMeltTempC() != null);
            thermalMass = thermalMassRepository.save(tm);
        }
        List<OccupancyScheduleHour> schedule = new ArrayList<>();
        if (req.occupancySchedule() != null) {
            if (req.occupancySchedule().size() != 24) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "occupancySchedule must have exactly 24 entries (one per hour), got " + req.occupancySchedule().size());
            }
            for (int h = 0; h < 24; h++) {
                CreateShelterDesignRequest.ScheduleHourRequest hourReq = req.occupancySchedule().get(h);
                OccupancyScheduleHour row = new OccupancyScheduleHour();
                row.setShelterDesign(saved);
                row.setHourOfDay(h);
                row.setOccupancyCount(hourReq.occupancyCount());
                row.setOccupancyActivity(parseEnum(ShelterDesign.OccupancyActivity.class, hourReq.occupancyActivity(), "occupancySchedule[" + h + "].occupancyActivity"));
                schedule.add(occupancyScheduleHourRepository.save(row));
            }
        }
        return new ChildRows(windows, doors, thermalMass, schedule);
    }

    private Material requireMaterial(Long id) {
        return materialRepository.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown material id: " + id));
    }

    private Opening toOpening(ShelterDesign d, Opening.OpeningType type, CreateShelterDesignRequest.OpeningRequest req) {
        Opening o = new Opening();
        o.setShelterDesign(d);
        o.setOpeningType(type);
        o.setCount(req.count());
        o.setAreaEachM2(bd(req.areaEach()));
        o.setOrientation(parseEnum(Opening.OpeningOrientation.class, req.orientation(), "opening.orientation"));
        if (req.glazingMaterialId() != null) {
            o.setGlazingMaterial(requireMaterial(req.glazingMaterialId()));
        }
        return o;
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> type, String value, String fieldName) {
        try {
            return Enum.valueOf(type, value);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + fieldName + ": " + value);
        }
    }

    private static BigDecimal bd(Double v) {
        return v != null ? BigDecimal.valueOf(v) : null;
    }
}
