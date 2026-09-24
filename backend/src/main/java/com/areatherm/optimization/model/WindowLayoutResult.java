package com.areatherm.optimization.model;

import com.areatherm.thermal.model.Opening;

import java.util.List;

public record WindowLayoutResult(Option current, Option best, List<Option> all) {
    public record Option(String label, List<Opening> groups, int score) {
    }
}
