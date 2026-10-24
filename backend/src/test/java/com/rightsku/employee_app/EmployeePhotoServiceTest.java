package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/** Photo rules: JPEG/PNG only by content, 2 MB limit, HR changes, employees read only their own. */
class EmployeePhotoServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-23T06:30:00Z"), ZoneId.of("Asia/Kolkata"));
    private static final Long HR = 1L;
    private static final byte[] PNG = DocumentFileRulesTest.PNG;
    private static final byte[] JPEG = DocumentFileRulesTest.JPEG;

    private EmployeePhotoRepository photos;
    private EmployeeRepository employees;
    private AuditEntryRepository audit;
    private EmployeePhotoService service;

    @BeforeEach
    void setUp() {
        photos = mock(EmployeePhotoRepository.class);
        employees = mock(EmployeeRepository.class);
        audit = mock(AuditEntryRepository.class);
        service = new EmployeePhotoService(photos, employees, audit, CLOCK);
        employee(10L, 110L, "EMP010");
        employee(20L, 120L, "EMP020");
    }

    private void employee(long id, long userId, String code) {
        AppUser account = AppUser.create(code, code.toLowerCase() + "@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(account, "id", userId);
        Employee e = Employee.create(account, code, new Employee.EmployeeDetails("Test", code, null, null, null, null));
        ReflectionTestUtils.setField(e, "id", id);
        when(employees.findById(id)).thenReturn(Optional.of(e));
        when(employees.existsById(id)).thenReturn(true);
        when(employees.findByUser_Id(userId)).thenReturn(Optional.of(e));
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    @Test
    void hrUploadsAPhotoThatIsStoredAndAudited() {
        service.upload(10L, JPEG, HR);

        ArgumentCaptor<EmployeePhoto> saved = ArgumentCaptor.forClass(EmployeePhoto.class);
        verify(photos).save(saved.capture());
        assertThat(saved.getValue().getEmployeeId()).isEqualTo(10L);
        assertThat(saved.getValue().getContentType()).isEqualTo("image/jpeg");
        assertThat(saved.getValue().getContent()).isEqualTo(JPEG);
        assertThat(saved.getValue().getUpdatedBy()).isEqualTo(HR);
        ArgumentCaptor<AuditEntry> logged = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(logged.capture());
        assertThat(logged.getValue().getAction()).isEqualTo("PHOTO_UPLOADED");
        assertThat(logged.getValue().getEntityId()).isEqualTo("EMP010");
    }

    @Test
    void replacingKeepsOneRowPerEmployee() {
        EmployeePhoto existing = new EmployeePhoto(10L);
        existing.replace("image/jpeg", JPEG, HR, CLOCK.instant());
        when(photos.findById(10L)).thenReturn(Optional.of(existing));

        service.upload(10L, PNG, HR);

        verify(photos).save(existing);
        assertThat(existing.getContentType()).isEqualTo("image/png");
        ArgumentCaptor<AuditEntry> logged = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(logged.capture());
        assertThat(logged.getValue().getAction()).isEqualTo("PHOTO_REPLACED");
    }

    @Test
    void onlyJpegAndPngUpToTwoMegabytesAreAccepted() {
        byte[] pdf = DocumentFileRulesTest.PDF;
        byte[] html = "<svg onload=alert(1)>".getBytes(StandardCharsets.UTF_8);
        byte[] tooBig = Arrays.copyOf(JPEG, EmployeePhotoService.MAX_BYTES + 1);

        assertApiError(catchThrowable(() -> service.upload(10L, pdf, HR)), HttpStatus.BAD_REQUEST, "file");
        assertApiError(catchThrowable(() -> service.upload(10L, html, HR)), HttpStatus.BAD_REQUEST, "file");
        assertApiError(catchThrowable(() -> service.upload(10L, new byte[0], HR)), HttpStatus.BAD_REQUEST, "file");
        assertApiError(catchThrowable(() -> service.upload(10L, tooBig, HR)), HttpStatus.BAD_REQUEST, "file");
        assertApiError(catchThrowable(() -> service.upload(99L, JPEG, HR)), HttpStatus.NOT_FOUND, null);
        verify(photos, never()).save(any());
        verify(audit, never()).save(any());
        // Exactly 2 MB is fine.
        service.upload(10L, Arrays.copyOf(JPEG, EmployeePhotoService.MAX_BYTES), HR);
    }

    @Test
    void anEmployeeReadsOnlyTheirOwnPhoto() {
        EmployeePhoto ravis = new EmployeePhoto(10L);
        ravis.replace("image/png", PNG, HR, CLOCK.instant());
        when(photos.findById(10L)).thenReturn(Optional.of(ravis));
        when(photos.findById(20L)).thenReturn(Optional.empty());

        assertThat(service.mine(110L).content()).isEqualTo(PNG);
        assertApiError(catchThrowable(() -> service.mine(120L)), HttpStatus.NOT_FOUND, null);
        assertApiError(catchThrowable(() -> service.mine(999L)), HttpStatus.NOT_FOUND, null);
    }

    @Test
    void hrRemovesAPhotoAndItIsAudited() {
        when(photos.existsById(10L)).thenReturn(true);

        service.remove(10L, HR);

        verify(photos).deleteById(10L);
        ArgumentCaptor<AuditEntry> logged = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(logged.capture());
        assertThat(logged.getValue().getAction()).isEqualTo("PHOTO_REMOVED");
    }
}
