# Authentication

How sign-in works in the RIGHTSKU Employee App, and what still has to be built.

## Sign-in methods

| Who | Signs in with | Endpoint |
|---|---|---|
| Employee | Employee ID (for example `EMP001`) + password | `POST /api/auth/login` |
| HR Admin | Work email (for example `hr@rightsku.com`) + password | `POST /api/auth/login` |

Request body: `{"username": "...", "password": "..."}`. A value containing `@` is
treated as an email, and email sign-in is accepted **only for HR Admin accounts**.
Every failure (wrong password, unknown ID or email, inactive account, employee
using an email) returns the same `401 Invalid ID or password`.

Before the lookup the backend normalizes what was typed: an Employee ID is
trimmed and upper-cased with `AppUser.normalizeLoginId()` (` emp001 ` finds
`EMP001`), and an email is trimmed and lower-cased. A value that can never be a
valid Employee ID is refused without a database lookup. HR Admins have no
Employee ID, so an HR Admin must type the full email; anything without `@` is
looked up only as an Employee ID.

**Finding out why a sign-in was refused:** the response never says why, but
the backend console prints one line per refusal, without the typed ID, email
or password, for example `Sign-in refused: no account uses that email.`,
`Sign-in refused: no account has that Employee ID (HR Admins sign in with
their email).`, `Sign-in failed: wrong password or unknown account.`,
`Sign-in failed: the account is inactive.` or `Sign-in refused: too many
failed attempts; blocked for N more seconds.`

Passwords are stored as BCrypt hashes (cost 12). A successful sign-in returns a
JWT (8 hours) whose subject is the internal user ID. Every request re-checks that
the account still exists, is active and has the same role.

## Employee ID (`app_users.login_id`)

Added by migration `V2__add_login_id_to_app_users.sql`.

**Enforced today**

- Format: 1–30 characters, letters, digits, `.`, `_` or `-`, starting with a
  letter or digit. It can never contain `@`.
  Checked by `AppUser.normalizeLoginId()`, a database check constraint and the
  login form.
- Stored trimmed and in upper case (`emp001` is saved as `EMP001`).
- Unique regardless of case (unique index on `UPPER(login_id)`).
- Every `EMPLOYEE` account must have one (`AppUser.create()` and a database
  check constraint). HR Admins have none and sign in by email.
- The two database checks are `NOT VALID`: they apply to new and changed rows,
  not to rows that existed before V2.

**Employee accounts (Phase 3, `EmployeeService`)**

HR Admins create employees through `POST /api/hr/employees`. The service:

1. Creates the `employees` row and its `app_users` login (role `EMPLOYEE`) in
   one transaction.
2. Uses one normalized Employee ID for both `employees.employee_code` and
   `app_users.login_id` (`Employee.create()` refuses a mismatch).
3. Accepts an HR-typed ID (validated with `AppUser.normalizeLoginId()`) or, if
   left blank, generates the next free `EMP001`, `EMP002`, … from the
   `employee_code_seq` sequence (migration V3).
4. Rejects an ID already used by any account, regardless of case (409), and the
   database enforces the same with case-insensitive unique indexes on both
   columns.
5. Never changes an Employee ID after creation, so the two columns cannot drift.
6. Stores the HR-chosen temporary password only as a BCrypt hash
   (`PasswordPolicy`: at least 12 characters, at most 72 bytes).
7. Deactivating an employee also deactivates their login; their open sessions
   stop at the next request. Activating restores sign-in.

**First sign-in with a temporary password (V4)**

- New employee accounts are marked `must_change_password`. Migration V4 also
  marks every existing employee account that has a valid Employee ID (all of
  them still had HR's temporary password). Nobody is locked out: they sign in
  with the password they already have and then choose a new one. Older rows
  without an Employee ID (they cannot sign in anyway) and HR Admin accounts are
  not changed.
- Signing in with a temporary password returns `mustChangePassword: true` and
  a token that can only be used for `POST /api/auth/change-password`
  (`{"currentPassword": "...", "newPassword": "..."}`). Every other API answers
  403, and the app shows only the "Choose your password" screen.
- The current password must be right (wrong guesses count towards the
  sign-in rate limit). The new password must be typed twice
  (`confirmPassword`), be different from the current one and follow
  `PasswordPolicy`:
  - **Employees:** at least 8 characters; letters, numbers and special
    characters are all allowed ("Password must contain at least 8
    characters."). No leading or trailing spaces; at most 72 bytes.
  - **HR Admins:** at least 12 characters (unchanged).
  On success (204) the flag is cleared and the account's `session_version`
  goes up. Employees can also change their password later from Profile.
- The temporary password HR gives a new employee still uses the 12-character
  rule. Passwords that already exist keep working; the new rule applies the
  next time a password is chosen.
- All passwords are stored only as BCrypt hashes (cost 12).

**Ending sessions**

Every token carries the account's session version (`sv`) and the
"password change required" flag (`pwc`). `ActiveUserJwtValidator` rejects a
token whose values no longer match the account, so after a password change
every older token (other phones, the temporary-password session) gets 401 and
the user signs in again with the new password. Tokens issued before V4 have
neither claim; they count as version 0 / no change required.

**Still not enforced at the database level:** no trigger yet checks that
`employees.employee_code` equals the linked `app_users.login_id`; this is
guaranteed by the service, which is the only code that creates employees.
**Not built yet:** an HR "reset password" action.

## Login rate limiting

`LoginRateLimiter` counts **failed** sign-ins only, in 15-minute windows:

| Limit | Default | Effect |
|---|---|---|
| Same Employee ID/email from the same network address | 5 failures | That ID/email is blocked from that address until the window ends |
| Same network address, any accounts | 30 failures | That address is blocked until the window ends |

- Blocked attempts get `429 Too Many Requests` with a `Retry-After` header. The
  password is not checked while blocked, and the answer is the same whether or
  not the account exists.
- A successful sign-in clears that account's counter for that address.
- Because the per-account limit also uses the address, someone elsewhere cannot
  lock a real employee out by guessing their ID.
- Settings: `app.login.rate-limit.*` in `application.properties`.

**Known limits**

- Counters are in memory: they reset when the backend restarts and are not
  shared between several backend instances.
- A slow attack spread over many network addresses against one account is not
  stopped. Consider a per-account limit across all addresses, plus monitoring,
  before going live.
- The address is the direct client address. Behind a reverse proxy or load
  balancer, configure trusted forwarded headers
  (`server.forward-headers-strategy`); otherwise all users share the proxy's
  address and the per-address limit applies to everyone together.
- During local development the Vite proxy makes every request come from
  `127.0.0.1`, so the per-address limit is shared by everyone on that machine.
- If the frontend is ever served from a different origin than the API, CORS must
  expose the `Retry-After` header.
