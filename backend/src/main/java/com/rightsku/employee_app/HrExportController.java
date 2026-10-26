package com.rightsku.employee_app;

import java.nio.charset.StandardCharsets;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * HR: CSV exports that open in Excel. /api/hr/** requires the HR_ADMIN role;
 * each export is recorded in the audit log with the HR account from the token.
 */
@RestController
@RequestMapping("/api/hr/exports")
public class HrExportController {

    private final ExportService exports;

    public HrExportController(ExportService exports) {
        this.exports = exports;
    }

    /** kind: employees (bank=true adds full account numbers), leave, timesheets or comp-off (?month=2026-10). */
    @GetMapping("/{kind}")
    public ResponseEntity<byte[]> export(
            @PathVariable String kind,
            @RequestParam(required = false) String month,
            @RequestParam(defaultValue = "false") boolean bank,
            @AuthenticationPrincipal Jwt jwt) {
        ExportService.CsvFile file = exports.export(kind, month, bank, Long.valueOf(jwt.getSubject()));
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(file.content());
    }
}
