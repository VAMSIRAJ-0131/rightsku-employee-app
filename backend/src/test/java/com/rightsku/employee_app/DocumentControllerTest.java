package com.rightsku.employee_app;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Web-layer tests for document upload, update and download: who may call
 * what, status codes and download headers. The service is mocked, so no
 * database is used.
 */
@WebMvcTest(
        controllers = {HrDocumentController.class, EmployeeDocumentController.class},
        properties = {
                "app.jwt.secret=" + JwtServiceTest.TEST_SECRET,
                "HR_ADMIN_BOOTSTRAP_ENABLED=false"
        })
@Import({SecurityConfig.class, JwtService.class, AppUserDetailsService.class})
class DocumentControllerTest {

    private static final byte[] PDF = DocumentFileRulesTest.PDF;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private DocumentService documentService;

    @MockitoBean
    private AppUserRepository appUserRepository;

    private String hrToken;
    private String employeeToken;
    private String temporaryPasswordToken;

    private String tokenFor(long id, String loginId, String email, String role, boolean temporaryPassword) {
        AppUser user = AppUser.create(loginId, email, "not-a-real-hash", role);
        if (temporaryPassword) {
            user.requirePasswordChange();
        }
        ReflectionTestUtils.setField(user, "id", id);
        when(appUserRepository.findById(id)).thenReturn(Optional.of(user));
        return jwtService.generateToken(user);
    }

    @BeforeEach
    void setUp() {
        hrToken = tokenFor(1L, null, "hr@rightsku.com", AppUser.ROLE_HR_ADMIN, false);
        employeeToken = tokenFor(110L, "EMP010", "ravi@rightsku.com", AppUser.ROLE_EMPLOYEE, false);
        temporaryPasswordToken = tokenFor(120L, "EMP020", "priya@rightsku.com", AppUser.ROLE_EMPLOYEE, true);
    }

    private static final String AUTH = "Authorization";

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private static DocumentResponse sample(long id) {
        return new DocumentResponse(id, 10L, "EMP010", "Ravi Kumar", "PAYSLIP", "Payslip", "2026-09",
                "Payslip - September 2026", "sept.pdf", "application/pdf", PDF.length, 1,
                Instant.parse("2026-10-01T09:00:00Z"), Instant.parse("2026-10-01T09:00:00Z"));
    }

    private static MockMultipartFile pdf() {
        return new MockMultipartFile("file", "sept.pdf", "application/pdf", PDF);
    }

    /* ---------- Who may upload ---------- */

    @Test
    void uploadWithoutTokenIs401AndEmployeesGet403() throws Exception {
        mockMvc.perform(multipart("/api/hr/employees/10/documents").file(pdf()).param("type", "PAYSLIP"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(multipart("/api/hr/employees/10/documents").file(pdf()).param("type", "PAYSLIP").header(AUTH, bearer(employeeToken)))
                .andExpect(status().isForbidden());
        mockMvc.perform(multipart("/api/hr/documents/7").file(pdf()).header(AUTH, bearer(employeeToken)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/hr/documents/7/file").header(AUTH, bearer(employeeToken))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/hr/employees/10/documents").header(AUTH, bearer(employeeToken))).andExpect(status().isForbidden());
        verify(documentService, never()).upload(anyLong(), any(), any(), any(), any(), any());
        verify(documentService, never()).downloadForHr(anyLong());
    }

    @Test
    void hrUploadsAFileForAnEmployee() throws Exception {
        when(documentService.upload(eq(10L), eq("PAYSLIP"), eq("2026-09"), isNull(), any(), eq(1L)))
                .thenReturn(sample(500L));

        mockMvc.perform(multipart("/api/hr/employees/10/documents")
                        .file(pdf())
                        .param("type", "PAYSLIP")
                        .param("period", "2026-09").header(AUTH, bearer(hrToken)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/hr/documents/500"))
                .andExpect(jsonPath("$.id").value(500))
                .andExpect(jsonPath("$.fileName").value("sept.pdf"))
                .andExpect(jsonPath("$.content").doesNotExist());

        ArgumentCaptor<DocumentService.UploadedFile> file = ArgumentCaptor.forClass(DocumentService.UploadedFile.class);
        verify(documentService).upload(eq(10L), eq("PAYSLIP"), eq("2026-09"), isNull(), file.capture(), eq(1L));
        org.assertj.core.api.Assertions.assertThat(file.getValue().bytes()).isEqualTo(PDF);
        org.assertj.core.api.Assertions.assertThat(file.getValue().originalName()).isEqualTo("sept.pdf");
    }

    @Test
    void uploadWithoutFileOrTypeIs400() throws Exception {
        mockMvc.perform(multipart("/api/hr/employees/10/documents").param("type", "PAYSLIP").header(AUTH, bearer(hrToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.file").exists());
        mockMvc.perform(multipart("/api/hr/employees/10/documents").file(pdf()).header(AUTH, bearer(hrToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.type").exists());
        verify(documentService, never()).upload(anyLong(), any(), any(), any(), any(), any());
    }

    @Test
    void serviceValidationErrorsReachTheClient() throws Exception {
        when(documentService.upload(anyLong(), any(), any(), any(), any(), any()))
                .thenThrow(ApiException.invalid("file", "Only PDF, PNG or JPG files can be uploaded."));

        mockMvc.perform(multipart("/api/hr/employees/10/documents").file(pdf()).param("type", "PAYSLIP")
                        .param("period", "2026-09").header(AUTH, bearer(hrToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.file").value("Only PDF, PNG or JPG files can be uploaded."));
    }

    @Test
    void hrReplacesAFileOrChangesTheTitle() throws Exception {
        when(documentService.update(eq(7L), isNull(), any(), eq(1L))).thenReturn(sample(7L));
        mockMvc.perform(multipart("/api/hr/documents/7").file(pdf()).header(AUTH, bearer(hrToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7));

        when(documentService.update(eq(7L), eq("Corrected payslip"), isNull(), eq(1L))).thenReturn(sample(7L));
        mockMvc.perform(multipart("/api/hr/documents/7").param("title", "Corrected payslip").header(AUTH, bearer(hrToken)))
                .andExpect(status().isOk());
        verify(documentService).update(eq(7L), eq("Corrected payslip"), isNull(), eq(1L));
    }

    /* ---------- Downloads ---------- */

    @Test
    void downloadIsAnAttachmentWithSafeHeaders() throws Exception {
        when(documentService.downloadForHr(7L))
                .thenReturn(new DocumentService.DownloadedDocument("Sept payslip.pdf", "application/pdf", PDF));

        mockMvc.perform(get("/api/hr/documents/7/file").header(AUTH, bearer(hrToken)))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/pdf"))
                .andExpect(content().bytes(PDF))
                .andExpect(header().string("Content-Disposition", containsString("attachment")))
                .andExpect(header().string("Content-Disposition", containsString("Sept")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", containsString("no-store")));
    }

    @Test
    void employeeSeesOnlyTheirOwnDocumentsIdentifiedByToken() throws Exception {
        when(documentService.listMine(110L)).thenReturn(List.of(sample(7L)));
        when(documentService.downloadMine(110L, 7L))
                .thenReturn(new DocumentService.DownloadedDocument("sept.pdf", "application/pdf", PDF));
        when(documentService.downloadMine(110L, 8L)).thenThrow(ApiException.notFound("Document not found."));

        mockMvc.perform(get("/api/employee/documents").header(AUTH, bearer(employeeToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(7));
        mockMvc.perform(get("/api/employee/documents/7/file").header(AUTH, bearer(employeeToken)))
                .andExpect(status().isOk())
                .andExpect(content().bytes(PDF));
        mockMvc.perform(get("/api/employee/documents/8/file").header(AUTH, bearer(employeeToken)))
                .andExpect(status().isNotFound());

        verify(documentService).listMine(110L);
        verify(documentService, never()).downloadForHr(anyLong());
    }

    @Test
    void employeeEndpointsRefuseHrTemporaryPasswordAndMissingTokens() throws Exception {
        mockMvc.perform(get("/api/employee/documents")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/employee/documents").header(AUTH, bearer(hrToken))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/employee/documents").header(AUTH, bearer(temporaryPasswordToken))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/employee/documents/7/file").header(AUTH, bearer(temporaryPasswordToken))).andExpect(status().isForbidden());
        verify(documentService, never()).listMine(anyLong());
        verify(documentService, never()).downloadMine(anyLong(), anyLong());
    }

    @Test
    void theAndroidAppCanReadTheFileNameOfItsOwnDownload() throws Exception {
        when(documentService.downloadMine(110L, 7L))
                .thenReturn(new DocumentService.DownloadedDocument("Offer letter.png", "image/png", DocumentFileRulesTest.PNG));

        // The app (origin https://localhost) is cross-origin to the API, so the header must be exposed.
        mockMvc.perform(get("/api/employee/documents/7/file").header(AUTH, bearer(employeeToken))
                        .header("Origin", "https://localhost"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://localhost"))
                .andExpect(header().string("Access-Control-Expose-Headers", containsString("Content-Disposition")))
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("Content-Disposition", containsString("Offer letter.png")));
    }

    @Test
    void anUnknownWebsiteGetsNoCorsAccessToDocuments() throws Exception {
        mockMvc.perform(get("/api/employee/documents/7/file").header(AUTH, bearer(employeeToken))
                        .header("Origin", "https://evil.example"))
                .andExpect(status().isForbidden());
        verify(documentService, never()).downloadMine(anyLong(), anyLong());
    }
}
