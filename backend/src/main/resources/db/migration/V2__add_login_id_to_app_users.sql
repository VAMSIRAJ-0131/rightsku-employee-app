-- Employee ID used to sign in (for example EMP001).
--
-- * Employees sign in with login_id + password.
-- * HR Admins sign in with their email + password and need no login_id,
--   so the column is nullable and existing accounts are left unchanged.
-- * IDs are unique regardless of upper/lower case (EMP001 = emp001).
-- * For employees, login_id is expected to match employees.employee_code.

ALTER TABLE app_users
    ADD COLUMN login_id VARCHAR(30);

CREATE UNIQUE INDEX ux_app_users_login_id_upper
    ON app_users (UPPER(login_id));

-- Every EMPLOYEE account must have an Employee ID. NOT VALID applies the rule
-- to new and changed rows without re-checking existing rows, so this
-- migration cannot fail or modify data on an existing database.
ALTER TABLE app_users
    ADD CONSTRAINT ck_app_users_employee_has_login_id
    CHECK (role <> 'EMPLOYEE' OR login_id IS NOT NULL) NOT VALID;

-- Employee ID format: starts with a letter or digit; then letters, digits,
-- ".", "_" or "-"; at most 30 characters. It can never contain "@", so an
-- Employee ID can never be confused with an HR Admin's email at sign-in.
ALTER TABLE app_users
    ADD CONSTRAINT ck_app_users_login_id_format
    CHECK (login_id IS NULL OR login_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$') NOT VALID;
