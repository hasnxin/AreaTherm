package com.areatherm.api.dto;

import com.areatherm.design.Opening;
import com.areatherm.design.OccupancyScheduleHour;
import com.areatherm.design.ShelterDesign;
import com.areatherm.design.ThermalMass;

import java.math.BigDecimal;
import java.util.List;

/**
 * Full shelter-design record for {@code GET/PUT /shelter-designs/{id}} --
 * mirrors {@link CreateShelterDesignRequest}'s shape in reverse: shape +
 * every dimension field for every shape variant (rectangular/round/L-shape),
 * orientation/azimuth, envelope materials + insulation, openings, thermal
 * mass, comfort profile. Deliberately more detailed than the lightweight
 * {@code {id,name,shape}} rows {@code GET /projects/{projectId}/shelter-designs}
 * still returns for its list view.
 */
public record ShelterDesignDetailResponse(
        Long id,
        Long projectId,
        String name,
        String shape,
        BigDecimal length, BigDecimal width, BigDecimal height, BigDecimal diameter,
        BigDecimal lengthA, BigDecimal widthA, BigDecimal lengthB, BigDecimal widthB,
        String orientation,
        BigDecimal azimuthDeg,
        Long wallMaterialId, BigDecimal wallThicknessMm,
        Long roofMaterialId, BigDecimal roofThicknessMm,
        Long floorMaterialId, BigDecimal floorThicknessMm,
        Long wallInsulationMaterialId, BigDecimal wallInsulationThicknessMm,
        Long roofInsulationMaterialId, BigDecimal roofInsulationThicknessMm,
        BigDecimal airLeakageAch,
        Long comfortProfileId,
        Integer occupancyCount,
        String occupancyActivity,
        BigDecimal internalHeatGainW,
        BigDecimal groundTempC,
        List<OpeningResponse> windows,
        List<OpeningResponse> doors,
        ThermalMassResponse thermalMass,
        List<ScheduleHourResponse> occupancySchedule
) {

    public static ShelterDesignDetailResponse from(ShelterDesign d, List<Opening> windows, List<Opening> doors,
                                                     ThermalMass thermalMass, List<OccupancyScheduleHour> occupancySchedule) {
        return new ShelterDesignDetailResponse(
                d.getId(), d.getProject().getId(), d.getName(), d.getShape().name(),
                d.getLengthM(), d.getWidthM(), d.getHeightM(), d.getDiameterM(),
                d.getLengthAM(), d.getWidthAM(), d.getLengthBM(), d.getWidthBM(),
                d.getOrientation().name(), d.getAzimuthDeg(),
                d.getWallMaterial().getId(), d.getWallThicknessMm(),
                d.getRoofMaterial().getId(), d.getRoofThicknessMm(),
                d.getFloorMaterial().getId(), d.getFloorThicknessMm(),
                d.getWallInsulationMaterial() != null ? d.getWallInsulationMaterial().getId() : null, d.getWallInsulationThicknessMm(),
                d.getRoofInsulationMaterial() != null ? d.getRoofInsulationMaterial().getId() : null, d.getRoofInsulationThicknessMm(),
                d.getAirLeakageAch(), d.getComfortProfile().getId(),
                d.getOccupancyCount(), d.getOccupancyActivity() != null ? d.getOccupancyActivity().name() : null,
                d.getInternalHeatGainW(), d.getGroundTempC(),
                windows.stream().map(OpeningResponse::from).toList(),
                doors.stream().map(OpeningResponse::from).toList(),
                thermalMass != null ? ThermalMassResponse.from(thermalMass) : null,
                occupancySchedule == null || occupancySchedule.isEmpty() ? null
                    : occupancySchedule.stream().map(ScheduleHourResponse::from).toList()
        );
    }

    public record OpeningResponse(Long id, BigDecimal areaEach, int count, String orientation, Long glazingMaterialId) {
        public static OpeningResponse from(Opening o) {
            return new OpeningResponse(
                    o.getId(), o.getAreaEachM2(), o.getCount(), o.getOrientation().name(),
                    o.getGlazingMaterial() != null ? o.getGlazingMaterial().getId() : null
            );
        }
    }

    public record ThermalMassResponse(Long materialId, BigDecimal massKg, BigDecimal surfaceAreaM2, String exposure) {
        public static ThermalMassResponse from(ThermalMass tm) {
            return new ThermalMassResponse(
                    tm.getMaterial().getId(), tm.getMassKg(), tm.getSurfaceAreaM2(), tm.getExposure().name()
            );
        }
    }

    public record ScheduleHourResponse(int hourOfDay, int occupancyCount, String occupancyActivity) {
        public static ScheduleHourResponse from(OccupancyScheduleHour row) {
            return new ScheduleHourResponse(row.getHourOfDay(), row.getOccupancyCount(), row.getOccupancyActivity().name());
        }
    }
}
