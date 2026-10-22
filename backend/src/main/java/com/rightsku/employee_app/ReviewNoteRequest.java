package com.rightsku.employee_app;

import jakarta.validation.constraints.Size;

/** HR: an optional note for the employee when approving or rejecting. */
public record ReviewNoteRequest(

    @Size(max = 500, message = "Note must be at most 500 characters")
    String note

) {
}
