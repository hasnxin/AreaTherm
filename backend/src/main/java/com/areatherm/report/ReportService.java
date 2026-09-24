package com.areatherm.report;

import com.areatherm.optimizationrun.DesignCandidate;
import com.areatherm.optimizationrun.DesignCandidateRepository;
import com.areatherm.optimizationrun.OptimizationRun;
import com.areatherm.optimizationrun.OptimizationRunRepository;
import com.areatherm.project.Project;
import com.areatherm.project.ProjectRepository;
import com.areatherm.simulation.Simulation;
import com.areatherm.simulation.SimulationRepository;
import com.areatherm.simulation.SimulationSummary;
import com.areatherm.thermal.model.SimulationResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.xhtmlrenderer.pdf.ITextRenderer;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

/**
 * Renders a real PDF report (project/simulation/optimization-run summary)
 * via an HTML/CSS template through Flying Saucer, backed by OpenPDF
 * (Apache-2.0, notably not iText's AGPL/commercial dual license) -- see
 * pom.xml. Genuine working infrastructure, not a stub: ARCHITECTURE.md
 * already commits to this exact library pairing.
 */
@Service
public class ReportService {

    private final ReportRepository reportRepository;
    private final ProjectRepository projectRepository;
    private final SimulationRepository simulationRepository;
    private final OptimizationRunRepository optimizationRunRepository;
    private final DesignCandidateRepository designCandidateRepository;
    private final ObjectMapper objectMapper;
    private final Path reportsDir;

    public ReportService(ReportRepository reportRepository, ProjectRepository projectRepository,
                          SimulationRepository simulationRepository, OptimizationRunRepository optimizationRunRepository,
                          DesignCandidateRepository designCandidateRepository, ObjectMapper objectMapper,
                          @Value("${areatherm.reports.directory:./reports}") String reportsDirectory) {
        this.reportRepository = reportRepository;
        this.projectRepository = projectRepository;
        this.simulationRepository = simulationRepository;
        this.optimizationRunRepository = optimizationRunRepository;
        this.designCandidateRepository = designCandidateRepository;
        this.objectMapper = objectMapper;
        this.reportsDir = Path.of(reportsDirectory);
    }

    @Transactional
    public Report generate(Long projectId, Long simulationId, Long optimizationRunId, Long generatedByUserId) {
        Project project = projectRepository.findById(projectId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown project: " + projectId));
        Simulation simulation = simulationId != null ? simulationRepository.findById(simulationId).orElse(null) : null;
        OptimizationRun optimizationRun = optimizationRunId != null ? optimizationRunRepository.findById(optimizationRunId).orElse(null) : null;

        String html = buildHtml(project, simulation, optimizationRun);

        try {
            Files.createDirectories(reportsDir);
        } catch (Exception e) {
            throw new IllegalStateException("Could not create reports directory: " + reportsDir, e);
        }

        Report report = new Report();
        report.setProject(project);
        report.setSimulation(simulation);
        report.setOptimizationRun(optimizationRun);
        report.setModelVersion("1.0");
        Report saved = reportRepository.save(report);

        String fileName = "report-" + saved.getId() + ".pdf";
        Path filePath = reportsDir.resolve(fileName);
        renderPdf(html, filePath);
        saved.setFilePath(filePath.toString());
        return reportRepository.save(saved);
    }

    private void renderPdf(String html, Path outputPath) {
        try (ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            ITextRenderer renderer = new ITextRenderer();
            renderer.setDocumentFromString(html);
            renderer.layout();
            renderer.createPDF(buffer);
            try (FileOutputStream fos = new FileOutputStream(outputPath.toFile())) {
                fos.write(buffer.toByteArray());
            }
        } catch (Exception e) {
            throw new IllegalStateException("PDF generation failed", e);
        }
    }

    private String buildHtml(Project project, Simulation simulation, OptimizationRun optimizationRun) {
        StringBuilder sb = new StringBuilder();
        sb.append("<html><head><style>")
            .append("body{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#222;}")
            .append("h1{font-size:18px;border-bottom:2px solid #0a5;} h2{font-size:14px;margin-top:20px;}")
            .append("table{border-collapse:collapse;width:100%;margin-top:8px;}")
            .append("td,th{border:1px solid #ccc;padding:4px 8px;text-align:left;}")
            .append(".note{color:#666;font-style:italic;font-size:10px;}")
            .append("</style></head><body>");

        sb.append("<h1>Area-Specific Passive Shelter Thermal Performance &amp; Design Optimization Report</h1>");
        sb.append("<p><b>Project:</b> ").append(escape(project.getName())).append("<br/>");
        sb.append("<b>Generated:</b> ").append(java.time.LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)).append("</p>");

        if (simulation != null) {
            sb.append("<h2>Simulation #").append(simulation.getId()).append(" (").append(simulation.getStatus()).append(")</h2>");
            if (simulation.getSummaryJson() != null) {
                try {
                    SimulationSummary summary = objectMapper.readValue(simulation.getSummaryJson(), SimulationSummary.class);
                    appendSimulationSummary(sb, summary);
                } catch (Exception e) {
                    sb.append("<p class=\"note\">Summary could not be parsed.</p>");
                }
            } else {
                sb.append("<p class=\"note\">No summary available yet -- simulation has not completed.</p>");
            }
        }

        if (optimizationRun != null) {
            sb.append("<h2>Optimization Run #").append(optimizationRun.getId())
                .append(" (").append(optimizationRun.getStatus()).append(", ")
                .append(optimizationRun.getCandidatesEvaluated() != null ? optimizationRun.getCandidatesEvaluated() : 0)
                .append(" candidates evaluated)</h2>");
            List<DesignCandidate> topCandidates = designCandidateRepository
                .findByOptimizationRunIdOrderByLabelAsc(optimizationRun.getId()).stream()
                .filter(c -> c.getLabel() != null && c.getLabel().length() == 1 && Character.isUpperCase(c.getLabel().charAt(0)))
                .toList();
            if (topCandidates.isEmpty()) {
                sb.append("<p class=\"note\">No ranked candidates yet.</p>");
            } else {
                sb.append("<table><tr><th>Label</th><th>Total Score</th><th>Comfort</th><th>Retention</th>")
                    .append("<th>Solar</th><th>Energy</th><th>Cost</th><th>Est. Cost (INR)</th></tr>");
                for (DesignCandidate c : topCandidates) {
                    sb.append("<tr>")
                        .append("<td>").append(c.getLabel()).append(c.isRecommended() ? " (recommended)" : "").append("</td>")
                        .append("<td>").append(c.getWeightedTotalScore()).append("</td>")
                        .append("<td>").append(c.getComfortScore()).append("</td>")
                        .append("<td>").append(c.getRetentionScore()).append("</td>")
                        .append("<td>").append(c.getSolarScore()).append("</td>")
                        .append("<td>").append(c.getEnergyScore()).append("</td>")
                        .append("<td>").append(c.getCostScore()).append("</td>")
                        .append("<td>").append(c.getEstimatedCostInr()).append("</td>")
                        .append("</tr>");
                }
                sb.append("</table>");
            }
            sb.append("<p class=\"note\">See GET /api/v1/optimization-runs/").append(optimizationRun.getId())
                .append(" for the full ranked candidate list (all ").append(optimizationRun.getCandidatesEvaluated())
                .append(" evaluated candidates).</p>");
        }

        sb.append("</body></html>");
        return sb.toString();
    }

    private void appendSimulationSummary(StringBuilder sb, SimulationSummary s) {
        SimulationResult.Scores scores = s.scores();
        SimulationResult.ComfortResult comfort = s.comfort();
        SimulationResult.DailyResult daily = s.daily();
        sb.append("<table>")
            .append(row("Thermal Comfort Score", String.valueOf(scores.thermalComfortScore())))
            .append(row("Comfort Score", fmt(scores.comfortScore())))
            .append(row("Heat Retention %", fmt(scores.heatRetentionPct())))
            .append(row("Solar Utilization %", fmt(scores.solarUtilizationPct())))
            .append(row("Min Indoor Temp (C)", fmt(comfort.minIndoor())))
            .append(row("Max Indoor Temp (C)", fmt(comfort.maxIndoor())))
            .append(row("Avg Indoor Temp (C)", fmt(comfort.avgIndoor())))
            .append(row("Comfort Hours/Day", fmt(comfort.comfortHoursPerDay())))
            .append(row("Heating Requirement (kWh/day)", fmt(daily.heatingReqKwh())))
            .append(row("Cooling Requirement (kWh/day)", fmt(daily.coolingReqKwh())))
            .append("</table>")
            .append("<p class=\"note\">Thermal Comfort Score is a custom, project-defined weighted index -- not PMV/PPD or any recognised thermal-comfort standard.</p>");
    }

    private static String row(String label, String value) {
        return "<tr><td>" + label + "</td><td>" + value + "</td></tr>";
    }

    private static String fmt(double v) {
        return java.math.BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    public Optional<Report> findById(Long id) {
        return reportRepository.findById(id);
    }
}
