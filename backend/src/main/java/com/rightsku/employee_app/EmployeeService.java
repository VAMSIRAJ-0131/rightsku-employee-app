package com.rightsku.employee_app;

import java.util.Locale;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Employee management rules for HR Admins.
 *
 * <ul>
 *   <li>Creating an employee also creates their EMPLOYEE login account, in
 *       one transaction. The login ID always equals the Employee ID.</li>
 *   <li>The Employee ID is either typed by HR (validated) or generated as the
 *       next free EMP###. It is unique regardless of case and never changes.</li>
 *   <li>Passwords are stored only as BCrypt hashes and are never returned.
 *       The HR-chosen password is temporary: the employee must replace it at
 *       first sign-in.</li>
 *   <li>Deactivating an employee also blocks their login; their open sessions
 *       stop at the next request.</li>
 *   <li>Every change is recorded in the audit log.</li>
 * </ul>
 */
@Service
public class EmployeeService {

    static final String GENERATED_PREFIX = "EMP";
    static final int MAX_GENERATION_ATTEMPTS = 50;
    static final int MAX_PAGE_SIZE = 100;

    private final EmployeeRepository employees;
    private final AppUserRepository users;
    private final AuditEntryRepository audit;
    private final PasswordEncoder passwordEncoder;

    public EmployeeService(
            EmployeeRepository employees,
            AppUserRepository users,
            AuditEntryRepository audit,
            PasswordEncoder passwordEncoder) {
        this.employees = employees;
        this.users = users;
        this.audit = audit;
        this.passwordEncoder = passwordEncoder;
    }

    /* ---------- Read ---------- */

    @Transactional(readOnly = true)
    public EmployeePageResponse list(String search, String status, int page, int size) {
        String statusFilter = parseStatusFilter(status);
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), MAX_PAGE_SIZE);

        Page<Employee> result = employees.findAll(
                EmployeeRepository.search(search, statusFilter),
                PageRequest.of(safePage, safeSize, Sort.by("employeeCode").ascending()));

        return new EmployeePageResponse(
                result.getContent().stream().map(EmployeeResponse::from).toList(),
                safePage,
                safeSize,
                result.getTotalElements(),
                result.getTotalPages(),
                employees.countByEmploymentStatus(Employee.STATUS_ACTIVE),
                employees.countByEmploymentStatus(Employee.STATUS_INACTIVE));
    }

    @Transactional(readOnly = true)
    public EmployeeResponse get(long id) {
        return EmployeeResponse.from(find(id));
    }

    /* ---------- Create ---------- */

    @Transactional
    public EmployeeResponse create(CreateEmployeeRequest request, Long actorUserId) {
        PasswordPolicy.problem(request.initialPassword()).ifPresent(problem -> {
            throw ApiException.invalid("initialPassword", problem);
        });

        String code = isBlank(request.employeeCode())
                ? generateEmployeeCode()
                : validateNewEmployeeCode(request.employeeCode());
        String email = normalizeEmail(request.email());
        if (users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("email", "This email is already used by another account.");
        }

        AppUser account = AppUser.create(
                code, email, passwordEncoder.encode(request.initialPassword()), AppUser.ROLE_EMPLOYEE);
        // The HR-chosen password is temporary: the employee replaces it at first sign-in.
        account.requirePasswordChange();
        Employee employee = Employee.create(account, code, details(
                request.firstName(), request.lastName(), request.phone(),
                request.department(), request.jobTitle(), request.joiningDate()));

        try {
            users.saveAndFlush(account);
            employees.saveAndFlush(employee);
        } catch (DataIntegrityViolationException ex) {
            // Another request took the same ID or email at the same moment.
            throw ApiException.conflict(null, "This Employee ID or email was just used by another account. Try again.");
        }

        record(actorUserId, "EMPLOYEE_CREATED", employee);
        return EmployeeResponse.from(employee);
    }

    /* ---------- Update ---------- */

    @Transactional
    public EmployeeResponse update(long id, UpdateEmployeeRequest request, Long actorUserId) {
        Employee employee = find(id);
        AppUser account = employee.getUser();

        String email = normalizeEmail(request.email());
        boolean emailTakenByOther = users.findByEmailIgnoreCase(email)
                .filter(other -> !other.getId().equals(account.getId()))
                .isPresent();
        if (emailTakenByOther) {
            throw ApiException.conflict("email", "This email is already used by another account.");
        }

        account.changeEmail(email);
        employee.apply(details(
                request.firstName(), request.lastName(), request.phone(),
                request.department(), request.jobTitle(), request.joiningDate()));

        try {
            employees.saveAndFlush(employee);
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict("email", "This email was just used by another account. Try again.");
        }

        record(actorUserId, "EMPLOYEE_UPDATED", employee);
        return EmployeeResponse.from(employee);
    }

    /* ---------- Activate / deactivate ---------- */

    @Transactional
    public EmployeeResponse setActive(long id, boolean active, Long actorUserId) {
        Employee employee = find(id);
        if (employee.isActive() == active && employee.getUser().isActive() == active) {
            return EmployeeResponse.from(employee); // already in that state; nothing to record
        }
        if (active) {
            employee.activate();
        } else {
            employee.deactivate();
        }
        employees.saveAndFlush(employee);
        record(actorUserId, active ? "EMPLOYEE_ACTIVATED" : "EMPLOYEE_DEACTIVATED", employee);
        return EmployeeResponse.from(employee);
    }

    /* ---------- Helpers ---------- */

    private Employee find(long id) {
        return employees.findById(id)
                .orElseThrow(() -> ApiException.notFound("Employee not found."));
    }

    /** Validates an HR-typed Employee ID and checks it is not already used. */
    private String validateNewEmployeeCode(String requested) {
        String code;
        try {
            code = AppUser.normalizeLoginId(requested);
        } catch (IllegalArgumentException ex) {
            throw ApiException.invalid("employeeCode",
                    "Use 1-30 letters, digits, '.', '_' or '-', starting with a letter or digit.");
        }
        if (isEmployeeCodeTaken(code)) {
            throw ApiException.conflict("employeeCode", "This Employee ID is already in use.");
        }
        return code;
    }

    /** Next free EMP### (EMP001, EMP002, ...), skipping IDs that are already used. */
    String generateEmployeeCode() {
        for (int attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
            String code = String.format(Locale.ROOT, "%s%03d", GENERATED_PREFIX, employees.nextEmployeeCodeNumber());
            if (!isEmployeeCodeTaken(code)) {
                return code;
            }
        }
        throw ApiException.conflict("employeeCode",
                "Could not generate a free Employee ID. Enter one manually.");
    }

    private boolean isEmployeeCodeTaken(String code) {
        return employees.existsByEmployeeCodeIgnoreCase(code) || users.findByLoginIdIgnoreCase(code).isPresent();
    }

    private void record(Long actorUserId, String action, Employee employee) {
        audit.save(AuditEntry.of(actorUserId, action, "EMPLOYEE", employee.getEmployeeCode()));
    }

    private static String parseStatusFilter(String status) {
        if (status == null || status.isBlank() || status.equalsIgnoreCase("ALL")) {
            return null;
        }
        String value = status.trim().toUpperCase(Locale.ROOT);
        if (Employee.STATUS_ACTIVE.equals(value) || Employee.STATUS_INACTIVE.equals(value)) {
            return value;
        }
        throw ApiException.invalid("status", "Status must be ALL, ACTIVE or INACTIVE.");
    }

    private static Employee.EmployeeDetails details(
            String firstName, String lastName, String phone,
            String department, String jobTitle, java.time.LocalDate joiningDate) {
        return new Employee.EmployeeDetails(
                firstName.trim(), lastName.trim(),
                trimToNull(phone), trimToNull(department), trimToNull(jobTitle), joiningDate);
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String trimToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
