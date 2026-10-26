package com.rightsku.employee_app;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** HR: the Activity screen (the audit log, read only). /api/hr/** requires the HR_ADMIN role. */
@RestController
@RequestMapping("/api/hr/audit")
public class HrAuditController {

    private final AuditService auditService;

    public HrAuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    /** ?page=0 (30 a page, newest first) and an optional category: approvals, employees, documents, company, requests. */
    @GetMapping
    public AuditService.PageResponse page(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(required = false) String category) {
        return auditService.page(page, category);
    }
}
