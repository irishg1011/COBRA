#!/usr/bin/env bash
# deploy/backup.sh - daily database backup (feat/admin-extras)
# ------------------------------------------------------------------
# Dumps the CobraByte database into BACKUP_DIR as
#     cobra_db-YYYYMMDD-HHMM.sql.gz
# and keeps only the newest KEEP files. Admin > System Health shows the
# newest one ("Last backup ... ago").
#
# Uses the SAME settings as the app (environment variables, defaults in
# server/cobradb.py): DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.
#   BACKUP_DIR   where to put the files   (default: <project>/backups)
#   KEEP         how many to keep         (default: 14)
#
# Run it once by hand:        bash deploy/backup.sh
# Every night at 2:15 (cron): crontab -e   then add one line:
#   15 2 * * * cd /path/to/COBRA && bash deploy/backup.sh >> backups/backup.log 2>&1
# The web page NEVER runs this - backups are made outside the app.
set -eu

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
KEEP="${KEEP:-14}"
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-cobra_db}"

DUMP="$(command -v mariadb-dump || command -v mysqldump || true)"
[ -n "$DUMP" ] || { echo "STOP: mariadb-dump / mysqldump not found." >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M)"
target="$BACKUP_DIR/${DB_NAME}-${stamp}.sql.gz"
partial="$target.part"

# The password goes through the environment, never the command line
# (so it can't be seen in the process list).
export MYSQL_PWD="${DB_PASSWORD:-}"
"$DUMP" --host="$DB_HOST" --user="$DB_USER" --single-transaction --routines --triggers \
        --default-character-set=utf8mb4 "$DB_NAME" | gzip -9 > "$partial"
unset MYSQL_PWD

mv "$partial" "$target"
chmod 600 "$target"
echo "$(date '+%F %T') backup written: $target ($(du -h "$target" | cut -f1))"

# Keep only the newest $KEEP backups.
ls -1t "$BACKUP_DIR"/"${DB_NAME}"-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f -- "$old"
    echo "removed old backup: $old"
done
