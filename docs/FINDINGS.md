# Findings from Existing Local Codebases

This document summarizes findings from inspecting `/home/lenovo/Solar-monitoring` and `/home/lenovo/intellisolar-crm` (read-only inspection).

---

## 1. Speech-to-Text & Audio (`/home/lenovo/Solar-monitoring`)

### A. Core Engine & Runtime
- **Library**: `faster-whisper` (CTranslate2 execution engine) running locally on CPU.
- **Compute config**: `compute_type="int8"`, `cpu_threads=4`, deterministic temperature `0.0`.
- **VAD (Voice Activity Detection)**: Built-in Silero VAD (`vad_filter=True`, `min_silence_duration_ms=500`) strips non-speech audio before inference, drastically reducing inference latency and hallucinations.
- **Beam size**: `beam_size=2` gives an optimal balance between execution speed and transcription accuracy on CPU.
- **Repetition penalty**: `repetition_penalty=1.2` eliminates repetitive token looping (e.g., looping Hindi fillers).

### B. Language Handling & Accuracy Tricks
- **Domain initial prompt**:
  Passes a multilingual prompt mixing English, Hindi (Devanagari), and Gujarati to prime the Whisper tokenizer:
  ```python
  initial_prompt = "Work instructions, tasks, deadlines, Hindi, Gujarati, English, Hinglish... काम, मीटिंग, असाइनमेंट, તારીખ, કામ..."
  ```
- **Language Detection & Dual-Pass Strategy**:
  1. **Pass 1 (`task="transcribe"`)**: Transcribes spoken audio in original language/script and outputs `info.language` and `info.language_probability`.
  2. **Pass 2 (`task="translate"`)**: If the detected language is non-English, Whisper runs native translation directly into English within the same model execution, avoiding external translation latency or rate limits.
- **Urdu -> Hindi dialect normalization**: Whisper often classifies spoken Hindustani as Urdu (`ur`). In Indian business context, `ur` is mapped to `hi` for correct script representation and downstream translation.
- **Latin Script False-Positive Guard**: When Whisper classifies short English audio as non-Latin (e.g. `hi` or `gu`), but >75% of characters are Latin, the detection is overridden to `en`.
- **Hallucination Shield**: Phantom foreign language classifications (e.g. `ru`, `zh`) on noisy or silent clips are caught and overridden.

### C. Client-Side Audio Recording (`useCommentAudioRecorder.ts`)
- Dynamically queries `MediaRecorder.isTypeSupported` across `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`, `audio/ogg`.
- Safely tracks elapsed time, buffers chunks, limits file size, and ensures all `MediaStreamTrack` instances are released on unmount or completion.

### D. Adaptations for TaskCatch
- **Timestamp extraction**: TaskCatch requires segment-level and word-level timestamps (`start_ms`, `end_ms`) so tasks can directly link to playable audio timestamps.
- **Long audio chunking**: 60-second chunks with 2-second overlaps, merging segments and de-duplicating cross-boundary sentences.
- **Hinglish/Gujarati Nuance Extraction**: Whisper translation is fast; for code-mixed Hinglish idioms and relative date references ("kal shaam", "parso dopahar", "agle somvar"), the local Ollama LLM performs the final structured task extraction pass.

---

## 2. Firebase Push & Notification System (`/home/lenovo/intellisolar-crm`)

### A. Firebase Admin Backend Initialization (`platform-new/config/firebaseAdmin.ts`)
- **Initialization hierarchy**:
  1. `FIREBASE_SERVICE_ACCOUNT_JSON`: Inline JSON string in environment.
  2. `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (with `\n` replacement).
  3. `FIREBASE_SERVICE_ACCOUNT_PATH`: Absolute path to the service account JSON file.
- **Active local file**: Service account JSON exists at:
  `/home/lenovo/intellisolar-crm/platform-new/intellisolar-crm-notification-firebase-adminsdk-fbsvc-3dd6575ad9.json`
- **Security Rule Adherence**:
  - TaskCatch **will not** copy this file into the repository.
  - TaskCatch configures `FIREBASE_SERVICE_ACCOUNT_PATH=/home/lenovo/intellisolar-crm/platform-new/...` in its local `.env`.
  - `.env` and `*.json` service accounts are ignored in `.gitignore`.
  - Firebase project is completely switchable via environment variables without code modification.

### B. FCM Sending & Token Hygiene (`platform-new/utils/notificationService.ts`)
- **Single send**: `admin.messaging().send(message)` with `android: { priority: 'high' }` and `apns: { payload: { aps: { sound: 'default' } } }`.
- **Batch send**: `admin.messaging().sendEach(messages)` with token response mapping.
- **Payload data format**: All custom data keys and values must be strings: `toFirebaseData(payload.data)`.
- **Invalid token pruning**: Detects error codes:
  - `messaging/registration-token-not-registered`
  - `messaging/invalid-registration-token`
  and immediately deletes unviable tokens from the database.

### C. Client & Service Worker Push (`client/src/utils/firebase.ts` & `public/firebase-messaging-sw.js`)
- Client initializes Firebase Web SDK using public Vite env vars:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_VAPID_KEY` (Verified present in client `.env`, length 87)
- Service Worker registration dynamically appends public config as query parameters:
  ```javascript
  navigator.serviceWorker.register('/firebase-messaging-sw.js?' + params.toString())
  ```
- Service Worker loads `firebase-app-compat.js` and `firebase-messaging-compat.js` (v10.12.2), registers `onBackgroundMessage`, and on `notificationclick` searches existing tabs to focus/navigate or opens a new window.

---

## 3. Recommended Architectural Defaults for TaskCatch

1. **Python STT Sidecar**:
   - FastAPI microservice running under `uv` on Python 3.11 (`cpython-3.11.16`).
   - Default engine: `faster-whisper` (`base` / `small` / `medium`) with int8 quantization, Silero VAD, Indian languages initial prompt, and segment timestamps.
   - Secondary provider: HuggingFace AI4Bharat IndicConformer / IndicWhisper.
2. **Node.js API**:
   - Fastify + TypeScript + Drizzle ORM + SQLite (WAL mode, FTS5).
   - In-process SQLite-backed job queue for chunking, transcription, translation, and extraction.
   - Dedicated `devices` table mapping user devices to platform (`web`, `desktop`, `phone`) and FCM registration tokens.
   - Reminder engine checking every 30s with automatic deduplication, retry, and token eviction.
