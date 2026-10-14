package com.rightsku.employee_app;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyHolidayRepository extends JpaRepository<CompanyHoliday, Long> {

    List<CompanyHoliday> findByHolidayDateBetweenOrderByHolidayDateAsc(LocalDate from, LocalDate to);

    Optional<CompanyHoliday> findByHolidayDate(LocalDate date);
}
