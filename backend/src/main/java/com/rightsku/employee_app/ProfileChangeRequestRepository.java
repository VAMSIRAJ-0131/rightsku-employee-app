package com.rightsku.employee_app;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProfileChangeRequestRepository extends JpaRepository<ProfileChangeRequest, Long> {

    List<ProfileChangeRequest> findTop20ByEmployeeIdOrderByCreatedAtDescIdDesc(Long employeeId);

    List<ProfileChangeRequest> findTop100ByStatusOrderByCreatedAtAscIdAsc(String status);

    boolean existsByEmployeeIdAndStatus(Long employeeId, String status);

    long countByStatus(String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ProfileChangeRequest r WHERE r.id = :id")
    Optional<ProfileChangeRequest> findForUpdate(@Param("id") Long id);
}
