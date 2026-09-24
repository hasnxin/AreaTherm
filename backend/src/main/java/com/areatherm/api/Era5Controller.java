package com.areatherm.api;

import com.areatherm.api.dto.Era5FetchRequest;
import com.areatherm.api.dto.Era5FetchResponse;
import com.areatherm.climate.era5.Era5Fetch;
import com.areatherm.climate.era5.Era5NetcdfParser;
import com.areatherm.climate.era5.Era5Service;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Optional, opt-in real-ERA5-data source (see Era5Properties' javadoc for
 * how it's configured). Same 202-then-poll shape as
 * /simulations|/optimization-runs, except GET may return COMPLETE
 * immediately on the very first poll when a cached fetch for this point/
 * month already existed -- the frontend doesn't need to special-case that,
 * just poll until a terminal status either way.
 */
@RestController
@RequestMapping("/api/v1/climate/era5-fetch")
public class Era5Controller {

    private final Era5Service era5Service;
    private final ObjectMapper objectMapper;

    public Era5Controller(Era5Service era5Service, ObjectMapper objectMapper) {
        this.era5Service = era5Service;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/availability")
    public Map<String, Boolean> availability() {
        return Map.of("available", era5Service.isAvailable());
    }

    @PostMapping
    public ResponseEntity<Era5FetchResponse> create(@Valid @RequestBody Era5FetchRequest req) {
        if (!era5Service.isAvailable()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "ERA5 is not configured on this server");
        }
        Era5Fetch fetch = era5Service.findOrCreateQueued(req.latitude(), req.longitude(), req.year(), req.month());
        // Only a freshly-created row needs kicking off -- an existing
        // RUNNING/COMPLETE row (the cache-sharing case) is already handled.
        // Called from here, not from inside findOrCreateQueued itself, so
        // @Async actually applies -- see runAsync's own javadoc.
        if (fetch.getStatus() == Era5Fetch.Status.QUEUED) {
            era5Service.runAsync(fetch.getId(), req.latitude(), req.longitude());
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(toResponse(fetch));
    }

    @GetMapping("/{id}")
    public Era5FetchResponse get(@PathVariable Long id) {
        Era5Fetch fetch = era5Service.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No ERA5 fetch with id " + id));
        return toResponse(fetch);
    }

    private Era5FetchResponse toResponse(Era5Fetch fetch) {
        Era5NetcdfParser.MonthlyHourlyProfile profile = null;
        if (fetch.getResultJson() != null) {
            try {
                profile = objectMapper.readValue(fetch.getResultJson(), Era5NetcdfParser.MonthlyHourlyProfile.class);
            } catch (Exception e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not parse stored ERA5 result");
            }
        }
        return new Era5FetchResponse(fetch.getId(), fetch.getStatus().name(), profile, fetch.getErrorMessage());
    }
}
