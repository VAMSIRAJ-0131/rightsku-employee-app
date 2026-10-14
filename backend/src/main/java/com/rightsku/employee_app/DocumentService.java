package com.rightsku.employee_app;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Employee documents: HR uploads and corrects them, employees download only
 * their own.
 *
 * <ul>
 *   <li>Every upload is checked by {@link DocumentFileRules} (type from the
 *       file's content, size limit, safe file name).</li>
 *   <li>One document per employee, type and period (e.g. one payslip per
 *       month). A corrected file replaces the existing one and increases its
 *       version; it is never stored twice.</li>
 *   <li>Employees are identified from their token, never from the request,
 *       and get "not found" for any document that is not theirs.</li>
 *   <li>Uploads and changes are recorded in the audit log.</li>
 * </ul>
 */
@Service
public class DocumentService {

    static final int MAX_TITLE_LENGTH = 150;
    static final int RECENT_LIMIT = 50;

    /** The uploaded file as received (name as sent by the browser, raw bytes). */
    public record UploadedFile(String originalName, byte[] bytes) {
    }

    /** A file ready to send to the browser. */
    public record DownloadedDocument(String fileName, String contentType, byte[] content) {
    }

    private final EmployeeDocumentRepository documents;
    private final EmployeeDocumentFileRepository files;
    private final EmployeeRepository employees;
    private final AuditEntryRepository audit;
    private final long maxBytes;

    public DocumentService(
            EmployeeDocumentRepository documents,
            EmployeeDocumentFileRepository files,
            EmployeeRepository employees,
            AuditEntryRepository audit,
            @Value("${app.documents.max-bytes:" + DocumentFileRules.DEFAULT_MAX_BYTES + "}") long maxBytes) {
        this.documents = documents;
        this.files = files;
        this.employees = employees;
        this.audit = audit;
        this.maxBytes = maxBytes;
    }

    /* ---------- HR: upload and update ---------- */

    @Transactional
    public DocumentResponse upload(
            long employeeId, String type, String period, String title, UploadedFile file, Long actorUserId) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> ApiException.notFound("Employee not found."));
        DocumentType documentType = DocumentType.parse(type)
                .orElseThrow(() -> ApiException.invalid("type", "Choose a document type."));
        String storedPeriod = checkPeriod(documentType, period);
        String storedTitle = checkTitle(title, documentType.defaultTitle(storedPeriod));
        DocumentFileRules.CheckedFile checked = checkFile(file);

        if (documents.existsSlot(employeeId, documentType.name(), storedPeriod == null ? "" : storedPeriod)) {
            throw ApiException.conflict("type", alreadyExists(documentType, storedPeriod));
        }

        EmployeeDocument document = EmployeeDocument.create(
                employee, documentType, storedPeriod, storedTitle, checked, actorUserId);
        try {
            documents.saveAndFlush(document);
        } catch (DataIntegrityViolationException ex) {
            // Someone uploaded the same document at the same moment.
            throw ApiException.conflict("type", alreadyExists(documentType, storedPeriod));
        }
        files.save(new EmployeeDocumentFile(document.getId(), checked.bytes()));
        record(actorUserId, "DOCUMENT_UPLOADED", document);
        return DocumentResponse.from(document);
    }

    /**
     * Replaces the file (a corrected version) and/or changes the title. At
     * least one of the two must be given. Type, period and employee never change.
     */
    @Transactional
    public DocumentResponse update(long documentId, String title, UploadedFile file, Long actorUserId) {
        EmployeeDocument document = documents.findWithEmployee(documentId)
                .orElseThrow(() -> ApiException.notFound("Document not found."));
        boolean hasFile = file != null && file.bytes() != null;
        boolean hasTitle = title != null && !title.isBlank();
        if (!hasFile && !hasTitle) {
            throw ApiException.invalid("file", "Choose a corrected file or enter a new title.");
        }

        if (hasTitle) {
            document.rename(checkTitle(title, document.getTitle()), actorUserId);
        }
        if (hasFile) {
            DocumentFileRules.CheckedFile checked = checkFile(file);
            document.replaceFile(checked, actorUserId);
            EmployeeDocumentFile stored = files.findById(document.getId())
                    .orElseGet(() -> new EmployeeDocumentFile(document.getId(), checked.bytes()));
            stored.replaceContent(checked.bytes());
            files.save(stored);
        }
        documents.saveAndFlush(document);
        record(actorUserId, hasFile ? "DOCUMENT_REPLACED" : "DOCUMENT_RENAMED", document);
        return DocumentResponse.from(document);
    }

    /* ---------- HR: read ---------- */

    @Transactional(readOnly = true)
    public List<DocumentResponse> listForEmployee(long employeeId) {
        if (!employees.existsById(employeeId)) {
            throw ApiException.notFound("Employee not found.");
        }
        return documents.findForEmployee(employeeId).stream().map(DocumentResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<DocumentResponse> listRecent(int limit) {
        int size = Math.min(Math.max(1, limit), RECENT_LIMIT);
        return documents.findRecent(PageRequest.of(0, size)).stream().map(DocumentResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public DownloadedDocument downloadForHr(long documentId) {
        EmployeeDocument document = documents.findWithEmployee(documentId)
                .orElseThrow(() -> ApiException.notFound("Document not found."));
        return toDownload(document);
    }

    /* ---------- Employee: only their own documents ---------- */

    @Transactional(readOnly = true)
    public List<DocumentResponse> listMine(long userId) {
        Employee me = currentEmployee(userId);
        return documents.findForEmployee(me.getId()).stream().map(DocumentResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public DownloadedDocument downloadMine(long userId, long documentId) {
        Employee me = currentEmployee(userId);
        EmployeeDocument document = documents.findWithEmployee(documentId)
                .filter(d -> d.getEmployee().getId().equals(me.getId()))
                // Same answer whether the document is someone else's or does not exist.
                .orElseThrow(() -> ApiException.notFound("Document not found."));
        return toDownload(document);
    }

    /* ---------- Helpers ---------- */

    private Employee currentEmployee(long userId) {
        return employees.findByUser_Id(userId)
                .orElseThrow(() -> ApiException.notFound("Employee record not found."));
    }

    private DownloadedDocument toDownload(EmployeeDocument document) {
        EmployeeDocumentFile file = files.findById(document.getId())
                .orElseThrow(() -> ApiException.notFound("The file for this document is missing."));
        return new DownloadedDocument(document.getFileName(), document.getContentType(), file.getContent());
    }

    private DocumentFileRules.CheckedFile checkFile(UploadedFile file) {
        if (file == null) {
            throw ApiException.invalid("file", "Choose a file to upload.");
        }
        try {
            return DocumentFileRules.check(file.originalName(), file.bytes(), maxBytes);
        } catch (IllegalArgumentException ex) {
            throw ApiException.invalid("file", ex.getMessage());
        }
    }

    private static String checkPeriod(DocumentType type, String period) {
        try {
            return type.normalizePeriod(period);
        } catch (IllegalArgumentException ex) {
            throw ApiException.invalid("period", ex.getMessage());
        }
    }

    private static String checkTitle(String title, String fallback) {
        if (title == null || title.isBlank()) {
            return fallback;
        }
        String value = title.replaceAll("\\p{Cntrl}", " ").strip();
        if (value.length() > MAX_TITLE_LENGTH) {
            throw ApiException.invalid("title", "Title must be at most " + MAX_TITLE_LENGTH + " characters.");
        }
        return value;
    }

    private static String alreadyExists(DocumentType type, String period) {
        String what = period == null ? "an " + type.label().toLowerCase(java.util.Locale.ROOT)
                : "a " + type.label().toLowerCase(java.util.Locale.ROOT) + " for " + period;
        if (type == DocumentType.FORM_16) {
            what = "a Form 16 for " + period;
        }
        return "This employee already has " + what + ". Open it and choose Replace to upload a corrected file.";
    }

    private void record(Long actorUserId, String action, EmployeeDocument document) {
        audit.save(AuditEntry.of(actorUserId, action, "DOCUMENT", String.valueOf(document.getId())));
    }
}
