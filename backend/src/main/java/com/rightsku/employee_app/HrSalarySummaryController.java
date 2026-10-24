package com.rightsku.employee_app;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Monthly salary summary (read only). /api/hr/** requires the HR_ADMIN role,
 * so employees and signed-out users can never see it.
 */
@RestController
@RequestMapping("/api/hr/salary-summary")
public class HrSalarySummaryController {

    private final SalarySummaryService summaries;

    public HrSalarySummaryController(SalarySummaryService summaries) {
        this.summaries = summaries;
    }

    @GetMapping
    public SalarySummaryResponse summary(@RequestParam int year, @RequestParam int month) {
        return summaries.summary(year, month);
    }
}
