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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

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
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class,
        RoleProbeTestConfig.class})
class AuthControllerTest {

    // Test-only values.
    private static final String HR_EMAIL = "hr@rightsku.com";
    private static final String EMPLOYEE_EMAIL = "emp@rightsku.com";
    private static final String PASSWORD = "Test-Only-Passw0rd!";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private AppUserRepository appUserRepository;

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    private AppUser givenUser(long id, String email, String role, boolean active) {
        AppUser user = AppUser.create(email, passwordEncoder.encode(PASSWORD), role);
        ReflectionTestUtils.setField(user, "id", id);
        ReflectionTestUtils.setField(user, "active", active);
        when(appUserRepository.findByEmailIgnoreCase(email)).thenReturn(Optional.of(user));
        return user;
    }

    private static String loginBody(String email, String password) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }

    /* ---------- Login ---------- */

    @Test
    void loginSucceedsAndNeverReturnsPasswordHash() throws Exception {
        AppUser hr = givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);

        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(HR_EMAIL, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.email").value(HR_EMAIL))
                .andExpect(jsonPath("$.role").value("HR_ADMIN"))
                .andExpect(jsonPath("$.userId").value(1))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(content().string(not(containsString(hr.getPasswordHash()))))
                .andExpect(content().string(not(containsString(PASSWORD))))
                .andReturn();

        String token = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.token");
        Jwt jwt = jwtService.jwtDecoderFromConfiguredSecret().decode(token);
        assertThat(jwt.getSubject()).isEqualTo(HR_EMAIL);
        assertThat(jwt.getClaimAsString("role")).isEqualTo("HR_ADMIN");
    }

    @Test
    void wrongPasswordReturns401() throws Exception {
        givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(HR_EMAIL, "Wrong-Passw0rd!")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid email or password"))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void unknownEmailReturns401WithSameMessage() throws Exception {
        when(appUserRepository.findByEmailIgnoreCase(anyString())).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("nobody@rightsku.com", PASSWORD)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid email or password"));
    }

    @Test
    void inactiveAccountCannotLogInEvenWithCorrectPassword() throws Exception {
        givenUser(2L, EMPLOYEE_EMAIL, AppUser.ROLE_EMPLOYEE, false);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(EMPLOYEE_EMAIL, PASSWORD)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid email or password"))
                .andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void passwordLongerThanBcryptLimitReturns401Not500() throws Exception {
        givenUser(1L, HR_EMAIL, AppUser.ROLE_HR_ADMIN, true);

        // 72 characters but more than 72 bytes (each "é" is 2 bytes).
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(HR_EMAIL, "é".repeat(72))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void missingPasswordReturns400() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + HR_EMAIL + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.password").exists());
    }

    @Test
    void invalidEmailReturns400() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("not-an-email", PASSWORD)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.email").exists())
                .andExpect(content().string(not(containsString(PASSWORD))));
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
