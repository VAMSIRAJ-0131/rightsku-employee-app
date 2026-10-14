package com.rightsku.employee_app;

import java.time.LocalDate;

/** A company holiday as returned by the API. weekday is MONDAY ... SUNDAY. */
public record HolidayResponse(Long id, LocalDate date, String name, String weekday) {

    static HolidayResponse from(CompanyHoliday h) {
        return new HolidayResponse(h.getId(), h.getDate(), h.getName(), h.getDate().getDayOfWeek().name());
    }
}
