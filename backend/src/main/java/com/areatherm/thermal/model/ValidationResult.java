package com.areatherm.thermal.model;

import java.util.List;

/** Mirrors validateDesign()/validateCoordinates() -- never throws, always returns a result. */
public record ValidationResult(boolean valid, List<String> errors) {
}
