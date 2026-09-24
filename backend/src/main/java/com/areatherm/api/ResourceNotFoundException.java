package com.areatherm.api;

/**
 * Thrown by any controller in this package when a path/body-referenced id
 * (project, location, material, ...) does not exist. Translated to a 404
 * via {@link ApiExceptionHandler}.
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
