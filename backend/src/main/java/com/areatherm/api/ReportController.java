package com.areatherm.api;

import com.areatherm.api.dto.CreateReportRequest;
import com.areatherm.report.Report;
import com.areatherm.report.ReportService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/** Implements API_SPEC.md's Reports resource. */
@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody CreateReportRequest req) {
        try {
            Report report = reportService.generate(req.projectId(), req.simulationId(), req.optimizationRunId(), req.generatedByUserId());
            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "id", report.getId(), "title", report.getTitle(),
                "generatedAt", report.getGeneratedAt().toString(), "fileUrl", "/api/v1/reports/" + report.getId() + "/file"
            ));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        Report report = reportService.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No report with id " + id));
        return Map.of(
            "id", report.getId(), "title", report.getTitle(), "modelVersion", report.getModelVersion(),
            "generatedAt", report.getGeneratedAt().toString(),
            "fileUrl", report.getFilePath() != null ? "/api/v1/reports/" + report.getId() + "/file" : null
        );
    }

    @GetMapping(value = "/{id}/file", produces = "application/pdf")
    public ResponseEntity<org.springframework.core.io.Resource> download(@PathVariable Long id) {
        Report report = reportService.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No report with id " + id));
        if (report.getFilePath() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Report file not yet generated");
        }
        org.springframework.core.io.Resource file = new org.springframework.core.io.FileSystemResource(report.getFilePath());
        if (!file.exists()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Report file missing on disk: " + report.getFilePath());
        }
        return ResponseEntity.ok()
            .header("Content-Disposition", "attachment; filename=\"report-" + id + ".pdf\"")
            .body(file);
    }
}
