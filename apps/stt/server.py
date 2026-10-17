import asyncio
import gc
import io
import math
import os
import resource
import time
import unicodedata
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional, List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None


# ── Indian Language Normalisation and Quirks ────────────────────────────────
_LANG_NORMALISE = {
    "hi": "hi", "gu": "gu", "en": "en", "mr": "mr", "bn": "bn", "ta": "ta",
    "te": "te", "kn": "kn", "pa": "pa", "ur": "hi", # Remap Urdu to Hindi for Indian domain
    "sd": "sd", "or": "or", "as": "as", "ne": "ne",
}

_NON_LATIN_LANGS = frozenset({
    "hi", "gu", "mr", "bn", "ta", "te", "kn", "pa", "ur", "sd", "or", "as", "ne",
    "ar", "ru", "zh", "ja", "ko",
})

_ENGLISH_CODES = frozenset({"en", "en-in", "en-us", "en-gb"})

DEFAULT_INITIAL_PROMPT = (
    "TaskCatch work instructions capture. Indian workplace context: Hindi, Gujarati, English, Hinglish. "
    "Client, meeting, deadline, kal, parso, agle somvar, aaj shaam, inverter, solar, deployment, PR, review, commit. "
    "કામ, મીટિંગ, આવતીકાલે, સોમવારે, ટાસ્ક, ઇન્વર્ટર. "
    "काम, मीटिंग, कल, परसों, सोमवार, टास्क, अप्रूवल, रिव्यू."
)

def is_predominantly_latin(text: str, threshold: float = 0.70) -> bool:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return True
    latin_count = sum(1 for c in letters if ord(c) < 128 or "LATIN" in unicodedata.name(c, "").upper())
    return (latin_count / len(letters)) >= threshold

def get_process_memory_mb() -> float:
    # ru_maxrss is in kilobytes on Linux
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(usage / 1024.0, 2)


# ── Model Manager with Idle Unloading ───────────────────────────────────────
class STTModelManager:
    def __init__(self):
        self.model: Optional[WhisperModel] = None
        self.active_model_size: Optional[str] = None
        self.last_used_timestamp: float = 0.0
        self.idle_timeout_seconds: float = 300.0  # Unload after 5 minutes of inactivity
        self.lock = asyncio.Lock()
        self.device = os.environ.get("WHISPER_DEVICE", "cpu")
        self.compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
        self.cpu_threads = int(os.environ.get("WHISPER_CPU_THREADS", "4"))

    def get_model(self, model_size: str = "small") -> WhisperModel:
        if WhisperModel is None:
            raise RuntimeError("faster_whisper is not installed in the environment.")

        if self.model is None or self.active_model_size != model_size:
            print(f"[STT] Loading Faster-Whisper model '{model_size}' (device={self.device}, compute={self.compute_type}, threads={self.cpu_threads})...")
            start = time.time()
            self.model = WhisperModel(
                model_size,
                device=self.device,
                compute_type=self.compute_type,
                cpu_threads=self.cpu_threads,
            )
            self.active_model_size = model_size
            print(f"[STT] Model '{model_size}' loaded in {time.time() - start:.2f}s. Memory RSS: {get_process_memory_mb()} MB")

        self.last_used_timestamp = time.time()
        return self.model

    def unload(self):
        if self.model is not None:
            print(f"[STT] Unloading Faster-Whisper model '{self.active_model_size}' from memory to enforce resource budget...")
            del self.model
            self.model = None
            self.active_model_size = None
            gc.collect()
            print(f"[STT] Model unloaded. Current RSS: {get_process_memory_mb()} MB")

    async def idle_reaper_loop(self):
        while True:
            await asyncio.sleep(30)
            if self.model is not None:
                idle_sec = time.time() - self.last_used_timestamp
                if idle_sec > self.idle_timeout_seconds:
                    print(f"[STT] Idle timeout exceeded ({idle_sec:.1f}s > {self.idle_timeout_seconds}s). Releasing model.")
                    self.unload()


manager = STTModelManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    reaper_task = asyncio.create_task(manager.idle_reaper_loop())
    try:
        yield
    finally:
        reaper_task.cancel()


app = FastAPI(title="TaskCatch STT Sidecar", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    idle_sec = round(time.time() - manager.last_used_timestamp, 1) if manager.model else -1
    return {
        "status": "ok",
        "service": "taskcatch-stt",
        "model_loaded": manager.model is not None,
        "active_model": manager.active_model_size,
        "idle_seconds": idle_sec,
        "memory_rss_mb": get_process_memory_mb(),
    }

@app.post("/unload")
async def unload_model():
    manager.unload()
    return {"status": "unloaded", "memory_rss_mb": get_process_memory_mb()}


def _transcribe_sync(
    audio_bytes: bytes,
    model_size: str,
    language_hint: Optional[str],
    task: str,
    initial_prompt: Optional[str],
):
    model = manager.get_model(model_size)
    audio_buf = io.BytesIO(audio_bytes)

    forced_lang = None
    if language_hint and language_hint.strip() and language_hint.lower() not in ("auto", "none"):
        forced_lang = _LANG_NORMALISE.get(language_hint.lower(), language_hint)

    transcribe_kwargs = {
        "beam_size": 2,
        "temperature": 0.0,
        "vad_filter": True,
        "vad_parameters": dict(min_silence_duration_ms=500),
        "repetition_penalty": 1.2,
        "no_speech_threshold": 0.6,
        "task": task,
    }

    if forced_lang:
        transcribe_kwargs["language"] = forced_lang
    else:
        transcribe_kwargs["language"] = None
        transcribe_kwargs["initial_prompt"] = initial_prompt or DEFAULT_INITIAL_PROMPT

    segments_gen, info = model.transcribe(audio_buf, **transcribe_kwargs)

    raw_lang = info.language or "en"
    lang_prob = info.language_probability or 0.0
    detected_lang = _LANG_NORMALISE.get(raw_lang, raw_lang)

    segments_list = []
    idx = 0
    full_text = []

    for seg in segments_gen:
        text = seg.text.strip()
        if not text:
            continue
        full_text.append(text)
        conf = round(math.exp(seg.avg_logprob), 3) if seg.avg_logprob else 0.8
        segments_list.append({
            "segment_index": idx,
            "start_ms": int(seg.start * 1000),
            "end_ms": int(seg.end * 1000),
            "speaker": "Speaker 1",
            "text_original": text,
            "text_english": text if task == "translate" else "",
            "confidence": min(max(conf, 0.1), 1.0),
        })
        idx += 1

    total_text = " ".join(full_text)

    # Indian domain remapping rules
    if detected_lang == "ur":
        detected_lang = "hi"

    if detected_lang in _NON_LATIN_LANGS and is_predominantly_latin(total_text, threshold=0.70):
        detected_lang = "en"

    duration = round(info.duration, 2) if hasattr(info, "duration") else 0.0

    return {
        "language_detected": detected_lang,
        "language_probability": round(lang_prob, 3),
        "duration_sec": duration,
        "segments": segments_list,
        "full_text": total_text,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    task: Optional[str] = Form("transcribe"),
    initial_prompt: Optional[str] = Form(None),
    model_size: Optional[str] = Form("small"),
):
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty audio file uploaded.")

        async with manager.lock:
            result = await asyncio.to_thread(
                _transcribe_sync,
                content,
                model_size or "small",
                language,
                task or "transcribe",
                initial_prompt,
            )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe/stream")
async def transcribe_stream(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    task: Optional[str] = Form("transcribe"),
    initial_prompt: Optional[str] = Form(None),
    model_size: Optional[str] = Form("small"),
):
    """Streams SSE events segment-by-segment as audio is processed."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    async def event_generator():
        try:
            async with manager.lock:
                model = manager.get_model(model_size or "small")
                audio_buf = io.BytesIO(content)

                forced_lang = None
                if language and language.strip() and language.lower() not in ("auto", "none"):
                    forced_lang = _LANG_NORMALISE.get(language.lower(), language)

                transcribe_kwargs = {
                    "beam_size": 2,
                    "temperature": 0.0,
                    "vad_filter": True,
                    "vad_parameters": dict(min_silence_duration_ms=500),
                    "repetition_penalty": 1.2,
                    "task": task or "transcribe",
                }
                if forced_lang:
                    transcribe_kwargs["language"] = forced_lang
                else:
                    transcribe_kwargs["initial_prompt"] = initial_prompt or DEFAULT_INITIAL_PROMPT

                segments_gen, info = model.transcribe(audio_buf, **transcribe_kwargs)

                yield f"data: {{\"type\": \"start\", \"language\": \"{info.language}\", \"duration\": {info.duration}}}\n\n"

                idx = 0
                for seg in segments_gen:
                    t = seg.text.strip()
                    if not t:
                        continue
                    conf = round(math.exp(seg.avg_logprob), 3) if seg.avg_logprob else 0.8
                    seg_data = {
                        "type": "segment",
                        "segment_index": idx,
                        "start_ms": int(seg.start * 1000),
                        "end_ms": int(seg.end * 1000),
                        "text": t,
                        "confidence": min(max(conf, 0.1), 1.0),
                    }
                    import json
                    yield f"data: {json.dumps(seg_data)}\n\n"
                    idx += 1

                yield "data: {\"type\": \"done\"}\n\n"
        except Exception as err:
            import json
            yield f"data: {json.dumps({'type': 'error', 'error': str(err)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
