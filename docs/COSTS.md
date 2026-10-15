# Project Costs and Dependency Free-Tier Matrix

TaskCatch strictly adheres to the **Zero-Cost / Free-Only Rule**. No paid APIs, no recurring subscriptions, and no credit card required.

---

## 1. Core Stack Dependencies

| Component | Technology | License | Cost / Free Limits |
| :--- | :--- | :--- | :--- |
| **Backend Runtime** | Node.js (v20+) | MIT | Free / Open Source |
| **Web Framework** | Fastify | MIT | Free / Open Source |
| **Database** | SQLite + better-sqlite3 | Public Domain / MIT | Free / Embedded Local File |
| **ORM & Migrations** | Drizzle ORM | Apache-2.0 | Free / Open Source |
| **Full-Text Search** | SQLite FTS5 | Public Domain | Free / Built into SQLite |
| **Validation** | Zod | MIT | Free / Open Source |
| **Logging** | Pino | MIT | Free / Open Source |
| **Realtime WebSockets** | `@fastify/websocket` / `ws` | MIT | Free / In-process local connections |
| **Media Preprocessing** | ffmpeg | LGPL / GPL | Free / System package |

---

## 2. Speech-to-Text Providers (`SpeechProvider`)

| Provider | Engine | License | Cost / Operational Limits |
| :--- | :--- | :--- | :--- |
| **Primary (Default)** | `faster-whisper` (CTranslate2) | MIT | **100% Free / Local CPU**. No network needed. Configurable models (`base`, `small`, `medium`). |
| **Indic Specialist** | AI4Bharat IndicConformer / IndicWhisper | MIT / Apache-2.0 | **100% Free / Local CPU/GPU**. Open weights hosted via HuggingFace. |
| **Cloud Fallback (Optional, Disabled)** | Groq Whisper Cloud API | Proprietary Free Tier | **Free Tier**: 20 requests/min, 2,000 req/day (rate limited). Disabled by default. |

---

## 3. LLM Translation & Task Extraction Providers (`LLMProvider`)

| Provider | Model | License | Cost / Operational Limits |
| :--- | :--- | :--- | :--- |
| **Primary (Default)** | Ollama (Local `qwen2.5:7b-instruct` or `llama3.1:8b`) | MIT (Ollama), Apache 2.0 (Qwen), Community (Llama) | **100% Free / Offline Local execution**. Runs completely within system RAM / CPU. Zero data egress. |
| **Cloud Fallback (Optional, Disabled)** | Google Gemini Free API (`gemini-1.5-flash` / `gemini-2.0-flash`) | Google API Terms | **Free Tier**: 15 RPM, 1,500 RPD, 1M TPM. No credit card required on free quota. Disabled by default. |

---

## 4. Push Notifications & Networking

| Service | Usage in TaskCatch | Tier / License | Cost Details |
| :--- | :--- | :--- | :--- |
| **Firebase Cloud Messaging (FCM)** | Mobile PWA & Web Push reminders | Google Firebase **Spark Plan** | **100% Free Forever**. Unlimited FCM notification messages. Does not use Cloud Functions, Firestore triggers, or any Blaze plan features. |
| **Tailscale** | Secure remote access from mobile to laptop over HTTPS (`tailscale serve`) | Free Personal Plan | **100% Free**. Up to 100 devices and 3 users. Unlimited bandwidth peer-to-peer. |

---

## 5. Client & Desktop Applications

| Component | Technology | License | Cost / Operational Limits |
| :--- | :--- | :--- | :--- |
| **Web Client / PWA** | React 18/19, Vite, Tailwind CSS, shadcn/ui | MIT | Free / Self-hosted on local Fastify server |
| **Desktop Widget** | Electron | MIT | Free / Packaged locally as AppImage and `.deb` |
| **Audio Recording** | Web Audio & MediaRecorder API | W3C Standard | Free / Browser native API |
| **Offline Cache** | IndexedDB (`idb`) | MIT / Browser native | Free / Local client device storage |

---

## 6. Testing & Development Tooling

| Tool | Purpose | License |
| :--- | :--- | :--- |
| **Vitest** | Unit & integration testing | MIT |
| **Playwright** | E2E browser automation | Apache-2.0 |
| **ESLint & Prettier** | Code linting and formatting | MIT |
| **uv** | Ultra-fast Python package management | MIT / Apache-2.0 |

---

## Summary
Total monthly operating cost: **$0.00 / ₹0.00**.
Everything runs either locally on the user's Ubuntu laptop or within Google's and Tailscale's permanent free tiers.
