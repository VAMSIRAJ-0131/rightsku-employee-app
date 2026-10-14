package com.rightsku.employee_app;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.util.List;

/**
 * HR: employee working schedules and the company holiday calendar.
 * /api/hr/** requires the HR_ADMIN role (see SecurityConfig).
 */
@RestController
@RequestMapping("/api/hr")
public class HrScheduleController {

    private final ScheduleService scheduleService;
    private final HolidayService holidayService;
    private final java.time.Clock clock;

    public HrScheduleController(ScheduleService scheduleService, HolidayService holidayService, java.time.Clock clock) {
        this.scheduleService = scheduleService;
        this.holidayService = holidayService;
        this.clock = clock;
    }

    @GetMapping("/employees/{employeeId}/schedule")
    public ScheduleResponse getSchedule(@PathVariable long employeeId) {
        return scheduleService.get(employeeId);
    }

    @PutMapping("/employees/{employeeId}/schedule")
    public ScheduleResponse setSchedule(
            @PathVariable long employeeId,
            @Valid @RequestBody ScheduleRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return scheduleService.set(employeeId, request, actorId(jwt));
    }

    /** Holidays of one year (default: the current year). */
    @GetMapping("/holidays")
    public List<HolidayResponse> holidays(@RequestParam(required = false) Integer year) {
        return holidayService.list(year != null ? year : LocalDate.now(clock).getYear());
    }

    @PostMapping("/holidays")
    @ResponseStatus(HttpStatus.CREATED)
    public HolidayResponse addHoliday(@Valid @RequestBody HolidayRequest request, @AuthenticationPrincipal Jwt jwt) {
        return holidayService.create(request, actorId(jwt));
    }

    @PutMapping("/holidays/{id}")
    public HolidayResponse changeHoliday(
            @PathVariable long id, @Valid @RequestBody HolidayRequest request, @AuthenticationPrincipal Jwt jwt) {
        return holidayService.update(id, request, actorId(jwt));
    }

    @DeleteMapping("/holidays/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeHoliday(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        holidayService.delete(id, actorId(jwt));
    }

    private static Long actorId(Jwt jwt) {
        return jwt == null ? null : Long.valueOf(jwt.getSubject());
    }
}
