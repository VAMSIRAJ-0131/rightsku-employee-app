package com.rightsku.employee_app;

/**
 * The signed-in employee's virtual ID card: only their own details plus the
 * company name, phone and the office address HR chose for them. Any value
 * HR has not entered yet is null (the app shows a placeholder; nothing is
 * made up).
 */
public record EmployeeIdCardResponse(
    String displayName,
    String employeeCode,
    String department,
    String jobTitle,
    String companyName,
    String companyPhone,
    String officeLabel,
    String officeAddress
) {
}
