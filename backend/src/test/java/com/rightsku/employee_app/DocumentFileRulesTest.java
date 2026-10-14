package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import org.junit.jupiter.api.Test;

/** Unit tests for upload checks: plain Java, no Spring. */
class DocumentFileRulesTest {

    static final byte[] PDF = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n".getBytes(StandardCharsets.US_ASCII);
    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13};
    static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16};
    private static final long LIMIT = DocumentFileRules.DEFAULT_MAX_BYTES;

    @Test
    void acceptsPdfPngAndJpegByTheirContent() {
        assertThat(DocumentFileRules.check("payslip.pdf", PDF, LIMIT).contentType()).isEqualTo("application/pdf");
        assertThat(DocumentFileRules.check("scan.png", PNG, LIMIT).contentType()).isEqualTo("image/png");
        assertThat(DocumentFileRules.check("photo.jpeg", JPEG, LIMIT).contentType()).isEqualTo("image/jpeg");
    }

    @Test
    void refusesOtherContentEvenWithAPdfName() {
        byte[] html = "<html><script>alert(1)</script></html>".getBytes(StandardCharsets.UTF_8);
        byte[] exe = {'M', 'Z', (byte) 0x90, 0};
        byte[] zip = {'P', 'K', 3, 4};
        for (byte[] bad : new byte[][] {html, exe, zip}) {
            assertThatThrownBy(() -> DocumentFileRules.check("payslip.pdf", bad, LIMIT))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("PDF, PNG or JPG");
        }
    }

    @Test
    void refusesEmptyAndOversizedFiles() {
        assertThatThrownBy(() -> DocumentFileRules.check("a.pdf", new byte[0], LIMIT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DocumentFileRules.check("a.pdf", null, LIMIT))
                .isInstanceOf(IllegalArgumentException.class);

        byte[] big = Arrays.copyOf(PDF, 2048);
        assertThatThrownBy(() -> DocumentFileRules.check("a.pdf", big, 1024))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("larger than");
        assertThat(DocumentFileRules.check("a.pdf", big, 2048).bytes()).hasSize(2048);
    }

    @Test
    void fileNameLosesFoldersAndSpecialCharactersAndGetsTheRealExtension() {
        assertThat(DocumentFileRules.safeFileName("../../etc/passwd", "application/pdf")).isEqualTo("passwd.pdf");
        assertThat(DocumentFileRules.safeFileName("C:\\Users\\hr\\Sept payslip.PDF", "application/pdf"))
                .isEqualTo("Sept payslip.pdf");
        assertThat(DocumentFileRules.safeFileName("payslip.exe", "application/pdf")).isEqualTo("payslip.pdf");
        assertThat(DocumentFileRules.safeFileName("bad\"name<>|?*;\n.pdf", "application/pdf")).isEqualTo("badname.pdf");
        assertThat(DocumentFileRules.safeFileName(".hidden", "image/png")).isEqualTo("document.png");
        assertThat(DocumentFileRules.safeFileName(null, "image/jpeg")).isEqualTo("document.jpg");
        assertThat(DocumentFileRules.safeFileName("x".repeat(300) + ".pdf", "application/pdf"))
                .hasSize(DocumentFileRules.MAX_FILE_NAME_LENGTH + 4);
    }

    @Test
    void recordsAChecksum() {
        String sum = DocumentFileRules.check("a.pdf", PDF, LIMIT).sha256();
        assertThat(sum).hasSize(64).matches("[0-9a-f]{64}");
        assertThat(DocumentFileRules.check("b.pdf", PDF, LIMIT).sha256()).isEqualTo(sum);
    }
}
