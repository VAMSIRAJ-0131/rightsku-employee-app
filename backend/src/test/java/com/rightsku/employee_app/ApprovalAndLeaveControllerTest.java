package com.rightsku.employee_app;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
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
 * Web-layer tests: only HR reviews timesheets and leave and changes balances;
 * employees only read their own balance and apply for themselves. Services
 * are mocked, so no database is used.
 */
@WebMvcTest(
        controllers = {HrApprovalController.class, EmployeeLeaveController.class, HrCompOffController.class,
                EmployeeCompOffController.class},
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class, TimeConfig.class})
class ApprovalAndLeaveControllerTest {

    private static final String REVIEW = """
            {"employeeId":10,"weekStart":"2026-10-05","decision":"APPROVE"}""";
    private static final String BALANCE = """
            {"balanceDays":7.5}""";
    private static final String APPLY = """
            {"leaveType":"CASUAL","startDate":"2026-10-19","endDate":"2026-10-20","reason":"Family function"}""";
    private static final String COMP_OFF_CHANGE = """
            {"changeDays":1.5,"reason":"Worked on Sunday","requestKey":"key-ctl-0001"}""";
    private static final String COMP_OFF_APPLY = """
            {"leaveType":"COMP_OFF","startDate":"2026-10-19","endDate":"2026-10-19","reason":"Day off for Sunday work"}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private HrTimesheetService timesheets;

    @MockitoBean
    private LeaveService leave;

    @MockitoBean
    private CompOffService compOff;

    @MockitoBean
    private CompOffRequestService compOffRequests;

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

    private static LeaveBalanceResponse casual(String days) {
        return new LeaveBalanceResponse("CASUAL", "Casual", new BigDecimal(days), BigDecimal.ZERO, new BigDecimal(days), null);
    }

    @Test
    void employeesCannotReviewOrChangeBalances() throws Exception {
        mockMvc.perform(as(get("/api/hr/timesheets"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(json(post("/api/hr/timesheets/review"), REVIEW), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(get("/api/hr/approvals/summary"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(post("/api/hr/leave-requests/5/approve"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(json(put("/api/hr/employees/10/leave-balances/CASUAL"), BALANCE), employeeToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(json(put("/api/hr/employees/10/leave-balances/CASUAL"), BALANCE)).andExpect(status().isUnauthorized());
        verify(timesheets, never()).review(any(), any());
        verify(leave, never()).setBalance(anyLong(), anyString(), any(), any());
        verify(leave, never()).approve(anyLong(), any(), any());
    }

    @Test
    void hrReviewsAWeekAsThemselves() throws Exception {
        when(timesheets.review(any(), eq(1L))).thenReturn(new HrTimesheetWeekResponse(10L, "EMP010", "Ravi Kumar",
                LocalDate.parse("2026-10-05"), LocalDate.parse("2026-10-11"), new BigDecimal("45"), null, "APPROVED", null, null, List.of(), List.of()));
        when(timesheets.summary()).thenReturn(new ApprovalSummaryResponse(
                new ApprovalSummaryResponse.Counts(2, 5, 1), new ApprovalSummaryResponse.Counts(1, 0, 0)));
        when(compOffRequests.counts()).thenReturn(new ApprovalSummaryResponse.Counts(3, 1, 0));

        mockMvc.perform(as(json(post("/api/hr/timesheets/review"), REVIEW), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
        verify(timesheets).review(new TimesheetReviewRequest(10L, LocalDate.parse("2026-10-05"), "APPROVE", null), 1L);
        mockMvc.perform(as(get("/api/hr/approvals/summary"), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timesheets.pending").value(2))
                .andExpect(jsonPath("$.leave.pending").value(1))
                .andExpect(jsonPath("$.compOff.pending").value(3));
    }

    private static final String COMP_OFF_REQUEST = """
            {"workDate":"2026-10-11","days":0.5,"reason":"Release support on Sunday"}""";

    private static CompOffRequestResponse compOffRequest(String status) {
        return new CompOffRequestResponse(7L, 10L, "EMP010", "Ravi Kumar", LocalDate.parse("2026-10-11"), "WEEKLY_OFF",
                null, new BigDecimal("0.5"), "Release support on Sunday", status, null, null, null);
    }

    @Test
    void employeeAsksForCompOffAsThemselves() throws Exception {
        when(compOffRequests.apply(eq(110L), any())).thenReturn(compOffRequest("PENDING"));
        when(compOffRequests.mine(110L)).thenReturn(List.of(compOffRequest("PENDING")));

        mockMvc.perform(as(json(post("/api/employee/comp-off-requests"), COMP_OFF_REQUEST), employeeToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"));
        verify(compOffRequests).apply(110L, new CompOffApplyRequest(
                LocalDate.parse("2026-10-11"), new BigDecimal("0.5"), "Release support on Sunday"));
        mockMvc.perform(as(get("/api/employee/comp-off-requests"), employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].dayKind").value("WEEKLY_OFF"));
    }

    @Test
    void compOffRequestNeedsTheDayDaysAndReason() throws Exception {
        mockMvc.perform(as(json(post("/api/employee/comp-off-requests"), "{\"days\":1}"), employeeToken))
                .andExpect(status().isBadRequest());
        verify(compOffRequests, never()).apply(anyLong(), any());
    }

    @Test
    void onlyHrCanSeeOrDecideCompOffRequestsAndOnlyEmployeesCanAsk() throws Exception {
        mockMvc.perform(as(get("/api/hr/comp-off-requests"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(post("/api/hr/comp-off-requests/7/approve"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(post("/api/hr/comp-off-requests/7/reject"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(json(post("/api/employee/comp-off-requests"), COMP_OFF_REQUEST), hrToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/employee/comp-off-requests")).andExpect(status().isUnauthorized());
        verify(compOffRequests, never()).approve(anyLong(), any(), any());
        verify(compOffRequests, never()).reject(anyLong(), any(), any());
        verify(compOffRequests, never()).apply(anyLong(), any());
    }

    @Test
    void hrDecidesCompOffRequestsAsThemselves() throws Exception {
        when(compOffRequests.withStatus(null)).thenReturn(List.of(compOffRequest("PENDING")));
        when(compOffRequests.approve(eq(7L), eq("Thanks"), eq(1L))).thenReturn(compOffRequest("APPROVED"));
        when(compOffRequests.reject(eq(8L), any(), eq(1L))).thenReturn(compOffRequest("REJECTED"));

        mockMvc.perform(as(get("/api/hr/comp-off-requests"), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].employeeCode").value("EMP010"));
        mockMvc.perform(as(json(post("/api/hr/comp-off-requests/7/approve"), "{\"note\":\"Thanks\"}"), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
        mockMvc.perform(as(post("/api/hr/comp-off-requests/8/reject"), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"));
        verify(compOffRequests).approve(7L, "Thanks", 1L);
        verify(compOffRequests).reject(8L, null, 1L);
    }

    @Test
    void hrSetsABalanceAsThemselves() throws Exception {
        when(leave.setBalance(eq(10L), eq("CASUAL"), any(), eq(1L))).thenReturn(List.of(casual("7.5")));

        mockMvc.perform(as(json(put("/api/hr/employees/10/leave-balances/CASUAL"), BALANCE), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].balanceDays").value(7.5));
        verify(leave).setBalance(10L, "CASUAL", new BigDecimal("7.5"), 1L);
        mockMvc.perform(as(json(put("/api/hr/employees/10/leave-balances/CASUAL"), "{}"), hrToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.balanceDays").exists());
    }

    @Test
    void employeesReadTheirOwnBalanceAndApplyForThemselves() throws Exception {
        when(leave.myBalances(110L)).thenReturn(List.of(casual("5")));
        when(leave.apply(eq(110L), any())).thenReturn(new LeaveRequestResponse(500L, 10L, "EMP010", "Ravi Kumar", "CASUAL",
                "Casual", LocalDate.parse("2026-10-19"), LocalDate.parse("2026-10-20"), new BigDecimal("2"), "Family function",
                "PENDING", null, null, null));

        mockMvc.perform(as(get("/api/employee/leave/balances"), employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].availableDays").value(5));
        mockMvc.perform(as(json(post("/api/employee/leave/requests"), APPLY), employeeToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"));
        verify(leave).apply(110L, new LeaveApplyRequest("CASUAL", LocalDate.parse("2026-10-19"), LocalDate.parse("2026-10-20"),
                "Family function"));
    }

    @Test
    void hrCannotUseEmployeeLeaveEndpoints() throws Exception {
        mockMvc.perform(as(json(post("/api/employee/leave/requests"), APPLY), hrToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(get("/api/employee/leave/balances"), hrToken)).andExpect(status().isForbidden());
        verify(leave, never()).apply(anyLong(), any());
    }

    @Test
    void refusalsReachTheApp() throws Exception {
        when(leave.apply(eq(110L), any())).thenThrow(ApiException.invalid("leaveType",
                "Not enough Casual leave: this request needs 2 days, and you have 1 available."));

        mockMvc.perform(as(json(post("/api/employee/leave/requests"), APPLY), employeeToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.leaveType").value("Not enough Casual leave: this request needs 2 days, and you have 1 available."));
    }

    /* ---------- Comp-Off ---------- */

    private static CompOffResponse compOffBalance(String days) {
        return new CompOffResponse(10L, new BigDecimal(days), BigDecimal.ZERO, new BigDecimal(days), List.of(
                new CompOffAdjustmentResponse(900L, "MANUAL", new BigDecimal("1.5"), BigDecimal.ZERO, new BigDecimal("1.5"),
                        "Worked on Sunday", null, null, "hr@rightsku.com", null)));
    }

    @Test
    void employeesCannotSeeOrChangeAnyCompOffBalance() throws Exception {
        mockMvc.perform(as(get("/api/hr/employees/10/comp-off"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(as(json(post("/api/hr/employees/10/comp-off/adjustments"), COMP_OFF_CHANGE), employeeToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(json(post("/api/hr/employees/10/comp-off/adjustments"), COMP_OFF_CHANGE)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/hr/employees/10/comp-off")).andExpect(status().isUnauthorized());
        verify(compOff, never()).adjust(anyLong(), any(), any());
        verify(compOff, never()).summary(anyLong());
    }

    @Test
    void hrAdjustsCompOffAsThemselves() throws Exception {
        when(compOff.adjust(eq(10L), any(), eq(1L))).thenReturn(compOffBalance("1.5"));
        when(compOff.summary(10L)).thenReturn(compOffBalance("1.5"));

        mockMvc.perform(as(json(post("/api/hr/employees/10/comp-off/adjustments"), COMP_OFF_CHANGE), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balanceDays").value(1.5))
                .andExpect(jsonPath("$.history[0].changedBy").value("hr@rightsku.com"));
        verify(compOff).adjust(10L, new CompOffAdjustmentRequest(new BigDecimal("1.5"), "Worked on Sunday", "key-ctl-0001"), 1L);
        mockMvc.perform(as(get("/api/hr/employees/10/comp-off"), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.history[0].reason").value("Worked on Sunday"));
    }

    @Test
    void aCompOffChangeWithoutAReasonOrDaysIsRefusedBeforeTheService() throws Exception {
        mockMvc.perform(as(json(post("/api/hr/employees/10/comp-off/adjustments"),
                        "{\"changeDays\":1,\"reason\":\"  \",\"requestKey\":\"key-ctl-0002\"}"), hrToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.reason").exists());
        mockMvc.perform(as(json(post("/api/hr/employees/10/comp-off/adjustments"),
                        "{\"reason\":\"Worked on Sunday\",\"requestKey\":\"key-ctl-0003\"}"), hrToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.changeDays").exists());
        verify(compOff, never()).adjust(anyLong(), any(), any());
    }

    @Test
    void compOffRefusalsFromTheServiceReachTheApp() throws Exception {
        when(compOff.adjust(eq(10L), any(), eq(1L))).thenThrow(ApiException.invalid("changeDays",
                "You can deduct at most 1 day: the Comp-Off balance is 1."));

        mockMvc.perform(as(json(post("/api/hr/employees/10/comp-off/adjustments"), COMP_OFF_CHANGE), hrToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.changeDays").value("You can deduct at most 1 day: the Comp-Off balance is 1."));
    }

    @Test
    void employeesApplyForCompOffThroughTheNormalLeaveEndpoint() throws Exception {
        when(leave.apply(eq(110L), any())).thenReturn(new LeaveRequestResponse(501L, 10L, "EMP010", "Ravi Kumar", "COMP_OFF",
                "Comp-Off", LocalDate.parse("2026-10-19"), LocalDate.parse("2026-10-19"), new BigDecimal("1"),
                "Day off for Sunday work", "PENDING", null, null, null));

        mockMvc.perform(as(json(post("/api/employee/leave/requests"), COMP_OFF_APPLY), employeeToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.label").value("Comp-Off"))
                .andExpect(jsonPath("$.status").value("PENDING"));
        verify(leave).apply(110L, new LeaveApplyRequest("COMP_OFF", LocalDate.parse("2026-10-19"), LocalDate.parse("2026-10-19"),
                "Day off for Sunday work"));
    }
}
