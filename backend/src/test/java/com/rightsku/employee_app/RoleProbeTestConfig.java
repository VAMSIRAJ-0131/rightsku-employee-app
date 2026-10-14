package com.rightsku.employee_app;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Test-only endpoints under the real /api/hr/** and /api/employee/**
 * security rules, used to check role-based access.
 *
 * Registered only where a test imports this class with
 * {@code @Import(RoleProbeTestConfig.class)}. Because it is a
 * {@code @TestConfiguration}, Spring Boot's component scan skips it, so these
 * endpoints never appear in the full application or in other tests.
 */
@TestConfiguration(proxyBeanMethods = false)
public class RoleProbeTestConfig {

    public static final String HR_PROBE = "/api/hr/probe";
    public static final String EMPLOYEE_PROBE = "/api/employee/probe";

    // No @Bean method here: Spring registers this nested @RestController
    // automatically when RoleProbeTestConfig is imported. Adding a @Bean as
    // well registered it twice ("Ambiguous mapping: GET /api/hr/probe").
    @RestController
    static class RoleProbeController {

        @GetMapping(HR_PROBE)
        String hr() {
            return "hr-ok";
        }

        @GetMapping(EMPLOYEE_PROBE)
        String employee() {
            return "employee-ok";
        }
    }
}
