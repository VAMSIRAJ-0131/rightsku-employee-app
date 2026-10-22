package com.rightsku.employee_app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Weekly timesheets: Save (draft), Submit for approval, the weekly target
 * (schedule, holidays, approved leave), the daily 1-9 hour rule, and the
 * older one-day submit that is kept for app versions installed earlier.
 * The real WorkCalendarService is used; the repositories are mocks backed
 * by in-memory lists, so a saved draft can be opened again. No database.
 * "Today" is Wednesday 14 October 2026 in India.
 */
class TimesheetServiceTest {

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final Clock CLOCK = Clock.fixed(
            LocalDate.parse("2026-10-14").atTime(10, 0).atZone(INDIA).toInstant(), INDIA);
    private static final BigDecimal NINE = new BigDecimal("9");
    private static final BigDecimal EIGHT = new BigDecimal("8");
    private static final String WORK = "Built the payslip screen";

    /** Monday 5 Oct 2026: a finished week with no holidays. */
    private static final String OCT_5 = "2026-10-05";
    /** Monday 28 Sep 2026: Friday 2 Oct is a holiday, Saturday 3 Oct a holiday on the weekly off. */
    private static final String SEP_28 = "2026-09-28";
    /** Monday 12 Oct 2026: this week (today is Wednesday). */
    private static final String OCT_12 = "2026-10-12";

    private TimesheetEntryRepository entries;
    private TimesheetWeekRepository weeks;
    private EmployeeRepository employees;
    private WorkScheduleRepository schedules;
    private CompanyHolidayRepository holidays;
    private TimesheetService service;
    private final List<CompanyHoliday> holidayRows = new ArrayList<>();
    private final List<TimesheetEntry> savedEntries = new ArrayList<>();
    private final Map<String, TimesheetWeek> savedWeeks = new HashMap<>();
    private final List<LeaveDays.LeaveDay> leave = new ArrayList<>();

    @BeforeEach
    void setUp() {
        entries = mock(TimesheetEntryRepository.class);
        weeks = mock(TimesheetWeekRepository.class);
        employees = mock(EmployeeRepository.class);
        schedules = mock(WorkScheduleRepository.class);
        holidays = mock(CompanyHolidayRepository.class);
        WorkCalendarService calendarService = new WorkCalendarService(schedules, holidays, "SATURDAY,SUNDAY", NINE);
        LeaveDays leaveDays = (employeeId, from, to) -> leave.stream()
                .filter(l -> !l.date().isBefore(from) && !l.date().isAfter(to)).toList();
        service = new TimesheetService(entries, weeks, employees, calendarService, leaveDays, CLOCK);

        employee(10L, 110L, "EMP010", null);  // Ravi: company default (Sat + Sun off, 9 h)
        employee(20L, 120L, "EMP020", null);  // Priya: Friday + Saturday off, 8 h (set below)

        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(20L)).thenReturn(List.of(
                WorkSchedule.create(20L, d("2026-01-01"), EnumSet.of(DayOfWeek.FRIDAY, DayOfWeek.SATURDAY), EIGHT, 1L)));

        // Holidays: looked up by date range, like the real query.
        when(holidays.findByHolidayDateBetweenOrderByHolidayDateAsc(any(), any())).thenAnswer(call -> {
            LocalDate from = call.getArgument(0);
            LocalDate to = call.getArgument(1);
            return holidayRows.stream().filter(h -> !h.getDate().isBefore(from) && !h.getDate().isAfter(to)).toList();
        });
        holidayRows.add(CompanyHoliday.create(d("2026-10-02"), "Gandhi Jayanti", 1L));       // Friday
        holidayRows.add(CompanyHoliday.create(d("2026-10-03"), "Test weekend holiday", 1L)); // Saturday

        // Timesheet entries, kept in memory.
        when(entries.saveAndFlush(any(TimesheetEntry.class))).thenAnswer(call -> {
            TimesheetEntry e = call.getArgument(0);
            ReflectionTestUtils.setField(e, "id", 900L + savedEntries.size());
            savedEntries.add(e);
            return e;
        });
        when(entries.findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(anyLong(), any(), any())).thenAnswer(call -> {
            long employeeId = call.getArgument(0);
            LocalDate from = call.getArgument(1);
            LocalDate to = call.getArgument(2);
            // Newest date first, like the real query.
            return savedEntries.stream().filter(e -> e.getEmployeeId() == employeeId
                    && !e.getWorkDate().isBefore(from) && !e.getWorkDate().isAfter(to))
                    .sorted(Comparator.comparing(TimesheetEntry::getWorkDate).reversed()).toList();
        });

        // Weeks, kept in memory (the "for update" lookup returns the same row).
        when(weeks.saveAndFlush(any(TimesheetWeek.class))).thenAnswer(call -> {
            TimesheetWeek w = call.getArgument(0);
            savedWeeks.put(w.getEmployeeId() + "/" + w.getWeekStart(), w);
            return w;
        });
        when(weeks.findByEmployeeIdAndWeekStart(anyLong(), any())).thenAnswer(call ->
                Optional.ofNullable(savedWeeks.get(call.getArgument(0) + "/" + call.getArgument(1))));
        when(weeks.findForUpdateByEmployeeIdAndWeekStart(anyLong(), any())).thenAnswer(call ->
                Optional.ofNullable(savedWeeks.get(call.getArgument(0) + "/" + call.getArgument(1))));
    }

    /* ---------- Helpers ---------- */

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    private Employee employee(long id, long userId, String code, LocalDate joiningDate) {
        AppUser account = AppUser.create(code, code.toLowerCase() + "@rightsku.com", "hash", AppUser.ROLE_EMPLOYEE);
        ReflectionTestUtils.setField(account, "id", userId);
        Employee e = Employee.create(account, code,
                new Employee.EmployeeDetails("Test", code, null, null, null, joiningDate));
        ReflectionTestUtils.setField(e, "id", id);
        when(employees.findByUser_Id(userId)).thenReturn(Optional.of(e));
        return e;
    }

    /** A week request: "2026-10-05", WORK, "2026-10-05=9", "2026-10-06=" (empty) ... */
    private static WeekTimesheetRequest week(String monday, String description, String... days) {
        List<WeekTimesheetRequest.DayHours> list = new ArrayList<>();
        for (String day : days) {
            String[] parts = day.split("=", -1);
            list.add(new WeekTimesheetRequest.DayHours(d(parts[0]), parts[1].isEmpty() ? null : new BigDecimal(parts[1])));
        }
        return new WeekTimesheetRequest(d(monday), description, list);
    }

    /** Monday to Friday of the week starting on monday, each with these hours. */
    private static String[] weekdays(String monday, String... hours) {
        String[] result = new String[hours.length];
        for (int i = 0; i < hours.length; i++) {
            result[i] = d(monday).plusDays(i) + "=" + hours[i];
        }
        return result;
    }

    private void approvedLeave(String date, LeaveDays.Portion portion) {
        leave.add(new LeaveDays.LeaveDay(d(date), portion, LeaveDays.Status.APPROVED));
    }

    private static WeekTimesheetResponse.Day dayOf(WeekTimesheetResponse week, String date) {
        return week.days().stream().filter(x -> x.date().equals(d(date))).findFirst().orElseThrow();
    }

    private static void assertApiError(Throwable thrown, HttpStatus status, String field) {
        assertThat(thrown).isInstanceOf(ApiException.class);
        assertThat(((ApiException) thrown).getStatus()).isEqualTo(status);
        assertThat(((ApiException) thrown).getField()).isEqualTo(field);
    }

    /* ---------- Weekly target ---------- */

    @Test
    void normalWeekIsFortyFiveHours() {
        WeekTimesheetResponse week = service.weekMine(110L, d(OCT_5));

        assertThat(week.status()).isEqualTo("NOT_STARTED");
        assertThat(week.target().scheduledHours()).isEqualByComparingTo("45");
        assertThat(week.target().expectedHours()).isEqualByComparingTo("45");
        assertThat(week.target().enteredHours()).isEqualByComparingTo("0");
        assertThat(week.target().remainingHours()).isEqualByComparingTo("45");
        assertThat(week.days()).extracting(WeekTimesheetResponse.Day::editable)
                .containsExactly(true, true, true, true, true, false, false);
        assertThat(week.canSubmit()).isFalse();
        assertThat(week.submitBlockedReason()).isEqualTo("Enter 45 more hours to reach this week's 45 hours.");
    }

    @Test
    void targetFollowsTheEmployeesOwnSchedule() {
        // Priya: 8 h a day, Friday and Saturday off, so Mon-Thu + Sunday = 40 h.
        WeekTimesheetResponse week = service.weekMine(120L, d(OCT_5));

        assertThat(week.target().expectedHours()).isEqualByComparingTo("40");
        assertThat(dayOf(week, "2026-10-09").editable()).as("Friday off").isFalse();
        assertThat(dayOf(week, "2026-10-11").editable()).as("Sunday works").isTrue();
    }

    @Test
    void holidayOnAWorkingDayLowersTheTarget() {
        WeekTimesheetResponse week = service.weekMine(110L, d(SEP_28));

        assertThat(week.target().scheduledHours()).isEqualByComparingTo("45");
        assertThat(week.target().holidayHours()).isEqualByComparingTo("9");
        assertThat(week.target().expectedHours()).isEqualByComparingTo("36");
        WeekTimesheetResponse.Day friday = dayOf(week, "2026-10-02");
        assertThat(friday.kind()).isEqualTo("HOLIDAY");
        assertThat(friday.holidayName()).isEqualTo("Gandhi Jayanti");
        assertThat(friday.editable()).isFalse();
    }

    @Test
    void holidayOnAWeeklyOffDoesNotLowerTheTargetAgain() {
        // Saturday 3 Oct is a holiday on Ravi's weekly off: still 36 h, not 27 h.
        WeekTimesheetResponse week = service.weekMine(110L, d(SEP_28));

        assertThat(week.target().expectedHours()).isEqualByComparingTo("36");
        WeekTimesheetResponse.Day saturday = dayOf(week, "2026-10-03");
        assertThat(saturday.weeklyOff()).isTrue();
        assertThat(saturday.scheduledHours()).isEqualByComparingTo("0");
        assertThat(saturday.editable()).isFalse();
    }

    @Test
    void fullDayOfApprovedLeaveLowersTheTargetByThatDay() {
        approvedLeave("2026-10-07", LeaveDays.Portion.FULL_DAY);

        WeekTimesheetResponse week = service.weekMine(110L, d(OCT_5));

        assertThat(week.target().leaveHours()).isEqualByComparingTo("9");
        assertThat(week.target().expectedHours()).isEqualByComparingTo("36");
        assertThat(week.target().enteredHours()).as("leave is never added to hours worked").isEqualByComparingTo("0");
        WeekTimesheetResponse.Day wednesday = dayOf(week, "2026-10-07");
        assertThat(wednesday.leave()).isEqualTo("FULL_DAY");
        assertThat(wednesday.editable()).isFalse();
    }

    @Test
    void halfDayOfApprovedLeaveLowersTheTargetByHalf() {
        approvedLeave("2026-10-07", LeaveDays.Portion.HALF_DAY);

        WeekTimesheetResponse week = service.weekMine(110L, d(OCT_5));

        assertThat(week.target().leaveHours()).isEqualByComparingTo("4.5");
        assertThat(week.target().expectedHours()).isEqualByComparingTo("40.5");
        WeekTimesheetResponse.Day wednesday = dayOf(week, "2026-10-07");
        assertThat(wednesday.leave()).isEqualTo("HALF_DAY");
        assertThat(wednesday.targetHours()).isEqualByComparingTo("4.5");
        assertThat(wednesday.editable()).as("the other half is worked").isTrue();
    }

    @Test
    void pendingOrRejectedLeaveDoesNotLowerTheTarget() {
        leave.add(new LeaveDays.LeaveDay(d("2026-10-06"), LeaveDays.Portion.FULL_DAY, LeaveDays.Status.PENDING));
        leave.add(new LeaveDays.LeaveDay(d("2026-10-07"), LeaveDays.Portion.HALF_DAY, LeaveDays.Status.REJECTED));

        WeekTimesheetResponse week = service.weekMine(110L, d(OCT_5));

        assertThat(week.target().leaveHours()).isEqualByComparingTo("0");
        assertThat(week.target().expectedHours()).isEqualByComparingTo("45");
        assertThat(dayOf(week, "2026-10-06").leave()).isNull();
        assertThat(dayOf(week, "2026-10-06").editable()).isTrue();
    }

    @Test
    void daysBeforeTheJoiningDateDoNotCount() {
        employee(30L, 130L, "EMP030", d("2026-10-07"));  // joined on Wednesday

        WeekTimesheetResponse week = service.weekMine(130L, d(OCT_5));

        assertThat(week.target().expectedHours()).isEqualByComparingTo("27");
        assertThat(dayOf(week, "2026-10-06").beforeJoining()).isTrue();
        assertThat(dayOf(week, "2026-10-06").editable()).isFalse();
    }

    /* ---------- Save (draft) ---------- */

    @Test
    void savedDraftOpensAgainAndIsNotSentForApproval() {
        WeekTimesheetResponse saved = service.saveDraft(110L,
                week(OCT_5, " First half of the week ", "2026-10-05=9", "2026-10-06=8.5", "2026-10-07=9", "2026-10-08="));

        assertThat(saved.status()).isEqualTo("DRAFT");
        verify(entries, never()).saveAndFlush(any());

        // Leave the screen and come back: the draft is still there.
        WeekTimesheetResponse reopened = service.weekMine(110L, d(OCT_5));
        assertThat(reopened.status()).isEqualTo("DRAFT");
        assertThat(reopened.description()).isEqualTo("First half of the week");
        assertThat(dayOf(reopened, "2026-10-06").hours()).isEqualByComparingTo("8.5");
        assertThat(dayOf(reopened, "2026-10-08").hours()).isNull();
        assertThat(dayOf(reopened, "2026-10-06").entryStatus()).as("not submitted").isNull();
        assertThat(reopened.target().enteredHours()).isEqualByComparingTo("26.5");
        assertThat(reopened.target().remainingHours()).isEqualByComparingTo("18.5");
        assertThat(reopened.days()).allSatisfy(day -> assertThat(day.entryStatus()).isNull());
    }

    @Test
    void draftStaysEditable() {
        service.saveDraft(110L, week(OCT_5, null, "2026-10-05=9", "2026-10-06=9"));
        WeekTimesheetResponse changed = service.saveDraft(110L, week(OCT_5, "Changed", "2026-10-05=7", "2026-10-07=9"));

        assertThat(dayOf(changed, "2026-10-05").hours()).isEqualByComparingTo("7");
        assertThat(dayOf(changed, "2026-10-06").hours()).as("cleared").isNull();
        assertThat(dayOf(changed, "2026-10-07").hours()).isEqualByComparingTo("9");
        assertThat(changed.target().enteredHours()).isEqualByComparingTo("16");
        assertThat(savedWeeks).hasSize(1);
    }

    @Test
    void thisWeekCanBeSavedIncludingDaysStillToCome() {
        // Today is Wednesday 14 Oct; Thursday and Friday can already go in the draft.
        WeekTimesheetResponse saved = service.saveDraft(110L, week(OCT_12, null, weekdays(OCT_12, "9", "9", "9", "9", "9")));

        assertThat(saved.target().enteredHours()).isEqualByComparingTo("45");
        assertThat(saved.submitOpensOn()).isEqualTo(d("2026-10-16"));
        assertThat(saved.canSubmit()).isFalse();
        assertThat(saved.submitBlockedReason()).isEqualTo("You can submit this week from Fri 16 Oct 2026, its last working day.");
    }

    /* ---------- Submit for approval ---------- */

    @Test
    void submittingAFullWeekSendsEveryDayForApproval() {
        service.saveDraft(110L, week(OCT_5, null, "2026-10-05=9"));

        WeekTimesheetResponse submitted = service.submitWeek(110L, week(OCT_5, " " + WORK + " ",
                weekdays(OCT_5, "9", "9", "9", "9", "9")));

        assertThat(submitted.status()).isEqualTo("SUBMITTED");
        assertThat(submitted.submittedAt()).isNotNull();
        assertThat(submitted.canSubmit()).isFalse();
        assertThat(submitted.target().enteredHours()).isEqualByComparingTo("45");
        assertThat(submitted.target().remainingHours()).isEqualByComparingTo("0");
        assertThat(savedEntries).hasSize(5);
        assertThat(savedEntries).allSatisfy(e -> {
            assertThat(e.getEmployeeId()).as("always the signed-in employee").isEqualTo(10L);
            assertThat(e.getStatus()).isEqualTo("PENDING");
            assertThat(e.getDescription()).isEqualTo(WORK);
        });
        assertThat(submitted.days()).filteredOn(WeekTimesheetResponse.Day::editable).isEmpty();
        assertThat(dayOf(submitted, "2026-10-05").entryStatus()).isEqualTo("PENDING");
        assertThat(savedWeeks.get("10/" + OCT_5).getDraftHours()).as("draft cleared").isEmpty();
    }

    @Test
    void aSubmittedWeekCantBeSubmittedTwiceOrOverwrittenBySave() {
        service.submitWeek(110L, week(OCT_5, WORK, weekdays(OCT_5, "9", "9", "9", "9", "9")));

        Throwable again = catchThrowable(() ->
                service.submitWeek(110L, week(OCT_5, WORK, weekdays(OCT_5, "9", "9", "9", "9", "9"))));
        assertApiError(again, HttpStatus.CONFLICT, null);
        assertThat(again).hasMessage("This week has already been submitted.");

        Throwable save = catchThrowable(() -> service.saveDraft(110L, week(OCT_5, null, "2026-10-05=1")));
        assertApiError(save, HttpStatus.CONFLICT, null);
        assertThat(save).hasMessage("This week has already been submitted, so it can't be saved as a draft.");

        assertThat(savedEntries).hasSize(5);
        assertThat(savedEntries).allSatisfy(e -> assertThat(e.getHours()).isEqualByComparingTo("9"));
    }

    @Test
    void aSecondSubmitAtTheSameTimeIsRefused() {
        // The database refuses a second entry for the same day (two taps at once).
        doThrow(new DataIntegrityViolationException("dup")).when(entries).saveAndFlush(any(TimesheetEntry.class));

        Throwable thrown = catchThrowable(() ->
                service.submitWeek(110L, week(OCT_5, WORK, weekdays(OCT_5, "9", "9", "9", "9", "9"))));

        assertApiError(thrown, HttpStatus.CONFLICT, null);
        assertThat(thrown).hasMessage("This week has already been submitted.");
    }

    @Test
    void notEnoughHoursBlocksSubmitting() {
        Throwable thrown = catchThrowable(() ->
                service.submitWeek(110L, week(OCT_5, WORK, weekdays(OCT_5, "9", "9", "9", "9", ""))));

        assertApiError(thrown, HttpStatus.BAD_REQUEST, "target");
        assertThat(thrown).hasMessage("Enter 9 more hours to reach this week's 45 hours.");
        verify(entries, never()).saveAndFlush(any());
        verify(weeks, never()).saveAndFlush(any());
    }

    @Test
    void aWeekWithAHolidayIsCheckedAgainstTheLowerTarget() {
        // Mon-Thu 9 h each; Friday is a holiday: 36 h is enough.
        WeekTimesheetResponse submitted = service.submitWeek(110L,
                week(SEP_28, WORK, weekdays(SEP_28, "9", "9", "9", "9")));

        assertThat(submitted.status()).isEqualTo("SUBMITTED");
        assertThat(savedEntries).hasSize(4);
    }

    @Test
    void aWeekWithHalfADayOfLeaveIsCheckedAgainstTheLowerTarget() {
        approvedLeave("2026-10-09", LeaveDays.Portion.HALF_DAY);

        Throwable short1 = catchThrowable(() ->
                service.submitWeek(110L, week(OCT_5, WORK, weekdays(OCT_5, "9", "9", "9", "9", "4.25"))));
        assertApiError(short1, HttpStatus.BAD_REQUEST, "target");
        assertThat(short1).hasMessage("Enter 0.25 more hours to reach this week's 40.5 hours.");

        WeekTimesheetResponse submitted = service.submitWeek(110L,
                week(OCT_5, WORK, weekdays(OCT_5, "9", "9", "9", "9", "4.5")));
        assertThat(submitted.target().expectedHours()).isEqualByComparingTo("40.5");
        assertThat(submitted.target().enteredHours()).isEqualByComparingTo("40.5");
        assertThat(submitted.target().leaveHours()).isEqualByComparingTo("4.5");
    }

    @Test
    void emptyDaysAreAllowedWhenTheWeekStillReachesItsTarget() {
        // A 7-hour schedule: the target is 35 h, so four days of 9 h with Friday left empty is enough.
        employee(40L, 140L, "EMP040", null);
        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(40L)).thenReturn(List.of(
                WorkSchedule.create(40L, d("2026-01-01"), EnumSet.of(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY),
                        new BigDecimal("7"), 1L)));

        WeekTimesheetResponse submitted = service.submitWeek(140L, week(OCT_5, WORK,
                weekdays(OCT_5, "9", "9", "9", "9", "")));

        assertThat(submitted.target().expectedHours()).isEqualByComparingTo("35");

        assertThat(submitted.status()).isEqualTo("SUBMITTED");
        assertThat(savedEntries).hasSize(4);
    }

    @Test
    void thisWeekCantBeSubmittedBeforeItsLastWorkingDay() {
        Throwable thrown = catchThrowable(() ->
                service.submitWeek(110L, week(OCT_12, WORK, weekdays(OCT_12, "9", "9", "9", "9", "9"))));

        assertApiError(thrown, HttpStatus.BAD_REQUEST, "target");
        assertThat(thrown).hasMessageContaining("from Fri 16 Oct 2026");
        verify(entries, never()).saveAndFlush(any());
    }

    @Test
    void descriptionIsNeededToSubmitButNotToSave() {
        assertThat(service.saveDraft(110L, week(OCT_5, " ", "2026-10-05=9")).description()).isNull();

        Throwable thrown = catchThrowable(() ->
                service.submitWeek(110L, week(OCT_5, " \t ", weekdays(OCT_5, "9", "9", "9", "9", "9"))));
        assertApiError(thrown, HttpStatus.BAD_REQUEST, "description");
    }

    /* ---------- Days submitted earlier, one at a time ---------- */

    @Test
    void daysSubmittedEarlierCountAndAreLocked() {
        savedEntries.add(TimesheetEntry.submit(10L, d("2026-10-05"), new BigDecimal("9.00"), "Earlier"));

        WeekTimesheetResponse week = service.weekMine(110L, d(OCT_5));
        assertThat(dayOf(week, "2026-10-05").entryStatus()).isEqualTo("PENDING");
        assertThat(dayOf(week, "2026-10-05").editable()).isFalse();
        assertThat(week.target().enteredHours()).isEqualByComparingTo("9");

        Throwable change = catchThrowable(() -> service.saveDraft(110L, week(OCT_5, null, "2026-10-05=5")));
        assertApiError(change, HttpStatus.CONFLICT, "days[2026-10-05]");

        // The other four days complete the week.
        WeekTimesheetResponse submitted = service.submitWeek(110L, week(OCT_5, WORK,
                "2026-10-06=9", "2026-10-07=9", "2026-10-08=9", "2026-10-09=9"));
        assertThat(submitted.status()).isEqualTo("SUBMITTED");
        assertThat(submitted.target().enteredHours()).isEqualByComparingTo("45");
        assertThat(savedEntries).hasSize(5);
        assertThat(savedEntries.get(0).getDescription()).as("earlier entry untouched").isEqualTo("Earlier");
    }

    @Test
    void aWeekWhoseWorkingDaysWereAllSubmittedEarlierIsAlreadySubmitted() {
        for (String day : new String[] {"2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"}) {
            savedEntries.add(TimesheetEntry.submit(10L, d(day), new BigDecimal("9.00"), "Earlier"));
        }

        WeekTimesheetResponse week = service.weekMine(110L, d(OCT_5));
        assertThat(week.status()).isEqualTo("ALREADY_SUBMITTED");
        assertThat(week.canSubmit()).isFalse();
        assertThat(week.submitBlockedReason())
                .isEqualTo("All working days of this week were already submitted, so there is nothing to save or submit.");
        assertThat(week.days()).filteredOn(WeekTimesheetResponse.Day::editable).isEmpty();
        assertThat(week.target().enteredHours()).isEqualByComparingTo("45");

        Throwable save = catchThrowable(() -> service.saveDraft(110L, week(OCT_5, null)));
        assertApiError(save, HttpStatus.CONFLICT, null);
        assertThat(save).hasMessage("All working days of this week were already submitted, so there is nothing to save or submit.");
        Throwable submit = catchThrowable(() -> service.submitWeek(110L, week(OCT_5, WORK)));
        assertApiError(submit, HttpStatus.CONFLICT, null);
        assertThat(submit).hasMessage("All working days of this week were already submitted, so there is nothing to save or submit.");
        verify(weeks, never()).saveAndFlush(any());
        assertThat(savedEntries).hasSize(5);
    }

    @Test
    void aDraftWeekBecomesAlreadySubmittedWhenItsDaysAreSubmittedOneByOne() {
        service.saveDraft(110L, week(OCT_5, null, "2026-10-05=9"));
        for (String day : new String[] {"2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"}) {
            service.submitOneDay(110L, oneDay(day, "9"));
        }

        WeekTimesheetResponse week = service.weekMine(110L, d(OCT_5));
        assertThat(week.status()).isEqualTo("ALREADY_SUBMITTED");
        assertThat(savedWeeks.get("10/" + OCT_5).getDraftHours()).as("draft day replaced by the entry").isEmpty();
    }

    @Test
    void aWeekWithSomeDaysLeftIsNotAlreadySubmitted() {
        for (String day : new String[] {"2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"}) {
            savedEntries.add(TimesheetEntry.submit(10L, d(day), new BigDecimal("9.00"), "Earlier"));
        }
        WeekTimesheetResponse week = service.weekMine(110L, d(OCT_5));
        assertThat(week.status()).isEqualTo("NOT_STARTED");
        assertThat(dayOf(week, "2026-10-09").editable()).isTrue();
    }

    /* ---------- Older one-day submit (kept for app versions installed earlier) ---------- */

    private static TimesheetRequest oneDay(String date, String hours) {
        return new TimesheetRequest(d(date), new BigDecimal(hours), " " + WORK + " ");
    }

    @Test
    void oneDaySubmitStillWorksForAWorkingDay() {
        TimesheetResponse response = service.submitOneDay(110L, oneDay("2026-10-12", "7.5"));

        assertThat(response.id()).isEqualTo(900L);
        assertThat(response.date()).isEqualTo(d("2026-10-12"));
        assertThat(response.hours()).isEqualByComparingTo("7.5");
        assertThat(response.description()).isEqualTo(WORK);
        assertThat(response.status()).isEqualTo("PENDING");
        assertThat(savedEntries.get(0).getEmployeeId()).as("always the signed-in employee").isEqualTo(10L);
        // It shows up in the weekly view as a locked, submitted day.
        assertThat(dayOf(service.weekMine(110L, d(OCT_12)), "2026-10-12").entryStatus()).isEqualTo("PENDING");
    }

    @Test
    void oneDaySubmitUsesTheSameDayRulesAsTheWeeklyScreen() {
        assertApiError(catchThrowable(() -> service.submitOneDay(110L, oneDay("2026-10-10", "8"))), HttpStatus.BAD_REQUEST, "date");
        Throwable holiday = catchThrowable(() -> service.submitOneDay(110L, oneDay("2026-10-02", "8")));
        assertApiError(holiday, HttpStatus.BAD_REQUEST, "date");
        assertThat(holiday).hasMessageContaining("Gandhi Jayanti");
        approvedLeave("2026-10-07", LeaveDays.Portion.FULL_DAY);
        Throwable onLeave = catchThrowable(() -> service.submitOneDay(110L, oneDay("2026-10-07", "8")));
        assertApiError(onLeave, HttpStatus.BAD_REQUEST, "date");
        assertThat(onLeave).hasMessageContaining("approved leave");
        assertApiError(catchThrowable(() -> service.submitOneDay(110L, oneDay("2026-10-15", "8"))), HttpStatus.BAD_REQUEST, "date");
        assertApiError(catchThrowable(() -> service.submitOneDay(110L, oneDay("2026-08-14", "8"))), HttpStatus.BAD_REQUEST, "date");
        employee(30L, 130L, "EMP030", d("2026-10-13"));
        assertApiError(catchThrowable(() -> service.submitOneDay(130L, oneDay("2026-10-12", "8"))), HttpStatus.BAD_REQUEST, "date");
        assertApiError(catchThrowable(() -> service.submitOneDay(110L,
                new TimesheetRequest(d("2026-10-12"), NINE, " \t "))), HttpStatus.BAD_REQUEST, "description");
        verify(entries, never()).saveAndFlush(any());
    }

    @Test
    void oneDaySubmitKeepsTheOneToNineHourRule() {
        for (String bad : new String[] {"0", "0.5", "0.99", "9.25", "10", "7.1"}) {
            Throwable thrown = catchThrowable(() -> service.submitOneDay(110L, oneDay("2026-10-12", bad)));
            assertApiError(thrown, HttpStatus.BAD_REQUEST, "hours");
            assertThat(thrown).as(bad).hasMessage("Enter hours from 1 to 9, in steps of 0.25 (15 minutes).");
        }
        for (String good : new String[] {"1", "8.75", "9"}) {
            savedEntries.clear();
            assertThat(service.submitOneDay(110L, oneDay("2026-10-12", good)).hours()).as(good).isEqualByComparingTo(good);
        }
    }

    @Test
    void oneDaySubmitCantAddToAWeekSubmittedAsAWholeOrRepeatADay() {
        service.submitWeek(110L, week(SEP_28, WORK, weekdays(SEP_28, "9", "9", "9", "9")));
        // Thursday 1 Oct is in the submitted week; nothing can be added there any more.
        savedEntries.removeIf(e -> e.getWorkDate().equals(d("2026-10-01")));
        Throwable submittedWeek = catchThrowable(() -> service.submitOneDay(110L, oneDay("2026-10-01", "9")));
        assertApiError(submittedWeek, HttpStatus.CONFLICT, "date");
        assertThat(submittedWeek).hasMessage("This week has already been submitted, so no more days can be added.");

        service.submitOneDay(110L, oneDay("2026-10-12", "8"));
        Throwable again = catchThrowable(() -> service.submitOneDay(110L, oneDay("2026-10-12", "8")));
        assertApiError(again, HttpStatus.CONFLICT, "date");
        assertThat(again).hasMessage("You already submitted a timesheet for this date.");

        doThrow(new DataIntegrityViolationException("dup")).when(entries).saveAndFlush(any(TimesheetEntry.class));
        assertApiError(catchThrowable(() -> service.submitOneDay(110L, oneDay("2026-10-13", "8"))), HttpStatus.CONFLICT, "date");
    }

    /* ---------- Daily hours: 1 to 9 in quarter hours ---------- */

    @Test
    void hoursFromOneToNineInQuarterHoursAreAccepted() {
        WeekTimesheetResponse saved = service.saveDraft(110L,
                week(OCT_5, null, weekdays(OCT_5, "1", "1.25", "2.5", "8.75", "9")));

        assertThat(dayOf(saved, "2026-10-05").hours()).isEqualByComparingTo("1");
        assertThat(dayOf(saved, "2026-10-06").hours()).isEqualByComparingTo("1.25");
        assertThat(dayOf(saved, "2026-10-07").hours()).isEqualByComparingTo("2.5");
        assertThat(dayOf(saved, "2026-10-08").hours()).isEqualByComparingTo("8.75");
        assertThat(dayOf(saved, "2026-10-09").hours()).isEqualByComparingTo("9");
    }

    @Test
    void hoursBelowOneOrAboveNineOrNotQuarterHoursAreRefused() {
        for (String bad : new String[] {"0", "-1", "0.25", "0.5", "0.75", "0.99", "9.25", "10", "24", "7.1", "1.2"}) {
            Throwable draft = catchThrowable(() -> service.saveDraft(110L, week(OCT_5, null, "2026-10-06=" + bad)));
            assertApiError(draft, HttpStatus.BAD_REQUEST, "days[2026-10-06]");
            assertThat(draft).as(bad).hasMessage("Enter hours from 1 to 9, in steps of 0.25 (15 minutes).");

            Throwable submit = catchThrowable(() -> service.submitWeek(110L,
                    week(OCT_5, WORK, weekdays(OCT_5, "9", bad, "9", "9", "9"))));
            assertApiError(submit, HttpStatus.BAD_REQUEST, "days[2026-10-06]");
        }
        verify(entries, never()).saveAndFlush(any());
        verify(weeks, never()).saveAndFlush(any());
    }

    /* ---------- Days that can't take hours ---------- */

    @Test
    void weeklyOffsHolidaysAndFullLeaveDaysRefuseHours() {
        Throwable saturday = catchThrowable(() -> service.saveDraft(110L, week(OCT_5, null, "2026-10-10=8")));
        assertApiError(saturday, HttpStatus.BAD_REQUEST, "days[2026-10-10]");
        assertThat(saturday).hasMessageContaining("weekly off");

        Throwable holiday = catchThrowable(() -> service.saveDraft(110L, week(SEP_28, null, "2026-10-02=8")));
        assertApiError(holiday, HttpStatus.BAD_REQUEST, "days[2026-10-02]");
        assertThat(holiday).hasMessageContaining("Gandhi Jayanti");

        Throwable overlap = catchThrowable(() -> service.saveDraft(110L, week(SEP_28, null, "2026-10-03=8")));
        assertThat(overlap).hasMessageContaining("holiday");

        approvedLeave("2026-10-07", LeaveDays.Portion.FULL_DAY);
        Throwable onLeave = catchThrowable(() -> service.saveDraft(110L, week(OCT_5, null, "2026-10-07=8")));
        assertApiError(onLeave, HttpStatus.BAD_REQUEST, "days[2026-10-07]");
        assertThat(onLeave).hasMessageContaining("approved leave");
        verify(weeks, never()).saveAndFlush(any());
    }

    @Test
    void hrScheduleChangeAppliesFromItsStartDate() {
        // HR: from Monday 5 Oct, Ravi works Saturdays (only Sunday off).
        when(schedules.findByEmployeeIdOrderByEffectiveFromAsc(10L)).thenReturn(List.of(
                WorkSchedule.create(10L, d("2026-10-05"), EnumSet.of(DayOfWeek.SUNDAY), NINE, 1L)));

        assertThat(dayOf(service.weekMine(110L, d(OCT_5)), "2026-10-10").editable()).as("Saturday after the change").isTrue();
        assertThat(service.weekMine(110L, d(OCT_5)).target().expectedHours()).isEqualByComparingTo("54");
        assertThat(dayOf(service.weekMine(110L, d("2026-09-21")), "2026-09-26").editable()).as("Saturday before").isFalse();
    }

    @Test
    void daysOutsideTheWeekOrSentTwiceAreRefused() {
        assertApiError(catchThrowable(() -> service.saveDraft(110L, week(OCT_5, null, "2026-10-12=9"))),
                HttpStatus.BAD_REQUEST, "days[2026-10-12]");
        assertApiError(catchThrowable(() -> service.saveDraft(110L, week(OCT_5, null, "2026-10-05=9", "2026-10-05=8"))),
                HttpStatus.BAD_REQUEST, "days[2026-10-05]");
    }

    /* ---------- Which weeks ---------- */

    @Test
    void weekMustStartOnMondayAndBeInTheAllowedRange() {
        assertApiError(catchThrowable(() -> service.weekMine(110L, d("2026-10-06"))), HttpStatus.BAD_REQUEST, "weekStart");
        assertApiError(catchThrowable(() -> service.weekMine(110L, d("2026-10-19"))), HttpStatus.BAD_REQUEST, "weekStart");
        // 60 days before 14 Oct is 15 Aug, in the week of Monday 10 Aug.
        assertThat(service.weekMine(110L, d("2026-08-10")).weekStart()).isEqualTo(d("2026-08-10"));
        assertApiError(catchThrowable(() -> service.weekMine(110L, d("2026-08-03"))), HttpStatus.BAD_REQUEST, "weekStart");

        employee(30L, 130L, "EMP030", d("2026-10-13"));
        assertApiError(catchThrowable(() -> service.weekMine(130L, d(OCT_5))), HttpStatus.BAD_REQUEST, "weekStart");
    }

    /* ---------- History (the app groups it by week) ---------- */

    @Test
    void historyListsEverySavedEntryOnceAndNeverDraftHours() {
        service.submitOneDay(110L, oneDay("2026-10-12", "8"));                      // older one-day submit
        service.submitWeek(110L, week(OCT_5, WORK, weekdays(OCT_5, "9", "9", "9", "9", "9"))); // weekly submit
        service.saveDraft(110L, week(OCT_12, null, "2026-10-13=9", "2026-10-14=9"));  // draft only

        List<TimesheetResponse> history = service.listMine(110L, d("2026-10-01"), d("2026-10-14"));

        assertThat(history).extracting(TimesheetResponse::date).containsExactly(
                d("2026-10-12"), d("2026-10-09"), d("2026-10-08"), d("2026-10-07"), d("2026-10-06"), d("2026-10-05"));
        assertThat(history).allSatisfy(t -> assertThat(t.status()).isEqualTo("PENDING"));
        assertThat(savedEntries).hasSize(6);
    }

    /* ---------- Calendar and lists (unchanged) ---------- */

    @Test
    void calendarShowsWorkingDaysOffsHolidaysAndOverlap() {
        CalendarResponse calendar = service.calendarMine(110L, d("2026-09-28"), d("2026-10-04"));

        assertThat(calendar.today()).isEqualTo(d("2026-10-14"));
        assertThat(calendar.days()).extracting(CalendarResponse.Day::kind).containsExactly(
                "WORKING", "WORKING", "WORKING", "WORKING", "HOLIDAY", "HOLIDAY", "WEEKLY_OFF");
        CalendarResponse.Day overlap = calendar.days().get(5);
        assertThat(overlap.weeklyOff()).isTrue();
        assertThat(overlap.holidayName()).isEqualTo("Test weekend holiday");
        assertThat(calendar.days().get(4).weeklyOff()).isFalse();
    }

    @Test
    void rangesAreCheckedAndUserWithoutEmployeeRecordGetsNotFound() {
        assertApiError(catchThrowable(() -> service.listMine(110L, d("2026-10-10"), d("2026-10-01"))), HttpStatus.BAD_REQUEST, "to");
        assertApiError(catchThrowable(() -> service.calendarMine(110L, d("2026-01-01"), d("2026-12-31"))), HttpStatus.BAD_REQUEST, "to");
        when(employees.findByUser_Id(anyLong())).thenReturn(Optional.empty());
        assertApiError(catchThrowable(() -> service.weekMine(1L, d(OCT_5))), HttpStatus.NOT_FOUND, null);
        assertApiError(catchThrowable(() -> service.saveDraft(1L, week(OCT_5, null))), HttpStatus.NOT_FOUND, null);
        verify(weeks, never()).saveAndFlush(any());
    }
}
