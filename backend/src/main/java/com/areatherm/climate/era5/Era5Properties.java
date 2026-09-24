package com.areatherm.climate.era5;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Binds the {@code areatherm.era5.*} block in application.yml. {@code
 * apiKey} left blank (the default, unset locally) means ERA5 is simply
 * unavailable -- {@link Era5Service#isAvailable()} reports this, every
 * other feature in the app is unaffected. See application.yml's own
 * comment for how to obtain and set a real key.
 */
@Component
@ConfigurationProperties(prefix = "areatherm.era5")
@Getter
@Setter
public class Era5Properties {

    private String apiUrl;
    private String apiKey;
    private long pollIntervalMs;
    private long pollTimeoutMs;

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
