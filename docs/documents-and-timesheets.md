# Documents, work schedules, holidays and timesheets

## Employee documents (migration V5)

HR uploads offer letters, experience letters, payslips and Form 16 for one
employee at a time. Employees can list and download only their own.

| Who | Endpoint | What |
|---|---|---|
| HR | `GET /api/hr/employees/{id}/documents` | One employee's documents |
| HR | `POST /api/hr/employees/{id}/documents` | Upload (multipart: `type`, `period`, optional `title`, `file`) |
| HR | `POST /api/hr/documents/{documentId}` | Replace the file with a corrected one and/or change the title (multipart) |
| HR | `GET /api/hr/documents?limit=20` | Recent uploads, all employees |
| HR | `GET /api/hr/documents/{documentId}/file` | Download |
| Employee | `GET /api/employee/documents` | Own documents |
| Employee | `GET /api/employee/documents/{documentId}/file` | Download (404 for anyone else's document) |

Rules (checked by the server in `DocumentService` and `DocumentFileRules`):

- Types: `OFFER_LETTER`, `EXPERIENCE_LETTER`, `PAYSLIP` (needs the month,
  `2026-09`), `FORM_16` (needs the financial year, `2025-26`).
- One document per employee, type and period. A second upload for the same
  slot gets 409; HR uses Replace instead, which keeps the same document and
  increases its version.
- PDF, PNG or JPEG only, decided from the file's first bytes (not its name).
  Empty files and files over 10 MB are refused. The stored file name is
  cleaned (no folders or special characters) and gets the matching extension.
- Files are stored inside PostgreSQL (`employee_document_files`, BYTEA), so they
  are part of normal database backups. Downloads are always sent as an
  attachment with `nosniff` and `no-store`.
- Uploads, replacements and title changes are written to the audit log.

## Work schedules and weekly offs (migration V6)

HR sets each employee's weekly off days and hours per day from a start date:
`GET` / `PUT /api/hr/employees/{id}/schedule`
(`{"weeklyOffs": ["SATURDAY","SUNDAY"], "hoursPerDay": 8, "effectiveFrom": "2026-10-05"}`).

- A schedule applies from its start date until the next one. The start date
  must be today or later (company time zone), so a change never rewrites days
  that have already passed or timesheets already submitted.
- Saving again for the same start date replaces that schedule.
- At least one working day per week; hours from 0.25 to 24 in quarter hours.
- Until HR sets one, the company default applies:
  `app.schedule.default-weekly-offs` (default `SATURDAY,SUNDAY`) and
  `app.schedule.default-hours-per-day` (default 9, so a normal week is
  5 x 9 = 45 hours).

## Holiday calendar (migration V6)

`GET /api/hr/holidays?year=2026`, `POST /api/hr/holidays`,
`PUT /api/hr/holidays/{id}`, `DELETE /api/hr/holidays/{id}` (HR only).
One holiday per date, for the whole company. Removing a holiday makes that
date a normal day again. Timesheets already submitted for a date that later
becomes a holiday are kept.

## Timesheets: weekly Save and Submit (migrations V6 and V7)

| Endpoint | What |
|---|---|
| `GET /api/employee/calendar?from=&to=` | Each day: `WORKING`, `WEEKLY_OFF` or `HOLIDAY` (at most 93 days) |
| `GET /api/employee/timesheets?from=&to=` | Own entries (history) |
| `GET /api/employee/timesheets/week?start=2026-10-05` | One week (start = its Monday): days, saved hours, status, target |
| `PUT /api/employee/timesheets/week/draft` | **Save**: keep the week as a draft. Nothing goes to HR |
| `POST /api/employee/timesheets/week/submit` | **Submit for approval**: the whole week in one step |
| `POST /api/employee/timesheets` | Older one-day submit, kept for app versions installed earlier (see below) |

Body for Save and Submit:
`{"weekStart": "2026-10-05", "description": "...", "days": [{"date": "2026-10-05", "hours": 9}, {"date": "2026-10-06", "hours": null}]}`
(`null` = empty box). The employee is always the signed-in user from the
token.

**Older one-day submit** (`{"date": "2026-10-13", "hours": 7.5, "description": "..."}`,
same request, response and error fields as before). The current app no longer
uses it; it stays on for app versions installed before weekly submission.
Each day gets the same checks as the weekly screen: working day only (not a
weekly off, holiday, full day of approved leave or before joining), not in
the future, at most 60 days back, 1 to 9 hours in quarter hours, a
description, one entry per date (409). It can't add a day to a week that was
submitted as a whole (409), and it removes that day from a saved draft. It
does **not** check the weekly target, because one day at a time never reaches
it; those days are still sent to HR as `PENDING` like before. It is to be
switched off once every installed app uses weekly submission.

**Weekly target** (worked out by the server, `WeekTarget`):

- Each scheduled working day counts its HR schedule hours, at most 9. Five
  9-hour days = **45 hours**. Other schedules give other targets (five
  8-hour days = 40).
- A company holiday on a working day lowers the target by that day's hours
  (36 hours with one holiday). A holiday on a weekly off changes nothing.
- Only **approved** leave lowers the target: a full day by that day's hours
  (36), a half day by half (40.5). Pending and rejected leave change nothing.
  Leave is shown as its own line and is never added to the hours worked.
- Weekly offs and days before the joining date never count.
- Approved leave comes from the leave requests (`LeaveRequestLeaveDays`), so
  approving a request lowers that week's target straight away.

**Rules** (the server refuses anything else; field `days[2026-10-05]`,
`description`, `target` or `weekStart` says where):

- Weeks from the one that contains "60 days ago" up to this week.
- Hours only on working days: not on weekly offs, holidays, full days of
  approved leave or before the joining date. 1 to 9 hours a day in quarter
  hours.
- **Save** accepts any filled boxes (also days later this week) and no
  description, and can be repeated: a draft stays editable.
- **Submit** needs a description, opens on the week's last working day, and
  needs at least the week's target ("Enter 9 more hours to reach this week's
  45 hours."). Empty days are fine as long as the target is reached. All days
  are saved in one transaction as `PENDING` entries; if anything is wrong,
  nothing is saved.
- A submitted week can't be saved or submitted again (409). The week row is
  locked while saving or submitting, and the database allows one entry per
  day, so a double tap can't create a second submission.
- Days submitted one at a time (older submit) stay as they are, count
  towards the week and can't be changed. Rejected days don't count. HR
  approval of timesheets is a later module.
- When **every** working day of a week was submitted one at a time, the week
  is `ALREADY_SUBMITTED`: the app shows "Already submitted" without Save and
  Submit, and the server refuses both (409, "All working days of this week
  were already submitted, so there is nothing to save or submit.").

**Database (V7, additive only):** `timesheet_weeks` (one row per employee and
week: `DRAFT` or `SUBMITTED`, description, submitted time) and
`timesheet_draft_days` (the hours of a draft, removed when the week is
submitted). `timesheet_entries` and all existing rows are unchanged.

**The app** shows one week at a time: Expected, Entered and Remaining hours
(with "45 h scheduled − 9 h holiday = 36 h expected"), then a row per day
("Monday · Oct 12") with an hours box. A new week is pre-filled with each
day's expected hours; a draft opens with what was saved. Weekly offs,
holidays and full leave days are greyed out; submitted days show their hours
and status. **Save** shows "Draft saved successfully" only after the server
confirms. **Submit for approval** first asks "Are you sure you want to submit
this timesheet for approval?" (Cancel sends nothing); after Confirm the
buttons are disabled until the server answers, and "Your timesheet has been
submitted successfully." appears only when it has.

**History** (on the timesheet screen and in Requests) shows one row per week,
Monday to Sunday, newest first: the date range, the number of entries, the
total hours of the saved entries and an overall status (Pending, Approved,
Rejected, or Mixed with a breakdown such as "3 approved · 2 pending"). Weeks
start closed; tapping one shows its days with hours, description and status.
It is built in the app from the saved entries (`GET /api/employee/timesheets`),
so days from the older one-day submit are included in their week, draft hours
are never counted, and nothing is changed, re-sent or duplicated.

**Database test** (`WeeklyTimesheetDatabaseTest`, real PostgreSQL). It checks
migration V7, saving and reloading a draft, that a submission failing part-way
leaves nothing saved, and that two submissions of the same week at the same
moment save it once. It is skipped unless `RIGHTSKU_TEST_DB_URL` is set, and it
refuses to start unless the database name ends in `_test`, so it can never use
the development database. It creates its own inactive test employee and
deletes only that employee's rows afterwards. Run it on a separate database,
for example a copy of the development database:

```powershell
psql -h localhost -p 5433 -U rightsku -d postgres -c "CREATE DATABASE rightsku_employee_v7_test TEMPLATE rightsku_employee;"
$env:RIGHTSKU_TEST_DB_URL = "jdbc:postgresql://localhost:5433/rightsku_employee_v7_test"
cd backend
.\mvnw.cmd test "-Dtest=WeeklyTimesheetDatabaseTest"
Remove-Item Env:RIGHTSKU_TEST_DB_URL
```

## HR approvals (migration V8)

| Endpoint (HR only) | What |
|---|---|
| `GET /api/hr/approvals/summary` | Pending / approved / rejected counts for timesheets (per employee-week) and leave |
| `GET /api/hr/timesheets?status=PENDING` | One row per employee and week: name, Employee ID, week, total hours, sent time, days |
| `POST /api/hr/timesheets/review` | `{"employeeId": 10, "weekStart": "2026-10-05", "decision": "APPROVE" or "REJECT", "note": "..."}` |
| `GET /api/hr/leave-requests?status=PENDING` | Leave requests with the employee's name and ID |
| `POST /api/hr/leave-requests/{id}/approve` / `reject` | Optional `{"note": "..."}` shown to the employee |

- **Why HR used to see "Nothing to review":** the HR screen read its lists
  from an empty placeholder (`EMPTY_DASHBOARD_DATA`), there was no HR
  timesheet API at all, and Approve / Reject only showed "a later update".
  Submissions were saved correctly; nothing ever read them for HR.
- A review changes only the days of that week that are still PENDING, in one
  database statement; a second decision on the same week gets 409. V8 adds
  `reviewed_by`, `reviewed_at` and `review_note` to `timesheet_entries`; the
  note is returned to the employee as `remark`.
- Every decision is written to the audit log (`TIMESHEET_APPROVED`,
  `TIMESHEET_REJECTED`, `LEAVE_APPROVED`, `LEAVE_REJECTED`).
- The counts are read from the database each time HR opens Home or
  Approvals and after every decision (there is no live push).

## Leave balances and requests (migration V8)

| Endpoint | Who | What |
|---|---|---|
| `GET /api/hr/employees/{id}/leave-balances` | HR | Balance, pending and available days per leave type |
| `PUT /api/hr/employees/{id}/leave-balances/{CASUAL\|SICK\|EARNED}` | HR | `{"balanceDays": 7.5}` |
| `GET /api/employee/leave/balances` | Employee | Own balances (read only) |
| `GET /api/employee/leave/requests` | Employee | Own requests |
| `POST /api/employee/leave/requests` | Employee | `{"leaveType": "CASUAL", "startDate": "...", "endDate": "...", "reason": "..."}` |

**Policy** (the app had none before, so this is the rule now in force):

- Leave types: Casual, Sick, Earned (the three the app's design used).
- HR sets each balance: 0 to 365 days in half days. Negative balances are
  refused. The change is audited with the previous and new value
  (`audit_history.details`, for example `{"leaveType": "CASUAL",
  "previousDays": 5.0, "newDays": 7.5}`).
- A request counts **working days** only (the employee's HR schedule and the
  company holiday calendar). Whole days only.
- **Pending** days are held back: a new request may use balance minus pending.
- The balance goes down **only when HR approves**, once. Rejecting releases
  the held days. If HR lowered the balance in the meantime and it no longer
  covers the request, approval is refused with a clear message.
- Overlapping requests (pending or approved) are refused; rejected dates can
  be requested again. Requests may start at most 60 days back and cover at
  most 93 days.
- Every leave action for one employee (apply, approve, change balance) first
  locks that employee's row, so two requests at the same moment can never
  use more than the balance. The database also refuses negative balances.
- Employees can't change balances: there is no employee endpoint for it, and
  `/api/hr/**` needs the HR_ADMIN role.

**Database test:** `ApprovalAndLeaveDatabaseTest` (same isolated `_test`
database rules as `WeeklyTimesheetDatabaseTest`) checks V8, a submitted week
reaching HR and the decision reaching the employee, audited balance changes,
two leave requests at the same moment, and approval taking the days off once.


## Comp-Off (migration V9)

Comp-Off is a fourth leave type next to Casual, Sick and Earned.

**Employees** pick "Comp-Off" in the normal leave form and send the request
the same way as any other leave. It shows as Pending, then Approved or
Rejected, in their history.

**HR** decides Comp-Off requests in Approvals → Leave, like any other leave.

**Balance.** HR opens the employee (Employees → name) and uses
"Comp-Off balance" → "Add or deduct". Every change needs a reason (3–500
characters). The history lists every change, newest first, with who made it,
when, and the balance before and after. Approved Comp-Off requests appear
there automatically. The Comp-Off balance can't be set directly in "Leave
balance": the server refuses it, so no change is ever made without a reason.

Rules (checked by the server, whatever the app sends):

- Only HR_ADMIN can see or change a Comp-Off balance (`/api/hr/**`).
- Whole or half days; the balance always stays between 0 and 365 days.
- Nothing is taken off while a request is pending or when it is rejected.
  Pending days are held back, so a new request can only use what is left.
- Approving takes the days off exactly once. The request is locked and must
  still be pending, and the database allows only one deduction per request
  (unique `leave_request_id`).
- The app sends a unique key with each manual change. If the same change
  arrives twice (double tap, or a retry after a lost reply), it is applied
  once (unique `request_key`).
- Every change locks the employee row first, like all leave actions, so
  changes and approvals for one employee never overlap.

API (HR only):

| Method | Path | Body |
|---|---|---|
| GET | `/api/hr/employees/{id}/comp-off` | – |
| POST | `/api/hr/employees/{id}/comp-off/adjustments` | `{"changeDays": 1.5, "reason": "Worked on Sunday", "requestKey": "<unique>"}` (negative `changeDays` deducts) |

Migration V9 only adds: the value `COMP_OFF` to the two leave-type checks
(every old value is still allowed), and the new table
`leave_balance_adjustments`. No existing row is changed or deleted.
