package com.areatherm.api;

import com.areatherm.climate.ClimateProfileRepository;
import com.areatherm.climate.Location;
import com.areatherm.climate.LocationRepository;
import com.areatherm.climate.dto.ClimateProfileSummaryResponse;
import com.areatherm.climate.dto.CreateLocationRequest;
import com.areatherm.climate.dto.LocationResponse;
import com.areatherm.project.Project;
import com.areatherm.project.ProjectRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/locations")
@Tag(name = "Locations")
public class LocationController {

    private final LocationRepository locationRepository;
    private final ProjectRepository projectRepository;
    private final ClimateProfileRepository climateProfileRepository;

    public LocationController(LocationRepository locationRepository, ProjectRepository projectRepository,
                               ClimateProfileRepository climateProfileRepository) {
        this.locationRepository = locationRepository;
        this.projectRepository = projectRepository;
        this.climateProfileRepository = climateProfileRepository;
    }

    @GetMapping
    @Operation(summary = "List saved locations for a project")
    public List<LocationResponse> list(@RequestParam Long projectId) {
        return locationRepository.findByProjectId(projectId).stream().map(LocationResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a location under a project")
    public LocationResponse create(@Valid @RequestBody CreateLocationRequest request) {
        Project project = projectRepository.findById(request.projectId())
                .orElseThrow(() -> new ResourceNotFoundException("Project " + request.projectId() + " not found"));

        Location location = new Location();
        location.setProject(project);
        // Leave the entity's "India" default in place unless the caller
        // actually supplied a country -- overwriting it with null would trip
        // the column's NOT NULL constraint.
        if (request.country() != null && !request.country().isBlank()) {
            location.setCountry(request.country());
        }
        location.setState(request.state());
        location.setDistrict(request.district());
        location.setVillage(request.village());
        location.setLatitude(request.latitude());
        location.setLongitude(request.longitude());
        location.setElevationM(request.elevationM());

        return LocationResponse.from(locationRepository.save(location));
    }

    @GetMapping("/{id}/climate-profiles")
    @Operation(summary = "List climate profiles for a location")
    public List<ClimateProfileSummaryResponse> climateProfiles(@PathVariable Long id) {
        if (!locationRepository.existsById(id)) {
            throw new ResourceNotFoundException("Location " + id + " not found");
        }
        return climateProfileRepository.findByLocationId(id).stream().map(ClimateProfileSummaryResponse::from).toList();
    }
}
