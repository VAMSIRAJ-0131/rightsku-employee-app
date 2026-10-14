package com.rightsku.employee_app;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmployeeDocumentRepository extends JpaRepository<EmployeeDocument, Long> {

    @Query("select d from EmployeeDocument d join fetch d.employee e where e.id = :employeeId order by d.updatedAt desc")
    List<EmployeeDocument> findForEmployee(@Param("employeeId") long employeeId);

    /** Most recently uploaded or updated, across all employees (HR Documents tab). */
    @Query("select d from EmployeeDocument d join fetch d.employee e order by d.updatedAt desc")
    List<EmployeeDocument> findRecent(Pageable pageable);

    @Query("select d from EmployeeDocument d join fetch d.employee e where d.id = :id")
    Optional<EmployeeDocument> findWithEmployee(@Param("id") long id);

    /** Same slot as the unique index ux_employee_documents_slot (V5). */
    @Query("select case when count(d) > 0 then true else false end from EmployeeDocument d"
            + " where d.employee.id = :employeeId"
            + " and d.docType = :docType and coalesce(d.period, '') = :period")
    boolean existsSlot(
            @Param("employeeId") long employeeId,
            @Param("docType") String docType,
            @Param("period") String period);
}
