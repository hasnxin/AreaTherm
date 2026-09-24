package com.areatherm.api;

import com.areatherm.design.ComfortProfile;
import com.areatherm.design.ComfortProfileRepository;
import com.areatherm.design.dto.ComfortProfileResponse;
import com.areatherm.design.dto.CreateComfortProfileRequest;
import com.areatherm.project.Project;
import com.areatherm.project.ProjectRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/comfort-profiles")
@Tag(name = "Comfort Profiles")
public class ComfortProfileController {

    private final ComfortProfileRepository comfortProfileRepository;
    private final ProjectRepository projectRepository;

    public ComfortProfileController(ComfortProfileRepository comfortProfileRepository, ProjectRepository projectRepository) {
        this.comfortProfileRepository = comfortProfileRepository;
        this.projectRepository = projectRepository;
    }

    @GetMapping
    @Operation(summary = "List comfort profiles for a project")
    public List<ComfortProfileResponse> list(@RequestParam Long projectId) {
        return comfortProfileRepository.findByProjectId(projectId).stream().map(ComfortProfileResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a comfort profile")
    public ComfortProfileResponse create(@Valid @RequestBody CreateComfortProfileRequest request) {
        Project project = projectRepository.findById(request.projectId())
                .orElseThrow(() -> new ResourceNotFoundException("Project " + request.projectId() + " not found"));

        ComfortProfile profile = new ComfortProfile();
        profile.setProject(project);
        profile.setProfileType(request.profileType());
        profile.setName(request.name());
        // comfort_min_c is stored AS the already-effective minimum -- the
        // schema has no clothing-level (clo) / activity-level (met) columns,
        // so this endpoint does not itself apply any such shift; the caller
        // is expected to send the already-shifted value (see API_SPEC.md).
        profile.setComfortMinC(request.comfortMinC());
        profile.setComfortMaxC(request.comfortMaxC());
        profile.setNotes(request.notes());

        return ComfortProfileResponse.from(comfortProfileRepository.save(profile));
    }
}
