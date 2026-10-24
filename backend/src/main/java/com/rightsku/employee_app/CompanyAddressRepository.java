package com.rightsku.employee_app;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

/** The company's office addresses (V15). */
public interface CompanyAddressRepository extends JpaRepository<CompanyAddress, Long> {

    /** Active addresses first, then by name. */
    List<CompanyAddress> findAllByOrderByActiveDescLabelAscIdAsc();
}
