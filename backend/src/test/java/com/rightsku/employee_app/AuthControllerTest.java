package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static com.rightsku.employee_app.RoleProbeTestConfig.EMPLOYEE_PROBE;
import static com.rightsku.employee_app.RoleProbeTestConfig.HR_PROBE;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Web-layer tests for login and role-based access. The real security
 * configuration, JWT service and user lookup are used; only the database
 * repository is replaced by a mock, so no database is needed or changed.
 */
@WebMvcTest(
        controllers = AuthController.class,
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
// RoleProbeTestConfig is imported explicitly. (The earlier version nested the
// probe controller inside this test class; Spring Boot's test scanning skips
// nested classes of tests, so its endpoints were never mapped: HTTP 404.)
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class, LoginRateLimiter.class,
        RoleProbeTestConfig.class})
class AuthControllerTest {

    // Test-only values.
    private static final String HR_EMAIL = "hr@rightsku.com";
    private static final String EMPLOYEE_EMAIL = "emp@rightsku.com";
    private static final String EMPLOYEE_ID = "EMP001";
    private static final String PASSWORD = "Test-Only-Passw0rd!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private LoginRateLimiter loginRateLimiter;

    /** The Spring context is shared between tests, so clear rate-limit counters each time. */
    @BeforeEach
    void clearRateLimits() {
        loginRateLimiter.reset();
    }

    @MockitoBean
    private AppUserRepository appUserRepository;

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    /**
     * A mocked account. Employees get EMPLOYEE_ID as their Employee ID; HR Admins
     * have none. The account is findable by ID, by email and (employees) by
     * Employee ID, exactly like the real repository.
     */
    private AppUser givenUser(long id, String email, String role, boolean active) {
        String loginId = AppUser.ROLE_EMPLOYEE.equals(role) ? EMPLOYEE_ID : null;
        AppUser user = AppUser.create(loginId, email, passwordEncoder.encode(PASSWORD), role);
        ReflectionTestUtils.setField(user, "id", id);
        ReflectionTestUtils.setField(user, "active", active);
        when(appUserRepository.findById(id)).thenReturn(Optional.of(user));
        when(appUserRepository.findByEmailIgnoreCase(email)).thenReturn(Optional.of(user));
        if (loginId != null) {
            when(appUserRepository.findByLoginIdIgnoreCase(loginId)).thenReturn(Optional.of(user));
        }
        return user;
    }

    private static String loginBody(String username, String password) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}";
    }

    private org.springframework.test.web.servlet.ResultActions login(String username, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginBody(username, password)));
    }

    /* ---------- Login: employees use Employee ID, HR Admins use email ---------- */

    @Test
    void employeeLogsInWithEmployeeId() throws Exception {
        AppUser employee = givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);

        MvcResult result = login(EMPLOYEE_ID, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.userId").value(2))
                .andExpect(jsonPath("$.loginId").value(EMPLOYEE_ID))
                .andExpect(jsonPath("$.email").value(EMPLOYEE_EMAIL))
                .andExpect(jsonPath("$.role").value("EMPLOYEE"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(content().string(not(containsString(employee.getPasswordHash()))))
                .andExpect(content().string(not(containsString(PASSWORD))))
                .andReturn();

        String token = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.token");
        Jwt jwt = jwtService.jwtDecoderFromConfiguredSecret().decode(token);
        assertThat(jwt.getSubject()).isEqualTo("2");
        assertThat(jwt.getClaimAsString("loginId")).isEqualTo(EMPLOYEE_ID);
        assertThat(jwt.getClaimAsString("role")).isEqualTo("EMPLOYEE");
    }

    @Test
    void hrAdminLogsInWithEmailAndNeverGetsPasswordHash() throws Exception {
        AppUser hr = givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);

        MvcResult result = login(HR_EMAIL, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(HR_EMAIL))
                .andExpect(jsonPath("$.role").value("HR_ADMIN"))
                .andExpect(jsonPath("$.userId").value(1))
                .andExpect(jsonPath("$.loginId").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(content().string(not(containsString(hr.getPasswordHash()))))
                .andExpect(content().string(not(containsString(PASSWORD))))
                .andReturn();

        String token = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.token");
        Jwt jwt = jwtService.jwtDecoderFromConfiguredSecret().decode(token);
        assertThat(jwt.getSubject()).isEqualTo("1");
        assertThat(jwt.getClaimAsString("role")).isEqualTo("HR_ADMIN");
    }

    @Test
    void employeeCannotLogInWithEmail() throws Exception {
        // Email sign-in is reserved for HR Admins; employees must use their Employee ID.
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);

        login(EMPLOYEE_EMAIL, PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid ID or password"))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void wrongPasswordForEmployeeIdReturns401() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);

        login(EMPLOYEE_ID, "Wrong-Passw0rd!")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid ID or password"))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void wrongPasswordForHrEmailReturns401() throws Exception {
        givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);

        login(HR_EMAIL, "Wrong-Passw0rd!")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid ID or password"));
    }

    @Test
    void unknownEmployeeIdReturns401WithSameMessage() throws Exception {
        when(appUserRepository.findByLoginIdIgnoreCase(anyString())).thenReturn(Optional.empty());

        login("EMP999", PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid ID or password"));
    }

    @Test
    void unknownEmailReturns401WithSameMessage() throws Exception {
        when(appUserRepository.findByEmailIgnoreCase(anyString())).thenReturn(Optional.empty());

        login("nobody@rightsku.com", PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid ID or password"));
    }

    @Test
    void inactiveEmployeeCannotLogInEvenWithCorrectPassword() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, false);

        login(EMPLOYEE_ID, PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid ID or password"))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void inactiveHrAdminCannotLogInEvenWithCorrectPassword() throws Exception {
        givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, false);

        login(HR_EMAIL, PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void passwordLongerThanBcryptLimitReturns401Not500() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);

        // 72 characters but more than 72 bytes (each "é" is 2 bytes).
        login(EMPLOYEE_ID, "é".repeat(72)).andExpect(status().isUnauthorized());
    }

    @Test
    void missingPasswordReturns400() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + EMPLOYEE_ID + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.password").exists());
    }

    @Test
    void blankEmployeeIdReturns400WithoutEchoingPassword() throws Exception {
        login("   ", PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.username").exists())
                .andExpect(content().string(not(containsString(PASSWORD))));
    }

    @Test
    void oldEmailFieldIsRejectedWith400() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + HR_EMAIL + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.username").exists());
    }

    /* ---------- Rate limiting ---------- */

    private org.springframework.test.web.servlet.ResultActions loginFrom(String address, String username, String password)
            throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .with(request -> {
                    request.setRemoteAddr(address);
                    return request;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginBody(username, password)));
    }

    @Test
    void afterFiveWrongPasswordsEvenTheCorrectPasswordGets429() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);
        for (int i = 0; i < 5; i++) {
            login(EMPLOYEE_ID, "Wrong-Passw0rd!").andExpect(status().isUnauthorized());
        }

        // Blocked before the password is checked: no token, same answer whatever the password.
        login(EMPLOYEE_ID, PASSWORD)
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.error").value("Too many sign-in attempts. Try again later."))
                .andExpect(jsonPath("$.retryAfterSeconds").isNumber())
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void unknownEmployeeIdsAreLimitedTheSameWay() throws Exception {
        for (int i = 0; i < 5; i++) {
            login("EMP999", PASSWORD).andExpect(status().isUnauthorized());
        }
        login("EMP999", PASSWORD).andExpect(status().isTooManyRequests());
    }

    @Test
    void successfulSignInResetsTheCounter() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);
        for (int i = 0; i < 4; i++) {
            login(EMPLOYEE_ID, "Wrong-Passw0rd!").andExpect(status().isUnauthorized());
        }
        login(EMPLOYEE_ID, PASSWORD).andExpect(status().isOk());
        for (int i = 0; i < 4; i++) {
            login(EMPLOYEE_ID, "Wrong-Passw0rd!").andExpect(status().isUnauthorized());
        }
        login(EMPLOYEE_ID, PASSWORD).andExpect(status().isOk());
    }

    @Test
    void blockedAccountDoesNotBlockOtherUsersOrTheSameUserElsewhere() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);
        givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);
        for (int i = 0; i < 5; i++) {
            loginFrom("203.0.113.10", EMPLOYEE_ID, "Wrong-Passw0rd!").andExpect(status().isUnauthorized());
        }
        loginFrom("203.0.113.10", EMPLOYEE_ID, PASSWORD).andExpect(status().isTooManyRequests());

        // Another account from the same address, and the real employee from their own address, still work.
        loginFrom("203.0.113.10", HR_EMAIL, PASSWORD).andExpect(status().isOk());
        loginFrom("198.51.100.20", EMPLOYEE_ID, PASSWORD).andExpect(status().isOk());
    }

    @Test
    void malformedJsonReturns400() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void emptyBodyReturns400() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());
    }

    /* ---------- JWT validation and role authorization ---------- */

    @Test
    void requestWithoutTokenReturns401() throws Exception {
        mockMvc.perform(get(HR_PROBE)).andExpect(status().isUnauthorized());
    }

    @Test
    void invalidTokenReturns401() throws Exception {
        mockMvc.perform(get(HR_PROBE).header("Authorization", "Bearer not.a.real.token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void expiredTokenReturns401() throws Exception {
        AppUser hr = givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);
        Clock nineHoursAgo = Clock.fixed(Instant.now().minus(Duration.ofHours(9)), ZoneOffset.UTC);
        String expired = new JwtService(JwtServiceTest.TEST_SECRET, Duration.ofHours(8), nineHoursAgo)
                .generateToken(hr);

        mockMvc.perform(get(HR_PROBE).header("Authorization", "Bearer " + expired))
                .andExpect(status().isUnauthorized());
    }

    /**
     * Guard: the role tests below are only meaningful if the probe endpoints
     * are really mapped. If they ever go missing this fails with a clear
     * message instead of an unexplained 404.
     */
    @Test
    void probeEndpointsAreRegistered() {
        var patterns = handlerMapping.getHandlerMethods().keySet().stream()
                .flatMap(info -> info.getPatternValues().stream())
                .toList();
        assertThat(patterns)
                .as("test probe endpoints must be mapped in the test context")
                .contains(HR_PROBE, EMPLOYEE_PROBE);
    }

    @Test
    void employeeEndpointWithoutTokenReturns401() throws Exception {
        mockMvc.perform(get(EMPLOYEE_PROBE)).andExpect(status().isUnauthorized());
    }

    @Test
    void hrAdminCanUseHrEndpointsButNotEmployeeEndpoints() throws Exception {
        String token = jwtService.generateToken(givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true));

        mockMvc.perform(get(HR_PROBE).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(content().string("hr-ok"));
        mockMvc.perform(get(EMPLOYEE_PROBE).header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void employeeCanUseEmployeeEndpointsButNotHrEndpoints() throws Exception {
        String token = jwtService.generateToken(givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true));

        mockMvc.perform(get(EMPLOYEE_PROBE).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(content().string("employee-ok"));
        mockMvc.perform(get(HR_PROBE).header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void tokenStopsWorkingAfterAccountIsDeactivated() throws Exception {
        AppUser employee = givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);
        String token = jwtService.generateToken(employee);

        ReflectionTestUtils.setField(employee, "active", false);

        mockMvc.perform(get(EMPLOYEE_PROBE).header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenStopsWorkingAfterRoleChanges() throws Exception {
        AppUser user = givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);
        String hrToken = jwtService.generateToken(user);

        ReflectionTestUtils.setField(user, "role", AppUser.ROLE_EMPLOYEE);

        mockMvc.perform(get(HR_PROBE).header("Authorization", "Bearer " + hrToken))
                .andExpect(status().isUnauthorized());
    }
}
