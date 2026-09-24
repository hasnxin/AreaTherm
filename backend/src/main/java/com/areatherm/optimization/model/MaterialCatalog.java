package com.areatherm.optimization.model;

import com.areatherm.thermal.model.MaterialProperties;

import java.util.Map;

/**
 * All materials the optimizer's fixed candidate systems (WALL_SYSTEMS,
 * ROOF_SYSTEMS, MASS_OPTIONS, glazing options) reference by id, resolved
 * once per optimization run by the design/material service layer and
 * passed in -- never looked up per-candidate (567+ candidates would
 * otherwise mean 567+ repository hits for the same handful of rows).
 */
public record MaterialCatalog(Map<String, MaterialProperties> byId) {
    public MaterialProperties get(String id) {
        if (id == null) return null;
        MaterialProperties m = byId.get(id);
        if (m == null) throw new IllegalStateException("Material not in catalog: " + id);
        return m;
    }
}
