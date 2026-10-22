package com.rightsku.employee_app;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Web-layer tests: only HR manages schedules and holidays; only the signed-in
 * employee reads their calendar and submits their own timesheets. Services
 * are mocked, so no database is used.
 */
@WebMvcTest(
        controllers = {HrScheduleController.class, EmployeeTimesheetController.class},
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class, TimeConfig.class})
class ScheduleAndTimesheetControllerTest {

    private static final String SCHEDULE = """
            {"weeklyOffs":["SUNDAY"],"hoursPerDay":8,"effectiveFrom":"2026-10-05"}""";
    private static final String HOLIDAY = """
            {"date":"2026-10-02","name":"Gandhi Jayanti"}""";
    private static final String OLD_ONE_DAY = """
            {"date":"2026-10-12","hours":7.5,"description":"Built the payslip screen"}""";
    private static final String WEEK = """
            {"weekStart":"2026-10-05","description":"Built the payslip screen",
             "days":[{"date":"2026-10-05","hours":9},{"date":"2026-10-06","hours":null}]}""";
    private static final WeekTimesheetRequest WEEK_REQUEST = new WeekTimesheetRequest(LocalDate.parse("2026-10-05"),
            "Built the payslip screen", List.of(
                    new WeekTimesheetRequest.DayHours(LocalDate.parse("2026-10-05"), new BigDecimal("9")),
                    new WeekTimesheetRequest.DayHours(LocalDate.parse("2026-10-06"), null)));

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private ScheduleService scheduleService;

    @MockitoBean
    private HolidayService holidayService;

    @MockitoBean
    private TimesheetService timesheetService;

    @MockitoBean
    private AppUserRepository appUserRepository;

    private String hrToken;
    private String employeeToken;

    private String tokenFor(long id, String loginId, String email, String role) {
        AppUser user = AppUser.create(loginId, email, "not-a-real-hash", role);
        ReflectionTestUtils.setField(user, "id", id);
        when(appUserRepository.findById(id)).thenReturn(Optional.of(user));
        return jwtService.generateToken(user);
    }

    @BeforeEach
    void setUp() {
        hrToken = tokenFor(1L, null, "hr@rightsku.com", AppUser.ROLE_HR_ADMIN);
        employeeToken = tokenFor(110L, "EMP010", "ravi@rightsku.com", AppUser.ROLE_EMPLOYEE);
    }

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder builder, String token) {
        return builder.header("Authorization", "Bearer " + token);
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    /* ---------- HR only ---------- */

    @Test
    void employeesCannotChangeSchedulesOrHolidays() throws Exception {
        mockMvc.perform(as(json(put("/api/hr/employees/10/schedule"), SCHEDULE), employeeToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(as(get("/api/hr/employees/10/schedule"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(json(post("/api/hr/holidays"), HOLIDAY), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(delete("/api/hr/holidays/5"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(json(post("/api/hr/holidays"), HOLIDAY)).andExpect(status().isUnauthorized());
        verify(scheduleService, never()).set(anyLong(), any(), any());
        verify(holidayService, never()).create(any(), any());
        verify(holidayService, never()).delete(anyLong(), any());
    }

    @Test
    void hrSetsAScheduleRecordedAsThemselves() throws Exception {
        ScheduleResponse.View view = new ScheduleResponse.View(LocalDate.parse("2026-10-05"), List.of("SUNDAY"),
                new BigDecimal("8.00"), false);
        when(scheduleService.set(eq(10L), any(), eq(1L)))
                .thenReturn(new ScheduleResponse(10L, view, List.of(), List.of(view), view));

        mockMvc.perform(as(json(put("/api/hr/employees/10/schedule"), SCHEDULE), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.current.weeklyOffs[0]").value("SUNDAY"));
        verify(scheduleService).set(eq(10L), eq(new ScheduleRequest(List.of("SUNDAY"), new BigDecimal("8"),
                LocalDate.parse("2026-10-05"))), eq(1L));
    }

    @Test
    void scheduleRequestNeedsAllFields() throws Exception {
        mockMvc.perform(as(json(put("/api/hr/employees/10/schedule"), "{\"weeklyOffs\":[\"SUNDAY\"]}"), hrToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.hoursPerDay").exists())
                .andExpect(jsonPath("$.fields.effectiveFrom").exists());
    }

    @Test
    void hrManagesHolidays() throws Exception {
        when(holidayService.create(any(), eq(1L))).thenReturn(
                new HolidayResponse(5L, LocalDate.parse("2026-10-02"), "Gandhi Jayanti", "FRIDAY"));
        when(holidayService.list(2026)).thenReturn(List.of(
                new HolidayResponse(5L, LocalDate.parse("2026-10-02"), "Gandhi Jayanti", "FRIDAY")));

        mockMvc.perform(as(json(post("/api/hr/holidays"), HOLIDAY), hrToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.date").value("2026-10-02"));
        mockMvc.perform(as(get("/api/hr/holidays").param("year", "2026"), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Gandhi Jayanti"));
        mockMvc.perform(as(delete("/api/hr/holidays/5"), hrToken)).andExpect(status().isNoContent());
        verify(holidayService).delete(5L, 1L);
        mockMvc.perform(as(json(post("/api/hr/holidays"), "{\"date\":\"2026-10-02\",\"name\":\" \"}"), hrToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.name").exists());
    }

    /* ---------- Employee: own calendar and timesheets ---------- */

    private static WeekTimesheetResponse weekResponse(String status) {
        BigDecimal nine = new BigDecimal("9.00");
        return new WeekTimesheetResponse(LocalDate.parse("2026-10-05"), LocalDate.parse("2026-10-11"),
                LocalDate.parse("2026-10-14"), status, "Built the payslip screen", null, null,
                List.of(new WeekTimesheetResponse.Day(LocalDate.parse("2026-10-05"), "WORKING", false, null, false, null,
                        nine, nine, nine, null, true)),
                new WeekTimesheetResponse.Target(new BigDecimal("45.00"), BigDecimal.ZERO, BigDecimal.ZERO,
                        new BigDecimal("45.00"), nine, new BigDecimal("36.00")),
                LocalDate.parse("2026-10-09"), false, "Enter 36 more hours to reach this week's 45 hours.");
    }

    @Test
    void employeeReadsSavesAndSubmitsTheirOwnWeek() throws Exception {
        when(timesheetService.weekMine(110L, LocalDate.parse("2026-10-05"))).thenReturn(weekResponse("NOT_STARTED"));
        when(timesheetService.saveDraft(eq(110L), any())).thenReturn(weekResponse("DRAFT"));
        when(timesheetService.submitWeek(eq(110L), any())).thenReturn(weekResponse("SUBMITTED"));

        mockMvc.perform(as(get("/api/employee/timesheets/week").param("start", "2026-10-05"), employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.target.expectedHours").value(45.00))
                .andExpect(jsonPath("$.target.remainingHours").value(36.00))
                .andExpect(jsonPath("$.submitBlockedReason").value("Enter 36 more hours to reach this week's 45 hours."));
        mockMvc.perform(as(json(put("/api/employee/timesheets/week/draft"), WEEK), employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));
        mockMvc.perform(as(json(post("/api/employee/timesheets/week/submit"), WEEK), employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUBMITTED"));

        // The employee always comes from the token (user 110), never from the request.
        verify(timesheetService).saveDraft(110L, WEEK_REQUEST);
        verify(timesheetService).submitWeek(110L, WEEK_REQUEST);
    }

    @Test
    void serverRefusalsReachTheApp() throws Exception {
        when(timesheetService.submitWeek(eq(110L), any()))
                .thenThrow(ApiException.invalid("target", "Enter 9 more hours to reach this week's 45 hours."));
        when(timesheetService.saveDraft(eq(110L), any()))
                .thenThrow(ApiException.invalid("days[2026-10-10]", "Sat 10 Oct 2026 is your weekly off."));

        mockMvc.perform(as(json(post("/api/employee/timesheets/week/submit"), WEEK), employeeToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.target").value("Enter 9 more hours to reach this week's 45 hours."));
        mockMvc.perform(as(json(put("/api/employee/timesheets/week/draft"), WEEK), employeeToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields['days[2026-10-10]']").value("Sat 10 Oct 2026 is your weekly off."));
    }

    @Test
    void weekRequestNeedsAWeekAndDays() throws Exception {
        mockMvc.perform(as(json(put("/api/employee/timesheets/week/draft"), "{\"description\":\"x\"}"), employeeToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.weekStart").exists())
                .andExpect(jsonPath("$.fields.days").exists());
        verify(timesheetService, never()).saveDraft(anyLong(), any());
    }

    @Test
    void theOlderOneDaySubmitStillWorksForTheSignedInEmployee() throws Exception {
        when(timesheetService.submitOneDay(eq(110L), any())).thenReturn(new TimesheetResponse(900L,
                LocalDate.parse("2026-10-12"), new BigDecimal("7.50"), "Built the payslip screen", "PENDING",
                Instant.parse("2026-10-12T12:00:00Z"), null));

        mockMvc.perform(as(json(post("/api/employee/timesheets"), OLD_ONE_DAY), employeeToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"));
        verify(timesheetService).submitOneDay(eq(110L), eq(new TimesheetRequest(LocalDate.parse("2026-10-12"),
                new BigDecimal("7.5"), "Built the payslip screen")));
    }

    @Test
    void oneDayRefusalsKeepTheirOldFields() throws Exception {
        when(timesheetService.submitOneDay(eq(110L), any()))
                .thenThrow(ApiException.conflict("date", "This week has already been submitted, so no more days can be added."));

        mockMvc.perform(as(json(post("/api/employee/timesheets"), OLD_ONE_DAY), employeeToken))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.fields.date").value("This week has already been submitted, so no more days can be added."));
    }

    @Test
    void employeeReadsOwnCalendar() throws Exception {
        when(timesheetService.calendarMine(110L, LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-31")))
                .thenReturn(new CalendarResponse(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-31"),
                        LocalDate.parse("2026-10-14"), List.of(new CalendarResponse.Day(LocalDate.parse("2026-10-02"),
                        "HOLIDAY", false, "Gandhi Jayanti", new BigDecimal("8.00")))));

        mockMvc.perform(as(get("/api/employee/calendar").param("from", "2026-10-01").param("to", "2026-10-31"), employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days[0].kind").value("HOLIDAY"))
                .andExpect(jsonPath("$.days[0].holidayName").value("Gandhi Jayanti"));
    }

    @Test
    void hrAndAnonymousCannotUseEmployeeTimesheetEndpoints() throws Exception {
        mockMvc.perform(as(json(post("/api/employee/timesheets/week/submit"), WEEK), hrToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(json(put("/api/employee/timesheets/week/draft"), WEEK), hrToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(get("/api/employee/timesheets/week").param("start", "2026-10-05"), hrToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(as(json(post("/api/employee/timesheets"), OLD_ONE_DAY), hrToken)).andExpect(status().isForbidden());
        mockMvc.perform(json(post("/api/employee/timesheets"), OLD_ONE_DAY)).andExpect(status().isUnauthorized());
        mockMvc.perform(json(post("/api/employee/timesheets/week/submit"), WEEK)).andExpect(status().isUnauthorized());
        mockMvc.perform(json(put("/api/employee/timesheets/week/draft"), WEEK)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/employee/calendar").param("from", "2026-10-01").param("to", "2026-10-31"))
                .andExpect(status().isUnauthorized());
        verify(timesheetService, never()).submitWeek(anyLong(), any());
        verify(timesheetService, never()).saveDraft(anyLong(), any());
        verify(timesheetService, never()).weekMine(anyLong(), any());
        verify(timesheetService, never()).submitOneDay(anyLong(), any());
    }

    @Test
    void badDateParametersAre400() throws Exception {
        mockMvc.perform(as(get("/api/employee/calendar").param("from", "not-a-date").param("to", "2026-10-31"), employeeToken))
                .andExpect(status().isBadRequest());
        mockMvc.perform(as(get("/api/employee/calendar").param("from", "2026-10-01"), employeeToken))
                .andExpect(status().isBadRequest());
    }
}
