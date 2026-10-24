#!/usr/bin/env bash
# Restore a RIGHTSKU database backup made by backup.sh.
#
#   ./restore.sh <backup file> [--replace]
#
# The backup file is either already decrypted (*.dump) or encrypted
# (*.dump.gpg; then the GPG private key must be available to gpg here).
#
# Without --replace (the safe check): the backup is restored into a scratch
# database, rightsku_restore_check, and its contents are summarised. The live
# database is not touched.
#
# With --replace: after the same check, and only when you type REPLACE, the
# backend is stopped, the live database is renamed (KEPT, not deleted) to
# rightsku_before_restore_<time>, the checked copy becomes the live database,
# and the backend is started again.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
LIVE_DB=rightsku_employee
CHECK_DB=rightsku_restore_check

if [ $# -lt 1 ] || [ ! -f "$1" ]; then
    echo "Usage: $0 <backup.dump | backup.dump.gpg> [--replace]" >&2
    exit 2
fi
backup="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
replace="${2:-}"

cd "$DEPLOY_DIR"
# </dev/null: docker compose exec would otherwise read (and swallow) what you type.
psql_admin() { docker compose exec -T postgres psql -U rightsku -d postgres -v ON_ERROR_STOP=1 -q "$@" </dev/null; }

echo "1/3 Creating scratch database $CHECK_DB"
psql_admin -c "DROP DATABASE IF EXISTS $CHECK_DB;" -c "CREATE DATABASE $CHECK_DB;"

echo "2/3 Restoring $(basename "$backup") into $CHECK_DB"
if [[ "$backup" == *.gpg ]]; then
    gpg --batch --quiet --decrypt "$backup"
else
    cat "$backup"
fi | docker compose exec -T postgres pg_restore -U rightsku -d "$CHECK_DB" --no-owner --exit-on-error

echo "3/3 Checking the restored copy"
docker compose exec -T postgres psql -U rightsku -d "$CHECK_DB" -v ON_ERROR_STOP=1 -At -F ' ' -c "
    SELECT 'migrations', count(*) FILTER (WHERE success), max(version::int) FROM flyway_schema_history
    UNION ALL SELECT 'users', count(*), NULL FROM app_users
    UNION ALL SELECT 'employees', count(*), NULL FROM employees
    UNION ALL SELECT 'documents', count(*), NULL FROM employee_documents
    UNION ALL SELECT 'document_files', count(*), NULL FROM employee_document_files
    UNION ALL SELECT 'timesheet_weeks', count(*), NULL FROM timesheet_weeks
    UNION ALL SELECT 'leave_requests', count(*), NULL FROM leave_requests;" </dev/null

if [ "$replace" != "--replace" ]; then
    echo "Check finished. The live database was NOT changed."
    echo "To use this backup as the live database, run again with --replace."
    exit 0
fi

echo
echo "This will stop the backend and make the restored copy the LIVE database."
echo "The current live database is kept as rightsku_before_restore_<time>."
read -r -p "Type REPLACE to continue: " answer
if [ "$answer" != "REPLACE" ]; then
    echo "Cancelled. The live database was NOT changed."
    exit 1
fi

kept="rightsku_before_restore_$(date -u +%Y%m%d%H%M%S)"
docker compose stop backend </dev/null
psql_admin \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$LIVE_DB', '$CHECK_DB') AND pid <> pg_backend_pid();" \
    -c "ALTER DATABASE $LIVE_DB RENAME TO $kept;" \
    -c "ALTER DATABASE $CHECK_DB RENAME TO $LIVE_DB;"
docker compose start backend </dev/null
echo "Restored. The previous live database is kept as $kept."
echo "When the app is confirmed working, it can be removed with:"
echo "  docker compose exec postgres psql -U rightsku -d postgres -c 'DROP DATABASE $kept;'"
