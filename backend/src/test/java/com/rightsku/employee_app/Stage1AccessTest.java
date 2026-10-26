package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Stage 1 endpoints and who may call them: exports, Activity, profile update
 * reviews and full personal details are for HR Admins only; employees ask,
 * cancel and see only their own (taken from the token). Services mocked.
 */
@WebMvcTest(
        controllers = {HrExportController.class, HrAuditController.class, HrProfileChangeController.class,
                EmployeeProfileChangeController.class, EmployeeLeaveController.class, EmployeeCompOffController.class},
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class})
class Stage1AccessTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JwtService jwtService;

    @MockitoBean private ExportService exports;
    @MockitoBean private AuditService audit;
    @MockitoBean private ProfileChangeService profileChanges;
    @MockitoBean private LeaveService leave;
    @MockitoBean private CompOffRequestService compOff;
    @MockitoBean private AppUserRepository appUserRepository;

    private String bearer(long id, String loginId, String email, String role) {
        AppUser user = AppUser.create(loginId, email, "not-a-real-hash", role);
        ReflectionTestUtils.setField(user, "id", id);
        when(appUserRepository.findById(id)).thenReturn(Optional.of(user));
        return "Bearer " + jwtService.generateToken(user);
    }

    private String hr() {
        return bearer(1L, null, "hr@rightsku.com", AppUser.ROLE_HR_ADMIN);
    }

    private String employee() {
        return bearer(110L, "EMP010", "ravi@rightsku.com", AppUser.ROLE_EMPLOYEE);
    }

    @Test
    void hrDownloadsAnExportAsAnUncachedCsvAttachment() throws Exception {
        byte[] csv = "﻿Employee ID,Name\r\nEMP010,Ravi\r\n".getBytes(StandardCharsets.UTF_8);
        when(exports.export(eq("leave"), eq("2026-10"), eq(false), eq(1L)))
                .thenReturn(new ExportService.CsvFile("rightcentral-leave-2026-10.csv", csv));

        byte[] body = mockMvc.perform(get("/api/hr/exports/leave?month=2026-10").header("Authorization", hr()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("rightcentral-leave-2026-10.csv")))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(body).isEqualTo(csv);
    }

    @Test
    void employeesAndSignedOutUsersCannotUseHrStage1Endpoints() throws Exception {
        String employee = employee();
        for (String path : List.of("/api/hr/exports/employees?bank=true", "/api/hr/audit", "/api/hr/profile-changes",
                "/api/hr/profile-changes/count", "/api/hr/employees/10/personal-details")) {
            mockMvc.perform(get(path)).andExpect(status().isUnauthorized());
            mockMvc.perform(get(path).header("Authorization", employee)).andExpect(status().isForbidden());
        }
        mockMvc.perform(post("/api/hr/profile-changes/5/approve").header("Authorization", employee))
                .andExpect(status().isForbidden());
        verifyNoInteractions(exports, audit);
        verify(profileChanges, never()).approve(anyLong(), any(), any());
        verify(profileChanges, never()).detailsFor(anyLong());
        verify(audit, never()).page(anyInt(), anyString());
        verify(exports, never()).export(anyString(), anyString(), anyBoolean(), any());
    }

    @Test
    void anEmployeeAsksAndCancelsOnlyAsThemselves() throws Exception {
        String employee = employee();
        when(profileChanges.ask(eq(110L), any())).thenReturn(new ProfileChangeResponse(5, 10, "EMP010", "Ravi", "PENDING",
                null, null, null, null, List.of()));

        mockMvc.perform(post("/api/employee/profile-changes").header("Authorization", employee)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"changes\":{\"phone\":\"9876543210\"}}"))
                .andExpect(status().isCreated());
        verify(profileChanges).ask(110L, Map.of("phone", "9876543210"));

        mockMvc.perform(post("/api/employee/leave/requests/31/cancel").header("Authorization", employee))
                .andExpect(status().isOk());
        verify(leave).cancel(110L, 31L);
        mockMvc.perform(post("/api/employee/comp-off-requests/7/cancel").header("Authorization", employee))
                .andExpect(status().isOk());
        verify(compOff).cancel(110L, 7L);
    }

    @Test
    void hrCannotActAsAnEmployee() throws Exception {
        String hr = hr();
        mockMvc.perform(get("/api/employee/profile-changes/details").header("Authorization", hr)).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/employee/leave/requests/31/cancel").header("Authorization", hr)).andExpect(status().isForbidden());
        verify(leave, never()).cancel(anyLong(), anyLong());
    }
}
