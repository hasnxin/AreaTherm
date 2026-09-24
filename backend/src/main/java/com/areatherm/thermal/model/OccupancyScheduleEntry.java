package com.areatherm.thermal.model;

/**
 * One hour's entry in Design.occupancySchedule() -- mirrors app/js/data.js's
 * OCCUPANCY_SCHEDULES preset shape ({persons, activityId}), except activity
 * is already resolved to an ActivityLevelSpec, same pattern as
 * Design.occupancyActivity() itself (see that field's javadoc).
 */
public record OccupancyScheduleEntry(int persons, ActivityLevelSpec activity) {
}
