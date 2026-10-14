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

**Not enforced yet: required future change**

There is **no employee-management module yet**, so no code creates employee
accounts or assigns Employee IDs today, and nothing yet guarantees that an
employee's `app_users.login_id` matches their `employees.employee_code`.

When the employee-management module is built, it **must**:

1. Create the `employees` row and its `app_users` login in one transaction.
2. Set `app_users.login_id` to the same value as `employees.employee_code`,
   passing it through `AppUser.normalizeLoginId()` and storing the normalized
   value in **both** columns.
3. Reject a code that is already used (case-insensitive) with a clear error.
4. Keep the two values equal when an Employee ID is ever changed (or disallow
   changing it).
5. Add tests for all of the above.

Recommended at the same time: a database check or trigger that rejects an
`employees` row whose `employee_code` differs from its user's `login_id`.

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
