package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

/**
 * An employee record (table created in V1). Each employee has exactly one
 * login account ({@link AppUser}, role EMPLOYEE) whose login_id always equals
 * this employee_code. The code cannot be changed after creation.
 */
@Entity
@Table(name = "employees")
public class Employee {

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_INACTIVE = "INACTIVE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private AppUser user;

    @Column(name = "employee_code", nullable = false, unique = true, length = 30)
    private String employeeCode;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    @Column(length = 30)
    private String phone;

    @Column(length = 100)
    private String department;

    @Column(name = "job_title", length = 100)
    private String jobTitle;

    @Column(name = "joining_date")
    private LocalDate joiningDate;

    @Column(name = "employment_status", nullable = false, length = 20)
    private String employmentStatus = STATUS_ACTIVE;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Employee() {
    }

    /** New active employee. The code must already be normalized and equal to the user's login ID. */
    public static Employee create(AppUser user, String employeeCode, EmployeeDetails details) {
        if (user == null || !AppUser.ROLE_EMPLOYEE.equals(user.getRole())) {
            throw new IllegalArgumentException("An employee needs an EMPLOYEE login account");
        }
        if (employeeCode == null || !employeeCode.equals(user.getLoginId())) {
            throw new IllegalArgumentException("Employee ID must equal the login ID");
        }
        Employee employee = new Employee();
        employee.user = user;
        employee.employeeCode = employeeCode;
        employee.employmentStatus = STATUS_ACTIVE;
        employee.apply(details);
        return employee;
    }

    /** Updates the editable details. The Employee ID is never changed here. */
    public void apply(EmployeeDetails details) {
        this.firstName = details.firstName();
        this.lastName = details.lastName();
        this.phone = details.phone();
        this.department = details.department();
        this.jobTitle = details.jobTitle();
        this.joiningDate = details.joiningDate();
    }

    public void activate() {
        employmentStatus = STATUS_ACTIVE;
        user.activate();
    }

    public void deactivate() {
        employmentStatus = STATUS_INACTIVE;
        user.deactivate();
    }

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public AppUser getUser() {
        return user;
    }

    public String getEmployeeCode() {
        return employeeCode;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public String getPhone() {
        return phone;
    }

    public String getDepartment() {
        return department;
    }

    public String getJobTitle() {
        return jobTitle;
    }

    public LocalDate getJoiningDate() {
        return joiningDate;
    }

    public String getEmploymentStatus() {
        return employmentStatus;
    }

    public boolean isActive() {
        return STATUS_ACTIVE.equals(employmentStatus);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /** Editable employee details, already trimmed (blank optional values are null). */
    public record EmployeeDetails(
            String firstName,
            String lastName,
            String phone,
            String department,
            String jobTitle,
            LocalDate joiningDate) {
    }
}
