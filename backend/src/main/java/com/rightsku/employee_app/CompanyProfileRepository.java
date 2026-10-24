package com.rightsku.employee_app;

import org.springframework.data.jpa.repository.JpaRepository;

/** The single company profile row (V15). */
public interface CompanyProfileRepository extends JpaRepository<CompanyProfile, Short> {
}
