package com.areatherm.climate.era5;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Raw HTTP client for the Copernicus Climate Data Store's REST API (the
 * "ECMWF Data Stores Processing API" -- an OGC API Processes / WPS-style
 * interface, not the Python `cdsapi` package, which this backend can't use
 * directly). Fully verified live against a real account on 2026-09-24:
 * base path is apiUrl + /retrieve/v1 (see PROCESSING_API_BASE -- the first
 * live attempt, using just apiUrl, got a real 404 "API endpoint not found");
 * POST /processes/{id}/execution to submit (id = dataset short name), GET
 * /jobs/{id} to poll (status: accepted|running|successful|failed|rejected|
 * dismissed), GET /jobs/{id}/results for a Link to the actual file, auth via
 * a PRIVATE-TOKEN header. The "inputs" shape below (including
 * product_type, missed on the first pass) and all 7 VARIABLES entries were
 * checked field-for-field against the dataset's own live process schema
 * (GET /processes/reanalysis-era5-single-levels's inputs.*.schema.items.enum)
 * -- every one confirmed a valid enum value, not just plausible-looking.
 * Genuinely unverified past this point: the actual downloaded NetCDF file's
 * internal variable/dimension names (Era5NetcdfParser's own javadoc covers
 * that) -- this class's job ends at handing over valid file bytes.
 */
@Component
public class Era5Client {

    private static final String DATASET = "reanalysis-era5-single-levels";
    private static final List<String> VARIABLES = List.of(
        "2m_temperature", "2m_dewpoint_temperature",
        "10m_u_component_of_wind", "10m_v_component_of_wind",
        "surface_solar_radiation_downwards", "total_precipitation",
        "soil_temperature_level_1"
    );

    private final Era5Properties props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();

    public Era5Client(Era5Properties props) {
        this.props = props;
    }

    public record JobHandle(String jobId) {
    }

    /** area: tight bounding box around one point -- [north, west, south, east], degrees. */
    public JobHandle submitMonth(double lat, double lon, int year, int month) {
        double pad = 0.15; // ERA5's native grid is ~0.25 deg; this comfortably brackets one cell
        List<Double> area = List.of(lat + pad, lon - pad, lat - pad, lon + pad);
        List<String> days = java.util.stream.IntStream.rangeClosed(1, java.time.YearMonth.of(year, month).lengthOfMonth())
            .mapToObj(d -> String.format("%02d", d)).toList();
        List<String> hours = java.util.stream.IntStream.range(0, 24).mapToObj(h -> String.format("%02d:00", h)).toList();

        var body = mapper.createObjectNode();
        var inputs = body.putObject("inputs");
        // Confirmed required by the live process schema (GET
        // /processes/reanalysis-era5-single-levels's own inputs.product_type,
        // enum includes "reanalysis") and present in CDS's own generated
        // "Show API request" example for this dataset -- this backend's
        // first live submission omitted it entirely.
        inputs.putPOJO("product_type", List.of("reanalysis"));
        inputs.putPOJO("variable", VARIABLES);
        inputs.put("year", String.format("%04d", year));
        inputs.putPOJO("month", List.of(String.format("%02d", month)));
        inputs.putPOJO("day", days);
        inputs.putPOJO("time", hours);
        inputs.putPOJO("area", area);
        inputs.put("data_format", "netcdf");
        inputs.put("download_format", "unarchived");

        HttpRequest req = authedRequest("/processes/" + DATASET + "/execution")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofByteArray(writeBytes(body)))
            .build();
        JsonNode resp = sendForJson(req, 201, 200);
        String jobId = resp.path("jobID").asText(null);
        if (jobId == null) throw new Era5Exception("CDS job submission response had no jobID: " + resp);
        return new JobHandle(jobId);
    }

    public record JobStatus(String status, int progress) {
        public boolean isTerminal() { return "successful".equals(status) || "failed".equals(status) || "dismissed".equals(status); }
    }

    public JobStatus pollStatus(String jobId) {
        HttpRequest req = authedRequest("/jobs/" + jobId).GET().build();
        JsonNode resp = sendForJson(req, 200);
        return new JobStatus(resp.path("status").asText("unknown"), resp.path("progress").asInt(0));
    }

    /** Resolves the completed job's actual downloadable file URL from its results envelope. */
    public String resultDownloadUrl(String jobId) {
        HttpRequest req = authedRequest("/jobs/" + jobId + "/results").GET().build();
        JsonNode resp = sendForJson(req, 200);
        // Results is a map of named outputs; a single-file dataset retrieval
        // typically has exactly one, but scan all of them defensively rather
        // than assume a fixed key name.
        var fields = resp.fields();
        while (fields.hasNext()) {
            var entry = fields.next();
            JsonNode href = entry.getValue().path("href");
            if (href.isTextual()) return href.asText();
            JsonNode nestedHref = entry.getValue().path("link").path("href");
            if (nestedHref.isTextual()) return nestedHref.asText();
        }
        throw new Era5Exception("CDS job results had no downloadable href: " + resp);
    }

    public byte[] download(String url) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMinutes(5)).GET().build();
            HttpResponse<byte[]> resp = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() / 100 != 2) throw new Era5Exception("Downloading ERA5 result failed: HTTP " + resp.statusCode());
            return resp.body();
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new Era5Exception("Downloading ERA5 result failed", e);
        }
    }

    // areatherm.era5.api-url is deliberately the general base
    // (https://cds.climate.copernicus.eu/api) matching what CDS's own docs
    // and .cdsapirc show -- /retrieve/v1 is this specific processing API's
    // own sub-path, confirmed live (2026-09-24) against
    // GET /api/retrieve/v1/processes/reanalysis-era5-single-levels -> 200.
    // Getting this wrong the first time around produced a real, confirmed
    // 404 ("Climate Data Store API endpoint not found") against the bare
    // api-url + /processes/... path this method used before.
    private static final String PROCESSING_API_BASE = "/retrieve/v1";

    private HttpRequest.Builder authedRequest(String path) {
        if (!props.isConfigured()) throw new Era5Exception("ERA5 is not configured (no areatherm.era5.api-key set)");
        return HttpRequest.newBuilder(URI.create(props.getApiUrl() + PROCESSING_API_BASE + path))
            .timeout(Duration.ofSeconds(30))
            .header("PRIVATE-TOKEN", props.getApiKey())
            .header("Accept", "application/json");
    }

    private JsonNode sendForJson(HttpRequest req, int... acceptableStatus) {
        try {
            HttpResponse<byte[]> resp = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
            boolean ok = java.util.stream.IntStream.of(acceptableStatus).anyMatch(s -> s == resp.statusCode());
            if (!ok) {
                throw new Era5Exception("CDS API call to " + req.uri() + " returned HTTP " + resp.statusCode()
                    + ": " + new String(resp.body(), java.nio.charset.StandardCharsets.UTF_8));
            }
            return mapper.readTree(resp.body());
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new Era5Exception("CDS API call to " + req.uri() + " failed", e);
        }
    }

    private byte[] writeBytes(JsonNode node) {
        try {
            return mapper.writeValueAsBytes(node);
        } catch (IOException e) {
            throw new Era5Exception("Failed to serialize CDS request body", e);
        }
    }
}
