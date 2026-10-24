package com.rightsku.employee_app;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface TimesheetWeekRepository extends JpaRepository<TimesheetWeek, Long> {

    Optional<TimesheetWeek> findByEmployeeIdAndWeekStart(Long employeeId, LocalDate weekStart);

    /** An employee's weeks starting between two Mondays (salary summary: which weeks were submitted). */
    List<TimesheetWeek> findByEmployeeIdAndWeekStartBetween(Long employeeId, LocalDate from, LocalDate to);

    /**
     * The same, locked until the transaction ends, so two saves or submits of
     * one week (for example a double tap) run one after the other.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<TimesheetWeek> findForUpdateByEmployeeIdAndWeekStart(Long employeeId, LocalDate weekStart);
}
