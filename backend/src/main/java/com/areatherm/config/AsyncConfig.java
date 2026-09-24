package com.areatherm.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Backs the QUEUED -> RUNNING -> COMPLETE/FAILED job flow for simulations
 * and optimization runs (API_SPEC.md's 202 Accepted contract) with a plain
 * bounded thread pool -- no queue/broker needed at this scale, and it
 * upgrades cleanly later without a controller-contract change.
 */
@Configuration
public class AsyncConfig {

    @Bean(name = "engineTaskExecutor")
    public Executor engineTaskExecutor(
        @Value("${areatherm.async.core-pool-size:4}") int corePoolSize,
        @Value("${areatherm.async.max-pool-size:8}") int maxPoolSize,
        @Value("${areatherm.async.queue-capacity:100}") int queueCapacity
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("engine-");
        executor.initialize();
        return executor;
    }

    /**
     * Separate, smaller pool for verification-code/login-notification
     * emails (see EmailService) -- kept independent of engineTaskExecutor
     * so a slow/unreachable SMTP server can never delay simulation or
     * optimization job dispatch, or vice versa.
     */
    @Bean(name = "mailTaskExecutor")
    public Executor mailTaskExecutor(
        @Value("${areatherm.mail.async.core-pool-size:2}") int corePoolSize,
        @Value("${areatherm.mail.async.max-pool-size:4}") int maxPoolSize,
        @Value("${areatherm.mail.async.queue-capacity:50}") int queueCapacity
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("mail-");
        executor.initialize();
        return executor;
    }
}
