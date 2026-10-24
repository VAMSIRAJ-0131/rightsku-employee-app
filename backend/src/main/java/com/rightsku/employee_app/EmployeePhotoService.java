package com.rightsku.employee_app;

import java.time.Clock;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Employee profile photos.
 *
 * <ul>
 *   <li>Only HR Admins upload, replace or remove a photo (the controller is
 *       under /api/hr/**). An employee can only read their own photo, found
 *       from the token, never by an ID they send.</li>
 *   <li>The file type comes from the file's first bytes, not its name or the
 *       browser's Content-Type: only JPEG and PNG are accepted, at most
 *       {@link #MAX_BYTES}.</li>
 *   <li>Stored in PostgreSQL like documents, and every change is audited.</li>
 * </ul>
 */
@Service
public class EmployeePhotoService {

    /** 2 MB: plenty for a profile photo, small enough to load quickly on a phone. */
    static final int MAX_BYTES = 2 * 1024 * 1024;

    /** The photo as stored, for the download response. */
    public record Photo(String contentType, byte[] content) {
    }

    private final EmployeePhotoRepository photos;
    private final EmployeeRepository employees;
    private final AuditEntryRepository audit;
    private final Clock clock;

    public EmployeePhotoService(
            EmployeePhotoRepository photos, EmployeeRepository employees, AuditEntryRepository audit, Clock clock) {
        this.photos = photos;
        this.employees = employees;
        this.audit = audit;
        this.clock = clock;
    }

    /* ---------- HR ---------- */

    @Transactional
    public void upload(long employeeId, byte[] bytes, Long actorUserId) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> ApiException.notFound("Employee not found."));
        String contentType = check(bytes);
        EmployeePhoto photo = photos.findById(employeeId).orElseGet(() -> new EmployeePhoto(employeeId));
        boolean replaced = photo.getContent() != null;
        photo.replace(contentType, bytes, actorUserId, clock.instant());
        photos.save(photo);
        audit.save(AuditEntry.of(actorUserId, replaced ? "PHOTO_REPLACED" : "PHOTO_UPLOADED",
                "EMPLOYEE", employee.getEmployeeCode()));
    }

    @Transactional(readOnly = true)
    public Photo forHr(long employeeId) {
        if (!employees.existsById(employeeId)) {
            throw ApiException.notFound("Employee not found.");
        }
        return read(employeeId);
    }

    @Transactional
    public void remove(long employeeId, Long actorUserId) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> ApiException.notFound("Employee not found."));
        if (photos.existsById(employeeId)) {
            photos.deleteById(employeeId);
            audit.save(AuditEntry.of(actorUserId, "PHOTO_REMOVED", "EMPLOYEE", employee.getEmployeeCode()));
        }
    }

    /* ---------- Employee: own photo only ---------- */

    @Transactional(readOnly = true)
    public Photo mine(long userId) {
        Employee me = employees.findByUser_Id(userId)
                .orElseThrow(() -> ApiException.notFound("No employee record is linked to this account."));
        return read(me.getId());
    }

    private Photo read(long employeeId) {
        EmployeePhoto photo = photos.findById(employeeId)
                .orElseThrow(() -> ApiException.notFound("No photo yet."));
        return new Photo(photo.getContentType(), photo.getContent());
    }

    /** JPEG or PNG (by content), not empty, at most 2 MB. Returns the content type to store. */
    static String check(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw ApiException.invalid("file", "Choose a photo to upload.");
        }
        if (bytes.length > MAX_BYTES) {
            throw ApiException.invalid("file", "This photo is larger than 2 MB. Choose a smaller one.");
        }
        String type = DocumentFileRules.detectContentType(bytes);
        if (!"image/jpeg".equals(type) && !"image/png".equals(type)) {
            throw ApiException.invalid("file", "Choose a JPG or PNG photo.");
        }
        return type;
    }
}
