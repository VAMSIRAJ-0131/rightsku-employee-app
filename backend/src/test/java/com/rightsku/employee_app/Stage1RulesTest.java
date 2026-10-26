package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** Stage 1 rules that need no database: personal detail checks and safe CSV cells. */
class Stage1RulesTest {

    @Test
    void personalDetailsAreCleanedAndChecked() {
        assertThat(ProfileField.PHONE.clean("  +91 98765 43210 ")).isEqualTo("+91 98765 43210");
        assertThat(ProfileField.PHONE.clean("")).isNull();
        assertThatThrownBy(() -> ProfileField.PHONE.clean("12345")).isInstanceOf(ApiException.class)
                .hasMessageContaining("10 to 15 digits");
        assertThatThrownBy(() -> ProfileField.EMERGENCY_CONTACT_PHONE.clean("call me")).isInstanceOf(ApiException.class);

        assertThat(ProfileField.BANK_ACCOUNT_NUMBER.clean("1234 5678-9012")).isEqualTo("123456789012");
        assertThatThrownBy(() -> ProfileField.BANK_ACCOUNT_NUMBER.clean("12AB")).isInstanceOf(ApiException.class)
                .hasMessageContaining("9 to 18 digits");

        assertThat(ProfileField.BANK_IFSC.clean("sbin 0001234")).isEqualTo("SBIN0001234");
        assertThatThrownBy(() -> ProfileField.BANK_IFSC.clean("SBIN1234")).isInstanceOf(ApiException.class)
                .hasMessageContaining("IFSC");

        assertThat(ProfileField.ADDRESS.clean("12, MG Road\n  Hyderabad")).isEqualTo("12, MG Road Hyderabad");
        assertThatThrownBy(() -> ProfileField.ADDRESS.clean("x".repeat(301))).isInstanceOf(ApiException.class)
                .hasMessageContaining("at most 300");
    }

    @Test
    void onlyKnownFieldsAndTheAccountNumberIsMasked() {
        assertThat(ProfileField.byKey("bankIfsc")).contains(ProfileField.BANK_IFSC);
        assertThat(ProfileField.byKey("salary")).isEmpty();
        assertThat(ProfileField.BANK_ACCOUNT_NUMBER.sensitive()).isTrue();
        assertThat(ProfileField.PHONE.sensitive()).isFalse();
        assertThat(ProfileField.mask("123456789012")).isEqualTo("•••• 9012");
        assertThat(ProfileField.mask(null)).isNull();
    }

    @Test
    void csvCellsAreQuotedAndNeverRunAsFormulas() {
        assertThat(ExportService.cell(null)).isEmpty();
        assertThat(ExportService.cell("Casual")).isEqualTo("Casual");
        assertThat(ExportService.cell("Hyderabad, Telangana")).isEqualTo("\"Hyderabad, Telangana\"");
        assertThat(ExportService.cell("He said \"ok\"")).isEqualTo("\"He said \"\"ok\"\"\"");
        assertThat(ExportService.cell("=HYPERLINK(\"x\")")).startsWith("\"'=HYPERLINK");
        assertThat(ExportService.cell("+1")).isEqualTo("'+1");
        assertThat(ExportService.cell("@sum")).isEqualTo("'@sum");
        StringBuilder csv = new StringBuilder();
        ExportService.row(csv, "a", "b,c");
        assertThat(csv.toString()).isEqualTo("a,\"b,c\"\r\n");
    }

    @Test
    void exportKindsAndMonthsAreChecked() {
        assertThat(ExportService.parseKind("comp-off")).isEqualTo(ExportService.Kind.COMP_OFF);
        assertThat(ExportService.parseKind("Leave")).isEqualTo(ExportService.Kind.LEAVE);
        assertThatThrownBy(() -> ExportService.parseKind("salaries")).isInstanceOf(ApiException.class);
        assertThat(ExportService.parseMonth("2026-10").getMonthValue()).isEqualTo(10);
        assertThatThrownBy(() -> ExportService.parseMonth("Oct 2026")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> ExportService.parseMonth(null)).isInstanceOf(ApiException.class);
    }
}
