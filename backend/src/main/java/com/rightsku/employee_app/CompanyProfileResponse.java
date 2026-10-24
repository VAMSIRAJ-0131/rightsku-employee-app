package com.rightsku.employee_app;

import java.time.Instant;
import java.util.List;

/**
 * The company profile for HR: name and phone (null until HR saves them) and
 * every office address, active ones first.
 */
public record CompanyProfileResponse(String name, String phone, Instant updatedAt, List<Address> addresses) {

    public record Address(long id, String label, String address, boolean active) {

        static Address from(CompanyAddress a) {
            return new Address(a.getId(), a.getLabel(), a.getAddress(), a.isActive());
        }
    }
}
