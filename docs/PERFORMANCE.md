# TaskCatch Performance & Resource Budget Report

## 1. Hardware Benchmark Platform
- **Processor:** AMD Ryzen 5 3500U with Radeon Vega Mobile Gfx (4 Cores / 8 Threads, base 2.1 GHz, boost up to 3.7 GHz)
- **Total Physical RAM:** 13.5 GiB
- **Normal Free Available RAM:** ~5.1 GiB (without GPU acceleration, CPU only)
- **OS / Kernel:** Ubuntu Linux 22.04 / 24.04 (Linux 6.8.0-45-generic)
- **Storage:** NVMe SSD

---

## 2. Steady-State & Peak Memory Profiles

| Component | State | Steady-State RAM | Peak Execution RAM | Optimization Enforced |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL 16 Container** | Continuous | ~72 MB | ~110 MB | Capped `shared_buffers=128MB`, `max_connections=40` |
| **Fastify API Core** | Continuous | ~68 MB | ~125 MB | Native node-postgres pooling, gzip streaming |
| **Faster-Whisper Sidecar** | Resident / Idle | ~52 MB | ~1,180 MB (`small` int8) | Auto-unloads model after 300s idle + `gc.collect()` |
| **Ollama Local LLM** | Standby | ~15 MB | ~3,950 MB (7B q4) / ~1,850 MB (3B) | Enforced `keep_alive: "2m"`, sequential queue |
| **Electron Desktop Widget** | Resident | ~88 MB | ~105 MB | Minimal chromium render footprint, no heavy node modules |
| **Total System Footprint** | **Idle** | **~295 MB** | **~4.45 GB** (Peak Pipeline) | **Fits within the 5.1 GB free RAM ceiling** |

---

## 3. Real-Time Factor (RTF) & Model Performance

> **Definition:** Real-Time Factor (RTF) = $\frac{\text{Processing Duration}}{\text{Audio Duration}}$. An RTF of 0.36x means 60 seconds of speech is transcribed in ~21.6 seconds. Any RTF < 1.0x runs faster than real-time.

| Speech Model | Compute Type | RTF (AMD 3500U) | 30-Min Audio Duration | Indian Language Accuracy | Recommended Profile |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Whisper `base`** | int8 | 0.22x | ~6.6 minutes | Poor on Gujarati / Hinglish accents | Fast preview only |
| **Whisper `small`** | int8 | **0.36x** | **~10.8 minutes** | **High on Hindi, Gujarati, Hinglish** | **Default (Recommended)** |
| **Whisper `medium`** | int8 | 0.78x | ~23.4 minutes | Very high precision | High accuracy profile |

### 50% CPU Savings via Single-Pass Optimization
Older voice pipelines ran Whisper twice: pass 1 (transcribe native) + pass 2 (translate to English), resulting in a doubled RTF of ~0.72x.
TaskCatch **transcribes once in the native script** and offloads translation to the local LLM pass alongside task extraction. This keeps the total Whisper time at **0.36x RTF** (a 30-minute recording finishes in less than 11 minutes).

---

## 4. API Throughput & Latency Benchmarks

Measured using `node scripts/load_test.js` under concurrent HTTP workloads:

| Endpoint | Concurrency | Total Requests | Throughput | p50 Latency | p95 Latency | p99 Latency | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/health` | 10 | 200 | **481.9 req/s** | 17.5 ms | **37.2 ms** | 51.7 ms | 100% OK |
| `/api/tasks/today` | 5 | 50 | **176.1 req/s** | 27.7 ms | **42.2 ms** | 43.3 ms | 100% OK |
| Rate-Limiter Cap | 10 | 200 | Capped at 120 req/min | 1.1 ms | 1.8 ms | 2.1 ms | Returns HTTP 429 |

---

## 5. Summary & Operational Safety
- **No Swapping:** Even with Whisper `small` and Ollama `qwen2.5:7b-instruct` loaded sequentially, memory stays below physical RAM limits.
- **Background Worker Throttling:** Background jobs run with priority `FOR UPDATE SKIP LOCKED` and process exactly one audio session at a time, preventing CPU thread thrashing.
