package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/** Unit tests for employee rules. Repositories are mocked: no database is touched. */
class EmployeeServiceTest {

    private static final String PASSWORD = "Test-Only-Passw0rd!";
    private static final Long HR_ACTOR = 1L;

    private EmployeeRepository employees;
    private AppUserRepository users;
    private AuditEntryRepository audit;
    private PasswordEncoder encoder;
    private EmployeeService service;

    @BeforeEach
    void setUp() {
        employees = mock(EmployeeRepository.class);
        users = mock(AppUserRepository.class);
        audit = mock(AuditEntryRepository.class);
        encoder = new BCryptPasswordEncoder(4); // low cost keeps tests fast
        service = new EmployeeService(employees, users, audit, encoder);
        when(users.findByLoginIdIgnoreCase(anyString())).thenReturn(Optional.empty());
        when(users.findByEmailIgnoreCase(anyString())).thenReturn(Optional.empty());
    }

    private static CreateEmployeeRequest create(String code, String email, String password) {
        return new CreateEmployeeRequest(code, " Ravi ", " Kumar ", email, " ", "Engineering ", null,
                LocalDate.of(2026, 10, 1), password);
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        ApiException ex = (ApiException) thrown;
        assertThat(ex.getStatus()).isEqualTo(status);
        assertThat(ex.getField()).isEqualTo(field);
    }

    private Employee existing(long id, String code, String email, boolean active) {
        AppUser account = AppUser.create(code, email, "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(account, "id", id + 100);
        Employee employee = Employee.create(account, account.getLoginId(),
                new Employee.EmployeeDetails("Old", "Name", null, null, null, null));
        ReflectionTestUtils.setField(employee, "id", id);
        if (!active) {
            employee.deactivate();
        }
        when(employees.findById(id)).thenReturn(Optional.of(employee));
        return employee;
    }

    /* ---------- Own profile ---------- */

    @Test
    void anEmployeeGetsTheirOwnRecordByAccountId() {
        Employee ravi = existing(10L, "EMP010", "ravi@rightsku.com", true);
        when(employees.findByUser_Id(110L)).thenReturn(Optional.of(ravi));

        EmployeeResponse mine = service.mine(110L);

        assertThat(mine.id()).isEqualTo(10L);
        assertThat(mine.employeeCode()).isEqualTo("EMP010");
        assertThat(mine.firstName()).isEqualTo("Old");
        assertThat(mine.lastName()).isEqualTo("Name");
        assertThat(mine.email()).isEqualTo("ravi@rightsku.com");
    }

    @Test
    void anAccountWithoutAnEmployeeRecordIsNotFound() {
        when(employees.findByUser_Id(999L)).thenReturn(Optional.empty());

        assertApiError(org.assertj.core.api.Assertions.catchThrowable(() -> service.mine(999L)), HttpStatus.NOT_FOUND, null);
    }

    /* ---------- HR resets a forgotten password ---------- */

    @Test
    void hrResetSetsAHashedTemporaryPasswordEndsSessionsAndForcesAChange() {
        Employee ravi = existing(10L, "EMP010", "ravi@rightsku.com", true);
        AppUser account = ravi.getUser();
        int sessionBefore = account.getSessionVersion();

        service.resetPassword(10L, new HrPasswordResetRequest(PASSWORD, PASSWORD), HR_ACTOR);

        assertThat(account.getPasswordHash()).isNotEqualTo(PASSWORD).startsWith("$2");
        assertThat(encoder.matches(PASSWORD, account.getPasswordHash())).isTrue();
        assertThat(account.isMustChangePassword()).as("must choose own password at next sign-in").isTrue();
        assertThat(account.getSessionVersion()).as("old sessions end").isEqualTo(sessionBefore + 1);
        verify(users).saveAndFlush(account);
        ArgumentCaptor<AuditEntry> logged = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(logged.capture());
        assertThat(logged.getValue().getAction()).isEqualTo("PASSWORD_RESET_BY_HR");
        assertThat(logged.getValue().getActorUserId()).isEqualTo(HR_ACTOR);
        assertThat(logged.getValue().getDetails()).as("the password is never logged").isNull();
    }

    @Test
    void hrResetFollowsThePasswordRulesAndBothFieldsMustMatch() {
        Employee ravi = existing(10L, "EMP010", "ravi@rightsku.com", true);
        String before = ravi.getUser().getPasswordHash();

        assertApiError(org.assertj.core.api.Assertions.catchThrowable(() ->
                service.resetPassword(10L, new HrPasswordResetRequest("short", "short"), HR_ACTOR)),
                HttpStatus.BAD_REQUEST, "temporaryPassword");
        assertApiError(org.assertj.core.api.Assertions.catchThrowable(() ->
                service.resetPassword(10L, new HrPasswordResetRequest(PASSWORD, PASSWORD + "x"), HR_ACTOR)),
                HttpStatus.BAD_REQUEST, "confirmPassword");
        assertThat(ravi.getUser().getPasswordHash()).isEqualTo(before);
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void inactiveOrMissingEmployeesCannotBeReset() {
        Employee gone = existing(11L, "EMP011", "gone@rightsku.com", false);
        String before = gone.getUser().getPasswordHash();

        assertApiError(org.assertj.core.api.Assertions.catchThrowable(() ->
                service.resetPassword(11L, new HrPasswordResetRequest(PASSWORD, PASSWORD), HR_ACTOR)),
                HttpStatus.CONFLICT, null);
        assertApiError(org.assertj.core.api.Assertions.catchThrowable(() ->
                service.resetPassword(99L, new HrPasswordResetRequest(PASSWORD, PASSWORD), HR_ACTOR)),
                HttpStatus.NOT_FOUND, null);
        assertThat(gone.getUser().getPasswordHash()).isEqualTo(before);
        verify(audit, never()).save(any());
    }

    /* ---------- Create ---------- */

    @Test
    void createsEmployeeWithLoginWhoseIdMatchesEmployeeIdAndHashedPassword() {
        EmployeeResponse response = service.create(create(" emp010 ", "Ravi.Kumar@RightSKU.com", PASSWORD), HR_ACTOR);

        ArgumentCaptor<AppUser> savedUser = ArgumentCaptor.forClass(AppUser.class);
        ArgumentCaptor<Employee> savedEmployee = ArgumentCaptor.forClass(Employee.class);
        verify(users).saveAndFlush(savedUser.capture());
        verify(employees).saveAndFlush(savedEmployee.capture());

        AppUser account = savedUser.getValue();
        assertThat(account.getRole()).isEqualTo(AppUser.ROLE_EMPLOYEE);
        assertThat(account.getLoginId()).isEqualTo("EMP010");
        assertThat(account.getEmail()).isEqualTo("ravi.kumar@rightsku.com");
        assertThat(account.isActive()).isTrue();
        assertThat(account.getPasswordHash()).startsWith("$2").isNotEqualTo(PASSWORD);
        assertThat(encoder.matches(PASSWORD, account.getPasswordHash())).isTrue();
        assertThat(account.isMustChangePassword())
                .as("HR-chosen password is temporary: the employee must change it at first sign-in")
                .isTrue();

        Employee employee = savedEmployee.getValue();
        assertThat(employee.getEmployeeCode()).isEqualTo(account.getLoginId());
        assertThat(employee.getFirstName()).isEqualTo("Ravi");
        assertThat(employee.getLastName()).isEqualTo("Kumar");
        assertThat(employee.getPhone()).as("blank optional value stored as null").isNull();
        assertThat(employee.getDepartment()).isEqualTo("Engineering");
        assertThat(employee.getEmploymentStatus()).isEqualTo("ACTIVE");

        assertThat(response.employeeCode()).isEqualTo("EMP010");
        assertThat(response.toString()).doesNotContain(account.getPasswordHash()).doesNotContain(PASSWORD);

        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("EMPLOYEE_CREATED");
        assertThat(entry.getValue().getActorUserId()).isEqualTo(HR_ACTOR);
        assertThat(entry.getValue().getEntityId()).isEqualTo("EMP010");
    }

    @Test
    void blankEmployeeIdIsGeneratedSkippingIdsAlreadyInUse() {
        when(employees.nextEmployeeCodeNumber()).thenReturn(1L, 2L, 3L);
        when(employees.existsByEmployeeCodeIgnoreCase("EMP001")).thenReturn(true);
        when(users.findByLoginIdIgnoreCase("EMP002")).thenReturn(Optional.of(
                AppUser.create("EMP002", "other@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE)));

        EmployeeResponse response = service.create(create("  ", "new@rightsku.com", PASSWORD), HR_ACTOR);

        assertThat(response.employeeCode()).isEqualTo("EMP003");
    }

    @Test
    void generatedIdsArePaddedToThreeDigitsAndCanGrow() {
        when(employees.nextEmployeeCodeNumber()).thenReturn(7L, 1234L);
        assertThat(service.generateEmployeeCode()).isEqualTo("EMP007");
        assertThat(service.generateEmployeeCode()).isEqualTo("EMP1234");
    }

    @Test
    void duplicateEmployeeIdIsRejectedRegardlessOfCase() {
        when(employees.existsByEmployeeCodeIgnoreCase("EMP010")).thenReturn(true);

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(
                () -> service.create(create("emp010", "new@rightsku.com", PASSWORD), HR_ACTOR));

        assertApiError(thrown, HttpStatus.CONFLICT, "employeeCode");
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void invalidEmployeeIdFormatIsRejected() {
        for (String bad : new String[] {"EMP 010", "emp@rightsku.com", "-EMP1", "EMP#1"}) {
            Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(
                    () -> service.create(create(bad, "new@rightsku.com", PASSWORD), HR_ACTOR));
            assertApiError(thrown, HttpStatus.BAD_REQUEST, "employeeCode");
        }
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void emailAlreadyUsedIsRejected() {
        when(users.existsByEmailIgnoreCase("taken@rightsku.com")).thenReturn(true);

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(
                () -> service.create(create("EMP010", "Taken@RightSKU.com", PASSWORD), HR_ACTOR));

        assertApiError(thrown, HttpStatus.CONFLICT, "email");
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void weakTemporaryPasswordIsRejectedWithoutEchoingIt() {
        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(
                () -> service.create(create("EMP010", "new@rightsku.com", "short1!"), HR_ACTOR));

        assertApiError(thrown, HttpStatus.BAD_REQUEST, "initialPassword");
        assertThat(thrown.getMessage()).doesNotContain("short1!");
        verify(users, never()).saveAndFlush(any());
    }

    @Test
    void concurrentDuplicateBecomesConflictNotServerError() {
        when(users.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("duplicate"));

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(
                () -> service.create(create("EMP010", "new@rightsku.com", PASSWORD), HR_ACTOR));

        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(HttpStatus.CONFLICT);
    }

    /* ---------- Update ---------- */

    @Test
    void updateChangesDetailsAndEmailButNeverTheEmployeeId() {
        Employee employee = existing(5L, "EMP005", "old@rightsku.com", true);

        EmployeeResponse response = service.update(5L, new UpdateEmployeeRequest(
                "Priya", "Sharma", "Priya.Sharma@rightsku.com", "+91 90000 00002", "QA", "Analyst",
                LocalDate.of(2024, 1, 8)), HR_ACTOR);

        assertThat(response.employeeCode()).isEqualTo("EMP005");
        assertThat(employee.getUser().getLoginId()).isEqualTo("EMP005");
        assertThat(response.email()).isEqualTo("priya.sharma@rightsku.com");
        assertThat(response.firstName()).isEqualTo("Priya");
        assertThat(response.jobTitle()).isEqualTo("Analyst");
        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("EMPLOYEE_UPDATED");
    }

    @Test
    void updateKeepingOwnEmailIsAllowed() {
        Employee employee = existing(5L, "EMP005", "same@rightsku.com", true);
        when(users.findByEmailIgnoreCase("same@rightsku.com")).thenReturn(Optional.of(employee.getUser()));

        EmployeeResponse response = service.update(5L, new UpdateEmployeeRequest(
                "A", "B", "same@rightsku.com", null, null, null, null), HR_ACTOR);

        assertThat(response.email()).isEqualTo("same@rightsku.com");
    }

    @Test
    void updateToAnotherAccountsEmailIsRejected() {
        existing(5L, "EMP005", "mine@rightsku.com", true);
        AppUser other = AppUser.create("EMP009", "theirs@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(other, "id", 999L);
        when(users.findByEmailIgnoreCase("theirs@rightsku.com")).thenReturn(Optional.of(other));

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(() -> service.update(5L,
                new UpdateEmployeeRequest("A", "B", "theirs@rightsku.com", null, null, null, null), HR_ACTOR));

        assertApiError(thrown, HttpStatus.CONFLICT, "email");
    }

    @Test
    void unknownEmployeeIsNotFound() {
        when(employees.findById(404L)).thenReturn(Optional.empty());

        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(() -> service.get(404L));

        assertApiError(thrown, HttpStatus.NOT_FOUND, null);
    }

    /* ---------- Activate / deactivate ---------- */

    @Test
    void deactivatingBlocksTheLoginAndIsAudited() {
        Employee employee = existing(5L, "EMP005", "e@rightsku.com", true);

        EmployeeResponse response = service.setActive(5L, false, HR_ACTOR);

        assertThat(response.status()).isEqualTo("INACTIVE");
        assertThat(employee.getUser().isActive()).as("login blocked too").isFalse();
        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("EMPLOYEE_DEACTIVATED");
    }

    @Test
    void activatingRestoresTheLogin() {
        Employee employee = existing(5L, "EMP005", "e@rightsku.com", false);

        EmployeeResponse response = service.setActive(5L, true, HR_ACTOR);

        assertThat(response.status()).isEqualTo("ACTIVE");
        assertThat(employee.getUser().isActive()).isTrue();
    }

    @Test
    void repeatingTheSameStatusChangesNothing() {
        existing(5L, "EMP005", "e@rightsku.com", true);

        service.setActive(5L, true, HR_ACTOR);

        verify(employees, never()).saveAndFlush(any());
        verify(audit, never()).save(any());
    }

    /* ---------- List ---------- */

    @Test
    void unknownStatusFilterIsRejected() {
        Throwable thrown = org.assertj.core.api.Assertions.catchThrowable(() -> service.list(null, "ON_HOLIDAY", 0, 20));

        assertApiError(thrown, HttpStatus.BAD_REQUEST, "status");
    }

    @Test
    void searchTextTreatsWildcardsAsNormalCharacters() {
        assertThat(EmployeeRepository.escapeLike("50%_off\\")).isEqualTo("50\\%\\_off\\\\");
    }

    @Test
    void employeeRecordRequiresMatchingLoginId() {
        AppUser account = AppUser.create("EMP001", "e@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        assertThatThrownBy(() -> Employee.create(account, "EMP002",
                new Employee.EmployeeDetails("A", "B", null, null, null, null)))
                .isInstanceOf(IllegalArgumentException.class);
        AppUser hr = AppUser.create("hr@rightsku.com", "hash", AppUser.ROLE_HR_ADMIN);
        assertThatThrownBy(() -> Employee.create(hr, null,
                new Employee.EmployeeDetails("A", "B", null, null, null, null)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
