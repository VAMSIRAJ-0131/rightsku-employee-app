package com.rightsku.employee_app;

import java.io.IOException;
import java.net.URI;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * HR document management. Everything under /api/hr/** requires the HR_ADMIN
 * role (see SecurityConfig): employees get 403, unauthenticated requests 401.
 *
 * Uploads are multipart forms with a "file" part. Updates use POST as well
 * (multipart form data is only reliably supported on POST).
 */
@RestController
@RequestMapping("/api/hr")
public class HrDocumentController {

    private final DocumentService documentService;

    public HrDocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping("/employees/{employeeId}/documents")
    public List<DocumentResponse> listForEmployee(@PathVariable long employeeId) {
        return documentService.listForEmployee(employeeId);
    }

    @PostMapping(path = "/employees/{employeeId}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentResponse> upload(
            @PathVariable long employeeId,
            @RequestParam("type") String type,
            @RequestParam(value = "period", required = false) String period,
            @RequestParam(value = "title", required = false) String title,
            @RequestPart("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt) throws IOException {
        DocumentResponse created = documentService.upload(
                employeeId, type, period, title, toUploaded(file), actorId(jwt));
        return ResponseEntity.created(URI.create("/api/hr/documents/" + created.id())).body(created);
    }

    /** Most recent uploads and changes across all employees. */
    @GetMapping("/documents")
    public List<DocumentResponse> recent(@RequestParam(defaultValue = "20") int limit) {
        return documentService.listRecent(limit);
    }

    /** Replace the file with a corrected one and/or change the title. */
    @PostMapping(path = "/documents/{documentId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DocumentResponse update(
            @PathVariable long documentId,
            @RequestParam(value = "title", required = false) String title,
            @RequestPart(value = "file", required = false) MultipartFile file,
            @AuthenticationPrincipal Jwt jwt) throws IOException {
        return documentService.update(documentId, title, file == null ? null : toUploaded(file), actorId(jwt));
    }

    @GetMapping("/documents/{documentId}/file")
    public ResponseEntity<byte[]> download(@PathVariable long documentId) {
        return DocumentDownloads.response(documentService.downloadForHr(documentId));
    }

    private static DocumentService.UploadedFile toUploaded(MultipartFile file) throws IOException {
        return new DocumentService.UploadedFile(file.getOriginalFilename(), file.getBytes());
    }

    /** The signed-in HR Admin's user ID (the token subject), for the audit log. */
    private static Long actorId(Jwt jwt) {
        return jwt == null ? null : Long.valueOf(jwt.getSubject());
    }
}
