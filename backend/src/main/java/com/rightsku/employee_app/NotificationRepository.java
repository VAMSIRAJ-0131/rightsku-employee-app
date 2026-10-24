package com.rightsku.employee_app;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    /** The newest notifications of one account that it has not cleared. */
    List<Notification> findTop50ByUserIdAndClearedAtIsNullOrderByCreatedAtDescIdDesc(Long userId);

    long countByUserIdAndReadAtIsNullAndClearedAtIsNull(Long userId);

    /** Looked up together with the owner, so one account can never reach another's notification. */
    Optional<Notification> findByIdAndUserId(Long id, Long userId);

    @Modifying
    @Query("update Notification n set n.readAt = :now where n.userId = :userId and n.readAt is null and n.clearedAt is null")
    int markAllRead(@Param("userId") Long userId, @Param("now") Instant now);

    /** Clears every notification of one account (also marks them read). Only notifications change. */
    @Modifying
    @Query("update Notification n set n.clearedAt = :now, n.readAt = coalesce(n.readAt, :now) "
            + "where n.userId = :userId and n.clearedAt is null")
    int clearAll(@Param("userId") Long userId, @Param("now") Instant now);
}
