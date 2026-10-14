package com.rightsku.employee_app;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in employee's own documents. /api/employee/** requires the
 * EMPLOYEE role; which employee is always taken from the token, so one
 * employee can never list or download another employee's documents.
 */
@RestController
@RequestMapping("/api/employee/documents")
public class EmployeeDocumentController {

    private final DocumentService documentService;

    public EmployeeDocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping
    public List<DocumentResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return documentService.listMine(Long.parseLong(jwt.getSubject()));
    }

    @GetMapping("/{documentId}/file")
    public ResponseEntity<byte[]> download(@PathVariable long documentId, @AuthenticationPrincipal Jwt jwt) {
        return DocumentDownloads.response(documentService.downloadMine(Long.parseLong(jwt.getSubject()), documentId));
    }
}
