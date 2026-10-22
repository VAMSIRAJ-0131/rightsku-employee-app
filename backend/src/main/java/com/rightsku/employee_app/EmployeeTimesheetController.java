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
import org.springframework.web.bind.annotation.PutMapping;
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

    /**
     * One week (start = its Monday): days, saved hours, status and the
     * expected, entered and remaining hours.
     */
    @GetMapping("/timesheets/week")
    public WeekTimesheetResponse week(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @AuthenticationPrincipal Jwt jwt) {
        return timesheetService.weekMine(userId(jwt), start);
    }

    /** "Save": keeps the week as a draft. Nothing is sent for approval. */
    @PutMapping("/timesheets/week/draft")
    public WeekTimesheetResponse saveDraft(@Valid @RequestBody WeekTimesheetRequest request, @AuthenticationPrincipal Jwt jwt) {
        return timesheetService.saveDraft(userId(jwt), request);
    }

    /** "Submit for approval": the whole week in one step. */
    @PostMapping("/timesheets/week/submit")
    public WeekTimesheetResponse submitWeek(@Valid @RequestBody WeekTimesheetRequest request, @AuthenticationPrincipal Jwt jwt) {
        return timesheetService.submitWeek(userId(jwt), request);
    }

    /**
     * The older one-day submit, kept working for app versions installed
     * before weekly submission. Each day gets the same checks as the weekly
     * screen (working day, leave, 1-9 hours, ...), and a week that was
     * already submitted as a whole can't be added to. It can't check the
     * weekly target: one day at a time never reaches it. To be switched off
     * once every installed app uses weekly submission.
     */
    @PostMapping("/timesheets")
    @ResponseStatus(HttpStatus.CREATED)
    public TimesheetResponse submit(@Valid @RequestBody TimesheetRequest request, @AuthenticationPrincipal Jwt jwt) {
        return timesheetService.submitOneDay(userId(jwt), request);
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
