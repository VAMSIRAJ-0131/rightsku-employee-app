package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** HR adds or changes an office address. active: false hides it from new choices (it is never deleted). */
public record CompanyAddressRequest(

    @NotBlank(message = "Give the office a name, for example Head office")
    @Size(max = 60, message = "Name must be at most 60 characters")
    String label,

    @NotBlank(message = "Address is required")
    @Size(max = 300, message = "Address must be at most 300 characters")
    String address,

    Boolean active

) {
}
