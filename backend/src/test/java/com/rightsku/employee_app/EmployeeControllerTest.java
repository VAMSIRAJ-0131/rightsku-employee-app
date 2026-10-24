package com.rightsku.employee_app;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

/**
 * Web-layer tests for the employee API: HR-only access, status codes and
 * response contents. The service and repository are mocked, so no database
 * is used and no accounts are created.
 */
@WebMvcTest(
        controllers = {EmployeeController.class, EmployeeProfileController.class},
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class})
class EmployeeControllerTest {

    private static final String BASE = "/api/hr/employees";
    private static final String VALID_CREATE = """
            {"employeeCode":"EMP010","firstName":"Ravi","lastName":"Kumar",
             "email":"ravi@rightsku.com","department":"Engineering",
             "joiningDate":"2026-10-01","initialPassword":"Test-Only-Passw0rd!"}""";
    private static final String VALID_UPDATE = """
            {"firstName":"Ravi","lastName":"Kumar","email":"ravi@rightsku.com","jobTitle":"Engineer"}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private EmployeeService employeeService;

    @MockitoBean
    private EmployeePhotoService photoService;

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
        employeeToken = tokenFor(2L, "EMP001", "emp@rightsku.com", AppUser.ROLE_EMPLOYEE);
    }

    private static EmployeeResponse sample(long id, String status) {
        return new EmployeeResponse(id, "EMP010", "Ravi", "Kumar", "ravi@rightsku.com", null, "Engineering",
                null, LocalDate.of(2026, 10, 1), status, Instant.parse("2026-10-14T09:00:00Z"),
                Instant.parse("2026-10-14T09:00:00Z"));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder withToken(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder, String token) {
        return builder.header("Authorization", "Bearer " + token);
    }

    /* ---------- Access control ---------- */

    @Test
    void requestsWithoutTokenGet401() throws Exception {
        mockMvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mockMvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content(VALID_CREATE))
                .andExpect(status().isUnauthorized());
        verify(employeeService, never()).create(any(), any());
    }

    @Test
    void employeesGet403OnEveryEmployeeManagementEndpoint() throws Exception {
        mockMvc.perform(withToken(get(BASE), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(withToken(get(BASE + "/5"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(withToken(post(BASE), employeeToken)
                .contentType(MediaType.APPLICATION_JSON).content(VALID_CREATE)).andExpect(status().isForbidden());
        mockMvc.perform(withToken(put(BASE + "/5"), employeeToken)
                .contentType(MediaType.APPLICATION_JSON).content(VALID_UPDATE)).andExpect(status().isForbidden());
        mockMvc.perform(withToken(post(BASE + "/5/deactivate"), employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(withToken(post(BASE + "/5/activate"), employeeToken)).andExpect(status().isForbidden());
        verify(employeeService, never()).create(any(), any());
        verify(employeeService, never()).setActive(anyLong(), org.mockito.ArgumentMatchers.anyBoolean(), any());
    }

    /* ---------- List and get ---------- */

    @Test
    void hrAdminCanSearchAndFilter() throws Exception {
        when(employeeService.list("ravi", "ACTIVE", 0, 20)).thenReturn(
                new EmployeePageResponse(List.of(sample(5L, "ACTIVE")), 0, 20, 1, 1, 1, 0));

        mockMvc.perform(withToken(get(BASE).param("q", "ravi").param("status", "ACTIVE"), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].employeeCode").value("EMP010"))
                .andExpect(jsonPath("$.items[0].email").value("ravi@rightsku.com"))
                .andExpect(jsonPath("$.items[0].joiningDate").value("2026-10-01"))
                .andExpect(jsonPath("$.activeCount").value(1))
                .andExpect(jsonPath("$.inactiveCount").value(0))
                .andExpect(content().string(not(containsString("password"))));
    }

    @Test
    void listDefaultsToAllStatusesFirstPage() throws Exception {
        when(employeeService.list(isNull(), eq("ALL"), eq(0), eq(20))).thenReturn(
                new EmployeePageResponse(List.of(), 0, 20, 0, 0, 0, 0));

        mockMvc.perform(withToken(get(BASE), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
    }

    @Test
    void invalidStatusFilterGets400() throws Exception {
        when(employeeService.list(any(), eq("ON_HOLIDAY"), anyInt(), anyInt()))
                .thenThrow(ApiException.invalid("status", "Status must be ALL, ACTIVE or INACTIVE."));

        mockMvc.perform(withToken(get(BASE).param("status", "ON_HOLIDAY"), hrToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.status").exists());
    }

    @Test
    void unknownEmployeeGets404() throws Exception {
        when(employeeService.get(404L)).thenThrow(ApiException.notFound("Employee not found."));

        mockMvc.perform(withToken(get(BASE + "/404"), hrToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Employee not found."));
    }

    @Test
    void nonNumericIdGets400() throws Exception {
        mockMvc.perform(withToken(get(BASE + "/abc"), hrToken)).andExpect(status().isBadRequest());
    }

    /* ---------- Create ---------- */

    @Test
    void hrAdminCreatesEmployeeAnd201HasNoPasswordData() throws Exception {
        when(employeeService.create(any(), eq(1L))).thenReturn(sample(5L, "ACTIVE"));

        mockMvc.perform(withToken(post(BASE), hrToken).contentType(MediaType.APPLICATION_JSON).content(VALID_CREATE))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/hr/employees/5"))
                .andExpect(jsonPath("$.employeeCode").value("EMP010"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.initialPassword").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(content().string(not(containsString("Test-Only-Passw0rd!"))));
    }

    @Test
    void missingRequiredFieldsGet400WithFieldMessages() throws Exception {
        mockMvc.perform(withToken(post(BASE), hrToken).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"not-an-email\",\"initialPassword\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.firstName").exists())
                .andExpect(jsonPath("$.fields.lastName").exists())
                .andExpect(jsonPath("$.fields.email").exists())
                .andExpect(jsonPath("$.fields.initialPassword").exists());
        verify(employeeService, never()).create(any(), any());
    }

    @Test
    void invalidPhoneGets400() throws Exception {
        mockMvc.perform(withToken(post(BASE), hrToken).contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_CREATE.replace("\"department\"", "\"phone\":\"call me\",\"department\"")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.phone").exists());
    }

    @Test
    void duplicateEmployeeIdGets409OnTheRightField() throws Exception {
        when(employeeService.create(any(), any()))
                .thenThrow(ApiException.conflict("employeeCode", "This Employee ID is already in use."));

        mockMvc.perform(withToken(post(BASE), hrToken).contentType(MediaType.APPLICATION_JSON).content(VALID_CREATE))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.fields.employeeCode").value("This Employee ID is already in use."));
    }

    /* ---------- Update, activate, deactivate ---------- */

    @Test
    void hrAdminUpdatesEmployee() throws Exception {
        when(employeeService.update(eq(5L), any(), eq(1L))).thenReturn(sample(5L, "ACTIVE"));

        mockMvc.perform(withToken(put(BASE + "/5"), hrToken).contentType(MediaType.APPLICATION_JSON).content(VALID_UPDATE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(5));
    }

    @Test
    void hrAdminDeactivatesAndActivatesEmployee() throws Exception {
        when(employeeService.setActive(5L, false, 1L)).thenReturn(sample(5L, "INACTIVE"));
        when(employeeService.setActive(5L, true, 1L)).thenReturn(sample(5L, "ACTIVE"));

        mockMvc.perform(withToken(post(BASE + "/5/deactivate"), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));
        mockMvc.perform(withToken(post(BASE + "/5/activate"), hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
        verify(employeeService).setActive(5L, false, 1L);
        verify(employeeService).setActive(5L, true, 1L);
    }

    /* ---------- HR resets a forgotten password ---------- */

    private static final String RESET_BODY =
            "{\"temporaryPassword\":\"Test-Only-Passw0rd!\",\"confirmPassword\":\"Test-Only-Passw0rd!\"}";

    @Test
    void hrResetsAPasswordAndNothingIsSentBack() throws Exception {
        mockMvc.perform(withToken(post(BASE + "/5/reset-password"), hrToken)
                        .contentType(MediaType.APPLICATION_JSON).content(RESET_BODY))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
        verify(employeeService).resetPassword(eq(5L), any(), eq(1L));
    }

    @Test
    void onlyHrCanResetPasswords() throws Exception {
        mockMvc.perform(post(BASE + "/5/reset-password").contentType(MediaType.APPLICATION_JSON).content(RESET_BODY))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(withToken(post(BASE + "/5/reset-password"), employeeToken)
                        .contentType(MediaType.APPLICATION_JSON).content(RESET_BODY))
                .andExpect(status().isForbidden());
        verify(employeeService, never()).resetPassword(anyLong(), any(), any());
    }

    @Test
    void aResetRefusalNamesTheFieldAndInactiveIs409() throws Exception {
        org.mockito.Mockito.doThrow(ApiException.invalid("temporaryPassword", "Password must be at least 12 characters."))
                .when(employeeService).resetPassword(eq(5L), any(), any());
        org.mockito.Mockito.doThrow(ApiException.conflict(null, "This employee is inactive."))
                .when(employeeService).resetPassword(eq(6L), any(), any());

        mockMvc.perform(withToken(post(BASE + "/5/reset-password"), hrToken)
                        .contentType(MediaType.APPLICATION_JSON).content(RESET_BODY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.temporaryPassword").value("Password must be at least 12 characters."));
        mockMvc.perform(withToken(post(BASE + "/6/reset-password"), hrToken)
                        .contentType(MediaType.APPLICATION_JSON).content(RESET_BODY))
                .andExpect(status().isConflict());
        mockMvc.perform(withToken(post(BASE + "/5/reset-password"), hrToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"temporaryPassword\":\"\",\"confirmPassword\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    /* ---------- Own profile (employee app) ---------- */

    @Test
    void employeeReadsTheirOwnProfileFromTheToken() throws Exception {
        when(employeeService.mine(2L)).thenReturn(sample(5L, "ACTIVE"));

        mockMvc.perform(withToken(get("/api/employee/profile"), employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.firstName").value("Ravi"))
                .andExpect(jsonPath("$.lastName").value("Kumar"))
                .andExpect(jsonPath("$.department").value("Engineering"))
                .andExpect(content().string(not(containsString("password"))));
        verify(employeeService).mine(2L);
    }

    @Test
    void ownProfileNeedsAnEmployeeToken() throws Exception {
        mockMvc.perform(get("/api/employee/profile")).andExpect(status().isUnauthorized());
        mockMvc.perform(withToken(get("/api/employee/profile"), hrToken)).andExpect(status().isForbidden());
        verify(employeeService, never()).mine(anyLong());
    }

    @Test
    void employeeViewsOnlyTheirOwnPhotoFromTheToken() throws Exception {
        when(photoService.mine(2L)).thenReturn(new EmployeePhotoService.Photo("image/jpeg", DocumentFileRulesTest.JPEG));

        mockMvc.perform(withToken(get("/api/employee/profile/photo"), employeeToken))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(content().bytes(DocumentFileRulesTest.JPEG));
        verify(photoService).mine(2L);
        // There is no employee endpoint that changes a photo.
        mockMvc.perform(withToken(put("/api/employee/profile/photo"), employeeToken))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(withToken(get("/api/employee/profile/photo"), hrToken)).andExpect(status().isForbidden());
        verify(photoService, never()).upload(anyLong(), any(), any());
    }

    @Test
    void accountWithoutAnEmployeeRecordGets404() throws Exception {
        when(employeeService.mine(2L)).thenThrow(ApiException.notFound("No employee record is linked to this account."));

        mockMvc.perform(withToken(get("/api/employee/profile"), employeeToken))
                .andExpect(status().isNotFound());
    }
}
