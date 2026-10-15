# TaskCatch Operations & Maintenance Guide

## 1. Systemd User Services

TaskCatch runs as three lightweight systemd user services that do not require root privileges and start automatically on user login.

### Service Overview
| Service Name | Description | Port / Process | Logs |
| :--- | :--- | :--- | :--- |
| `taskcatch-api.service` | Fastify TypeScript REST & WebSocket Server | Port 3000 | `journalctl --user-unit taskcatch-api -f` |
| `taskcatch-stt.service` | Faster-Whisper int8 Speech-to-Text Sidecar | Port 8000 | `journalctl --user-unit taskcatch-stt -f` |
| `taskcatch-postgres.service` | PostgreSQL 16 Docker Container | Port 5433 | `docker logs taskcatch-postgres -f` |

### Service Commands
```bash
# Check status of all services
systemctl --user status taskcatch-api taskcatch-stt taskcatch-postgres

# Restart API
systemctl --user restart taskcatch-api

# Restart Speech Sidecar
systemctl --user restart taskcatch-stt

# Stop all services
systemctl --user stop taskcatch-api taskcatch-stt taskcatch-postgres
```

---

## 2. Automated Backups & Restoration

### Running Manual Backup
```bash
./scripts/backup.sh
```
This produces a compressed gzip dump in `~/.taskcatch/backups/taskcatch_backup_YYYYMMDD_HHMMSS.sql.gz` and automatically prunes archives older than 14 days.

### Setting Up Nightly Automatic Cron Backup
Run `crontab -e` and add the following entry to backup every night at 2:30 AM:
```cron
30 2 * * * /home/lenovo/taskcatch/scripts/backup.sh >> /home/lenovo/.taskcatch/backup.log 2>&1
```

### Tested Database Restoration
```bash
./scripts/restore.sh ~/.taskcatch/backups/taskcatch_backup_20261015_134729.sql.gz
```
The script will prompt for confirmation, stream the SQL dump into the PostgreSQL container, and print verified table row counts upon completion.

---

## 3. Upgrading TaskCatch

When updating code from git:
```bash
cd /home/lenovo/taskcatch
git pull origin main

# Install any new packages and build all workspaces
npm install
npm run build

# Apply any new database migrations
npm run db:migrate --workspace=@taskcatch/api

# Restart systemd services
systemctl --user restart taskcatch-api taskcatch-stt
```

---

## 4. Audio Retention Cleanup

By default, raw audio files are stored in `~/.taskcatch/audio`.
To reclaim disk space while keeping all transcripts, timestamps, and extracted tasks intact:
- Configured in the UI under **Settings** > **Storage & Audio Retention** (default: 30 days).
- Can be triggered manually via:
  ```bash
  curl -X POST http://localhost:3000/api/sessions/cleanup-audio
  ```

---

## 5. Troubleshooting & Diagnostics

### Issue 1: Database connection refused (Port 5433)
Check if the Docker container is running:
```bash
docker ps | grep taskcatch-postgres
```
If stopped:
```bash
docker compose up -d postgres
```

### Issue 2: Faster-Whisper sidecar fails to start
Check Python virtualenv and dependencies:
```bash
apps/stt/.venv/bin/python -c "import faster_whisper; print('faster-whisper ok')"
```
If missing:
```bash
apps/stt/.venv/bin/pip install -r apps/stt/requirements.txt
```

### Issue 3: Ollama local LLM not responding
Verify Ollama is running and has the recommended model pulled:
```bash
curl http://localhost:11434/api/tags
ollama pull qwen2.5:7b-instruct
```

### Issue 4: Ubuntu microphone permissions
Ensure your user belongs to the `audio` group:
```bash
groups | grep audio
```
If not, run `sudo usermod -a -G audio $USER` and log back in.
