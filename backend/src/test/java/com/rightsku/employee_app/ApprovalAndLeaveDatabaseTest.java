package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * HR approvals and leave against a REAL PostgreSQL test database: migration
 * V8, the review UPDATE, the approval counts, leave balances with the audit
 * details, and two leave requests at the same moment never using more than
 * the balance; Comp-Off (V9) changes and approvals recorded exactly once.
 *
 * <p>Same safety rules as {@link WeeklyTimesheetDatabaseTest}: skipped unless
 * RIGHTSKU_TEST_DB_URL is set, refuses any database whose name does not end
 * in "_test", creates its own inactive test employee and deletes only that
 * employee's rows (and the audit rows it wrote) afterwards.
 */
@EnabledIfEnvironmentVariable(named = "RIGHTSKU_TEST_DB_URL", matches = "jdbc:postgresql://.+")
@SpringBootTest(properties = {
        "HR_ADMIN_BOOTSTRAP_ENABLED=false",
        "app.jwt.secret=" + JwtServiceTest.TEST_SECRET
})
class ApprovalAndLeaveDatabaseTest {

    @DynamicPropertySource
    static void isolatedTestDatabase(DynamicPropertyRegistry registry) {
        WeeklyTimesheetDatabaseTest.isolatedTestDatabase(registry);
    }

    @Autowired
    private TimesheetService timesheets;

    @Autowired
    private HrTimesheetService hrTimesheets;

    @Autowired
    private LeaveService leave;

    @Autowired
    private CompOffService compOff;

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
        code = "WT" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase(Locale.ROOT);
        userId = jdbc.queryForObject(
                "INSERT INTO app_users (email, password_hash, role, active, login_id) "
                        + "VALUES (?, 'not-a-password-hash', 'EMPLOYEE', FALSE, ?) RETURNING id",
                Long.class, code.toLowerCase(Locale.ROOT) + "@test.invalid", code);
        employeeId = jdbc.queryForObject(
                "INSERT INTO employees (user_id, employee_code, first_name, last_name, employment_status) "
                        + "VALUES (?, ?, 'Approval', 'Leave Test', 'INACTIVE') RETURNING id",
                Long.class, userId, code);
    }

    @AfterEach
    void removeOnlyThisTestsRows() {
        jdbc.update("DELETE FROM audit_history WHERE entity_id LIKE ? OR (entity_type = 'LEAVE_REQUEST' AND entity_id IN "
                + "(SELECT id::text FROM leave_requests WHERE employee_id = ?))", code + "%", employeeId);
        jdbc.update("DELETE FROM leave_balance_adjustments WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM leave_requests WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM leave_balances WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM timesheet_entries WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM timesheet_weeks WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM employees WHERE id = ?", employeeId);
        jdbc.update("DELETE FROM app_users WHERE id = ?", userId);
    }

    /** A Monday two weeks back and its open days at 9 hours. */
    private WeekTimesheetRequest twoWeeksAgo() {
        LocalDate monday = TimesheetService.mondayOf(LocalDate.now(clock)).minusWeeks(2);
        WeekTimesheetResponse week = timesheets.weekMine(userId, monday);
        List<WeekTimesheetRequest.DayHours> days = new ArrayList<>();
        week.days().stream().filter(WeekTimesheetResponse.Day::editable)
                .forEach(d -> days.add(new WeekTimesheetRequest.DayHours(d.date(), new BigDecimal("9"))));
        return new WeekTimesheetRequest(monday, "Database test week", days);
    }

    @Test
    void migrationV8IsApplied() {
        assertThat(jdbc.queryForObject("SELECT success FROM flyway_schema_history WHERE version = '8'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() "
                + "AND table_name = 'timesheet_entries' AND column_name LIKE 'review%' ORDER BY column_name", String.class))
                .containsExactly("review_note", "reviewed_at", "reviewed_by");
    }

    @Test
    void aSubmittedWeekReachesHrAndTheDecisionReachesTheEmployee() {
        WeekTimesheetRequest week = twoWeeksAgo();
        timesheets.submitWeek(userId, week);

        // HR sees it, once, with the employee's name and hours.
        List<HrTimesheetWeekResponse> pending = hrTimesheets.weeks("PENDING").stream()
                .filter(w -> w.employeeId() == employeeId).toList();
        assertThat(pending).singleElement().satisfies(w -> {
            assertThat(w.employeeCode()).isEqualTo(code);
            assertThat(w.weekStart()).isEqualTo(week.weekStart());
            assertThat(w.days()).hasSize(week.days().size());
        });
        long pendingBefore = hrTimesheets.summary().timesheets().pending();

        hrTimesheets.review(new TimesheetReviewRequest(employeeId, week.weekStart(), "REJECT", "Wrong project code"), null);

        assertThat(hrTimesheets.summary().timesheets().pending()).isEqualTo(pendingBefore - 1);
        assertThat(timesheets.listMine(userId, week.weekStart(), week.weekStart().plusDays(6)))
                .allSatisfy(t -> {
                    assertThat(t.status()).isEqualTo("REJECTED");
                    assertThat(t.remark()).isEqualTo("Wrong project code");
                });
    }

    @Test
    void balanceChangesAreSavedAndAuditedWithPreviousAndNewValues() {
        leave.setBalance(employeeId, "CASUAL", new BigDecimal("5"), null);
        leave.setBalance(employeeId, "CASUAL", new BigDecimal("7.5"), null);

        assertThat(leave.myBalances(userId).get(0).availableDays()).isEqualByComparingTo("7.5");
        String details = jdbc.queryForObject("SELECT details::text FROM audit_history WHERE action = 'LEAVE_BALANCE_CHANGED' "
                + "AND entity_id = ? ORDER BY id DESC LIMIT 1", String.class, code);
        assertThat(details).contains("\"previousDays\": 5.0").contains("\"newDays\": 7.5");
    }

    @Test
    void twoLeaveRequestsAtTheSameMomentNeverUseMoreThanTheBalance() throws Exception {
        leave.setBalance(employeeId, "CASUAL", new BigDecimal("3"), null);
        // Two different 2-working-day requests next month: only one fits into 3 days.
        LocalDate monday = TimesheetService.mondayOf(LocalDate.now(clock)).plusWeeks(4);
        LeaveApplyRequest first = new LeaveApplyRequest("CASUAL", monday, monday.plusDays(1), "First");
        LeaveApplyRequest second = new LeaveApplyRequest("CASUAL", monday.plusDays(7), monday.plusDays(8), "Second");

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Object> results = new ArrayList<>();
        try {
            List<Future<Object>> futures = new ArrayList<>();
            for (LeaveApplyRequest request : List.of(first, second)) {
                Callable<Object> call = () -> {
                    start.await();
                    try {
                        return leave.apply(userId, request);
                    } catch (ApiException ex) {
                        return ex;
                    }
                };
                futures.add(pool.submit(call));
            }
            start.countDown();
            for (Future<Object> f : futures) {
                results.add(f.get(30, TimeUnit.SECONDS));
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(results).filteredOn(LeaveRequestResponse.class::isInstance).hasSize(1);
        assertThat(results).filteredOn(ApiException.class::isInstance).hasSize(1);
        BigDecimal pending = jdbc.queryForObject("SELECT COALESCE(SUM(days), 0) FROM leave_requests "
                + "WHERE employee_id = ? AND status = 'PENDING'", BigDecimal.class, employeeId);
        assertThat(pending).isEqualByComparingTo("2");
    }

    @Test
    void approvingTakesTheDaysOffOnceInTheDatabase() {
        leave.setBalance(employeeId, "SICK", new BigDecimal("4"), null);
        LocalDate monday = TimesheetService.mondayOf(LocalDate.now(clock)).plusWeeks(4);
        LeaveRequestResponse sent = leave.apply(userId, new LeaveApplyRequest("SICK", monday, monday.plusDays(1), "Doctor"));

        leave.approve(sent.id(), null, null);

        assertThat(jdbc.queryForObject("SELECT balance_days FROM leave_balances WHERE employee_id = ? AND leave_type = 'SICK'",
                BigDecimal.class, employeeId)).isEqualByComparingTo("2");
        assertThat(jdbc.queryForObject("SELECT status FROM leave_requests WHERE id = ?", String.class, sent.id()))
                .isEqualTo("APPROVED");
    }

    /* ---------- Comp-Off (V9) ---------- */

    private static String newKey() {
        return "dbtest-" + UUID.randomUUID();
    }

    @Test
    void migrationV9IsApplied() {
        assertThat(jdbc.queryForObject("SELECT success FROM flyway_schema_history WHERE version = '9'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema() "
                + "AND table_name = 'leave_balance_adjustments'", Integer.class)).isEqualTo(1);
    }

    @Test
    void theSameCompOffChangeArrivingTwiceAtTheSameMomentIsAppliedOnce() throws Exception {
        CompOffAdjustmentRequest change = new CompOffAdjustmentRequest(new BigDecimal("1"), "Worked on Sunday", newKey());
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Object>> futures = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                Callable<Object> call = () -> {
                    start.await();
                    try {
                        return compOff.adjust(employeeId, change, null);
                    } catch (ApiException ex) {
                        return ex;
                    }
                };
                futures.add(pool.submit(call));
            }
            start.countDown();
            for (Future<Object> f : futures) {
                f.get(30, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(jdbc.queryForObject("SELECT balance_days FROM leave_balances WHERE employee_id = ? AND leave_type = 'COMP_OFF'",
                BigDecimal.class, employeeId)).isEqualByComparingTo("1");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM leave_balance_adjustments WHERE employee_id = ?",
                Integer.class, employeeId)).isEqualTo(1);
    }

    @Test
    void approvingCompOffTakesTheDaysOffOnceAndKeepsTheHistory() {
        compOff.adjust(employeeId, new CompOffAdjustmentRequest(new BigDecimal("2"), "Worked two Saturdays", newKey()), null);
        LocalDate monday = TimesheetService.mondayOf(LocalDate.now(clock)).plusWeeks(4);
        LeaveRequestResponse sent = leave.apply(userId, new LeaveApplyRequest("COMP_OFF", monday, monday, "Day off"));
        assertThat(compOff.summary(employeeId).balanceDays()).as("not taken off while pending").isEqualByComparingTo("2");

        leave.approve(sent.id(), null, null);
        Throwable again = catchThrowable(() -> leave.approve(sent.id(), null, null));

        assertThat(again).isInstanceOf(ApiException.class);
        assertThat(jdbc.queryForObject("SELECT balance_days FROM leave_balances WHERE employee_id = ? AND leave_type = 'COMP_OFF'",
                BigDecimal.class, employeeId)).isEqualByComparingTo("1");
        assertThat(jdbc.queryForList("SELECT source FROM leave_balance_adjustments WHERE employee_id = ? ORDER BY id",
                String.class, employeeId)).containsExactly("MANUAL", "LEAVE_APPROVED");
        // The database itself refuses a second deduction for the same request.
        Throwable duplicate = catchThrowable(() -> jdbc.update("INSERT INTO leave_balance_adjustments (employee_id, leave_type, "
                + "source, change_days, balance_before, balance_after, reason, leave_request_id) "
                + "VALUES (?, 'COMP_OFF', 'LEAVE_APPROVED', -1, 1, 0, 'Second time', ?)", employeeId, sent.id()));
        assertThat(duplicate).isNotNull();
        assertThat(compOff.summary(employeeId).history()).hasSize(2);
    }
}
