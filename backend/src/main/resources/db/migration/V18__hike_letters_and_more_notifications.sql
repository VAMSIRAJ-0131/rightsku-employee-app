-- Compensation (hike) letters, and more notifications. Additive only: the
-- existing documents and notifications are unchanged.

-- A compensation / hike letter: one per employee per calendar year ("2026").
ALTER TABLE employee_documents DROP CONSTRAINT employee_documents_doc_type_check;
ALTER TABLE employee_documents ADD CONSTRAINT employee_documents_doc_type_check
    CHECK (doc_type IN ('OFFER_LETTER', 'EXPERIENCE_LETTER', 'PAYSLIP', 'FORM_16', 'COMPENSATION_LETTER'));

ALTER TABLE employee_documents DROP CONSTRAINT ck_employee_documents_period;
ALTER TABLE employee_documents ADD CONSTRAINT ck_employee_documents_period CHECK (
    (doc_type = 'PAYSLIP' AND period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
    OR (doc_type = 'FORM_16' AND period ~ '^[0-9]{4}-[0-9]{2}$')
    OR (doc_type = 'COMPENSATION_LETTER' AND period ~ '^[0-9]{4}$')
    OR (doc_type IN ('OFFER_LETTER', 'EXPERIENCE_LETTER') AND period IS NULL)
);

-- New notifications:
--   LEAVE_BALANCE_UPDATED      HR changed a leave or Comp-Off balance
--   HOLIDAYS_UPDATED           HR added, changed or removed a company holiday
--   LEAVE_PENDING_REMINDER     your leave is still waiting for HR (after 2 days, daily)
--   COMP_OFF_PENDING_REMINDER  your Comp-Off request is still waiting for HR
--   PENDING_APPROVALS_REMINDER (HR) requests waiting 2 days or more
ALTER TABLE notifications DROP CONSTRAINT ck_notifications_type;
ALTER TABLE notifications ADD CONSTRAINT ck_notifications_type
    CHECK (type IN ('LEAVE_APPROVED', 'LEAVE_REJECTED', 'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED',
                    'PAYSLIP_PUBLISHED', 'DOCUMENT_PUBLISHED',
                    'SCHEDULE_CHANGED', 'COMP_OFF_APPROVED', 'COMP_OFF_REJECTED',
                    'TIMESHEET_REMINDER',
                    'LEAVE_BALANCE_UPDATED', 'HOLIDAYS_UPDATED',
                    'LEAVE_PENDING_REMINDER', 'COMP_OFF_PENDING_REMINDER', 'PENDING_APPROVALS_REMINDER'));
