package com.rightsku.employee_app;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PasswordResetCodeRepository extends JpaRepository<PasswordResetCode, Long> {

    /** The newest code of an account: the only one that can ever be used. */
    Optional<PasswordResetCode> findFirstByUserIdOrderByCreatedAtDescIdDesc(Long userId);

    /** Codes still open, so a new request (or a successful reset) can end them. */
    List<PasswordResetCode> findByUserIdAndUsedAtIsNull(Long userId);

    /** How many codes were sent recently, to limit how often one account can be emailed. */
    long countByUserIdAndCreatedAtAfter(Long userId, Instant since);
}
