-- Employee management (Phase 3). Additive only: no existing rows are changed.

-- Numbers for auto-generated Employee IDs (EMP001, EMP002, ...). The service
-- skips any number whose ID is already taken.
CREATE SEQUENCE employee_code_seq START WITH 1 INCREMENT BY 1;

-- employees.employee_code uses the same rules as app_users.login_id (V2):
-- same format, and unique regardless of upper/lower case.
ALTER TABLE employees
    ADD CONSTRAINT ck_employees_code_format
    CHECK (employee_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$') NOT VALID;

CREATE UNIQUE INDEX ux_employees_code_upper
    ON employees (UPPER(employee_code));
