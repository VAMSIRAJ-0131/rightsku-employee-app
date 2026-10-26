package com.rightsku.employee_app;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;

import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface EmployeeRepository extends JpaRepository<Employee, Long>, JpaSpecificationExecutor<Employee> {

    boolean existsByEmployeeCodeIgnoreCase(String employeeCode);

    /** The employee record of a signed-in employee (token subject = app_users.id). */
    Optional<Employee> findByUser_Id(Long userId);

    Optional<Employee> findByEmployeeCodeIgnoreCase(String employeeCode);

    long countByEmploymentStatus(String employmentStatus);

    /**
     * The employee row, locked until the transaction ends. Leave actions for
     * one employee (apply, approve, change balance) take this lock first, so
     * they run one after the other and can never overbook the balance.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM Employee e WHERE e.id = :id")
    Optional<Employee> lockById(@Param("id") Long id);

    /** Next number for an auto-generated Employee ID (sequence created in V3). */
    @Query(value = "SELECT nextval('employee_code_seq')", nativeQuery = true)
    long nextEmployeeCodeNumber();

    /**
     * Search by name, Employee ID, email, department or job title
     * (case-insensitive, "contains"), optionally limited to one status.
     */
    static Specification<Employee> search(String text, String status) {
        return (root, query, cb) -> {
            List<Predicate> conditions = new ArrayList<>();
            if (status != null) {
                conditions.add(cb.equal(root.get("employmentStatus"), status));
            }
            if (text != null && !text.isBlank()) {
                String pattern = "%" + escapeLike(text.trim().toLowerCase(Locale.ROOT)) + "%";
                Join<Employee, AppUser> user = root.join("user");
                conditions.add(cb.or(
                        cb.like(cb.lower(root.<String>get("employeeCode")), pattern, '\\'),
                        cb.like(cb.lower(root.<String>get("firstName")), pattern, '\\'),
                        cb.like(cb.lower(root.<String>get("lastName")), pattern, '\\'),
                        cb.like(cb.lower(cb.concat(cb.concat(root.<String>get("firstName"), " "), root.<String>get("lastName"))),
                                pattern, '\\'),
                        cb.like(cb.lower(root.<String>get("department")), pattern, '\\'),
                        cb.like(cb.lower(root.<String>get("jobTitle")), pattern, '\\'),
                        cb.like(cb.lower(user.<String>get("email")), pattern, '\\')));
            }
            return cb.and(conditions.toArray(new Predicate[0]));
        };
    }

    /** Treats %, _ and \ in the search text as normal characters. */
    static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
