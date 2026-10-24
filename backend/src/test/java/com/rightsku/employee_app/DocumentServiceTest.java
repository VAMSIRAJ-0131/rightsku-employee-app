package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/** Unit tests for document rules and permissions. Repositories are mocked: no database. */
class DocumentServiceTest {

    private static final Long HR = 1L;
    private static final byte[] PDF = DocumentFileRulesTest.PDF;
    private static final byte[] PNG = DocumentFileRulesTest.PNG;

    private EmployeeDocumentRepository documents;
    private EmployeeDocumentFileRepository files;
    private EmployeeRepository employees;
    private AuditEntryRepository audit;
    private DocumentService service;
    private NotificationRepository notificationRows;

    private Employee ravi;   // employee id 10, user id 110
    private Employee priya;  // employee id 20, user id 120

    @BeforeEach
    void setUp() {
        documents = mock(EmployeeDocumentRepository.class);
        files = mock(EmployeeDocumentFileRepository.class);
        employees = mock(EmployeeRepository.class);
        audit = mock(AuditEntryRepository.class);
        notificationRows = mock(NotificationRepository.class);
        service = new DocumentService(documents, files, employees, audit,
                new NotificationService(notificationRows, java.time.Clock.systemUTC()), 1024);

        ravi = employee(10L, 110L, "EMP010", "Ravi");
        priya = employee(20L, 120L, "EMP020", "Priya");

        // Give saved documents an ID, like the database would.
        when(documents.saveAndFlush(any(EmployeeDocument.class))).thenAnswer(call -> {
            EmployeeDocument doc = call.getArgument(0);
            if (doc.getId() == null) {
                ReflectionTestUtils.setField(doc, "id", 500L);
            }
            return doc;
        });
    }

    private Employee employee(long id, long userId, String code, String firstName) {
        AppUser account = AppUser.create(code, firstName.toLowerCase() + "@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(account, "id", userId);
        Employee e = Employee.create(account, code, new Employee.EmployeeDetails(firstName, "Test", null, null, null, null));
        ReflectionTestUtils.setField(e, "id", id);
        when(employees.findById(id)).thenReturn(Optional.of(e));
        when(employees.existsById(id)).thenReturn(true);
        when(employees.findByUser_Id(userId)).thenReturn(Optional.of(e));
        return e;
    }

    private EmployeeDocument stored(long id, Employee owner, DocumentType type, String period, byte[] content) {
        EmployeeDocument doc = EmployeeDocument.create(owner, type, period, type.defaultTitle(period),
                DocumentFileRules.check("file.pdf", content, 1024), HR);
        ReflectionTestUtils.setField(doc, "id", id);
        when(documents.findWithEmployee(id)).thenReturn(Optional.of(doc));
        when(files.findById(id)).thenReturn(Optional.of(new EmployeeDocumentFile(id, content)));
        return doc;
    }

    private static DocumentService.UploadedFile file(String name, byte[] bytes) {
        return new DocumentService.UploadedFile(name, bytes);
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    /* ---------- Upload ---------- */

    @Test
    void hrUploadsPayslipStoredWithFileAndAudit() {
        DocumentResponse response = service.upload(10L, "PAYSLIP", "2026-09", "", file("../sept.pdf", PDF), HR);

        assertThat(response.id()).isEqualTo(500L);
        assertThat(response.employeeId()).isEqualTo(10L);
        assertThat(response.type()).isEqualTo("PAYSLIP");
        assertThat(response.period()).isEqualTo("2026-09");
        assertThat(response.title()).isEqualTo("Payslip - September 2026");
        assertThat(response.fileName()).isEqualTo("sept.pdf");
        assertThat(response.contentType()).isEqualTo("application/pdf");
        assertThat(response.sizeBytes()).isEqualTo(PDF.length);
        assertThat(response.version()).isEqualTo(1);

        ArgumentCaptor<EmployeeDocumentFile> savedFile = ArgumentCaptor.forClass(EmployeeDocumentFile.class);
        verify(files).save(savedFile.capture());
        assertThat(savedFile.getValue().getDocumentId()).isEqualTo(500L);
        assertThat(savedFile.getValue().getContent()).isEqualTo(PDF);

        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("DOCUMENT_UPLOADED");
        assertThat(entry.getValue().getActorUserId()).isEqualTo(HR);
    }

    @Test
    void publishingAPayslipNotifiesOnlyItsEmployee() {
        service.upload(10L, "PAYSLIP", "2026-09", "", file("sept.pdf", PDF), HR);

        ArgumentCaptor<Notification> sent = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRows).save(sent.capture());
        assertThat(sent.getValue().getUserId()).as("Ravi's own account").isEqualTo(110L);
        assertThat(sent.getValue().getType()).isEqualTo("PAYSLIP_PUBLISHED");
        assertThat(sent.getValue().getTitle()).isEqualTo("Payslip published");
        assertThat(sent.getValue().getMessage()).isEqualTo("Payslip - September 2026 is ready to download.");
    }

    @Test
    void aCorrectedFileNotifiesButARenameAndARefusedUploadDoNot() {
        stored(7L, priya, DocumentType.OFFER_LETTER, null, PDF);

        service.update(7L, "Offer - Priya", null, HR);
        verify(notificationRows, never()).save(any());
        catchThrowable(() -> service.upload(10L, "SALARY", "2026-09", null, file("a.pdf", PDF), HR));
        verify(notificationRows, never()).save(any());

        service.update(7L, null, file("new.pdf", PDF), HR);
        ArgumentCaptor<Notification> sent = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRows).save(sent.capture());
        assertThat(sent.getValue().getUserId()).isEqualTo(120L);
        assertThat(sent.getValue().getType()).isEqualTo("DOCUMENT_PUBLISHED");
        assertThat(sent.getValue().getTitle()).isEqualTo("Document updated");
    }

    @Test
    void lettersNeedNoPeriodAndKeepHrTitle() {
        DocumentResponse response = service.upload(10L, "offer_letter", null, " Offer - Ravi ", file("offer.png", PNG), HR);
        assertThat(response.type()).isEqualTo("OFFER_LETTER");
        assertThat(response.period()).isNull();
        assertThat(response.title()).isEqualTo("Offer - Ravi");
        assertThat(response.contentType()).isEqualTo("image/png");
    }

    @Test
    void uploadValidationErrorsNameTheField() {
        assertApiError(catchThrowable(() -> service.upload(99L, "PAYSLIP", "2026-09", null, file("a.pdf", PDF), HR)),
                HttpStatus.NOT_FOUND, null);
        assertApiError(catchThrowable(() -> service.upload(10L, "SALARY", "2026-09", null, file("a.pdf", PDF), HR)),
                HttpStatus.BAD_REQUEST, "type");
        assertApiError(catchThrowable(() -> service.upload(10L, "PAYSLIP", "", null, file("a.pdf", PDF), HR)),
                HttpStatus.BAD_REQUEST, "period");
        assertApiError(catchThrowable(() -> service.upload(10L, "FORM_16", "2025-27", null, file("a.pdf", PDF), HR)),
                HttpStatus.BAD_REQUEST, "period");
        assertApiError(catchThrowable(() -> service.upload(10L, "PAYSLIP", "2026-09", "x".repeat(151), file("a.pdf", PDF), HR)),
                HttpStatus.BAD_REQUEST, "title");
        byte[] html = "<html></html>".getBytes(StandardCharsets.UTF_8);
        assertApiError(catchThrowable(() -> service.upload(10L, "PAYSLIP", "2026-09", null, file("a.pdf", html), HR)),
                HttpStatus.BAD_REQUEST, "file");
        assertApiError(catchThrowable(() -> service.upload(10L, "PAYSLIP", "2026-09", null, file("a.pdf", new byte[2048]), HR)),
                HttpStatus.BAD_REQUEST, "file");
        assertApiError(catchThrowable(() -> service.upload(10L, "PAYSLIP", "2026-09", null, null, HR)),
                HttpStatus.BAD_REQUEST, "file");
        verify(documents, never()).saveAndFlush(any());
        verify(files, never()).save(any());
    }

    @Test
    void secondPayslipForSameMonthIsRefusedButOtherMonthIsFine() {
        when(documents.existsSlot(10L, "PAYSLIP", "2026-09")).thenReturn(true);

        assertApiError(catchThrowable(() -> service.upload(10L, "PAYSLIP", "2026-09", null, file("a.pdf", PDF), HR)),
                HttpStatus.CONFLICT, "type");
        assertThat(service.upload(10L, "PAYSLIP", "2026-10", null, file("a.pdf", PDF), HR).period()).isEqualTo("2026-10");
    }

    @Test
    void lettersUseAnEmptyPeriodForTheDuplicateCheck() {
        service.upload(10L, "EXPERIENCE_LETTER", null, null, file("exp.pdf", PDF), HR);
        verify(documents).existsSlot(10L, "EXPERIENCE_LETTER", "");
    }

    @Test
    void simultaneousDuplicateUploadBecomesConflict() {
        doThrow(new DataIntegrityViolationException("dup")).when(documents).saveAndFlush(any(EmployeeDocument.class));
        assertApiError(catchThrowable(() -> service.upload(10L, "PAYSLIP", "2026-09", null, file("a.pdf", PDF), HR)),
                HttpStatus.CONFLICT, "type");
        verify(files, never()).save(any());
    }

    /* ---------- Update ---------- */

    @Test
    void replacingTheFileKeepsTheDocumentAndIncreasesVersion() {
        stored(7L, ravi, DocumentType.PAYSLIP, "2026-09", PDF);

        DocumentResponse response = service.update(7L, null, file("corrected.png", PNG), HR);

        assertThat(response.id()).isEqualTo(7L);
        assertThat(response.version()).isEqualTo(2);
        assertThat(response.fileName()).isEqualTo("corrected.png");
        assertThat(response.contentType()).isEqualTo("image/png");
        assertThat(response.period()).isEqualTo("2026-09");
        ArgumentCaptor<EmployeeDocumentFile> savedFile = ArgumentCaptor.forClass(EmployeeDocumentFile.class);
        verify(files).save(savedFile.capture());
        assertThat(savedFile.getValue().getContent()).isEqualTo(PNG);
        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("DOCUMENT_REPLACED");
    }

    @Test
    void renamingOnlyKeepsTheFileAndVersion() {
        stored(7L, ravi, DocumentType.OFFER_LETTER, null, PDF);

        DocumentResponse response = service.update(7L, "Offer letter (signed)", null, HR);

        assertThat(response.title()).isEqualTo("Offer letter (signed)");
        assertThat(response.version()).isEqualTo(1);
        verify(files, never()).save(any());
    }

    @Test
    void updateNeedsAFileOrTitleAndAValidFile() {
        stored(7L, ravi, DocumentType.PAYSLIP, "2026-09", PDF);
        assertApiError(catchThrowable(() -> service.update(7L, "  ", null, HR)), HttpStatus.BAD_REQUEST, "file");
        byte[] html = "<html></html>".getBytes(StandardCharsets.UTF_8);
        assertApiError(catchThrowable(() -> service.update(7L, null, file("a.pdf", html), HR)),
                HttpStatus.BAD_REQUEST, "file");
        assertApiError(catchThrowable(() -> service.update(404L, "Title", null, HR)), HttpStatus.NOT_FOUND, null);
        verify(files, never()).save(any());
    }

    /* ---------- Employee access ---------- */

    @Test
    void employeeListsOnlyTheirOwnDocuments() {
        EmployeeDocument mine = stored(7L, ravi, DocumentType.PAYSLIP, "2026-09", PDF);
        when(documents.findForEmployee(10L)).thenReturn(List.of(mine));

        List<DocumentResponse> result = service.listMine(110L);

        assertThat(result).extracting(DocumentResponse::id).containsExactly(7L);
        verify(documents).findForEmployee(10L);
        verify(documents, never()).findForEmployee(20L);
    }

    @Test
    void employeeDownloadsOwnDocument() {
        stored(7L, ravi, DocumentType.PAYSLIP, "2026-09", PDF);

        DocumentService.DownloadedDocument download = service.downloadMine(110L, 7L);

        assertThat(download.content()).isEqualTo(PDF);
        assertThat(download.contentType()).isEqualTo("application/pdf");
    }

    @Test
    void employeeGetsNotFoundForAnotherEmployeesDocument() {
        stored(8L, priya, DocumentType.FORM_16, "2025-26", PDF);

        assertApiError(catchThrowable(() -> service.downloadMine(110L, 8L)), HttpStatus.NOT_FOUND, null);
        assertApiError(catchThrowable(() -> service.downloadMine(110L, 999L)), HttpStatus.NOT_FOUND, null);
        verify(files, never()).findById(8L);
    }

    @Test
    void userWithoutEmployeeRecordGetsNotFound() {
        when(employees.findByUser_Id(anyLong())).thenReturn(Optional.empty());
        assertApiError(catchThrowable(() -> service.listMine(1L)), HttpStatus.NOT_FOUND, null);
    }

    @Test
    void hrCanDownloadAnyDocumentAndListPerEmployee() {
        EmployeeDocument doc = stored(8L, priya, DocumentType.FORM_16, "2025-26", PDF);
        when(documents.findForEmployee(20L)).thenReturn(List.of(doc));

        assertThat(service.downloadForHr(8L).content()).isEqualTo(PDF);
        assertThat(service.listForEmployee(20L)).extracting(DocumentResponse::employeeCode).containsExactly("EMP020");
        assertApiError(catchThrowable(() -> service.listForEmployee(99L)), HttpStatus.NOT_FOUND, null);
    }

    @Test
    void recentListIsCappedAtFifty() {
        service.listRecent(500);
        verify(documents).findRecent(eq(org.springframework.data.domain.PageRequest.of(0, 50)));
        verify(documents, never()).existsSlot(anyLong(), anyString(), anyString());
    }
}
