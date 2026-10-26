package com.rightsku.employee_app;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TimesheetEntryRepository extends JpaRepository<TimesheetEntry, Long> {

    List<TimesheetEntry> findByEmployeeIdAndWorkDateBetweenOrderByWorkDateDesc(
            Long employeeId, LocalDate from, LocalDate to);

    boolean existsByEmployeeIdAndWorkDate(Long employeeId, LocalDate workDate);

    /** The first submitted day on or after a date, of any status (a schedule change must not rewrite it). */
    java.util.Optional<TimesheetEntry> findFirstByEmployeeIdAndWorkDateGreaterThanEqualOrderByWorkDateAsc(
            Long employeeId, LocalDate from);

    /** Every employee's entries with one status, from a date on (HR review lists). */
    /** Every employee's entries in a date range: for HR exports. */
    List<TimesheetEntry> findByWorkDateBetweenOrderByWorkDateAscEmployeeIdAsc(LocalDate from, LocalDate to);

    List<TimesheetEntry> findByStatusAndWorkDateGreaterThanEqualOrderByWorkDateDesc(String status, LocalDate from);

    /**
     * HR decision for one employee's week: changes only the entries that are
     * still PENDING, in one statement, and returns how many changed. Two HR
     * admins deciding the same week at once: the second changes nothing.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE TimesheetEntry e SET e.status = :status, e.reviewedBy = :reviewer, e.reviewedAt = :at, "
            + "e.reviewNote = :note, e.updatedAt = :at "
            + "WHERE e.employeeId = :employeeId AND e.workDate BETWEEN :from AND :to AND e.status = 'PENDING'")
    int reviewPending(@Param("employeeId") Long employeeId, @Param("from") LocalDate from, @Param("to") LocalDate to,
            @Param("status") String status, @Param("reviewer") Long reviewer, @Param("at") Instant at,
            @Param("note") String note);

    /** How many employee-weeks (Monday to Sunday) have at least one entry in each status. */
    @Query(value = "SELECT status, count(DISTINCT (employee_id, date_trunc('week', work_date))) "
            + "FROM timesheet_entries GROUP BY status", nativeQuery = true)
    List<Object[]> countWeeksByStatus();
}
