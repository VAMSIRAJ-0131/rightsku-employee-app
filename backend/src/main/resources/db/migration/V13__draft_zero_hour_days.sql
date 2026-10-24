-- A saved timesheet draft may hold 0 hours for a day: "I did not work this
-- day" (LOP when no paid leave is left, or a day whose leave is waiting for
-- HR). A blank day is simply not stored. Draft rows only; submitted entries
-- (timesheet_entries) still need more than 0 hours.
ALTER TABLE timesheet_draft_days DROP CONSTRAINT IF EXISTS timesheet_draft_days_hours_check;
ALTER TABLE timesheet_draft_days
    ADD CONSTRAINT timesheet_draft_days_hours_check CHECK (hours >= 0 AND hours <= 24);
