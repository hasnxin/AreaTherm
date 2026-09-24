package com.areatherm.climate.era5;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Same QUEUED -> RUNNING -> COMPLETE/FAILED async-job shape as
 * SimulationService (see its runAsync javadoc for why @Transactional
 * covers the whole async method here too), except the "work" is itself a
 * remote submit-then-poll cycle against CDS, not a local computation.
 */
@Service
public class Era5Service {

    private static final Logger log = LoggerFactory.getLogger(Era5Service.class);

    private final Era5FetchRepository repository;
    private final Era5Client client;
    private final Era5NetcdfParser parser;
    private final Era5Properties props;
    private final ObjectMapper objectMapper;

    public Era5Service(Era5FetchRepository repository, Era5Client client, Era5NetcdfParser parser,
                        Era5Properties props, ObjectMapper objectMapper) {
        this.repository = repository;
        this.client = client;
        this.parser = parser;
        this.props = props;
        this.objectMapper = objectMapper;
    }

    public boolean isAvailable() {
        return props.isConfigured();
    }

    @Transactional(readOnly = true)
    public java.util.Optional<Era5Fetch> findById(Long id) {
        return repository.findById(id);
    }

    /**
     * Returns an existing COMPLETE/QUEUED/RUNNING fetch for this point/month
     * if one exists (sharing the cache across users -- see Era5Fetch's
     * javadoc), otherwise creates a fresh QUEUED row. Coordinates are
     * rounded to 2dp (~1km) so nearby requests for "the same place" actually
     * share a row.
     *
     * Deliberately does NOT call runAsync itself: @Async only takes effect
     * through Spring's proxy, which a same-class self-invocation (this.foo())
     * bypasses entirely -- calling it from here would silently run it
     * synchronously on this same request thread and transaction instead of
     * in the background (confirmed the hard way: this is exactly what
     * happened on the first live test, a DataIntegrityViolationException
     * from something ELSE deep inside the synchronous call unwound back
     * through THIS method's own @Transactional commit). The caller
     * (Era5Controller) calls runAsync separately, from outside this class,
     * the same way SimulationController calls
     * SimulationService.createQueued/runAsync as two separate calls --
     * see runAsync's own javadoc.
     */
    @Transactional
    public Era5Fetch findOrCreateQueued(double lat, double lon, int year, int month) {
        BigDecimal roundedLat = BigDecimal.valueOf(lat).setScale(2, RoundingMode.HALF_UP);
        BigDecimal roundedLon = BigDecimal.valueOf(lon).setScale(2, RoundingMode.HALF_UP);
        var existing = repository.findByLatitudeAndLongitudeAndYearAndMonth(roundedLat, roundedLon, year, month);
        if (existing.isPresent() && existing.get().getStatus() != Era5Fetch.Status.FAILED) {
            return existing.get();
        }
        Era5Fetch fetch = existing.orElseGet(Era5Fetch::new);
        fetch.setLatitude(roundedLat);
        fetch.setLongitude(roundedLon);
        fetch.setYear(year);
        fetch.setMonth(month);
        fetch.setStatus(Era5Fetch.Status.QUEUED);
        fetch.setErrorMessage(null);
        return repository.save(fetch);
    }

    /**
     * Must be called from OUTSIDE this class (e.g. Era5Controller), never as
     * a same-class self-invocation from findOrCreateQueued above -- see its
     * javadoc for why that silently defeats @Async.
     */
    @Async("engineTaskExecutor")
    @Transactional
    public void runAsync(Long fetchId, double exactLat, double exactLon) {
        Era5Fetch fetch = repository.findById(fetchId).orElse(null);
        if (fetch == null) {
            log.warn("runAsync: era5_fetch {} no longer exists", fetchId);
            return;
        }
        fetch.setStatus(Era5Fetch.Status.RUNNING);
        repository.save(fetch);

        try {
            Era5Client.JobHandle job = client.submitMonth(exactLat, exactLon, fetch.getYear(), fetch.getMonth());
            fetch.setCdsJobId(job.jobId());
            repository.save(fetch);

            long deadline = System.currentTimeMillis() + props.getPollTimeoutMs();
            Era5Client.JobStatus status;
            do {
                if (System.currentTimeMillis() > deadline) {
                    throw new Era5Exception("Timed out waiting for CDS job " + job.jobId() + " after " + props.getPollTimeoutMs() + "ms");
                }
                Thread.sleep(props.getPollIntervalMs());
                status = client.pollStatus(job.jobId());
            } while (!status.isTerminal());

            if (!"successful".equals(status.status())) {
                throw new Era5Exception("CDS job " + job.jobId() + " ended with status: " + status.status());
            }

            String downloadUrl = client.resultDownloadUrl(job.jobId());
            byte[] netcdf = client.download(downloadUrl);
            Era5NetcdfParser.MonthlyHourlyProfile profile = parser.parse(netcdf, exactLat, exactLon);

            fetch.setResultJson(objectMapper.writeValueAsString(profile));
            fetch.setStatus(Era5Fetch.Status.COMPLETE);
            fetch.setCompletedAt(LocalDateTime.now());
            repository.save(fetch);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("ERA5 fetch {} interrupted", fetchId, e);
            fetch.setStatus(Era5Fetch.Status.FAILED);
            fetch.setErrorMessage("Interrupted");
            repository.save(fetch);
        } catch (Exception e) {
            log.error("ERA5 fetch {} failed", fetchId, e);
            fetch.setStatus(Era5Fetch.Status.FAILED);
            fetch.setErrorMessage(String.valueOf(e.getMessage()));
            repository.save(fetch);
        }
    }
}
