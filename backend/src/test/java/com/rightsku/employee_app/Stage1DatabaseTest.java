package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Stage 1 against a REAL PostgreSQL test database (V19): cancelling pending
 * leave and Comp-Off, personal details change requests, the HR Activity
 * screen and the CSV exports.
 *
 * <p>Same safety rules as {@link WeeklyTimesheetDatabaseTest}: skipped unless
 * RIGHTSKU_TEST_DB_URL is set, refuses any database whose name does not end
 * in "_test", creates its own inactive test accounts and deletes only their
 * rows afterwards.
 */
@EnabledIfEnvironmentVariable(named = "RIGHTSKU_TEST_DB_URL", matches = "jdbc:postgresql://.+")
@SpringBootTest(properties = {
        "HR_ADMIN_BOOTSTRAP_ENABLED=false",
        "app.jwt.secret=" + JwtServiceTest.TEST_SECRET
})
class Stage1DatabaseTest {

    @DynamicPropertySource
    static void isolatedTestDatabase(DynamicPropertyRegistry registry) {
        WeeklyTimesheetDatabaseTest.isolatedTestDatabase(registry);
    }

    @Autowired private LeaveService leave;
    @Autowired private CompOffRequestService compOff;
    @Autowired private ProfileChangeService profileChanges;
    @Autowired private AuditService auditService;
    @Autowired private ExportService exports;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private Clock clock;

    private String code;
    private long userId;
    private long employeeId;
    private long otherUserId;
    private long otherEmployeeId;
    private long hrUserId;

    @BeforeEach
    void createTestAccounts() {
        assertThat(jdbc.queryForObject("SELECT current_database()", String.class)).as("connected database").endsWith("_test");
        code = "S1" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase(Locale.ROOT);
        userId = user(code, "EMPLOYEE");
        employeeId = employee(userId, code, "Stage", "One Test");
        otherUserId = user(code + "B", "EMPLOYEE");
        otherEmployeeId = employee(otherUserId, code + "B", "Other", "Person");
        // An active HR Admin, so the "cancelled" / "profile update" notifications have someone to reach.
        hrUserId = jdbc.queryForObject(
                "INSERT INTO app_users (email, password_hash, role, active) VALUES (?, 'not-a-password-hash', 'HR_ADMIN', TRUE) RETURNING id",
                Long.class, code.toLowerCase(Locale.ROOT) + "-hr@test.invalid");
        jdbc.update("INSERT INTO leave_balances (employee_id, leave_type, balance_days) VALUES (?, 'CASUAL', 5)", employeeId);
    }

    private long user(String login, String role) {
        return jdbc.queryForObject("INSERT INTO app_users (email, password_hash, role, active, login_id) "
                + "VALUES (?, 'not-a-password-hash', ?, FALSE, ?) RETURNING id",
                Long.class, login.toLowerCase(Locale.ROOT) + "@test.invalid", role, login);
    }

    private long employee(long user, String empCode, String first, String last) {
        return jdbc.queryForObject("INSERT INTO employees (user_id, employee_code, first_name, last_name, employment_status) "
                + "VALUES (?, ?, ?, ?, 'INACTIVE') RETURNING id", Long.class, user, empCode, first, last);
    }

    @AfterEach
    void removeOnlyThisTestsRows() {
        for (long e : new long[] {employeeId, otherEmployeeId}) {
            jdbc.update("DELETE FROM audit_history WHERE entity_type = 'LEAVE_REQUEST' AND entity_id IN "
                    + "(SELECT id::text FROM leave_requests WHERE employee_id = ?)", e);
            jdbc.update("DELETE FROM audit_history WHERE entity_type = 'COMP_OFF_REQUEST' AND entity_id IN "
                    + "(SELECT id::text FROM comp_off_requests WHERE employee_id = ?)", e);
            jdbc.update("DELETE FROM profile_change_requests WHERE employee_id = ?", e);
            jdbc.update("DELETE FROM leave_requests WHERE employee_id = ?", e);
            jdbc.update("DELETE FROM comp_off_requests WHERE employee_id = ?", e);
            jdbc.update("DELETE FROM leave_balances WHERE employee_id = ?", e);
        }
        jdbc.update("DELETE FROM audit_history WHERE entity_id LIKE ?", code + "%");
        jdbc.update("DELETE FROM audit_history WHERE actor_user_id IN (?, ?, ?)", userId, otherUserId, hrUserId);
        jdbc.update("DELETE FROM notifications WHERE user_id IN (?, ?, ?)", userId, otherUserId, hrUserId);
        jdbc.update("DELETE FROM employees WHERE id IN (?, ?)", employeeId, otherEmployeeId);
        jdbc.update("DELETE FROM app_users WHERE id IN (?, ?, ?)", userId, otherUserId, hrUserId);
    }

    /** A Wednesday next week: a working day under the company default schedule. */
    private LocalDate nextWednesday() {
        return LocalDate.now(clock).plusWeeks(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.WEDNESDAY));
    }

    private LocalDate lastSunday() {
        return LocalDate.now(clock).minusDays(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
    }

    private long hrNotifications(String type) {
        return jdbc.queryForObject("SELECT count(*) FROM notifications WHERE user_id = ? AND type = ?", Long.class, hrUserId, type);
    }

    @Test
    void migrationV19IsApplied() {
        assertThat(jdbc.queryForObject("SELECT success FROM flyway_schema_history WHERE version = '19'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() "
                + "AND table_name = 'employees' AND column_name LIKE 'bank_%' ORDER BY column_name", String.class))
                .containsExactly("bank_account_name", "bank_account_number", "bank_ifsc");
    }

    @Test
    void anEmployeeCancelsTheirOwnPendingLeaveAndItsDaysAreFreeAgain() {
        LocalDate day = nextWednesday();
        LeaveRequestResponse asked = leave.apply(userId, new LeaveApplyRequest("CASUAL", day, day, "Family function"));

        // Someone else's request looks missing.
        assertThatThrownBy(() -> leave.cancel(otherUserId, asked.id()))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));

        LeaveRequestResponse cancelled = leave.cancel(userId, asked.id());
        assertThat(cancelled.status()).isEqualTo("CANCELLED");
        assertThat(hrNotifications("LEAVE_CANCELLED")).isEqualTo(1);
        // Cancelled once only.
        assertThatThrownBy(() -> leave.cancel(userId, asked.id()))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        // The same day can be asked for again, and the cancelled one holds no days.
        LeaveRequestResponse again = leave.apply(userId, new LeaveApplyRequest("CASUAL", day, day, "Family function"));
        assertThat(again.status()).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_history WHERE action = 'LEAVE_CANCELLED' AND entity_id = ?",
                Long.class, String.valueOf(asked.id()))).isEqualTo(1);
    }

    @Test
    void aDecidedLeaveCannotBeCancelled() {
        LocalDate day = nextWednesday();
        LeaveRequestResponse asked = leave.apply(userId, new LeaveApplyRequest("CASUAL", day, day, "Doctor visit"));
        leave.reject(asked.id(), "Busy week", hrUserId);
        assertThatThrownBy(() -> leave.cancel(userId, asked.id())).isInstanceOf(ApiException.class)
                .hasMessageContaining("rejected");
    }

    @Test
    void aCancelledCompOffRequestLetsTheDayBeAskedForAgain() {
        LocalDate day = lastSunday();
        CompOffRequestResponse asked = compOff.apply(userId, new CompOffApplyRequest(day, BigDecimal.ONE, "Release support"));
        assertThat(compOff.cancel(userId, asked.id()).status()).isEqualTo("CANCELLED");
        assertThat(hrNotifications("COMP_OFF_CANCELLED")).isEqualTo(1);
        CompOffRequestResponse again = compOff.apply(userId, new CompOffApplyRequest(day, BigDecimal.ONE, "Release support"));
        assertThat(again.status()).isEqualTo("PENDING");
        assertThatThrownBy(() -> compOff.cancel(otherUserId, again.id())).isInstanceOf(ApiException.class);
    }

    @Test
    void aProfileUpdateIsSavedOnlyWhenHrApproves() {
        Map<String, String> asked = new LinkedHashMap<>();
        asked.put("phone", "+91 98765 43210");
        asked.put("bankAccountNumber", "123456789012");
        asked.put("bankIfsc", "sbin0001234");
        ProfileChangeResponse request = profileChanges.ask(userId, asked);
        assertThat(request.status()).isEqualTo("PENDING");
        // The employee sees the account number masked; nothing is saved yet.
        assertThat(request.items()).extracting(ProfileChangeResponse.Item::requested)
                .containsExactly("+91 98765 43210", "•••• 9012", "SBIN0001234");
        assertThat(jdbc.queryForObject("SELECT bank_ifsc FROM employees WHERE id = ?", String.class, employeeId)).isNull();
        assertThat(profileChanges.myDetails(userId).pendingRequestId()).isEqualTo(request.id());
        assertThat(hrNotifications("PROFILE_CHANGE_REQUESTED")).isEqualTo(1);

        // One waiting request at a time.
        assertThatThrownBy(() -> profileChanges.ask(userId, Map.of("address", "12 MG Road, Hyderabad")))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT));

        // HR sees the full number and approves: saved once.
        assertThat(profileChanges.withStatus("PENDING")).filteredOn(r -> r.id() == request.id()).singleElement()
                .satisfies(r -> assertThat(r.items()).extracting(ProfileChangeResponse.Item::requested).contains("123456789012"));
        profileChanges.approve(request.id(), "Updated", hrUserId);
        Map<String, Object> saved = jdbc.queryForMap("SELECT phone, bank_account_number, bank_ifsc FROM employees WHERE id = ?", employeeId);
        assertThat(saved).containsEntry("phone", "+91 98765 43210").containsEntry("bank_account_number", "123456789012")
                .containsEntry("bank_ifsc", "SBIN0001234");
        assertThatThrownBy(() -> profileChanges.approve(request.id(), null, hrUserId)).isInstanceOf(ApiException.class);
        assertThat(profileChanges.myDetails(userId).bankAccountNumber()).isEqualTo("•••• 9012");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE user_id = ? AND type = 'PROFILE_CHANGE_APPROVED'",
                Long.class, userId)).isEqualTo(1);

        // The audit log names the fields, never the values.
        String details = jdbc.queryForObject("SELECT details::text FROM audit_history WHERE action = 'PROFILE_CHANGE_APPROVED' "
                + "AND entity_id = ?", String.class, code);
        assertThat(details).contains("bankAccountNumber").doesNotContain("123456789012");
    }

    @Test
    void profileUpdatesAreCheckedAndCanBeRejectedOrCancelled() {
        assertThatThrownBy(() -> profileChanges.ask(userId, Map.of("bankIfsc", "NOT-AN-IFSC"))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> profileChanges.ask(userId, Map.of("salary", "1000000"))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> profileChanges.ask(userId, Map.of())).isInstanceOf(ApiException.class);

        ProfileChangeResponse first = profileChanges.ask(userId, Map.of("address", "12 MG Road, Hyderabad"));
        assertThatThrownBy(() -> profileChanges.cancel(otherUserId, first.id())).isInstanceOf(ApiException.class);
        assertThat(profileChanges.cancel(userId, first.id()).status()).isEqualTo("CANCELLED");

        ProfileChangeResponse second = profileChanges.ask(userId, Map.of("address", "12 MG Road, Hyderabad"));
        assertThat(profileChanges.reject(second.id(), "Send proof", hrUserId).status()).isEqualTo("REJECTED");
        assertThat(jdbc.queryForObject("SELECT address FROM employees WHERE id = ?", String.class, employeeId)).isNull();
    }

    @Test
    void theActivityScreenShowsWhoDidWhatInWords() {
        LocalDate day = nextWednesday();
        LeaveRequestResponse asked = leave.apply(userId, new LeaveApplyRequest("CASUAL", day, day, "Trip"));
        leave.cancel(userId, asked.id());

        AuditService.PageResponse requests = auditService.page(0, "requests");
        assertThat(requests.items()).filteredOn(i -> i.action().equals("LEAVE_CANCELLED") && i.subject() != null
                        && i.subject().contains(code))
                .singleElement()
                .satisfies(i -> {
                    assertThat(i.label()).isEqualTo("Cancelled leave request");
                    assertThat(i.actor()).contains("Stage One Test").contains(code);
                    assertThat(i.subject()).contains("Casual leave");
                });
        assertThat(auditService.page(0, "approvals").items()).noneMatch(i -> i.action().equals("LEAVE_CANCELLED"));
        assertThatThrownBy(() -> auditService.page(0, "salaries")).isInstanceOf(ApiException.class);
    }

    @Test
    void exportsAreCsvForExcelAndRecorded() {
        jdbc.update("UPDATE employees SET address = '=CMD()' WHERE id = ?", employeeId);
        LocalDate day = nextWednesday();
        leave.apply(userId, new LeaveApplyRequest("CASUAL", day, day, "Exam, \"final\""));

        ExportService.CsvFile people = exports.export("employees", null, false, hrUserId);
        String text = new String(people.content(), StandardCharsets.UTF_8);
        assertThat(text).startsWith("﻿Employee ID,Name,Email");
        assertThat(text).contains(code + ",Stage One Test").contains("'=CMD()");

        ExportService.CsvFile leaveCsv = exports.export("leave", day.toString().substring(0, 7), false, hrUserId);
        assertThat(leaveCsv.fileName()).isEqualTo("rightcentral-leave-" + day.toString().substring(0, 7) + ".csv");
        assertThat(new String(leaveCsv.content(), StandardCharsets.UTF_8))
                .contains(code + ",Stage One Test,Casual," + day + "," + day + ",1,Pending,\"Exam, \"\"final\"\"\"");

        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_history WHERE action = 'DATA_EXPORTED' AND actor_user_id = ?",
                Long.class, hrUserId)).isEqualTo(2);
        assertThatThrownBy(() -> exports.export("leave", "October", false, hrUserId)).isInstanceOf(ApiException.class);
    }
}
