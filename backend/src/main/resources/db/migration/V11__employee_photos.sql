-- Employee profile photos. Additive only: a new table, nothing existing changes.
--
-- Like documents (V5), the image is stored inside PostgreSQL (BYTEA), so it
-- is part of normal database backups and only the API can read it. Only HR
-- Admins can upload or replace a photo; an employee can only view their own.
-- One photo per employee: replacing it overwrites the row.

CREATE TABLE employee_photos (
    employee_id BIGINT PRIMARY KEY REFERENCES employees(id),
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    content BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    updated_by BIGINT REFERENCES app_users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
