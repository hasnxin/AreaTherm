package com.areatherm.climate.era5;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import ucar.ma2.Array;
import ucar.ma2.Index;
import ucar.nc2.NetcdfFile;
import ucar.nc2.NetcdfFiles;
import ucar.nc2.Variable;

/**
 * Parses one month's ERA5 NetCDF file (as requested by Era5Client.submitMonth)
 * into a 24-point average-by-hour-of-day profile, directly usable as a
 * Season.hourly value -- ThermalEngine/engine.js already support a real
 * hourly series as an input (see Season's own javadoc), so this needs no
 * change to the physics engine on either side, only to supply real data
 * for that existing slot instead of the usual synthetic sinusoidal
 * fallback.
 *
 * NOT verified against a real downloaded file (no CDS account existed to
 * test against while writing this) -- variable/dimension names below
 * (time/latitude/longitude, t2m/d2m/u10/v10/ssrd/tp/stl1) are ERA5's
 * standard, long-documented short names, but CDS has changed a NetCDF
 * output convention before (e.g. a "time" vs "valid_time" dimension
 * rename in 2024) and may again. findVariableIgnoreCase with a few
 * fallback names per field is a defensive attempt at that, not a
 * guarantee -- if parsing fails against a real file, the exception
 * message names exactly which variable/dimension lookup came back empty.
 */
@Component
public class Era5NetcdfParser {

    public record MonthlyHourlyProfile(List<HourPoint> hourly, double groundTempC) {
        public record HourPoint(double temp, double solar, double windMs) {
        }
    }

    private static final double KELVIN_TO_C = -273.15;

    public MonthlyHourlyProfile parse(byte[] netcdfBytes, double targetLat, double targetLon) {
        Path tmp = null;
        try {
            tmp = Files.createTempFile("era5-", ".nc");
            Files.write(tmp, netcdfBytes);
            try (NetcdfFile nc = NetcdfFiles.open(tmp.toString())) {
                Variable latVar = requireVariable(nc, "latitude", "lat");
                Variable lonVar = requireVariable(nc, "longitude", "lon");
                int[] nearest = nearestGridPoint(latVar, lonVar, targetLat, targetLon);
                int latIdx = nearest[0], lonIdx = nearest[1];

                double[] t2m = readSeriesAtPoint(nc, latIdx, lonIdx, "t2m", "2m_temperature");
                double[] d2m = readSeriesAtPoint(nc, latIdx, lonIdx, "d2m", "2m_dewpoint_temperature");
                double[] u10 = readSeriesAtPoint(nc, latIdx, lonIdx, "u10", "10m_u_component_of_wind");
                double[] v10 = readSeriesAtPoint(nc, latIdx, lonIdx, "v10", "10m_v_component_of_wind");
                double[] ssrd = readSeriesAtPoint(nc, latIdx, lonIdx, "ssrd", "surface_solar_radiation_downwards");
                double[] stl1 = readSeriesAtPoint(nc, latIdx, lonIdx, "stl1", "soil_temperature_level_1");

                int hoursInMonth = t2m.length;
                double[] sumTemp = new double[24], sumSolar = new double[24], sumWind = new double[24];
                int[] count = new int[24];
                double groundSum = 0;
                for (int i = 0; i < hoursInMonth; i++) {
                    int hourOfDay = i % 24;
                    sumTemp[hourOfDay] += t2m[i] + KELVIN_TO_C;
                    // ssrd is J/m^2 accumulated over the hour -> average W/m^2.
                    sumSolar[hourOfDay] += Math.max(0, ssrd[i] / 3600.0);
                    double windMs = Math.hypot(u10[i], v10[i]);
                    sumWind[hourOfDay] += windMs;
                    count[hourOfDay]++;
                    groundSum += stl1[i] + KELVIN_TO_C;
                }
                List<MonthlyHourlyProfile.HourPoint> hourly = new ArrayList<>(24);
                for (int h = 0; h < 24; h++) {
                    int n = Math.max(1, count[h]);
                    hourly.add(new MonthlyHourlyProfile.HourPoint(sumTemp[h] / n, sumSolar[h] / n, sumWind[h] / n));
                }
                double groundTempC = groundSum / hoursInMonth;
                return new MonthlyHourlyProfile(hourly, groundTempC);
            }
        } catch (IOException e) {
            throw new Era5Exception("Failed to parse ERA5 NetCDF response", e);
        } finally {
            if (tmp != null) {
                try { Files.deleteIfExists(tmp); } catch (IOException ignored) { /* best-effort cleanup */ }
            }
        }
    }

    private Variable requireVariable(NetcdfFile nc, String... candidateNames) {
        for (String name : candidateNames) {
            Variable v = nc.findVariable(name);
            if (v != null) return v;
        }
        throw new Era5Exception("ERA5 NetCDF file has none of the expected variables: " + String.join(", ", candidateNames)
            + " -- actual variables: " + nc.getVariables().stream().map(Variable::getShortName).toList());
    }

    private int[] nearestGridPoint(Variable latVar, Variable lonVar, double targetLat, double targetLon) throws IOException {
        double[] lats = toDoubleArray(latVar.read());
        double[] lons = toDoubleArray(lonVar.read());
        int bestLat = 0;
        double bestLatDist = Double.MAX_VALUE;
        for (int i = 0; i < lats.length; i++) {
            double d = Math.abs(lats[i] - targetLat);
            if (d < bestLatDist) { bestLatDist = d; bestLat = i; }
        }
        int bestLon = 0;
        double bestLonDist = Double.MAX_VALUE;
        for (int i = 0; i < lons.length; i++) {
            // ERA5 longitudes are conventionally 0-360; normalize both sides
            // before comparing so a target given as e.g. -180..180 still matches.
            double lonNormalized = ((lons[i] + 540) % 360) - 180;
            double d = Math.abs(lonNormalized - (((targetLon + 540) % 360) - 180));
            if (d < bestLonDist) { bestLonDist = d; bestLon = i; }
        }
        return new int[]{bestLat, bestLon};
    }

    /** Reads one (time, lat, lon) variable's full time series at a fixed grid point. */
    private double[] readSeriesAtPoint(NetcdfFile nc, int latIdx, int lonIdx, String... candidateNames) throws IOException {
        Variable v = requireVariable(nc, candidateNames);
        Array full = v.read();
        int[] shape = full.getShape(); // expected [time, lat, lon]
        if (shape.length != 3) throw new Era5Exception("Expected a 3D (time,lat,lon) variable for " + v.getShortName() + ", got shape " + java.util.Arrays.toString(shape));
        int timeLen = shape[0];
        double[] out = new double[timeLen];
        Index idx = full.getIndex();
        for (int t = 0; t < timeLen; t++) {
            idx.set(t, latIdx, lonIdx);
            out[t] = full.getDouble(idx);
        }
        return out;
    }

    private double[] toDoubleArray(Array a) {
        int n = (int) a.getSize();
        double[] out = new double[n];
        for (int i = 0; i < n; i++) out[i] = a.getDouble(i);
        return out;
    }
}
