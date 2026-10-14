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
  `app.schedule.default-hours-per-day` (default 8).

## Holiday calendar (migration V6)

`GET /api/hr/holidays?year=2026`, `POST /api/hr/holidays`,
`PUT /api/hr/holidays/{id}`, `DELETE /api/hr/holidays/{id}` (HR only).
One holiday per date, for the whole company. Removing a holiday makes that
date a normal day again. Timesheets already submitted for a date that later
becomes a holiday are kept.

## Timesheets (migration V6)

| Endpoint | What |
|---|---|
| `GET /api/employee/calendar?from=&to=` | Each day: `WORKING`, `WEEKLY_OFF` or `HOLIDAY` (at most 93 days) |
| `GET /api/employee/timesheets?from=&to=` | Own entries |
| `POST /api/employee/timesheets` | `{"date": "2026-10-13", "hours": 7.5, "description": "..."}` |

The server refuses (400, field `date`): weekly offs from the schedule in force
on that date, company holidays (a holiday on a weekly off is reported as the
holiday), future dates in the company time zone (`app.time-zone`, default
Asia/Kolkata), dates more than 60 days back, and dates before the joining
date. One entry per date (409). Hours: 0.25 to 9 per day, in quarter hours
(400, field `hours`). New entries are `PENDING`; HR approval is a later module.

The app shows one week at a time, a row per day ("Monday · Oct 12") with an
hours box. Working days are pre-filled with the scheduled hours (at most 9);
weekly offs, holidays and future days are greyed out, and days already
submitted show their hours and status. Submitting sends one entry per filled
day through the same API, so every day is still checked by the server.
