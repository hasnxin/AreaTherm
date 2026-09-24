/* AreaTherm — pre-simulation input validation.
   Rejects nonsensical design/state values before they reach the thermal
   engine, instead of letting a NaN or divide-by-zero propagate silently.
   Returns { valid, errors: [{ field, message }] } — `field` matches a
   form control id where one exists, so the UI can focus/highlight it. */

window.APP_VALIDATOR = (function () {
  const ENGINE = window.APP_ENGINE;

  function validateDesign(state) {
    const errors = [];
    const d = state.design;
    if (!d) return { valid: false, errors: [{ field: null, message: "No shelter design defined yet." }] };

    const isRound = ["CIRCULAR", "DOME", "SEMI_CIRCULAR"].includes(d.shape);
    const isLShape = d.shape === "L_SHAPE";
    let dimsOk = false;
    if (isRound) {
      if (!(d.diameter > 0)) errors.push({ field: "dDiameter", message: "Diameter must be greater than 0 m." });
      dimsOk = d.diameter > 0;
    } else if (isLShape) {
      if (!(d.lengthA > 0)) errors.push({ field: "dLengthA", message: "Wing A length must be greater than 0 m." });
      if (!(d.widthA > 0)) errors.push({ field: "dWidthA", message: "Wing A width must be greater than 0 m." });
      if (!(d.lengthB > 0)) errors.push({ field: "dLengthB", message: "Wing B length must be greater than 0 m." });
      if (!(d.widthB > 0)) errors.push({ field: "dWidthB", message: "Wing B width must be greater than 0 m." });
      if (d.widthB > 0 && d.lengthA > 0 && d.widthB > d.lengthA) {
        errors.push({ field: "dWidthB", message: "Wing B width must not exceed Wing A length (the two wings must actually form an L)." });
      }
      dimsOk = d.lengthA > 0 && d.widthA > 0 && d.lengthB > 0 && d.widthB > 0 && d.widthB <= d.lengthA;
    } else {
      if (!(d.length > 0)) errors.push({ field: "dLength", message: "Length must be greater than 0 m." });
      if (!(d.width > 0)) errors.push({ field: "dWidth", message: "Width must be greater than 0 m." });
      if ((d.length || 0) + (d.width || 0) <= 0.5) {
        errors.push({ field: "dLength", message: "Length + width must be greater than 0.5 m combined." });
      }
      dimsOk = d.length > 0 && d.width > 0;
    }
    const heightField = isLShape ? "dHeight3" : isRound ? "dHeight2" : "dHeight";
    if (!(d.height > 0)) errors.push({ field: heightField, message: "Height must be greater than 0 m." });

    if (d.occupancy != null && !(d.occupancy >= 0 && d.occupancy <= 50)) {
      errors.push({ field: "dOccupancy", message: "Occupancy must be between 0 and 50 people." });
    }

    if (d.occupancySchedule != null) {
      if (!Array.isArray(d.occupancySchedule) || d.occupancySchedule.length !== 24) {
        errors.push({ field: "dOccupancySchedule", message: "Occupancy schedule must have exactly 24 hourly entries." });
      } else {
        const validActivity = new Set(["SLEEPING", "SEATED", "LIGHT", "MODERATE", "HEAVY"]);
        d.occupancySchedule.forEach((entry, h) => {
          if (!entry || !(entry.persons >= 0 && entry.persons <= 50)) {
            errors.push({ field: "dOccupancySchedule", message: `Occupancy schedule hour ${h}: persons must be between 0 and 50.` });
          }
          if (!entry || !validActivity.has(entry.activityId)) {
            errors.push({ field: "dOccupancySchedule", message: `Occupancy schedule hour ${h}: unrecognized activity level.` });
          }
        });
      }
    }

    [["wall", "Wall", "dWallInsThick"], ["roof", "Roof", "dRoofInsThick"]].forEach(([key, label, field]) => {
      const t = d[key] && d[key].insulationThicknessMm;
      if (t != null && !(t >= 0 && t <= 200)) {
        errors.push({ field, message: `${label} insulation thickness must be between 0 and 200 mm.` });
      }
    });

    if (d.airLeakageAch != null && !(d.airLeakageAch >= 0 && d.airLeakageAch <= 2)) {
      errors.push({ field: "dAch", message: "Air leakage (ACH) must be between 0 and 2." });
    }

    if (ENGINE && dimsOk && d.height > 0) {
      try {
        const geom = ENGINE.computeGeometry(d);
        const totalWindowArea = (d.windows || []).reduce((s, w) => s + (w.areaEach || 0) * (w.count || 0), 0);
        if (geom.wallArea > 0 && totalWindowArea / geom.wallArea > 0.5) {
          errors.push({ field: "dWinArea", message: "Total window area exceeds 50% of wall area." });
        }
      } catch (e) { /* geometry not computable yet — dimension errors above already cover this */ }
    }

    if (state.location) {
      const lat = state.location.latitude, lon = state.location.longitude;
      if (lat != null && (lat < -90 || lat > 90)) errors.push({ field: null, message: "Latitude must be between -90 and 90." });
      if (lon != null && (lon < -180 || lon > 180)) errors.push({ field: null, message: "Longitude must be between -180 and 180." });
    }

    return { valid: errors.length === 0, errors };
  }

  return { validateDesign };
})();
