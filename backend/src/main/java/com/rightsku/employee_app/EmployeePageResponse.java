package com.rightsku.employee_app;

import java.util.List;

/** One page of employees, plus overall active/inactive counts for the summary. */
public record EmployeePageResponse(
    List<EmployeeResponse> items,
    int page,
    int size,
    long totalItems,
    int totalPages,
    long activeCount,
    long inactiveCount
) {
}
