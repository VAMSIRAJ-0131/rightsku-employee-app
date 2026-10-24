package com.rightsku.employee_app;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkScheduleRepository extends JpaRepository<WorkSchedule, Long> {

    /** The employee's schedules in force (not replaced by a later save), oldest first. */
    @org.springframework.data.jpa.repository.Query("SELECT s FROM WorkSchedule s WHERE s.employeeId = :employeeId "
            + "AND s.replacedAt IS NULL ORDER BY s.effectiveFrom")
    List<WorkSchedule> findByEmployeeIdOrderByEffectiveFromAsc(
            @org.springframework.data.repository.query.Param("employeeId") Long employeeId);

    Optional<WorkSchedule> findByEmployeeIdAndEffectiveFrom(Long employeeId, LocalDate effectiveFrom);
}
