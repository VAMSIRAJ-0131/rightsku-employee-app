package com.rightsku.employee_app;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The company holiday list for employees (read only). /api/employee/**
 * requires the EMPLOYEE role. Holidays are created, changed and removed only
 * by HR through /api/hr/holidays; every saved holiday is the published list.
 */
@RestController
@RequestMapping("/api/employee/holidays")
public class EmployeeHolidayController {

    private final HolidayService holidayService;
    private final Clock clock;

    public EmployeeHolidayController(HolidayService holidayService, Clock clock) {
        this.holidayService = holidayService;
        this.clock = clock;
    }

    /** One calendar year (default: this year), in date order. The service checks the year range. */
    @GetMapping
    public List<HolidayResponse> holidays(@RequestParam(required = false) Integer year) {
        return holidayService.list(year != null ? year : LocalDate.now(clock).getYear());
    }
}
