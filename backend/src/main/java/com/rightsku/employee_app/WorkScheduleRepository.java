package com.rightsku.employee_app;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkScheduleRepository extends JpaRepository<WorkSchedule, Long> {

    List<WorkSchedule> findByEmployeeIdOrderByEffectiveFromAsc(Long employeeId);

    Optional<WorkSchedule> findByEmployeeIdAndEffectiveFrom(Long employeeId, LocalDate effectiveFrom);
}
