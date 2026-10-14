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
        PasswordChangeService.class, TimeConfig.class, RoleProbeTestConfig.class})
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

    @MockitoBean
    private AuditEntryRepository auditEntryRepository;

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
    void employeeIdIsAcceptedInLowerCaseAndWithSpaces() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);

        login("  emp001 ", PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loginId").value(EMPLOYEE_ID))
                .andExpect(jsonPath("$.role").value("EMPLOYEE"));
    }

    @Test
    void hrAdminEmailIsAcceptedInAnyCaseAndWithSpaces() throws Exception {
        givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);

        login("  HR@RightSKU.com ", PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(HR_EMAIL))
                .andExpect(jsonPath("$.role").value("HR_ADMIN"));
    }

    @Test
    void hrAdminCannotSignInWithAnIdInsteadOfEmail() throws Exception {
        // HR Admins have no Employee ID; even the correct password is refused.
        givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);

        login("hr", PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid ID or password"))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void invalidEmployeeIdFormatReturns401Not500() throws Exception {
        login("EMP 001", PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid ID or password"));
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

    /* ---------- First sign-in with a temporary password ---------- */

    private static final String NEW_PASSWORD = "Vamsi@90"; // employees: at least 8 characters
    private static final String CHANGE_PASSWORD = "/api/auth/change-password";

    /** An employee created by HR: the password is temporary until they change it. */
    private AppUser givenEmployeeWithTemporaryPassword() {
        AppUser employee = givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);
        employee.requirePasswordChange();
        return employee;
    }

    private String tokenFrom(MvcResult result) throws Exception {
        return com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.token");
    }

    private org.springframework.test.web.servlet.ResultActions changePassword(
            String token, String current, String next) throws Exception {
        var request = post(CHANGE_PASSWORD)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next
                        + "\",\"confirmPassword\":\"" + next + "\"}");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return mockMvc.perform(request);
    }

    @Test
    void temporaryPasswordSignInSaysPasswordMustChangeAndTokenIsRestricted() throws Exception {
        givenEmployeeWithTemporaryPassword();

        MvcResult result = login(EMPLOYEE_ID, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(true))
                .andReturn();
        String token = tokenFrom(result);

        Jwt jwt = jwtService.jwtDecoderFromConfiguredSecret().decode(token);
        assertThat(jwt.getClaimAsBoolean(JwtService.CLAIM_PASSWORD_CHANGE_REQUIRED)).isTrue();

        // The token works for nothing except changing the password.
        mockMvc.perform(get(EMPLOYEE_PROBE).header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(HR_PROBE).header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void firstSignInFlowChangesPasswordEndsOldSessionAndAllowsNewSignIn() throws Exception {
        AppUser employee = givenEmployeeWithTemporaryPassword();
        String temporaryToken = tokenFrom(login(EMPLOYEE_ID, PASSWORD).andReturn());

        changePassword(temporaryToken, PASSWORD, NEW_PASSWORD).andExpect(status().isNoContent());
        assertThat(employee.isMustChangePassword()).isFalse();
        assertThat(passwordEncoder.matches(NEW_PASSWORD, employee.getPasswordHash())).isTrue();

        // The old session has ended: the token used for the change no longer works.
        changePassword(temporaryToken, NEW_PASSWORD, "Welcome@123").andExpect(status().isUnauthorized());
        mockMvc.perform(get(EMPLOYEE_PROBE).header("Authorization", "Bearer " + temporaryToken))
                .andExpect(status().isUnauthorized());

        // The temporary password no longer signs in; the new one does, with full access.
        login(EMPLOYEE_ID, PASSWORD).andExpect(status().isUnauthorized());
        MvcResult fresh = login(EMPLOYEE_ID, NEW_PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(false))
                .andReturn();
        mockMvc.perform(get(EMPLOYEE_PROBE).header("Authorization", "Bearer " + tokenFrom(fresh)))
                .andExpect(status().isOk())
                .andExpect(content().string("employee-ok"));
    }

    @Test
    void changingPasswordEndsEverySessionOfThatAccount() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);
        String phone = tokenFrom(login(EMPLOYEE_ID, PASSWORD).andReturn());
        String laptop = tokenFrom(login(EMPLOYEE_ID, PASSWORD).andReturn());

        changePassword(laptop, PASSWORD, NEW_PASSWORD).andExpect(status().isNoContent());

        mockMvc.perform(get(EMPLOYEE_PROBE).header("Authorization", "Bearer " + phone))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void wrongCurrentPasswordIsRefusedAndSessionStaysUsable() throws Exception {
        AppUser employee = givenEmployeeWithTemporaryPassword();
        String token = tokenFrom(login(EMPLOYEE_ID, PASSWORD).andReturn());

        changePassword(token, "Not-The-Passw0rd!", NEW_PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.currentPassword").exists())
                .andExpect(content().string(not(containsString(NEW_PASSWORD))));
        assertThat(employee.isMustChangePassword()).isTrue();

        // Still allowed to try again with the same token.
        changePassword(token, PASSWORD, NEW_PASSWORD).andExpect(status().isNoContent());
    }

    @Test
    void weakOrUnchangedNewPasswordIsRefused() throws Exception {
        givenEmployeeWithTemporaryPassword();
        String token = tokenFrom(login(EMPLOYEE_ID, PASSWORD).andReturn());

        changePassword(token, PASSWORD, "short").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.newPassword").exists());
        changePassword(token, PASSWORD, PASSWORD).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.newPassword").exists());
        changePassword(token, PASSWORD, "").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.newPassword").exists());
    }

    @Test
    void employeePasswordNeedsAtLeastEightCharactersAndConfirmation() throws Exception {
        AppUser employee = givenEmployeeWithTemporaryPassword();
        String token = tokenFrom(login(EMPLOYEE_ID, PASSWORD).andReturn());

        for (String tooShort : new String[] {"Vams@90", "1234567", "abc"}) {
            changePassword(token, PASSWORD, tooShort)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fields.newPassword").value("Password must contain at least 8 characters."));
        }

        mockMvc.perform(post(CHANGE_PASSWORD)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD
                                + "\",\"newPassword\":\"Vamsi@90\",\"confirmPassword\":\"Vamsi@91\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.confirmPassword").exists());
        mockMvc.perform(post(CHANGE_PASSWORD)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"Vamsi@90\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.confirmPassword").exists());
        assertThat(employee.isMustChangePassword()).isTrue();

        // 8 characters with letters and symbols is accepted; stored only as a BCrypt hash.
        changePassword(token, PASSWORD, "Vamsi@90").andExpect(status().isNoContent());
        assertThat(employee.getPasswordHash()).startsWith("$2").doesNotContain("Vamsi@90");
        login(EMPLOYEE_ID, "Vamsi@90").andExpect(status().isOk());
    }

    @Test
    void longerPasswordWorksAndLaterChangeReplacesTheOldOne() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);
        String token = tokenFrom(login(EMPLOYEE_ID, PASSWORD).andReturn());

        changePassword(token, PASSWORD, "Welcome@123-Longer").andExpect(status().isNoContent());

        login(EMPLOYEE_ID, PASSWORD).andExpect(status().isUnauthorized());
        login(EMPLOYEE_ID, "Welcome@123-Longer").andExpect(status().isOk());
    }

    @Test
    void hrAdminSignInAndPasswordRuleAreUnchanged() throws Exception {
        givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);
        String token = tokenFrom(login(HR_EMAIL, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(false))
                .andReturn());

        // HR Admins keep the longer rule (at least 12 characters).
        changePassword(token, PASSWORD, "Vamsi@90").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.newPassword").exists());
        changePassword(token, PASSWORD, "Hr-New-Passw0rd-2026").andExpect(status().isNoContent());
        login(HR_EMAIL, "Hr-New-Passw0rd-2026").andExpect(status().isOk());
    }

    @Test
    void changePasswordNeedsAToken() throws Exception {
        changePassword(null, PASSWORD, NEW_PASSWORD).andExpect(status().isUnauthorized());
        changePassword("not.a.real.token", PASSWORD, NEW_PASSWORD).andExpect(status().isUnauthorized());
    }

    @Test
    void hrSettingTemporaryPasswordAgainEndsTheNormalSession() throws Exception {
        AppUser employee = givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, true);
        String token = tokenFrom(login(EMPLOYEE_ID, PASSWORD).andReturn());
        mockMvc.perform(get(EMPLOYEE_PROBE).header("Authorization", "Bearer " + token)).andExpect(status().isOk());

        employee.requirePasswordChange();

        mockMvc.perform(get(EMPLOYEE_PROBE).header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
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
