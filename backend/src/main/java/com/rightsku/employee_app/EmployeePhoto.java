package com.rightsku.employee_app;

import jakarta.persistence.*;
import java.time.Instant;

/** An employee's profile photo (table employee_photos, V11). One per employee. */
@Entity
@Table(name = "employee_photos")
public class EmployeePhoto {

    @Id
    @Column(name = "employee_id")
    private Long employeeId;

    @Column(name = "content_type", nullable = false, length = 20)
    private String contentType;

    @Column(nullable = false)
    private byte[] content;

    @Column(name = "size_bytes", nullable = false)
    private int sizeBytes;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected EmployeePhoto() {
    }

    public EmployeePhoto(Long employeeId) {
        this.employeeId = employeeId;
    }

    public void replace(String contentType, byte[] content, Long updatedBy, Instant updatedAt) {
        this.contentType = contentType;
        this.content = content;
        this.sizeBytes = content.length;
        this.updatedBy = updatedBy;
        this.updatedAt = updatedAt;
    }

    public Long getEmployeeId() {
        return employeeId;
    }

    public String getContentType() {
        return contentType;
    }

    public byte[] getContent() {
        return content;
    }

    public int getSizeBytes() {
        return sizeBytes;
    }

    public Long getUpdatedBy() {
        return updatedBy;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
