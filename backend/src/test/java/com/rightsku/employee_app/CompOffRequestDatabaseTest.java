package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Comp-Off requests (V14) against a REAL PostgreSQL test database: the
 * database itself allows one active request per day, credits each request
 * once, and two HR approvals at the same moment credit the balance once.
 *
 * <p>Same safety rules as {@link WeeklyTimesheetDatabaseTest}: skipped unless
 * RIGHTSKU_TEST_DB_URL is set, refuses any database whose name does not end
 * in "_test", creates its own inactive test employee and deletes only that
 * employee's rows afterwards.
 */
@EnabledIfEnvironmentVariable(named = "RIGHTSKU_TEST_DB_URL", matches = "jdbc:postgresql://.+")
@SpringBootTest(properties = {
        "HR_ADMIN_BOOTSTRAP_ENABLED=false",
        "app.jwt.secret=" + JwtServiceTest.TEST_SECRET
})
class CompOffRequestDatabaseTest {

    @DynamicPropertySource
    static void isolatedTestDatabase(DynamicPropertyRegistry registry) {
        WeeklyTimesheetDatabaseTest.isolatedTestDatabase(registry);
    }

    @Autowired
    private CompOffRequestService compOffRequests;

    @Autowired
    private ScheduleService schedules;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private Clock clock;

    private long userId;
    private long employeeId;
    private String code;

    @BeforeEach
    void createTestEmployee() {
        String connected = jdbc.queryForObject("SELECT current_database()", String.class);
        assertThat(connected).as("connected database").endsWith("_test");
        code = "CO" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase(Locale.ROOT);
        userId = jdbc.queryForObject(
                "INSERT INTO app_users (email, password_hash, role, active, login_id) "
                        + "VALUES (?, 'not-a-password-hash', 'EMPLOYEE', FALSE, ?) RETURNING id",
                Long.class, code.toLowerCase(Locale.ROOT) + "@test.invalid", code);
        employeeId = jdbc.queryForObject(
                "INSERT INTO employees (user_id, employee_code, first_name, last_name, employment_status) "
                        + "VALUES (?, ?, 'CompOff', 'Request Test', 'INACTIVE') RETURNING id",
                Long.class, userId, code);
    }

    @AfterEach
    void removeOnlyThisTestsRows() {
        jdbc.update("DELETE FROM audit_history WHERE entity_id LIKE ? OR (entity_type = 'COMP_OFF_REQUEST' AND entity_id IN "
                + "(SELECT id::text FROM comp_off_requests WHERE employee_id = ?))", code + "%", employeeId);
        jdbc.update("DELETE FROM notifications WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM leave_balance_adjustments WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM comp_off_requests WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM leave_balances WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM employee_work_schedules WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM employees WHERE id = ?", employeeId);
        jdbc.update("DELETE FROM app_users WHERE id = ?", userId);
    }

    /** The last Sunday before today: a weekly off under the company default (Saturday and Sunday). */
    private LocalDate lastSunday() {
        return LocalDate.now(clock).minusDays(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
    }

    private BigDecimal compOffBalance() {
        List<BigDecimal> rows = jdbc.queryForList(
                "SELECT balance_days FROM leave_balances WHERE employee_id = ? AND leave_type = 'COMP_OFF'",
                BigDecimal.class, employeeId);
        return rows.isEmpty() ? BigDecimal.ZERO : rows.get(0);
    }

    @Test
    void migrationV14IsApplied() {
        assertThat(jdbc.queryForObject("SELECT success FROM flyway_schema_history WHERE version = '14'", Boolean.class))
                .isTrue();
        assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() "
                + "AND table_name = 'leave_balance_adjustments' AND column_name = 'comp_off_request_id'", String.class))
                .containsExactly("comp_off_request_id");
    }

    @Test
    void theDatabaseAllowsOneActiveRequestPerDay() {
        LocalDate day = lastSunday();
        String insert = "INSERT INTO comp_off_requests (employee_id, work_date, days, reason, status, reviewed_at) "
                + "VALUES (?, ?, 1.0, 'Worked', ?, ?)";
        jdbc.update(insert, employeeId, day, "REJECTED", java.sql.Timestamp.from(clock.instant()));
        jdbc.update(insert, employeeId, day, "PENDING", null);
        assertThatThrownBy(() -> jdbc.update(insert, employeeId, day, "PENDING", null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ux_comp_off_requests_active_day");
        // Only full or half days.
        assertThatThrownBy(() -> jdbc.update(insert.replace("1.0", "0.7"), employeeId, day.minusDays(7), "PENDING", null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void approvingCreditsOnceAndTheHistoryRowIsLinkedToTheRequest() {
        CompOffRequestResponse asked = compOffRequests.apply(userId,
                new CompOffApplyRequest(lastSunday(), new BigDecimal("0.5"), "Database test: release support"));

        compOffRequests.approve(asked.id(), "Thanks", null);

        assertThat(compOffBalance()).isEqualByComparingTo("0.5");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM leave_balance_adjustments WHERE comp_off_request_id = ? "
                + "AND source = 'COMP_OFF_EARNED' AND change_days = 0.5", Long.class, asked.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT type FROM notifications WHERE user_id = ?", String.class, userId))
                .isEqualTo("COMP_OFF_APPROVED");
        // A second credit row for the same request is refused by the database itself.
        assertThatThrownBy(() -> jdbc.update("INSERT INTO leave_balance_adjustments (employee_id, leave_type, source, "
                + "change_days, balance_before, balance_after, reason, comp_off_request_id) "
                + "VALUES (?, 'COMP_OFF', 'COMP_OFF_EARNED', 0.5, 0.5, 1.0, 'again', ?)", employeeId, asked.id()))
                .isInstanceOf(DataIntegrityViolationException.class);
        // An earned row must point at a request, and only add days.
        assertThatThrownBy(() -> jdbc.update("INSERT INTO leave_balance_adjustments (employee_id, leave_type, source, "
                + "change_days, balance_before, balance_after, reason) "
                + "VALUES (?, 'COMP_OFF', 'COMP_OFF_EARNED', 1.0, 0.5, 1.5, 'no request')", employeeId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void twoApprovalsAtTheSameMomentCreditTheBalanceOnce() throws Exception {
        CompOffRequestResponse asked = compOffRequests.apply(userId,
                new CompOffApplyRequest(lastSunday(), new BigDecimal("1"), "Database test: weekend deployment"));

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<String>> results = new ArrayList<>();
        Callable<String> approve = () -> {
            start.await();
            try {
                compOffRequests.approve(asked.id(), null, null);
                return "approved";
            } catch (ApiException e) {
                return "refused";
            }
        };
        results.add(pool.submit(approve));
        results.add(pool.submit(approve));
        start.countDown();
        List<String> outcomes = new ArrayList<>();
        for (Future<String> f : results) {
            outcomes.add(f.get());
        }
        pool.shutdown();

        assertThat(outcomes).containsExactlyInAnyOrder("approved", "refused");
        assertThat(compOffBalance()).isEqualByComparingTo("1.0");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM leave_balance_adjustments WHERE employee_id = ?",
                Long.class, employeeId)).isEqualTo(1);
    }

    @Test
    void aScheduleChangeIsSavedFromAMondayAndTheEmployeeIsNotified() {
        LocalDate thisMonday = LocalDate.now(clock).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

        schedules.set(employeeId, new ScheduleRequest(List.of("TUESDAY", "WEDNESDAY"), new BigDecimal("9"), thisMonday), null);

        assertThat(jdbc.queryForObject("SELECT weekly_off_mask FROM employee_work_schedules WHERE employee_id = ?",
                Integer.class, employeeId)).isEqualTo(6);
        assertThat(jdbc.queryForObject("SELECT type FROM notifications WHERE user_id = ?", String.class, userId))
                .isEqualTo("SCHEDULE_CHANGED");
    }
}
