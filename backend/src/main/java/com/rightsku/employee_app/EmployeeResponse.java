package com.rightsku.employee_app;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Employee as returned by the API. Never contains a password or password hash.
 * gender, namePrefix and companyAddressId are null until HR sets them;
 * displayName is "Mr. First Last" (no prefix when none is set).
 */
public record EmployeeResponse(
    Long id,
    String employeeCode,
    String firstName,
    String lastName,
    String email,
    String phone,
    String department,
    String jobTitle,
    LocalDate joiningDate,
    String status,
    Instant createdAt,
    Instant updatedAt,
    String gender,
    String namePrefix,
    String displayName,
    Long companyAddressId
) {

    static EmployeeResponse from(Employee e) {
        return new EmployeeResponse(
                e.getId(),
                e.getEmployeeCode(),
                e.getFirstName(),
                e.getLastName(),
                e.getUser().getEmail(),
                e.getPhone(),
                e.getDepartment(),
                e.getJobTitle(),
                e.getJoiningDate(),
                e.getEmploymentStatus(),
                e.getCreatedAt(),
                e.getUpdatedAt(),
                e.getGender(),
                e.getNamePrefix(),
                e.displayName(),
                e.getCompanyAddressId());
    }
}
