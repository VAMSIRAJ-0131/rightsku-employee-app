package com.rightsku.employee_app;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface LeaveBalanceAdjustmentRepository extends JpaRepository<LeaveBalanceAdjustment, Long> {

    /** The newest changes first (at most 200, plenty for one screen). */
    List<LeaveBalanceAdjustment> findTop200ByEmployeeIdAndLeaveTypeOrderByCreatedAtDescIdDesc(Long employeeId, String leaveType);

    /** A manual change already saved with this key (the same change sent twice). */
    Optional<LeaveBalanceAdjustment> findByRequestKey(String requestKey);

    boolean existsByLeaveRequestId(Long leaveRequestId);

    boolean existsByCompOffRequestId(Long compOffRequestId);
}
