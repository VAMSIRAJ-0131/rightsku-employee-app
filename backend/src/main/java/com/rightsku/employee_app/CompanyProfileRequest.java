package com.rightsku.employee_app;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** HR saves the company's name and phone. */
public record CompanyProfileRequest(

    @NotBlank(message = "Company name is required")
    @Size(max = 150, message = "Company name must be at most 150 characters")
    String name,

    @Size(max = 30, message = "Phone must be at most 30 characters")
    String phone

) {
}
