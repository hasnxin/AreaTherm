package com.areatherm.api;

import com.areatherm.climate.LocationRepository;
import com.areatherm.design.ShelterDesignRepository;
import com.areatherm.project.Project;
import com.areatherm.project.ProjectRepository;
import com.areatherm.project.dto.CreateProjectRequest;
import com.areatherm.project.dto.ProjectResponse;
import com.areatherm.security.AppUser;
import com.areatherm.security.AppUserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Projects aren't in API_SPEC.md's own endpoint list, but every other
 * resource there (locations, comfort profiles, shelter designs, ...) is
 * scoped by {@code project_id}, so a project CRUD entry point is a
 * necessary addition. Every endpoint here is scoped to the authenticated
 * caller (the JWT principal -- see {@link AppUserPrincipal}): {@link
 * #list} returns only the caller's own projects, {@link #create} derives
 * {@code Project.owner} from that principal rather than trusting a
 * client-supplied id, and {@link #delete} only ever touches a project the
 * caller owns.
 */
@RestController
@RequestMapping("/api/v1/projects")
@Tag(name = "Projects")
public class ProjectController {

    private final ProjectRepository projectRepository;
    private final LocationRepository locationRepository;
    private final ShelterDesignRepository shelterDesignRepository;

    public ProjectController(ProjectRepository projectRepository, LocationRepository locationRepository,
                              ShelterDesignRepository shelterDesignRepository) {
        this.projectRepository = projectRepository;
        this.locationRepository = locationRepository;
        this.shelterDesignRepository = shelterDesignRepository;
    }

    @GetMapping
    @Operation(summary = "List the caller's own projects")
    public List<ProjectResponse> list(@AuthenticationPrincipal AppUserPrincipal principal) {
        return projectRepository.findByOwnerId(principal.getAppUser().getId()).stream().map(ProjectResponse::from).toList();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a project by id", description = "404 if the project doesn't exist or isn't owned by the caller.")
    public ProjectResponse get(@AuthenticationPrincipal AppUserPrincipal principal, @PathVariable Long id) {
        return ProjectResponse.from(requireOwnedProject(id, principal));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a project",
            description = "The project's owner is the authenticated caller; there is no owner/user-id request field.")
    public ProjectResponse create(@AuthenticationPrincipal AppUserPrincipal principal, @Valid @RequestBody CreateProjectRequest request) {
        AppUser owner = principal.getAppUser();

        Project project = new Project();
        project.setOwner(owner);
        project.setName(request.name());
        project.setDescription(request.description());

        return ProjectResponse.from(projectRepository.save(project));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a project",
            description = "404 if the project doesn't exist or isn't owned by the caller; 409 if it still has child "
                    + "records (shelter designs, locations) that must be deleted first.")
    public void delete(@AuthenticationPrincipal AppUserPrincipal principal, @PathVariable Long id) {
        Project project = requireOwnedProject(id, principal);

        if (shelterDesignRepository.existsByProjectId(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Project " + id + " has shelter designs -- cannot delete");
        }
        if (locationRepository.existsByProjectId(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Project " + id + " has locations -- cannot delete");
        }

        projectRepository.delete(project);
    }

    /** A project owned by someone else 404s too, instead of leaking that it exists. */
    private Project requireOwnedProject(Long id, AppUserPrincipal principal) {
        return projectRepository.findByIdAndOwnerId(id, principal.getAppUser().getId())
                .orElseThrow(() -> new ResourceNotFoundException("Project " + id + " not found"));
    }
}
