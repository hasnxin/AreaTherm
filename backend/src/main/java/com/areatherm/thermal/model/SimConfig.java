package com.areatherm.thermal.model;

public record SimConfig(int timeStepMinutes, PeriodType periodType, int days) {
    public enum PeriodType {
        TWENTY_FOUR_HOUR, SEVEN_DAY, THIRTY_DAY, SEASONAL, CUSTOM
    }
}
