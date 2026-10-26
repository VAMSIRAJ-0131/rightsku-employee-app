package com.rightsku.employee_app;

import java.util.Collection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditEntryRepository extends JpaRepository<AuditEntry, Long> {

    /** The HR Activity screen, newest first. */
    Page<AuditEntry> findAllByOrderByCreatedAtDescIdDesc(Pageable page);

    Page<AuditEntry> findByActionInOrderByCreatedAtDescIdDesc(Collection<String> actions, Pageable page);
}
