#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz | path_to_backup_file.sql>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "=================================================="
echo "         TaskCatch Database Restore               "
echo "=================================================="
echo "Target backup: $BACKUP_FILE"

read -p "⚠️  This will overwrite current PostgreSQL data. Continue? (y/N): " -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Restore aborted."
  exit 0
fi

echo "➜ Restoring database..."

if [[ "$BACKUP_FILE" == *.gz ]]; then
  if docker ps --format '{{.Names}}' | grep -q "taskcatch-postgres"; then
    gunzip -c "$BACKUP_FILE" | docker exec -i taskcatch-postgres psql -U taskcatch -d taskcatch
  else
    PGPASSWORD="${POSTGRES_PASSWORD:-taskcatch_dev_secret}" gunzip -c "$BACKUP_FILE" | psql -h localhost -p 5433 -U taskcatch -d taskcatch
  fi
else
  if docker ps --format '{{.Names}}' | grep -q "taskcatch-postgres"; then
    cat "$BACKUP_FILE" | docker exec -i taskcatch-postgres psql -U taskcatch -d taskcatch
  else
    PGPASSWORD="${POSTGRES_PASSWORD:-taskcatch_dev_secret}" psql -h localhost -p 5433 -U taskcatch -d taskcatch < "$BACKUP_FILE"
  fi
fi

echo "➜ Verifying restored database..."
if docker ps --format '{{.Names}}' | grep -q "taskcatch-postgres"; then
  TASK_COUNT=$(docker exec taskcatch-postgres psql -U taskcatch -d taskcatch -t -c "SELECT count(*) FROM tasks;" | tr -d ' ')
  USER_COUNT=$(docker exec taskcatch-postgres psql -U taskcatch -d taskcatch -t -c "SELECT count(*) FROM users;" | tr -d ' ')
else
  TASK_COUNT=$(PGPASSWORD="${POSTGRES_PASSWORD:-taskcatch_dev_secret}" psql -h localhost -p 5433 -U taskcatch -d taskcatch -t -c "SELECT count(*) FROM tasks;" | tr -d ' ')
  USER_COUNT=$(PGPASSWORD="${POSTGRES_PASSWORD:-taskcatch_dev_secret}" psql -h localhost -p 5433 -U taskcatch -d taskcatch -t -c "SELECT count(*) FROM users;" | tr -d ' ')
fi

echo "✓ Restore complete!"
echo "Verified: $USER_COUNT users, $TASK_COUNT tasks in database."
