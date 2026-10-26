
package com.rightsku.employee_app;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByEmailIgnoreCase(String email);

    /** Employee ID lookup; case-insensitive, matching the UPPER(login_id) unique index. */
    Optional<AppUser> findByLoginIdIgnoreCase(String loginId);

    /** Active accounts with this role (for example every HR Admin, for their reminders). */
    java.util.List<AppUser> findByRoleAndActiveTrue(String role);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByRole(String role);
}
