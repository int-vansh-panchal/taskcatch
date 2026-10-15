#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${TASKCATCH_BACKUP_DIR:-$HOME/.taskcatch/backups}"
RETENTION_DAYS="${TASKCATCH_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/taskcatch_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "➜ Creating PostgreSQL backup: $BACKUP_FILE..."

# Check if running via Docker container or local postgres
if docker ps --format '{{.Names}}' | grep -q "taskcatch-postgres"; then
  docker exec taskcatch-postgres pg_dump -U taskcatch -d taskcatch | gzip -9 > "$BACKUP_FILE"
elif command -v pg_dump >/dev/null 2>&1; then
  PGPASSWORD="${POSTGRES_PASSWORD:-taskcatch_dev_secret}" pg_dump -h localhost -p 5433 -U taskcatch -d taskcatch | gzip -9 > "$BACKUP_FILE"
else
  echo "❌ Neither Docker container 'taskcatch-postgres' nor pg_dump binary found."
  exit 1
fi

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✓ Backup completed successfully ($FILE_SIZE)."

# Prune backups older than retention days
echo "➜ Cleaning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "taskcatch_backup_*.sql.gz" -mtime +"$RETENTION_DAYS" -exec rm -f {} \;
echo "✓ Retention check finished."
