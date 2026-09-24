package com.areatherm.optimization.model;

import java.util.List;

public record SensitivityResult(double baseScore, List<ParameterImpact> impacts) {
    public record ParameterImpact(String parameter, double deltaScore) {
    }
}
