package com.areatherm.simulation;

import com.areatherm.climate.ClimateProfile;
import com.areatherm.climate.ClimateProfileRepository;
import com.areatherm.climate.ClimateProfileService;
import com.areatherm.design.ShelterDesign;
import com.areatherm.design.ShelterDesignRepository;
import com.areatherm.design.ShelterDesignService;
import com.areatherm.project.Project;
import com.areatherm.project.ProjectRepository;
import com.areatherm.security.AppUser;
import com.areatherm.security.AppUserRepository;
import com.areatherm.thermal.ThermalEngine;
import com.areatherm.thermal.model.Design;
import com.areatherm.thermal.model.Season;
import com.areatherm.thermal.model.SimConfig;
import com.areatherm.thermal.model.SimulationResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Orchestrates a simulation run: loads the persisted design/climate profile,
 * maps them to plain physics records (via ShelterDesignService/
 * ClimateProfileService), calls the real ThermalEngine, and persists the
 * result -- the QUEUED/RUNNING/COMPLETE/FAILED job lifecycle API_SPEC.md's
 * `POST /simulations` -> 202 Accepted contract describes.
 */
@Service
public class SimulationService {

    private static final Logger log = LoggerFactory.getLogger(SimulationService.class);

    private final SimulationRepository simulationRepository;
    private final SimulationResultPointRepository resultPointRepository;
    private final ShelterDesignRepository shelterDesignRepository;
    private final ClimateProfileRepository climateProfileRepository;
    private final ProjectRepository projectRepository;
    private final AppUserRepository appUserRepository;
    private final ShelterDesignService shelterDesignService;
    private final ClimateProfileService climateProfileService;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public SimulationService(SimulationRepository simulationRepository, SimulationResultPointRepository resultPointRepository,
                              ShelterDesignRepository shelterDesignRepository, ClimateProfileRepository climateProfileRepository,
                              ProjectRepository projectRepository, AppUserRepository appUserRepository,
                              ShelterDesignService shelterDesignService, ClimateProfileService climateProfileService,
                              JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.simulationRepository = simulationRepository;
        this.resultPointRepository = resultPointRepository;
        this.shelterDesignRepository = shelterDesignRepository;
        this.climateProfileRepository = climateProfileRepository;
        this.projectRepository = projectRepository;
        this.appUserRepository = appUserRepository;
        this.shelterDesignService = shelterDesignService;
        this.climateProfileService = climateProfileService;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public Simulation createQueued(Long projectId, Long shelterDesignId, Long climateProfileId,
                                    int timeStepMinutes, SimConfig.PeriodType periodType,
                                    LocalDateTime startAt, LocalDateTime endAt, Long runByUserId) {
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown project: " + projectId));
        ShelterDesign shelterDesign = shelterDesignRepository.findById(shelterDesignId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown shelter design: " + shelterDesignId));
        ClimateProfile climateProfile = climateProfileRepository.findById(climateProfileId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown climate profile: " + climateProfileId));

        Simulation sim = new Simulation();
        sim.setProject(project);
        sim.setShelterDesign(shelterDesign);
        sim.setClimateProfile(climateProfile);
        sim.setTimeStepMinutes(timeStepMinutes);
        sim.setPeriodType(periodType);
        sim.setStartAt(startAt);
        sim.setEndAt(endAt);
        sim.setStatus(Simulation.Status.QUEUED);
        if (runByUserId != null) {
            AppUser runBy = appUserRepository.findById(runByUserId).orElse(null);
            sim.setRunBy(runBy);
        }
        return simulationRepository.save(sim);
    }

    /**
     * @Transactional here (not just on smaller sub-steps) is deliberate: this
     * runs on its own @Async thread, so without an ambient transaction every
     * individual repository call would open-and-close its own, leaving every
     * entity returned from one call already detached by the time the next
     * line tries to traverse one of its lazy associations (e.g.
     * Opening.glazingMaterial) -- caught directly by a real
     * LazyInitializationException during end-to-end testing, not by
     * inspection. Holding one open transaction for the whole physics run is
     * an acceptable tradeoff for a local, single-user backend at this stage;
     * splitting into a read/compute/persist pipeline is a reasonable future
     * optimization if this becomes a real bottleneck under concurrent load.
     */
    @Async("engineTaskExecutor")
    @Transactional
    public void runAsync(Long simulationId) {
        Simulation sim = simulationRepository.findById(simulationId).orElse(null);
        if (sim == null) {
            log.warn("runAsync: simulation {} no longer exists", simulationId);
            return;
        }
        sim.setStatus(Simulation.Status.RUNNING);
        simulationRepository.save(sim);

        try {
            Design design = shelterDesignService.toDesign(sim.getShelterDesign());
            Season season = climateProfileService.toSeason(sim.getClimateProfile());
            int days = Math.max(1, (int) Math.ceil(Duration.between(sim.getStartAt(), sim.getEndAt()).toHours() / 24.0));
            SimConfig simConfig = new SimConfig(sim.getTimeStepMinutes(), sim.getPeriodType(), days);

            SimulationResult result = ThermalEngine.runSimulation(design, season, simConfig);

            insertResultPointsBatch(simulationId, sim.getTimeStepMinutes(), result);

            sim.setSummaryJson(objectMapper.writeValueAsString(SimulationSummary.from(result)));
            sim.setStatus(Simulation.Status.COMPLETE);
            simulationRepository.save(sim);
        } catch (Exception e) {
            log.error("Simulation {} failed", simulationId, e);
            sim.setStatus(Simulation.Status.FAILED);
            simulationRepository.save(sim);
        }
    }

    /**
     * simulation_result.id is BIGINT AUTO_INCREMENT (JPA GenerationType.IDENTITY),
     * which Hibernate cannot batch -- it would flush one INSERT per row to
     * get each generated key back. A 30-day/15-min run is 2,880 rows;
     * JdbcTemplate.batchUpdate bypasses the entity manager entirely for this
     * one write path (see the backend design plan's persistence-layer notes).
     */
    private void insertResultPointsBatch(Long simulationId, int timeStepMinutes, SimulationResult result) {
        String sql = "INSERT INTO simulation_result (simulation_id, ts_offset_minutes, ambient_temp_c, indoor_temp_c, "
            + "mass_temp_c, solar_gain_w, wall_loss_w, roof_loss_w, floor_loss_w, opening_loss_w, vent_loss_w, "
            + "mass_exchange_w, net_balance_w, in_comfort_band) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        List<SimulationResult.SeriesPoint> series = result.series();
        int batchSize = 500;
        for (int start = 0; start < series.size(); start += batchSize) {
            List<SimulationResult.SeriesPoint> chunk = series.subList(start, Math.min(start + batchSize, series.size()));
            jdbcTemplate.batchUpdate(sql, chunk, chunk.size(), (ps, s) -> {
                ps.setLong(1, simulationId);
                ps.setInt(2, s.stepIndex() * timeStepMinutes);
                ps.setDouble(3, s.tAmb());
                ps.setDouble(4, s.tIndoor());
                ps.setDouble(5, s.tMass());
                ps.setDouble(6, s.qSolarWindow());
                ps.setDouble(7, s.qWall());
                ps.setDouble(8, s.qRoof());
                ps.setDouble(9, s.qFloor());
                ps.setDouble(10, s.qWindowCond() + s.qDoorCond()); // one combined column, see V1__init.sql
                ps.setDouble(11, s.qVent());
                ps.setDouble(12, s.qMassExchange());
                ps.setDouble(13, s.qNet());
                ps.setBoolean(14, s.inComfort());
            });
        }
    }

    public Optional<Simulation> findById(Long id) {
        return simulationRepository.findById(id);
    }

    public Page<SimulationResultPoint> getSeries(Long simulationId, Pageable pageable) {
        return resultPointRepository.findBySimulationIdOrderByTsOffsetMinutesAsc(simulationId, pageable);
    }
}
