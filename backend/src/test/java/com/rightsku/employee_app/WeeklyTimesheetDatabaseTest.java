package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Weekly timesheets against a REAL PostgreSQL database: migration V7, saving
 * and reloading a draft, rollback when a submission fails part-way, and two
 * submissions of the same week at the same moment.
 *
 * <p><b>Runs only against a separate test database.</b> It is skipped unless
 * RIGHTSKU_TEST_DB_URL is set, and it refuses to start (before connecting)
 * unless the database name ends in "_test". Your development database
 * (rightsku_employee) is never used. Example:
 * <pre>
 * $env:RIGHTSKU_TEST_DB_URL = "jdbc:postgresql://localhost:5433/rightsku_employee_v7_test"
 * .\mvnw.cmd test "-Dtest=WeeklyTimesheetDatabaseTest"
 * </pre>
 * The database user is RIGHTSKU_TEST_DB_USER (default rightsku) with the
 * password in RIGHTSKU_TEST_DB_PASSWORD (default: DB_PASSWORD).
 *
 * <p><b>Data:</b> Flyway brings the test database up to date (V1 to V7).
 * Each test creates its own test employee (an INACTIVE account that can never
 * sign in, with a random Employee ID "WT..." and an @test.invalid email) and
 * afterwards deletes only the rows belonging to that test employee. No other
 * rows are changed or deleted, no admin account is created (the HR Admin
 * bootstrap is forced off), and nothing is ever dropped except the temporary
 * test trigger that this class itself creates.
 */
@EnabledIfEnvironmentVariable(named = "RIGHTSKU_TEST_DB_URL", matches = "jdbc:postgresql://.+")
@SpringBootTest(properties = {
        "HR_ADMIN_BOOTSTRAP_ENABLED=false",
        "app.jwt.secret=" + JwtServiceTest.TEST_SECRET
})
class WeeklyTimesheetDatabaseTest {

    private static final String DEVELOPMENT_DATABASE = "rightsku_employee";
    private static final BigDecimal NINE = new BigDecimal("9");

    @DynamicPropertySource
    static void isolatedTestDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("RIGHTSKU_TEST_DB_URL");
        String name = databaseName(url);
        if (!name.endsWith("_test") || name.equalsIgnoreCase(DEVELOPMENT_DATABASE)) {
            // Stops before Spring or Flyway connect to anything.
            throw new IllegalStateException("WeeklyTimesheetDatabaseTest only runs on a separate test database "
                    + "whose name ends in \"_test\". Refusing to use \"" + name + "\".");
        }
        String user = System.getenv().getOrDefault("RIGHTSKU_TEST_DB_USER", "rightsku");
        String password = System.getenv("RIGHTSKU_TEST_DB_PASSWORD");
        if (password == null) {
            password = System.getenv("DB_PASSWORD");
        }
        String finalPassword = password;
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> user);
        registry.add("spring.datasource.password", () -> finalPassword);
    }

    /** "jdbc:postgresql://localhost:5433/name?x=y" -> "name". */
    static String databaseName(String url) {
        String rest = url.substring(url.indexOf("//") + 2);
        int slash = rest.indexOf('/');
        String name = slash < 0 ? "" : rest.substring(slash + 1);
        int query = name.indexOf('?');
        return (query < 0 ? name : name.substring(0, query)).toLowerCase(Locale.ROOT);
    }

    @Autowired
    private TimesheetService service;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private Clock clock;

    private long userId;
    private long employeeId;

    @BeforeEach
    void createTestEmployee() {
        // Second check, on the live connection.
        String connected = jdbc.queryForObject("SELECT current_database()", String.class);
        assertThat(connected).as("connected database").endsWith("_test").isNotEqualToIgnoringCase(DEVELOPMENT_DATABASE);

        String code = "WT" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase(Locale.ROOT);
        userId = jdbc.queryForObject(
                "INSERT INTO app_users (email, password_hash, role, active, login_id) "
                        + "VALUES (?, 'not-a-password-hash', 'EMPLOYEE', FALSE, ?) RETURNING id",
                Long.class, code.toLowerCase(Locale.ROOT) + "@test.invalid", code);
        employeeId = jdbc.queryForObject(
                "INSERT INTO employees (user_id, employee_code, first_name, last_name, employment_status) "
                        + "VALUES (?, ?, 'Weekly', 'Timesheet Test', 'INACTIVE') RETURNING id",
                Long.class, userId, code);
    }

    @AfterEach
    void removeOnlyThisTestsRows() {
        dropFailureTrigger();
        jdbc.update("DELETE FROM timesheet_entries WHERE employee_id = ?", employeeId);
        jdbc.update("DELETE FROM timesheet_weeks WHERE employee_id = ?", employeeId); // draft days go with it (ON DELETE CASCADE)
        jdbc.update("DELETE FROM employees WHERE id = ?", employeeId);
        jdbc.update("DELETE FROM app_users WHERE id = ?", userId);
    }

    /* ---------- Helpers ---------- */

    /**
     * A finished week (two to six weeks ago) with at least two days that take
     * hours, read from the server so company holidays in the test database
     * are respected.
     */
    private WeekTimesheetResponse pickWeek() {
        LocalDate thisMonday = TimesheetService.mondayOf(LocalDate.now(clock));
        for (int back = 2; back <= 6; back++) {
            WeekTimesheetResponse week = service.weekMine(userId, thisMonday.minusWeeks(back));
            if (editableDays(week).size() >= 2) {
                return week;
            }
        }
        throw new IllegalStateException("No recent week with two working days found in the test database.");
    }

    private static List<LocalDate> editableDays(WeekTimesheetResponse week) {
        return week.days().stream().filter(WeekTimesheetResponse.Day::editable).map(WeekTimesheetResponse.Day::date).toList();
    }

    /** Every open day at 9 hours, which always reaches the week's target. */
    private static WeekTimesheetRequest fullWeek(WeekTimesheetResponse week, String description) {
        List<WeekTimesheetRequest.DayHours> days = new ArrayList<>();
        for (LocalDate date : editableDays(week)) {
            days.add(new WeekTimesheetRequest.DayHours(date, NINE));
        }
        return new WeekTimesheetRequest(week.weekStart(), description, days);
    }

    private int entryCount() {
        return jdbc.queryForObject("SELECT count(*) FROM timesheet_entries WHERE employee_id = ?", Integer.class, employeeId);
    }

    private String weekStatus(LocalDate weekStart) {
        List<String> rows = jdbc.queryForList(
                "SELECT status FROM timesheet_weeks WHERE employee_id = ? AND week_start = ?", String.class, employeeId, weekStart);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String triggerName() {
        return "wt_fail_insert_" + employeeId;
    }

    /** Test-only trigger: the INSERT for this employee and date fails, like a database error part-way. */
    private void failInsertOn(LocalDate date) {
        jdbc.execute("CREATE OR REPLACE FUNCTION " + triggerName() + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
                + "IF NEW.employee_id = " + employeeId + " AND NEW.work_date = DATE '" + date + "' THEN "
                + "RAISE EXCEPTION 'test-only failure while saving the last day'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER " + triggerName() + " BEFORE INSERT ON timesheet_entries "
                + "FOR EACH ROW EXECUTE FUNCTION " + triggerName() + "()");
    }

    private void dropFailureTrigger() {
        jdbc.execute("DROP TRIGGER IF EXISTS " + triggerName() + " ON timesheet_entries");
        jdbc.execute("DROP FUNCTION IF EXISTS " + triggerName() + "()");
    }

    /* ---------- Migration V7 ---------- */

    @Test
    void migrationV7IsAppliedAndOnlyAddsTwoTables() {
        assertThat(jdbc.queryForObject(
                "SELECT success FROM flyway_schema_history WHERE version = '7'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForList("SELECT table_name FROM information_schema.tables "
                + "WHERE table_schema = current_schema() AND table_name IN ('timesheet_weeks', 'timesheet_draft_days') "
                + "ORDER BY table_name", String.class))
                .containsExactly("timesheet_draft_days", "timesheet_weeks");
        // timesheet_entries is unchanged from V6.
        assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.columns "
                + "WHERE table_schema = current_schema() AND table_name = 'timesheet_entries' ORDER BY ordinal_position", String.class))
                .containsExactly("id", "employee_id", "work_date", "hours", "description", "status", "created_at", "updated_at");

        // The new rules hold: a week starts on a Monday; one row per employee and week; SUBMITTED needs a time.
        LocalDate monday = TimesheetService.mondayOf(LocalDate.now(clock)).minusWeeks(2);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO timesheet_weeks (employee_id, week_start) VALUES (?, ?)",
                employeeId, monday.plusDays(1))).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("INSERT INTO timesheet_weeks (employee_id, week_start) VALUES (?, ?)", employeeId, monday);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO timesheet_weeks (employee_id, week_start) VALUES (?, ?)",
                employeeId, monday)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE timesheet_weeks SET status = 'SUBMITTED' WHERE employee_id = ?",
                employeeId)).isInstanceOf(DataIntegrityViolationException.class);
    }

    /* ---------- Save and reload a draft ---------- */

    @Test
    void draftIsSavedReloadedAndReplacedWithoutSubmittingAnything() {
        WeekTimesheetResponse week = pickWeek();
        List<LocalDate> open = editableDays(week);

        service.saveDraft(userId, new WeekTimesheetRequest(week.weekStart(), " First draft ", List.of(
                new WeekTimesheetRequest.DayHours(open.get(0), new BigDecimal("8.5")),
                new WeekTimesheetRequest.DayHours(open.get(1), NINE))));

        // Reload, as when the employee comes back later.
        WeekTimesheetResponse reloaded = service.weekMine(userId, week.weekStart());
        assertThat(reloaded.status()).isEqualTo("DRAFT");
        assertThat(reloaded.description()).isEqualTo("First draft");
        assertThat(reloaded.days()).filteredOn(d -> d.date().equals(open.get(0)))
                .singleElement().satisfies(d -> assertThat(d.hours()).isEqualByComparingTo("8.5"));
        assertThat(reloaded.target().enteredHours()).isEqualByComparingTo("17.5");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM timesheet_draft_days d JOIN timesheet_weeks w ON w.id = d.week_id "
                + "WHERE w.employee_id = ?", Integer.class, employeeId)).isEqualTo(2);
        assertThat(entryCount()).as("a draft never creates timesheet entries").isZero();

        // Edit the draft: the first day is cleared, the second changed.
        service.saveDraft(userId, new WeekTimesheetRequest(week.weekStart(), "Changed", List.of(
                new WeekTimesheetRequest.DayHours(open.get(0), null),
                new WeekTimesheetRequest.DayHours(open.get(1), new BigDecimal("7.25")))));
        WeekTimesheetResponse changed = service.weekMine(userId, week.weekStart());
        assertThat(changed.days()).filteredOn(d -> d.date().equals(open.get(0))).singleElement()
                .satisfies(d -> assertThat(d.hours()).isNull());
        assertThat(changed.target().enteredHours()).isEqualByComparingTo("7.25");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM timesheet_weeks WHERE employee_id = ?", Integer.class, employeeId))
                .isEqualTo(1);
        assertThat(weekStatus(week.weekStart())).isEqualTo("DRAFT");
        assertThat(entryCount()).isZero();
    }

    /* ---------- Rollback ---------- */

    @Test
    void aSubmissionThatFailsPartWayLeavesNothingSubmitted() {
        WeekTimesheetResponse week = pickWeek();
        List<LocalDate> open = editableDays(week);
        service.saveDraft(userId, new WeekTimesheetRequest(week.weekStart(), "Draft before submitting",
                List.of(new WeekTimesheetRequest.DayHours(open.get(0), NINE))));

        // The earlier days are written first; the last day's INSERT fails.
        failInsertOn(open.get(open.size() - 1));
        assertThatThrownBy(() -> service.submitWeek(userId, fullWeek(week, "Whole week")))
                .isInstanceOf(RuntimeException.class);

        assertThat(entryCount()).as("no day of the week was kept").isZero();
        assertThat(weekStatus(week.weekStart())).as("the week is still a draft").isEqualTo("DRAFT");
        assertThat(jdbc.queryForObject("SELECT submitted_at IS NULL FROM timesheet_weeks WHERE employee_id = ?",
                Boolean.class, employeeId)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM timesheet_draft_days d JOIN timesheet_weeks w ON w.id = d.week_id "
                + "WHERE w.employee_id = ?", Integer.class, employeeId)).as("the saved draft is untouched").isEqualTo(1);

        // Once the problem is gone, the same week submits normally.
        dropFailureTrigger();
        assertThat(service.submitWeek(userId, fullWeek(week, "Whole week")).status()).isEqualTo("SUBMITTED");
        assertThat(entryCount()).isEqualTo(open.size());
    }

    /* ---------- Two submissions at the same moment ---------- */

    @Test
    void twoSubmissionsOfANewWeekAtTheSameMomentSaveItOnce() throws Exception {
        assertOnlyOneOfTwoSubmissionsWins(pickWeek());
    }

    @Test
    void twoSubmissionsOfASavedDraftAtTheSameMomentSaveItOnce() throws Exception {
        WeekTimesheetResponse week = pickWeek();
        service.saveDraft(userId, fullWeek(week, "Draft"));
        assertOnlyOneOfTwoSubmissionsWins(week);
    }

    private void assertOnlyOneOfTwoSubmissionsWins(WeekTimesheetResponse week) throws Exception {
        WeekTimesheetRequest request = fullWeek(week, "Whole week");
        CountDownLatch start = new CountDownLatch(1);
        Callable<Object> submit = () -> {
            start.await();
            try {
                return service.submitWeek(userId, request);
            } catch (ApiException ex) {
                return ex;
            }
        };
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Object> first = pool.submit(submit);
            Future<Object> second = pool.submit(submit);
            start.countDown();
            List<Object> results = List.of(first.get(30, TimeUnit.SECONDS), second.get(30, TimeUnit.SECONDS));

            assertThat(results).filteredOn(WeekTimesheetResponse.class::isInstance).hasSize(1);
            assertThat(results).filteredOn(ApiException.class::isInstance).singleElement()
                    .satisfies(r -> assertThat(((ApiException) r).getStatus()).isEqualTo(HttpStatus.CONFLICT));
        } finally {
            pool.shutdownNow();
        }
        assertThat(entryCount()).as("each day saved exactly once").isEqualTo(editableDays(week).size());
        assertThat(jdbc.queryForObject("SELECT count(DISTINCT work_date) FROM timesheet_entries WHERE employee_id = ?",
                Integer.class, employeeId)).isEqualTo(editableDays(week).size());
        assertThat(weekStatus(week.weekStart())).isEqualTo("SUBMITTED");
    }
}
