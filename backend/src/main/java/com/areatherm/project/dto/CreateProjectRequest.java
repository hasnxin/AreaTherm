package com.areatherm.project.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * {@code Project.owner} is derived from the authenticated caller (the JWT
 * principal -- see {@code ProjectController#create}), never supplied by the
 * client, so this request body carries no owner/user id field at all.
 */
public record CreateProjectRequest(
        @NotBlank String name,
        String description
) {
}
