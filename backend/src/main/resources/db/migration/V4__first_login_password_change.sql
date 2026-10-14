-- First-login password change and session invalidation. Additive only.
--
-- must_change_password: the account still uses a temporary password set by
--   HR. Until it is changed, the account's token can only be used to change
--   the password (see SecurityConfig and ActiveUserJwtValidator).
-- session_version: increases every time the password changes. Each token
--   carries the version it was issued with, so all older tokens stop working.
-- password_changed_at: when the account holder last changed the password.

ALTER TABLE app_users
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN password_changed_at TIMESTAMPTZ;

ALTER TABLE app_users
    ADD CONSTRAINT ck_app_users_session_version CHECK (session_version >= 0);

-- Existing employee accounts were created by HR with a temporary password
-- (there was no way to change it before this version), so those employees
-- choose their own password at their next sign-in. They are not locked out:
-- they sign in with the password they already have, then pick a new one.
--
-- Only accounts that can sign in with an Employee ID are marked. Older rows
-- without a valid Employee ID (possible from before V2) are left exactly as
-- they are: updating them would trip the V2 checks, and they cannot sign in
-- by Employee ID anyway. Deactivated employees are included, so they also
-- choose a new password if HR activates them again. HR Admin accounts are
-- never changed. No rows are deleted.
UPDATE app_users
SET must_change_password = TRUE
WHERE role = 'EMPLOYEE'
  AND login_id IS NOT NULL
  AND login_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$';
