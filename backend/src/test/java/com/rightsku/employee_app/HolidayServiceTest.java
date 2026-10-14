package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/** The HR holiday calendar. Repositories are mocked: no database. */
class HolidayServiceTest {

    private static final Long HR = 1L;

    private CompanyHolidayRepository holidays;
    private AuditEntryRepository audit;
    private HolidayService service;

    @BeforeEach
    void setUp() {
        holidays = mock(CompanyHolidayRepository.class);
        audit = mock(AuditEntryRepository.class);
        service = new HolidayService(holidays, audit);
    }

    private CompanyHoliday existing(long id, String date, String name) {
        CompanyHoliday h = CompanyHoliday.create(LocalDate.parse(date), name, HR);
        ReflectionTestUtils.setField(h, "id", id);
        when(holidays.findById(id)).thenReturn(Optional.of(h));
        when(holidays.findByHolidayDate(LocalDate.parse(date))).thenReturn(Optional.of(h));
        return h;
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    @Test
    void hrAddsAHoliday() {
        HolidayResponse response = service.create(new HolidayRequest(LocalDate.parse("2026-10-02"), " Gandhi Jayanti "), HR);

        assertThat(response.name()).isEqualTo("Gandhi Jayanti");
        assertThat(response.weekday()).isEqualTo("FRIDAY");
        verify(holidays).saveAndFlush(any(CompanyHoliday.class));
        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("HOLIDAY_ADDED");
    }

    @Test
    void secondHolidayOnTheSameDateIsRefused() {
        existing(5L, "2026-10-02", "Gandhi Jayanti");

        assertApiError(catchThrowable(() -> service.create(new HolidayRequest(LocalDate.parse("2026-10-02"), "Other"), HR)),
                HttpStatus.CONFLICT, "date");
        verify(holidays, never()).saveAndFlush(any());
    }

    @Test
    void hrRenamesOrMovesAHolidayButNotOntoAnother() {
        existing(5L, "2026-10-02", "Gandhi Jayanti");
        existing(6L, "2026-10-20", "Dussehra");

        HolidayResponse renamed = service.update(5L, new HolidayRequest(LocalDate.parse("2026-10-02"), "Gandhi Jayanti (Fri)"), HR);
        assertThat(renamed.name()).isEqualTo("Gandhi Jayanti (Fri)");

        HolidayResponse moved = service.update(6L, new HolidayRequest(LocalDate.parse("2026-10-21"), "Dussehra"), HR);
        assertThat(moved.date()).isEqualTo(LocalDate.parse("2026-10-21"));

        assertApiError(catchThrowable(() -> service.update(6L, new HolidayRequest(LocalDate.parse("2026-10-02"), "Dussehra"), HR)),
                HttpStatus.CONFLICT, "date");
        assertApiError(catchThrowable(() -> service.update(99L, new HolidayRequest(LocalDate.parse("2026-10-02"), "X"), HR)),
                HttpStatus.NOT_FOUND, null);
    }

    @Test
    void hrRemovesAHolidayAddedByMistake() {
        CompanyHoliday h = existing(5L, "2026-10-02", "Gandhi Jayanti");

        service.delete(5L, HR);

        verify(holidays).delete(h);
        ArgumentCaptor<AuditEntry> entry = ArgumentCaptor.forClass(AuditEntry.class);
        verify(audit).save(entry.capture());
        assertThat(entry.getValue().getAction()).isEqualTo("HOLIDAY_REMOVED");
    }

    @Test
    void invalidInputIsRefused() {
        assertApiError(catchThrowable(() -> service.create(new HolidayRequest(LocalDate.parse("2026-10-02"), "  "), HR)),
                HttpStatus.BAD_REQUEST, "name");
        assertApiError(catchThrowable(() -> service.create(new HolidayRequest(null, "Diwali"), HR)),
                HttpStatus.BAD_REQUEST, "date");
        assertApiError(catchThrowable(() -> service.list(1999)), HttpStatus.BAD_REQUEST, "year");
    }

    @Test
    void listsOneYear() {
        when(holidays.findByHolidayDateBetweenOrderByHolidayDateAsc(LocalDate.parse("2026-01-01"), LocalDate.parse("2026-12-31")))
                .thenReturn(List.of(CompanyHoliday.create(LocalDate.parse("2026-01-26"), "Republic Day", HR)));

        assertThat(service.list(2026)).extracting(HolidayResponse::name).containsExactly("Republic Day");
    }
}
