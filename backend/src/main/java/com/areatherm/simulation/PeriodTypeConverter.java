package com.areatherm.simulation;

import com.areatherm.thermal.model.SimConfig;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Maps {@link SimConfig.PeriodType} (the physics engine's own period-type
 * enum -- reused here rather than duplicated) to/from
 * {@code simulation.period_type}'s stored values. Not applied via
 * {@code EnumType.STRING} because {@code '24H'} starts with a digit and
 * isn't a valid Java enum-constant identifier -- see the DDL comment at the
 * top of V1__init.sql. Applied explicitly per-field with
 * {@code @Convert(converter = PeriodTypeConverter.class)}, not
 * {@code autoApply}.
 */
@Converter(autoApply = false)
public class PeriodTypeConverter implements AttributeConverter<SimConfig.PeriodType, String> {

    @Override
    public String convertToDatabaseColumn(SimConfig.PeriodType attribute) {
        if (attribute == null) {
            return null;
        }
        return switch (attribute) {
            case TWENTY_FOUR_HOUR -> "24H";
            case SEVEN_DAY -> "7D";
            case THIRTY_DAY -> "30D";
            case SEASONAL -> "SEASONAL";
            case CUSTOM -> "CUSTOM";
        };
    }

    @Override
    public SimConfig.PeriodType convertToEntityAttribute(String dbData) {
        if (dbData == null) {
            return null;
        }
        return switch (dbData) {
            case "24H" -> SimConfig.PeriodType.TWENTY_FOUR_HOUR;
            case "7D" -> SimConfig.PeriodType.SEVEN_DAY;
            case "30D" -> SimConfig.PeriodType.THIRTY_DAY;
            case "SEASONAL" -> SimConfig.PeriodType.SEASONAL;
            case "CUSTOM" -> SimConfig.PeriodType.CUSTOM;
            default -> throw new IllegalArgumentException("Unknown simulation.period_type value: " + dbData);
        };
    }
}
