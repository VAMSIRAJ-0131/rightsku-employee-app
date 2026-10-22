package com.rightsku.employee_app;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface LeaveBalanceRepository extends JpaRepository<LeaveBalance, Long> {

    List<LeaveBalance> findByEmployeeId(Long employeeId);

    /** Locked until the transaction ends, so a balance is never changed by two requests at once. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<LeaveBalance> findForUpdateByEmployeeIdAndLeaveType(Long employeeId, String leaveType);
}
