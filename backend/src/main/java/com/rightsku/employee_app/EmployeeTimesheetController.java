package com.rightsku.employee_app;

import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in employee's working calendar and timesheets.
 * /api/employee/** requires the EMPLOYEE role; the employee is always taken
 * from the token.
 */
@RestController
@RequestMapping("/api/employee")
public class EmployeeTimesheetController {

    private final TimesheetService timesheetService;

    public EmployeeTimesheetController(TimesheetService timesheetService) {
        this.timesheetService = timesheetService;
    }

    /** Working days, weekly offs and holidays between two dates (both included). */
    @GetMapping("/calendar")
    public CalendarResponse calendar(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal Jwt jwt) {
        return timesheetService.calendarMine(userId(jwt), from, to);
    }

    @GetMapping("/timesheets")
    public List<TimesheetResponse> timesheets(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal Jwt jwt) {
        return timesheetService.listMine(userId(jwt), from, to);
    }

    @PostMapping("/timesheets")
    @ResponseStatus(HttpStatus.CREATED)
    public TimesheetResponse submit(@Valid @RequestBody TimesheetRequest request, @AuthenticationPrincipal Jwt jwt) {
        return timesheetService.submit(userId(jwt), request);
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
