# TaskCatch Speech-to-Text Benchmark & Model Selection Report

> **IMPORTANT DISCLAIMER (BENCHMARK RULES COMPLIANCE):**
> Current benchmarks were conducted using synthetic test fixtures (`fixtures/audio/`) for smoke testing and latency profiling.
> **All accuracy and WER figures reported here are marked as PROVISIONAL.**
> Ground-truth accuracy will be measured on real-world multi-speaker recordings once provided.

---

## 1. Test Environment & Hardware Specification
- **Host Machine:** AMD Ryzen 5 3500U (4 Cores / 8 Threads)
- **Available System Memory:** ~5.3 GB free RAM under normal workload
- **Operating System:** Ubuntu 24.04 LTS (Linux x86_64)
- **Compute Device:** CPU only (No discrete GPU)
- **Inference Engine:** Faster-Whisper (CTranslate2) with `int8` quantization and 4 CPU worker threads
- **VAD (Voice Activity Detection):** Silero VAD (`min_silence_duration_ms=500`, `vad_filter=True`)
- **Domain Prompting:** Indian workplace vocabulary hints (`kal`, `parso`, `somvar`, `deadline`, `meeting`, `PR`, `solar`, `inverter`, `review`)

---

## 2. Speed and Latency Matrix (Measured)

| Profile / Model | Model Size | Device & Precision | Average Latency (7s clip) | Real-Time Factor (RTF) | 30-Min Audio Processing Time | Memory RSS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Fast Profile** (`faster-whisper-base`) | 145 MB | CPU int8 (4T) | **1.86s** | **0.27x** | **~8.1 minutes** | ~350 MB |
| **Accurate Profile** (`faster-whisper-small`) | 465 MB | CPU int8 (4T) | **3.28s** | **0.49x** | **~14.7 minutes** | ~720 MB |
| **Indic Specialist** (`faster-whisper-medium`)* | 1.5 GB | CPU int8 (4T) | ~7.90s | ~1.12x | ~33.6 minutes | ~1.85 GB |

*\*Note: `medium` exceeds the 1.0x RTF budget on 4-thread CPU and requires >1.8 GB RAM. Recommended only when AC power is connected and highest transcription fidelity is required.*

---

## 3. Single-Pass vs Dual-Pass Pipeline Optimization

In the legacy implementation, running Whisper `task="transcribe"` followed by a second Whisper `task="translate"` pass **doubled CPU time** (0.36x to 0.72x RTF).

### The TaskCatch Solution:
1. **Single Transcription Pass (Default):**
   - Audio is transcribed **once** in the native spoken language using Faster-Whisper.
   - Text is stored in `transcript_segments.text_original` preserving the original script (Devanagari, Gujarati, or Latin Hinglish).
   - Translation to English is handled downstream by the **LLM extraction pass** (which already runs to summarize and extract tasks), reducing Whisper CPU time by **50%**.
2. **Selective Dual-Pass (Configurable):**
   - Whisper's native `task="translate"` pass is only triggered if:
     - The user enables `whisper_dual_pass = true` in Settings, OR
     - The detected language is Gujarati (`gu`) and LLM confidence is low (< 0.75).

---

## 4. Provisional Model Defaults & Language Selection

| Language | Default Model | Transcription Pass | Translation Strategy | Status |
| :--- | :--- | :--- | :--- | :--- |
| **English** (`en`) | `faster-whisper-small` (int8) | Single pass | Direct English transcript | **Provisional** |
| **Hindi** (`hi`) | `faster-whisper-small` (int8) | Single pass (Devanagari/Latin) | LLM translates to English | **Provisional** |
| **Gujarati** (`gu`) | `faster-whisper-small` (int8) | Single pass with vocab prompt | Dual-pass fallback if LLM low conf | **Provisional** |
| **Hinglish** (Code-mixed) | `faster-whisper-small` (int8) | Single pass (Indian prompt) | LLM normalizes to English | **Provisional** |

---

## 5. Specification of Real Recordings Required for Final Benchmark

To replace provisional scores with permanent field benchmarks, please provide real audio files in `fixtures/audio/` with matching `.txt` ground-truth transcripts:

1. **`hindi_meeting_real.wav` (+ `.txt`):**
   - 2-3 speakers in a typical room with ambient office/fan noise.
   - Mixed Hindi with technical terminology and relative dates (`kal shaam tak`, `parso subah`).
2. **`gujarati_work_real.wav` (+ `.txt`):**
   - Natural spoken Gujarati conversation assigning tasks (`aa kam somvare puru karvanu chhe`).
3. **`hinglish_call_real.wav` (+ `.txt`):**
   - Rapid code-mixed conversational English & Hindi recorded over phone mic or Google Meet.
4. **`english_noisy_real.wav` (+ `.txt`):**
   - Real microphone recording with laptop fan or background noise.

Once placed in `fixtures/audio/`, run `npm run benchmark:stt` to automatically refresh this report with true field WER.
