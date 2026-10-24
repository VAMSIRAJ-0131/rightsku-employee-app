#!/usr/bin/env bash
# Nightly backup of the RIGHTSKU database (employee data, documents, payslips
# and photos are all inside it).
#
#   1. pg_dump inside the postgres container (custom format, compressed)
#   2. encrypt to the GPG public key in BACKUP_GPG_RECIPIENT; the server holds
#      no private key, so it cannot read its own backups
#   3. copy off the server with rclone (BACKUP_RCLONE_REMOTE)
#   4. keep BACKUP_KEEP_LOCAL copies here and BACKUP_KEEP_REMOTE_DAYS off-server
#
# Run from cron (see README.md). Exits non-zero on any failure.
set -euo pipefail
umask 077

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
BACKUP_DIR="$DEPLOY_DIR/backups"

# Read one setting from .env without running the file as a script.
setting() {
    grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

GPG_RECIPIENT="$(setting BACKUP_GPG_RECIPIENT)"
RCLONE_REMOTE="$(setting BACKUP_RCLONE_REMOTE)"
KEEP_LOCAL="$(setting BACKUP_KEEP_LOCAL)"; KEEP_LOCAL="${KEEP_LOCAL:-7}"
KEEP_REMOTE_DAYS="$(setting BACKUP_KEEP_REMOTE_DAYS)"; KEEP_REMOTE_DAYS="${KEEP_REMOTE_DAYS:-30}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup: $*"; }

if [ -z "$GPG_RECIPIENT" ]; then
    log "FAILED: BACKUP_GPG_RECIPIENT is not set in $ENV_FILE"
    exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/rightsku-$stamp.dump.gpg"

cd "$DEPLOY_DIR"
log "dumping database"
if ! docker compose exec -T postgres pg_dump -U rightsku -d rightsku_employee --format=custom \
        | gpg --batch --yes --quiet --trust-model always --encrypt \
              --recipient "$GPG_RECIPIENT" --output "$file.part"; then
    rm -f "$file.part"
    log "FAILED: dump or encryption failed"
    exit 1
fi
mv "$file.part" "$file"
log "saved $(basename "$file") ($(wc -c < "$file") bytes)"

if [ -n "$RCLONE_REMOTE" ]; then
    log "copying to $RCLONE_REMOTE"
    rclone copy "$file" "$RCLONE_REMOTE"
    rclone delete --min-age "${KEEP_REMOTE_DAYS}d" --include "rightsku-*.dump.gpg" "$RCLONE_REMOTE"
else
    log "WARNING: BACKUP_RCLONE_REMOTE is not set; this backup is only on this server"
fi

# Keep the newest KEEP_LOCAL backups on this server.
ls -1t "$BACKUP_DIR"/rightsku-*.dump.gpg | tail -n +"$((KEEP_LOCAL + 1))" | while read -r old; do
    rm -f -- "$old"
done

log "OK"
