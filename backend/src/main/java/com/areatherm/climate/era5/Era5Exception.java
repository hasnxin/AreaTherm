package com.areatherm.climate.era5;

/** Any failure talking to CDS or parsing its response -- always caught and turned into an Era5Fetch.Status.FAILED row, never propagated raw to a caller. */
public class Era5Exception extends RuntimeException {
    public Era5Exception(String message) {
        super(message);
    }

    public Era5Exception(String message, Throwable cause) {
        super(message, cause);
    }
}
