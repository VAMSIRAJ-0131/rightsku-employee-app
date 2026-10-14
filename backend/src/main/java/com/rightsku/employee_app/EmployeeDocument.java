package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * A document HR uploaded for one employee (table employee_documents, V5).
 * Only details are kept here; the file itself is in
 * {@link EmployeeDocumentFile}, so lists never load file contents.
 */
@Entity
@Table(name = "employee_documents")
public class EmployeeDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    /** A {@link DocumentType} name. */
    @Column(name = "doc_type", nullable = false, length = 30)
    private String docType;

    @Column(length = 7)
    private String period;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(nullable = false)
    private int version;

    @Column(name = "uploaded_by")
    private Long uploadedBy;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected EmployeeDocument() {
    }

    /** New document; the file has already passed {@link DocumentFileRules}. */
    public static EmployeeDocument create(
            Employee employee, DocumentType type, String period, String title,
            DocumentFileRules.CheckedFile file, Long actorUserId) {
        EmployeeDocument doc = new EmployeeDocument();
        doc.employee = employee;
        doc.docType = type.name();
        doc.period = period;
        doc.title = title;
        doc.version = 1;
        doc.uploadedBy = actorUserId;
        doc.updatedBy = actorUserId;
        doc.useFile(file);
        return doc;
    }

    /** HR uploaded a corrected file: details change and the version goes up. */
    public void replaceFile(DocumentFileRules.CheckedFile file, Long actorUserId) {
        useFile(file);
        version++;
        updatedBy = actorUserId;
        updatedAt = Instant.now();
    }

    public void rename(String newTitle, Long actorUserId) {
        title = newTitle;
        updatedBy = actorUserId;
        updatedAt = Instant.now();
    }

    private void useFile(DocumentFileRules.CheckedFile file) {
        fileName = file.fileName();
        contentType = file.contentType();
        sizeBytes = file.bytes().length;
        sha256 = file.sha256();
    }

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Employee getEmployee() {
        return employee;
    }

    public DocumentType getType() {
        return DocumentType.valueOf(docType);
    }

    public String getPeriod() {
        return period;
    }

    public String getTitle() {
        return title;
    }

    public String getFileName() {
        return fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }

    public int getVersion() {
        return version;
    }

    public Long getUploadedBy() {
        return uploadedBy;
    }

    public Long getUpdatedBy() {
        return updatedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
