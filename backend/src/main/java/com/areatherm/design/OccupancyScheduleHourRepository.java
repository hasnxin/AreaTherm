package com.areatherm.design;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OccupancyScheduleHourRepository extends JpaRepository<OccupancyScheduleHour, Long> {

    /** Ordered by hour so callers can rely on index == hour-of-day without re-sorting. */
    List<OccupancyScheduleHour> findByShelterDesignIdOrderByHourOfDay(Long shelterDesignId);
}
