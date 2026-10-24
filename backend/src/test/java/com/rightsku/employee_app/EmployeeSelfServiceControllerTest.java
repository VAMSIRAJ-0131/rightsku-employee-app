package com.rightsku.employee_app;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

/**
 * Web-layer tests for employee notifications, the employee holiday list and
 * HR photo upload: who may call what, and that the account always comes
 * from the token. Services are mocked, so no database is used.
 */
@WebMvcTest(
        controllers = {EmployeeNotificationController.class, EmployeeHolidayController.class, HrEmployeePhotoController.class},
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class, TimeConfig.class})
class EmployeeSelfServiceControllerTest {

    private static final String AUTH = "Authorization";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private NotificationService notificationService;

    @MockitoBean
    private HolidayService holidayService;

    @MockitoBean
    private EmployeePhotoService photoService;

    @MockitoBean
    private AppUserRepository appUserRepository;

    private String hrToken;
    private String employeeToken;
    private String temporaryPasswordToken;

    private String tokenFor(long id, String loginId, String email, String role, boolean temporaryPassword) {
        AppUser user = AppUser.create(loginId, email, "not-a-real-hash", role);
        if (temporaryPassword) {
            user.requirePasswordChange();
        }
        ReflectionTestUtils.setField(user, "id", id);
        when(appUserRepository.findById(id)).thenReturn(Optional.of(user));
        return "Bearer " + jwtService.generateToken(user);
    }

    @BeforeEach
    void setUp() {
        hrToken = tokenFor(1L, null, "hr@rightsku.com", AppUser.ROLE_HR_ADMIN, false);
        employeeToken = tokenFor(110L, "EMP010", "ravi@rightsku.com", AppUser.ROLE_EMPLOYEE, false);
        temporaryPasswordToken = tokenFor(120L, "EMP020", "priya@rightsku.com", AppUser.ROLE_EMPLOYEE, true);
    }

    /* ---------- Notifications ---------- */

    @Test
    void anEmployeeListsTheirOwnNotificationsFromTheToken() throws Exception {
        when(notificationService.mine(110L)).thenReturn(new NotificationResponse.Page(1, List.of(
                new NotificationResponse(7L, "LEAVE_APPROVED", "Casual leave approved", "Your Casual leave was approved.",
                        false, Instant.parse("2026-10-22T10:00:00Z")))));

        mockMvc.perform(get("/api/employee/notifications").header(AUTH, employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(1))
                .andExpect(jsonPath("$.items[0].id").value(7))
                .andExpect(jsonPath("$.items[0].read").value(false));
        verify(notificationService).mine(110L);
    }

    @Test
    void markingReadUsesTheTokensAccountSoAnotherEmployeesIdIs404() throws Exception {
        when(notificationService.markRead(110L, 9L)).thenThrow(ApiException.notFound("Notification not found."));

        mockMvc.perform(post("/api/employee/notifications/9/read").header(AUTH, employeeToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/employee/notifications/read-all").header(AUTH, employeeToken))
                .andExpect(status().isOk());
        verify(notificationService).markAllRead(110L);
    }

    @Test
    void notificationsNeedAnEmployeeToken() throws Exception {
        mockMvc.perform(get("/api/employee/notifications")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/employee/notifications").header(AUTH, hrToken)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/employee/notifications").header(AUTH, temporaryPasswordToken)).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/employee/notifications/1/read").header(AUTH, hrToken)).andExpect(status().isForbidden());
        verify(notificationService, never()).mine(anyLong());
        verify(notificationService, never()).markRead(anyLong(), anyLong());
    }

    /* ---------- Holidays ---------- */

    @Test
    void employeesSeeTheHolidayList() throws Exception {
        when(holidayService.list(2026)).thenReturn(List.of(
                new HolidayResponse(3L, LocalDate.parse("2026-11-08"), "Diwali", "SUNDAY")));

        mockMvc.perform(get("/api/employee/holidays?year=2026").header(AUTH, employeeToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Diwali"))
                .andExpect(jsonPath("$[0].date").value("2026-11-08"));
    }

    @Test
    void theHolidayListNeedsAnEmployeeTokenAndEmployeesCannotChangeHolidays() throws Exception {
        mockMvc.perform(get("/api/employee/holidays")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/employee/holidays").header(AUTH, hrToken)).andExpect(status().isForbidden());
        // Creating holidays stays HR-only (/api/hr/holidays); there is no employee write endpoint.
        mockMvc.perform(post("/api/employee/holidays").header(AUTH, employeeToken)
                        .contentType("application/json").content("{\"date\":\"2026-12-25\",\"name\":\"Christmas\"}"))
                .andExpect(status().is4xxClientError());
        verify(holidayService, never()).list(anyInt());
        verify(holidayService, never()).create(any(), any());
    }

    /* ---------- HR photo upload ---------- */

    private static MockMultipartHttpServletRequestBuilder putPhoto(String path) {
        MockMultipartHttpServletRequestBuilder b = multipart(path);
        b.with(request -> {
            request.setMethod("PUT");
            return request;
        });
        return b;
    }

    private static MockMultipartFile jpeg() {
        return new MockMultipartFile("file", "me.jpg", "image/jpeg", DocumentFileRulesTest.JPEG);
    }

    @Test
    void hrUploadsAnEmployeePhoto() throws Exception {
        mockMvc.perform(putPhoto("/api/hr/employees/10/photo").file(jpeg()).header(AUTH, hrToken))
                .andExpect(status().isNoContent());
        verify(photoService).upload(10L, DocumentFileRulesTest.JPEG, 1L);
    }

    @Test
    void employeesCannotUploadChangeOrRemoveAnyPhotoIncludingTheirOwn() throws Exception {
        mockMvc.perform(putPhoto("/api/hr/employees/10/photo").file(jpeg()).header(AUTH, employeeToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/hr/employees/10/photo").header(AUTH, employeeToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/hr/employees/10/photo").header(AUTH, employeeToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(putPhoto("/api/hr/employees/10/photo").file(jpeg()))
                .andExpect(status().isUnauthorized());
        verify(photoService, never()).upload(anyLong(), any(), any());
        verify(photoService, never()).remove(anyLong(), any());
    }

    @Test
    void aRefusedPhotoNamesTheField() throws Exception {
        doThrow(ApiException.invalid("file", "Choose a JPG or PNG photo."))
                .when(photoService).upload(anyLong(), any(), any());

        mockMvc.perform(putPhoto("/api/hr/employees/10/photo")
                        .file(new MockMultipartFile("file", "x.pdf", "application/pdf", DocumentFileRulesTest.PDF))
                        .header(AUTH, hrToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.file").value("Choose a JPG or PNG photo."));
    }

    @Test
    void hrViewsAPhotoAsAnUncachedImage() throws Exception {
        when(photoService.forHr(10L)).thenReturn(new EmployeePhotoService.Photo("image/png", DocumentFileRulesTest.PNG));

        mockMvc.perform(get("/api/hr/employees/10/photo").header(AUTH, hrToken))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(content().bytes(DocumentFileRulesTest.PNG));
    }
}
