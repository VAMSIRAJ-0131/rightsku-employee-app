package com.rightsku.employee_app;

import java.time.LocalDate;
import java.util.List;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The company holiday calendar, managed by HR. Holidays apply to every
 * employee: no timesheet can be submitted for a holiday. Timesheets already
 * submitted for a date before it became a holiday are kept unchanged.
 */
@Service
public class HolidayService {

    private final CompanyHolidayRepository holidays;
    private final AuditEntryRepository audit;

    public HolidayService(CompanyHolidayRepository holidays, AuditEntryRepository audit) {
        this.holidays = holidays;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<HolidayResponse> list(int year) {
        if (year < 2000 || year > 2100) {
            throw ApiException.invalid("year", "Choose a year between 2000 and 2100.");
        }
        return holidays.findByHolidayDateBetweenOrderByHolidayDateAsc(
                        LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31)).stream()
                .map(HolidayResponse::from)
                .toList();
    }

    @Transactional
    public HolidayResponse create(HolidayRequest request, Long actorUserId) {
        LocalDate date = checkDate(request.date());
        String name = cleanName(request.name());
        holidays.findByHolidayDate(date).ifPresent(existing -> {
            throw ApiException.conflict("date", "There is already a holiday on this date: " + existing.getName() + ".");
        });
        CompanyHoliday holiday = CompanyHoliday.create(date, name, actorUserId);
        save(holiday);
        record(actorUserId, "HOLIDAY_ADDED", holiday);
        return HolidayResponse.from(holiday);
    }

    @Transactional
    public HolidayResponse update(long id, HolidayRequest request, Long actorUserId) {
        CompanyHoliday holiday = find(id);
        LocalDate date = checkDate(request.date());
        String name = cleanName(request.name());
        holidays.findByHolidayDate(date)
                .filter(other -> !other.getId().equals(holiday.getId()))
                .ifPresent(other -> {
                    throw ApiException.conflict("date", "There is already a holiday on this date: " + other.getName() + ".");
                });
        holiday.change(date, name, actorUserId);
        save(holiday);
        record(actorUserId, "HOLIDAY_CHANGED", holiday);
        return HolidayResponse.from(holiday);
    }

    /** Removes a holiday added by mistake; that date becomes a normal day again. */
    @Transactional
    public void delete(long id, Long actorUserId) {
        CompanyHoliday holiday = find(id);
        holidays.delete(holiday);
        record(actorUserId, "HOLIDAY_REMOVED", holiday);
    }

    private CompanyHoliday find(long id) {
        return holidays.findById(id).orElseThrow(() -> ApiException.notFound("Holiday not found."));
    }

    private void save(CompanyHoliday holiday) {
        try {
            holidays.saveAndFlush(holiday);
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict("date", "There is already a holiday on this date.");
        }
    }

    private static LocalDate checkDate(LocalDate date) {
        if (date == null || date.getYear() < 2000 || date.getYear() > 2100) {
            throw ApiException.invalid("date", "Choose a valid date.");
        }
        return date;
    }

    private static String cleanName(String name) {
        String value = name == null ? "" : name.replaceAll("\\p{Cntrl}", " ").strip();
        if (value.isEmpty()) {
            throw ApiException.invalid("name", "Enter the holiday name.");
        }
        if (value.length() > 100) {
            throw ApiException.invalid("name", "Holiday name must be at most 100 characters.");
        }
        return value;
    }

    private void record(Long actorUserId, String action, CompanyHoliday holiday) {
        audit.save(AuditEntry.of(actorUserId, action, "HOLIDAY", holiday.getDate().toString()));
    }
}
