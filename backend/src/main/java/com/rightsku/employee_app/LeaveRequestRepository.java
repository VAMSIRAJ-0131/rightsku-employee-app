package com.rightsku.employee_app;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LeaveRequestRepository extends JpaRepository<LeaveRequest, Long> {

    List<LeaveRequest> findByEmployeeIdOrderByStartDateDesc(Long employeeId);

    List<LeaveRequest> findByStatusOrderByCreatedAtAsc(String status);

    /** The request, locked until the transaction ends (approve / reject). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM LeaveRequest r WHERE r.id = :id")
    Optional<LeaveRequest> findForUpdate(@Param("id") Long id);

    /** Days of one type that are waiting for HR (they are held back from the balance). */
    @Query("SELECT COALESCE(SUM(r.days), 0) FROM LeaveRequest r "
            + "WHERE r.employeeId = :employeeId AND r.leaveType = :leaveType AND r.status = 'PENDING'")
    BigDecimal pendingDays(@Param("employeeId") Long employeeId, @Param("leaveType") String leaveType);

    /** Requests of any status that touch the dates from..to (both included). */
    @Query("SELECT r FROM LeaveRequest r WHERE r.employeeId = :employeeId "
            + "AND r.startDate <= :to AND r.endDate >= :from ORDER BY r.startDate")
    List<LeaveRequest> touching(@Param("employeeId") Long employeeId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = "SELECT status, count(*) FROM leave_requests GROUP BY status", nativeQuery = true)
    List<Object[]> countByStatusGrouped();
}
