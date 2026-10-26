package com.rightsku.employee_app;

import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Security rules with the production settings: CORS allows only the Android
 * app's origins, and of the actuator only GET /actuator/health is open without
 * signing in. (The health endpoint itself is not part of this web-layer test,
 * so an open path answers 404 here instead of 401.)
 */
@WebMvcTest(
        controllers = AuthController.class,
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false",
                "app.cors.allowed-origins=https://localhost, capacitor://localhost"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class, LoginRateLimiter.class,
        PasswordChangeService.class, TimeConfig.class, RefreshTokenService.class})
class ProductionSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AppUserRepository appUserRepository;

    @MockitoBean
    private AuditEntryRepository auditEntryRepository;

    @MockitoBean
    private RefreshTokenRepository refreshTokenRepository;

    // Addressed to the real API host: a request to http://localhost would make
    // the origin http://localhost "same site", which CORS never checks.
    private static org.springframework.test.web.servlet.RequestBuilder preflight(String origin) {
        return options("https://api.rightsku.com/api/auth/login")
                .header("Origin", origin)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type");
    }

    @Test
    void androidAppOriginIsAllowed() throws Exception {
        mockMvc.perform(preflight("https://localhost"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://localhost"));
        mockMvc.perform(preflight("capacitor://localhost"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "capacitor://localhost"));
    }

    @Test
    void webDevAndOtherOriginsAreRefused() throws Exception {
        for (String origin : new String[] {
                "http://localhost:5174", "http://127.0.0.1:5174", "https://evil.example", "http://localhost"}) {
            mockMvc.perform(preflight(origin))
                    .andExpect(status().isForbidden())
                    .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        }
    }

    @Test
    void healthIsOpenWithoutSigningIn() throws Exception {
        mockMvc.perform(get("/actuator/health")).andExpect(status().is(not(401)));
    }

    @Test
    void otherActuatorPathsAndHealthWritesNeedSignIn() throws Exception {
        for (String path : new String[] {
                "/actuator", "/actuator/env", "/actuator/health/db", "/actuator/beans", "/actuator/heapdump"}) {
            mockMvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        mockMvc.perform(post("/actuator/health")).andExpect(status().isUnauthorized());
    }
}
