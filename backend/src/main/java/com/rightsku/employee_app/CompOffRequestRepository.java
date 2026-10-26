package com.rightsku.employee_app;

import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CompOffRequestRepository extends JpaRepository<CompOffRequest, Long> {

    List<CompOffRequest> findByEmployeeIdOrderByWorkDateDescIdDesc(Long employeeId);

    List<CompOffRequest> findByStatusOrderByCreatedAtAsc(String status);

    /** The request, locked until the transaction ends (approve / reject). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM CompOffRequest r WHERE r.id = :id")
    Optional<CompOffRequest> findForUpdate(@Param("id") Long id);

    /** A pending or approved request for this day (a rejected or cancelled one does not count). */
    @Query("SELECT r FROM CompOffRequest r WHERE r.employeeId = :employeeId AND r.workDate = :day "
            + "AND r.status NOT IN ('REJECTED', 'CANCELLED')")
    List<CompOffRequest> activeOn(@Param("employeeId") Long employeeId, @Param("day") LocalDate day);

    /** Pending or approved requests on or after a date (a schedule change must not turn them into working days). */
    @Query("SELECT r FROM CompOffRequest r WHERE r.employeeId = :employeeId AND r.workDate >= :from "
            + "AND r.status NOT IN ('REJECTED', 'CANCELLED') ORDER BY r.workDate")
    List<CompOffRequest> activeFrom(@Param("employeeId") Long employeeId, @Param("from") LocalDate from);

    /** Every employee's requests for days in a range: for HR exports. */
    List<CompOffRequest> findByWorkDateBetweenOrderByWorkDateAscIdAsc(LocalDate from, LocalDate to);

    @Query(value = "SELECT status, count(*) FROM comp_off_requests GROUP BY status", nativeQuery = true)
    List<Object[]> countByStatusGrouped();
}
