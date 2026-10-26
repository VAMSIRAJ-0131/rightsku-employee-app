package com.rightsku.employee_app;

/**
 * An employee's personal details. For the employee the bank account number
 * is masked ("•••• 4321"); HR gets it in full. "pendingRequestId" is the
 * waiting change request, if there is one.
 */
public record PersonalDetailsResponse(
    String phone,
    String address,
    String emergencyContactName,
    String emergencyContactPhone,
    String bankAccountName,
    String bankAccountNumber,
    String bankIfsc,
    Long pendingRequestId
) {

    static PersonalDetailsResponse of(Employee e, boolean maskBank, Long pendingRequestId) {
        return new PersonalDetailsResponse(
                e.getPhone(),
                e.getAddress(),
                e.getEmergencyContactName(),
                e.getEmergencyContactPhone(),
                e.getBankAccountName(),
                maskBank ? ProfileField.mask(e.getBankAccountNumber()) : e.getBankAccountNumber(),
                e.getBankIfsc(),
                pendingRequestId);
    }
}
