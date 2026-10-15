# TaskCatch Architecture & System Design

TaskCatch is a personal, private voice-driven capture and reminder system engineered for hands-free instruction recording in multilingual Indian workplaces (Hindi, Gujarati, Hinglish, English).

```mermaid
graph TD
    subgraph Client Layer
        Phone["📱 Android / iOS PWA\n(Screen Wake Lock, 10s Chunks, IndexedDB)"]
        Widget["💻 Ubuntu Desktop Widget\n(Electron 320x420 / Pill, Global Hotkeys)"]
    end

    subgraph Transport & Network
        Tailscale["🔒 Tailscale HTTPS Tunnel\n(tailscale serve --https=443)"]
    end

    subgraph Backend Core (apps/api)
        Fastify["⚡ Fastify TypeScript API (Port 3000)\nJWT Auth (Argon2id), Signed Stream URLs"]
        Queue["📦 Atomic Job Queue\n(SELECT ... FOR UPDATE SKIP LOCKED)"]
        Orchestrator["🎼 Pipeline Orchestrator\n(Single-Pass STT + LLM Translation)"]
        Scheduler["⏰ Reminder Engine\n(Deduped Poller, Snooze, Quiet Hours)"]
    end

    subgraph Persistence Layer (PostgreSQL 16)
        Postgres[("🐘 PostgreSQL 16 (Port 5433)\nGIN tsvector Search, Drizzle ORM")]
    end

    subgraph AI Engine (Local CPU)
        WhisperSidecar["🎙️ apps/stt: Faster-Whisper Sidecar (Port 8000)\nint8, Silero VAD, Indian Vocabulary Hints, Auto-Unload"]
        OllamaLocal["🧠 Ollama CPU LLM (Port 11434)\nqwen2.5:7b-instruct, keep_alive: 2m, Schema Constrained"]
    end

    subgraph Push Notification
        FCM["🔔 Firebase Cloud Messaging (Spark Free Tier)\nfirebase-admin -> Web Push SW & Mobile Tokens"]
    end

    Phone -->|HTTPS POST Chunks & WS| Tailscale
    Widget -->|Local IPC & WS| Fastify
    Tailscale --> Fastify
    Fastify --> Queue
    Queue --> Orchestrator
    Orchestrator -->|HTTP POST audio/wav| WhisperSidecar
    Orchestrator -->|HTTP POST prompt| OllamaLocal
    Orchestrator --> Postgres
    Scheduler --> Postgres
    Scheduler --> FCM
    Scheduler -->|WebSocket broadcast| Fastify
    Fastify -->|WebSocket| Phone
    Fastify -->|WebSocket| Widget
```

---

## 1. Architectural Highlights

### A. Strict Memory Budget (< 5 GB Free RAM on AMD Ryzen 5 3500U)
- **Problem:** Faster-Whisper models and 7B LLMs cannot remain resident concurrently without causing swapping or Out-Of-Memory (OOM) on a 5GB free memory machine.
- **Solution:**
  1. **Faster-Whisper Auto-Unload:** The `apps/stt` sidecar unloads the whisper model and triggers Python `gc.collect()` after 300 seconds of idle inactivity.
  2. **Ollama `keep_alive: "2m"`:** Ollama is explicitly commanded to release model weights from memory after 2 minutes of idle time.
  3. **PostgreSQL Capped Buffer:** Docker Compose specifies `shared_buffers=128MB` and `max_connections=40`.

### B. Single Transcription Pass (50% CPU Time Savings)
- Older dual-pass implementations ran Whisper twice: once for native transcription, once for English translation. On a 4C/8T CPU, this doubled processing time to 0.72x real-time factor.
- **TaskCatch Single-Pass:** Transcribes once in the original spoken dialect (`text_original`), and extracts/translates to English in a single LLM prompt pass (`text_english`). This cuts Whisper CPU time by 50% without sacrificing task extraction precision.

### C. Indian Relative Date Resolution (`Asia/Calcutta`)
- Integrated `@taskcatch/shared` date resolver converts colloquial spoken deadlines into strict ISO timestamps anchored to the recording time:
  - Hindi: *"kal shaam"*, *"parso subah"*, *"agle somvar"*
  - Gujarati: *"આવતીકાલે બપોરે"*, *"કાલે સાંજે"*, *"આવતા શુક્રવારે"*, *"પરમ દિવસે"*
  - Hinglish: *"next Monday 5 pm"*, *"aaj raat tak"*

### D. Zero Audio Loss Resilience
- **Phone:** Audio chunks are saved in IndexedDB *before* attempting HTTP upload. Interrupted recordings (call received, app backgrounded, lock screen) stay queued and flush upon reconnection.
- **Desktop:** Recorded via local ffmpeg process directly to disk before streaming to the API.
