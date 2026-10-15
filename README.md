# TaskCatch

Personal voice-driven task capture, transcription, translation, and reminder system designed for Hindi, Gujarati, Hinglish, and English conversations.

TaskCatch enables you to **only listen** during meetings and conversations. It captures audio, auto-transcribes and translates it to English with timestamps, extracts structured actionable tasks via local LLM, and reminds you across your phone (Firebase push notifications) and laptop (Ubuntu desktop widget).

---

## Architecture

```text
[Mobile PWA] (Android Chrome / iOS) 
   │ (10s audio chunks + bookmarks via IndexedDB)
   │ 
[Laptop Desktop Widget] (Electron) ──┐
   │ (Global hotkeys + mic / system audio)
   ▼
[Fastify API Server] (Node.js 20 + TypeScript) ◄───► [WebSocket Event Hub]
   │
   ├──► [PostgreSQL 16] (Drizzle ORM + tsvector GIN Search)
   │       └── [Jobs Queue] (SELECT ... FOR UPDATE SKIP LOCKED)
   │       └── [In-process 30s Reminder Engine]
   │
   ├──► [Python STT Sidecar] (FastAPI + faster-whisper int8 CPU + Silero VAD)
   │       └── Segment timestamps + Native dual-pass translation
   │
   ├──► [Local LLM Provider] (Ollama: qwen2.5:7b-instruct / llama3.1:8b)
   │       └── Pass 1: Terminology alignment
   │       └── Pass 2: JSON-schema constrained task & note extraction
   │
   └──► [Firebase Cloud Messaging] (Free Spark Plan)
           └── Push alerts to PWA & Web Push
```

---

## 1. Quick Start & Setup

### Prerequisites
- Ubuntu 22.04 or 24.04 LTS
- Node.js 20+ and npm 10+
- Docker & Docker Compose (or PostgreSQL 16 native)
- Python 3.11 with `uv`
- `ffmpeg` system binary (`sudo apt install ffmpeg`)

### Step 1: Start PostgreSQL 16
```bash
# Start isolated local PostgreSQL 16 on port 5433
docker compose up -d

# Verify connection
docker compose ps
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default connection string:
```bash
DATABASE_URL=postgresql://taskcatch:taskcatch_dev_secret@localhost:5433/taskcatch
```

### Step 3: Install Dependencies & Run Tests
```bash
# Install node dependencies
npm install

# Run unit and integration tests across workspaces
npm test
```

### Step 4: Setup Python STT Environment
```bash
# Create virtual environment and install requirements
~/.local/bin/uv venv apps/stt/.venv --python 3.11
~/.local/bin/uv pip install -r apps/stt/requirements.txt --python apps/stt/.venv/bin/python
```

---

## 2. PostgreSQL 16 Data Model & Features

- **Driver & ORM**: Drizzle ORM with `pg` (`node-postgres`).
- **Jobs Engine**: Persistent DB-backed job queue utilizing PostgreSQL atomic job claims:
  ```sql
  WITH next_job AS (
    SELECT id FROM jobs
    WHERE status = 'pending' AND run_at <= now()
    ORDER BY run_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE jobs
  SET status = 'processing', attempts = attempts + 1, updated_at = now()
  WHERE id IN (SELECT id FROM next_job)
  RETURNING *;
  ```
- **Full-Text Search**: Native `tsvector` generated columns with PostgreSQL `GIN` indexing:
  - `tasks`: Generated from `title`, `description`, and `tags`.
  - `transcript_segments`: Generated from `text_original` and `text_english`.
  - Query operator: `search_vector @@ plainto_tsquery('english', $1)`.
- **Performance Indexes**:
  - `idx_tasks_status_due` on `tasks(status, due_at)`
  - `idx_reminders_fire_sent` on `reminders(fire_at) WHERE sent_at IS NULL` (Partial index)
  - `idx_segments_session` on `transcript_segments(session_id, start_ms)`

---

## 3. Firebase Cloud Messaging (FCM) Setup

TaskCatch strictly runs on the **Firebase Spark Free Plan** (no credit card required, unlimited FCM push messages).

### Switching to your own Personal Project:
1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project (free Spark plan).
2. Navigate to **Project settings -> Service accounts** -> Click **Generate new private key**.
3. Save the JSON file securely on your Ubuntu machine (e.g. `~/.config/taskcatch/firebase-adminsdk.json`).
4. Set the path in `.env`:
   ```bash
   FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-adminsdk.json
   ```
5. For Web Push, navigate to **Project settings -> Cloud Messaging -> Web Push certificates** and click **Generate key pair** (VAPID key).
6. Set the VAPID key in `.env`:
   ```bash
   VITE_FIREBASE_VAPID_KEY=your_generated_vapid_key
   ```

---

## 4. Tailscale Setup (Phone PWA Microphone Access)

Modern mobile browsers (Chrome / Safari) require **HTTPS** for microphone access (`navigator.mediaDevices.getUserMedia`). Tailscale provides free HTTPS certificates for your local machine over your private mesh network:

```bash
# 1. Install Tailscale on Ubuntu (if not already installed)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# 2. Serve the TaskCatch API over HTTPS on your Tailscale network
sudo tailscale serve --bg https / http://127.0.0.1:3000

# 3. Access on your phone
# Open https://<your-machine-name>.tailnet-xyz.ts.net on your phone browser
# Tap "Add to Home Screen" to install the PWA
```

---

## 5. Monorepo Structure

- `/apps/api`: Fastify backend, Drizzle ORM, PostgreSQL queries, Job Queue, WebSocket server, Reminder engine.
- `/apps/stt`: Python 3.11 sidecar with `faster-whisper` and Phase 0 benchmark scripts.
- `/apps/web`: React + Vite + Tailwind CSS + PWA with IndexedDB offline audio chunk queue.
- `/apps/desktop`: Electron tray widget with frameless always-on-top mode and global hotkeys.
- `/packages/shared`: Shared TypeScript types, Zod schemas, and Indian context relative date resolver.
- `/docs/FINDINGS.md`: Insights from inspecting existing repositories.
- `/docs/COSTS.md`: Zero-cost licensing matrix.

---

## 6. Running Tests

```bash
# Run all unit and integration tests (Shared + API)
npm test

# Run STT Benchmarks (Phase 0)
apps/stt/.venv/bin/python apps/stt/benchmark.py --audio-dir fixtures/audio
```
