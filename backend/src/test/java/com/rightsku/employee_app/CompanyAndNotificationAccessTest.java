package com.rightsku.employee_app;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
 * Who may call the company profile, the ID card and the notification
 * clearing endpoints. Services are mocked; the account always comes from the token.
 */
@WebMvcTest(
        controllers = {HrCompanyController.class, EmployeeProfileController.class, EmployeeNotificationController.class},
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class, TimeConfig.class})
class CompanyAndNotificationAccessTest {

    private static final String AUTH = "Authorization";
    private static final String PROFILE = """
            {"name":"Test Company","phone":"+91 40 1234 5678"}""";
    private static final String ADDRESS = """
            {"label":"Head office","address":"Test street 1, Test city"}""";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private CompanyService companyService;

    @MockitoBean
    private EmployeeService employeeService;

    @MockitoBean
    private EmployeePhotoService photoService;

    @MockitoBean
    private NotificationService notificationService;

    @MockitoBean
    private AppUserRepository appUserRepository;

    private String hrToken;
    private String employeeToken;

    private String tokenFor(long id, String loginId, String email, String role) {
        AppUser user = AppUser.create(loginId, email, "not-a-real-hash", role);
        ReflectionTestUtils.setField(user, "id", id);
        when(appUserRepository.findById(id)).thenReturn(Optional.of(user));
        return "Bearer " + jwtService.generateToken(user);
    }

    @BeforeEach
    void setUp() {
        hrToken = tokenFor(1L, null, "hr@example.invalid", AppUser.ROLE_HR_ADMIN);
        employeeToken = tokenFor(110L, "EMP010", "ravi@example.invalid", AppUser.ROLE_EMPLOYEE);
        when(companyService.get()).thenReturn(new CompanyProfileResponse("Test Company", null, null, List.of()));
    }

    @Test
    void onlyHrReadsAndChangesTheCompanyProfile() throws Exception {
        mockMvc.perform(get("/api/hr/company").header(AUTH, employeeToken)).andExpect(status().isForbidden());
        mockMvc.perform(put("/api/hr/company").header(AUTH, employeeToken).contentType(MediaType.APPLICATION_JSON).content(PROFILE))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/hr/company/addresses").header(AUTH, employeeToken).contentType(MediaType.APPLICATION_JSON)
                .content(ADDRESS)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/hr/company")).andExpect(status().isUnauthorized());
        verify(companyService, never()).save(any(), any());
        verify(companyService, never()).addAddress(any(), any());

        mockMvc.perform(get("/api/hr/company").header(AUTH, hrToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Test Company"));
        mockMvc.perform(put("/api/hr/company").header(AUTH, hrToken).contentType(MediaType.APPLICATION_JSON).content(PROFILE))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/hr/company/addresses").header(AUTH, hrToken).contentType(MediaType.APPLICATION_JSON)
                .content(ADDRESS)).andExpect(status().isCreated());
        verify(companyService).save(new CompanyProfileRequest("Test Company", "+91 40 1234 5678"), 1L);
    }

    @Test
    void aCompanyNameIsRequired() throws Exception {
        mockMvc.perform(put("/api/hr/company").header(AUTH, hrToken).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"  \"}")).andExpect(status().isBadRequest());
    }

    @Test
    void theIdCardIsTheSignedInEmployeesOwn() throws Exception {
        when(companyService.idCard(110L)).thenReturn(new EmployeeIdCardResponse("Mr. Ravi Kumar", "EMP010", null, null,
                "Test Company", null, "Head office", "Test street 1"));

        mockMvc.perform(get("/api/employee/profile/id-card").header(AUTH, employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Mr. Ravi Kumar"))
                .andExpect(jsonPath("$.officeAddress").value("Test street 1"));
        verify(companyService).idCard(110L);
        mockMvc.perform(get("/api/employee/profile/id-card").header(AUTH, hrToken)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/employee/profile/id-card")).andExpect(status().isUnauthorized());
    }

    @Test
    void anEmployeeClearsOnlyTheirOwnNotifications() throws Exception {
        when(notificationService.clear(eq(110L), anyLong())).thenReturn(new NotificationResponse.Page(0, List.of()));
        when(notificationService.clearAll(110L)).thenReturn(new NotificationResponse.Page(0, List.of()));

        mockMvc.perform(post("/api/employee/notifications/7/clear").header(AUTH, employeeToken)).andExpect(status().isOk());
        mockMvc.perform(post("/api/employee/notifications/clear-all").header(AUTH, employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(0));
        verify(notificationService).clear(110L, 7L);
        verify(notificationService).clearAll(110L);

        mockMvc.perform(post("/api/employee/notifications/clear-all").header(AUTH, hrToken)).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/employee/notifications/7/clear")).andExpect(status().isUnauthorized());
    }
}
