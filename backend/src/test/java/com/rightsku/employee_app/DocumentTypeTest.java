package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** Unit tests for document types and their periods. */
class DocumentTypeTest {

    @Test
    void parsesTypeNamesIgnoringCase() {
        assertThat(DocumentType.parse("payslip")).contains(DocumentType.PAYSLIP);
        assertThat(DocumentType.parse(" FORM_16 ")).contains(DocumentType.FORM_16);
        assertThat(DocumentType.parse("salary")).isEmpty();
        assertThat(DocumentType.parse(null)).isEmpty();
    }

    @Test
    void payslipNeedsAMonth() {
        assertThat(DocumentType.PAYSLIP.normalizePeriod(" 2026-09 ")).isEqualTo("2026-09");
        for (String bad : new String[] {null, "", "2026-13", "2026-00", "09-2026", "2026-9", "1999-01"}) {
            assertThatThrownBy(() -> DocumentType.PAYSLIP.normalizePeriod(bad)).as(String.valueOf(bad))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void form16NeedsAFinancialYear() {
        assertThat(DocumentType.FORM_16.normalizePeriod("2025-26")).isEqualTo("2025-26");
        assertThat(DocumentType.FORM_16.normalizePeriod("2099-00")).isEqualTo("2099-00");
        for (String bad : new String[] {null, "2025", "2025-27", "2025-2026", "25-26"}) {
            assertThatThrownBy(() -> DocumentType.FORM_16.normalizePeriod(bad)).as(String.valueOf(bad))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void lettersHaveNoPeriod() {
        assertThat(DocumentType.OFFER_LETTER.normalizePeriod(null)).isNull();
        assertThat(DocumentType.EXPERIENCE_LETTER.normalizePeriod("  ")).isNull();
        assertThatThrownBy(() -> DocumentType.OFFER_LETTER.normalizePeriod("2026-09"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void defaultTitlesAreReadable() {
        assertThat(DocumentType.PAYSLIP.defaultTitle("2026-09")).isEqualTo("Payslip - September 2026");
        assertThat(DocumentType.FORM_16.defaultTitle("2025-26")).isEqualTo("Form 16 - FY 2025-26");
        assertThat(DocumentType.OFFER_LETTER.defaultTitle(null)).isEqualTo("Offer letter");
    }
}
