package com.rightsku.employee_app;

import jakarta.persistence.*;

/** The stored file of an {@link EmployeeDocument} (table employee_document_files, V5). */
@Entity
@Table(name = "employee_document_files")
public class EmployeeDocumentFile {

    @Id
    @Column(name = "document_id")
    private Long documentId;

    @Column(nullable = false)
    private byte[] content;

    protected EmployeeDocumentFile() {
    }

    public EmployeeDocumentFile(Long documentId, byte[] content) {
        this.documentId = documentId;
        this.content = content;
    }

    public void replaceContent(byte[] newContent) {
        this.content = newContent;
    }

    public Long getDocumentId() {
        return documentId;
    }

    public byte[] getContent() {
        return content;
    }
}
