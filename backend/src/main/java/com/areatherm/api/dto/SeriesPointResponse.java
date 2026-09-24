package com.areatherm.api.dto;

import com.areatherm.simulation.SimulationResultPoint;

import java.math.BigDecimal;

public record SeriesPointResponse(
    int tsOffsetMinutes, BigDecimal ambientTempC, BigDecimal indoorTempC, BigDecimal massTempC,
    BigDecimal solarGainW, BigDecimal wallLossW, BigDecimal roofLossW, BigDecimal floorLossW,
    BigDecimal openingLossW, BigDecimal ventLossW, BigDecimal massExchangeW, BigDecimal netBalanceW,
    Boolean inComfortBand
) {
    public static SeriesPointResponse from(SimulationResultPoint p) {
        return new SeriesPointResponse(
            p.getTsOffsetMinutes(), p.getAmbientTempC(), p.getIndoorTempC(), p.getMassTempC(),
            p.getSolarGainW(), p.getWallLossW(), p.getRoofLossW(), p.getFloorLossW(),
            p.getOpeningLossW(), p.getVentLossW(), p.getMassExchangeW(), p.getNetBalanceW(),
            p.getInComfortBand()
        );
    }
}
