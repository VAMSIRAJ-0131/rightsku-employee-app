package com.rightsku.employee_app;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/** The salary summary is for HR Admins only. Service mocked: no database. */
@WebMvcTest(
        controllers = HrSalarySummaryController.class,
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class})
class HrSalarySummaryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private SalarySummaryService summaries;

    @MockitoBean
    private AppUserRepository appUserRepository;

    private String bearer(long id, String loginId, String email, String role) {
        AppUser user = AppUser.create(loginId, email, "not-a-real-hash", role);
        ReflectionTestUtils.setField(user, "id", id);
        when(appUserRepository.findById(id)).thenReturn(Optional.of(user));
        return "Bearer " + jwtService.generateToken(user);
    }

    @Test
    void hrGetsTheMonthlySummary() throws Exception {
        String hr = bearer(1L, null, "hr@rightsku.com", AppUser.ROLE_HR_ADMIN);
        when(summaries.summary(2026, 9)).thenReturn(new SalarySummaryResponse(2026, 9, LocalDate.parse("2026-09-01"),
                LocalDate.parse("2026-09-30"), 30, false, LocalDate.parse("2026-10-05"), Instant.parse("2026-10-05T05:00:00Z"),
                List.of(new SalarySummaryResponse.Row(1, 10L, "EMP010", "Ravi Kumar", "ACTIVE", LocalDate.parse("2025-01-06"),
                        30, 21, 19, 2, 0, 1, 8, 0, 0, 0, 0, 0, 30, true, List.of())),
                new SalarySummaryResponse.Totals(1, 19, 2, 0, 0, 0, 0, 0, 30, 0)));

        mockMvc.perform(get("/api/hr/salary-summary?year=2026&month=9").header("Authorization", hr))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].employeeCode").value("EMP010"))
                .andExpect(jsonPath("$.rows[0].payableDays").value(30))
                .andExpect(jsonPath("$.totals.employees").value(1));
    }

    @Test
    void employeesAndSignedOutUsersCannotSeeSalaryData() throws Exception {
        String employee = bearer(110L, "EMP010", "ravi@rightsku.com", AppUser.ROLE_EMPLOYEE);

        mockMvc.perform(get("/api/hr/salary-summary?year=2026&month=9")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/hr/salary-summary?year=2026&month=9").header("Authorization", employee))
                .andExpect(status().isForbidden());
        verify(summaries, never()).summary(anyInt(), anyInt());
    }
}
