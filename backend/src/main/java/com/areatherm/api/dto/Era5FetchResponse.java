package com.areatherm.api.dto;

import com.areatherm.climate.era5.Era5NetcdfParser;

public record Era5FetchResponse(Long id, String status, Era5NetcdfParser.MonthlyHourlyProfile profile, String errorMessage) {
}
