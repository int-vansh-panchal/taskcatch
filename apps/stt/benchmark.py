#!/usr/bin/env python3
"""
TaskCatch STT Benchmark Script (Phase 0)
Evaluates transcription latency, memory usage, Real-Time Factor (RTF),
and Word Error Rate (WER) across models on Hindi, Gujarati, Hinglish, and English audio.

Usage:
    python benchmark.py --audio-dir ./fixtures/audio --models solar-approach small medium
    python benchmark.py --file sample.wav --ref "Reference transcript text"
"""

import argparse
import json
import os
import sys
import time
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Any

import soundfile as sf
from faster_whisper import WhisperModel

try:
    import jiwer
except ImportError:
    jiwer = None

# ── Normalization and Language Helpers (adapted from Solar-monitoring) ────────

_ENGLISH_CODES = frozenset({"en", "en-us", "en-gb", "en-in"})
_NON_LATIN_LANGS = frozenset({"hi", "gu", "ur", "mr", "bn", "ta", "te"})

DOMAIN_INITIAL_PROMPT = (
    "Work instructions, task assignments, deadlines, meetings, follow-ups. "
    "Hindi, Gujarati, Hinglish, English conversations. "
    "काम, असाइनमेंट, कल शाम, परसों, मीटिंग, रिव्यू, अर्जेंट. "
    "કામ, મીટિંગ, આવતીકાલે, પરમ દિવસે, મહત્વનું, ટાસ્ક."
)

def is_predominantly_latin(text: str, threshold: float = 0.75) -> bool:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return True
    latin_count = sum(1 for c in letters if ord(c) < 128 or "LATIN" in unicodedata.name(c, "").upper())
    return (latin_count / len(letters)) >= threshold

def calculate_wer(reference: str, hypothesis: str) -> Optional[float]:
    if not reference or not hypothesis or jiwer is None:
        return None
    try:
        # Standardize transforms: lower case, remove punctuation
        transform = jiwer.Compose([
            jiwer.ToLowerCase(),
            jiwer.RemovePunctuation(),
            jiwer.RemoveMultipleSpaces(),
            jiwer.Strip(),
        ])
        return round(float(jiwer.wer(reference, hypothesis, reference_transform=transform, hypothesis_transform=transform)) * 100, 2)
    except Exception:
        return None

def get_audio_duration(file_path: str) -> float:
    try:
        info = sf.info(file_path)
        return float(info.duration)
    except Exception:
        return 0.0

# ── Evaluator Implementations ────────────────────────────────────────────────

class ModelBenchmark:
    def __init__(self, model_key: str, model_size: str, device: str = "cpu", compute_type: str = "int8", cpu_threads: int = 4):
        self.model_key = model_key
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.cpu_threads = cpu_threads
        print(f"Loading {model_key} ({model_size}) on {device} ({compute_type}, {cpu_threads} threads)...")
        t0 = time.time()
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type, cpu_threads=cpu_threads)
        self.load_time = round(time.time() - t0, 2)
        print(f"Loaded {model_key} in {self.load_time}s")

    def transcribe(self, audio_path: str, is_solar_approach: bool = False) -> Dict[str, Any]:
        duration = get_audio_duration(audio_path)
        t_start = time.time()

        if is_solar_approach:
            # Solar-monitoring approach:
            # VAD filter, repetition penalty 1.2, beam size 2, domain prompt
            segments, info = self.model.transcribe(
                audio_path,
                beam_size=2,
                temperature=0.0,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
                repetition_penalty=1.2,
                no_speech_threshold=0.6,
                initial_prompt=DOMAIN_INITIAL_PROMPT,
                task="transcribe"
            )
            raw_segments = list(segments)
            original_text = " ".join(s.text.strip() for s in raw_segments)
            detected_lang = info.language or "en"
            lang_prob = round(float(info.language_probability or 0.0), 3)

            # Map Urdu dialect to Hindi in Indian context
            if detected_lang == "ur":
                detected_lang = "hi"

            # False-positive non-Latin override
            if detected_lang in _NON_LATIN_LANGS and is_predominantly_latin(original_text, 0.75):
                detected_lang = "en"

            # Second pass translate if non-English
            english_text = original_text
            if detected_lang not in _ENGLISH_CODES and original_text.strip():
                trans_segs, _ = self.model.transcribe(
                    audio_path,
                    beam_size=2,
                    temperature=0.0,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=500),
                    repetition_penalty=1.2,
                    no_speech_threshold=0.6,
                    task="translate"
                )
                english_text = " ".join(s.text.strip() for s in trans_segs)

        else:
            # Standard faster-whisper default pass
            segments, info = self.model.transcribe(
                audio_path,
                beam_size=5,
                temperature=0.0,
                vad_filter=True,
                task="transcribe"
            )
            raw_segments = list(segments)
            original_text = " ".join(s.text.strip() for s in raw_segments)
            detected_lang = info.language or "en"
            lang_prob = round(float(info.language_probability or 0.0), 3)
            english_text = original_text

        proc_time = round(time.time() - t_start, 3)
        rtf = round(duration / proc_time, 2) if proc_time > 0 else 0.0

        return {
            "model": self.model_key,
            "audio_duration_sec": round(duration, 2),
            "process_time_sec": proc_time,
            "real_time_factor": rtf,
            "detected_lang": detected_lang,
            "lang_prob": lang_prob,
            "original_text": original_text,
            "english_text": english_text,
        }

# ── Main Benchmark Runner ───────────────────────────────────────────────────

def run_benchmarks(audio_files: List[Path], models_to_run: List[str], output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)
    results = []

    model_registry = {
        "solar-approach": ("base", True),
        "solar-small": ("small", True),
        "small": ("small", False),
        "medium": ("medium", False),
        "large-v3": ("large-v3", False),
    }

    for m_name in models_to_run:
        if m_name not in model_registry:
            print(f"Warning: Unknown model {m_name}, skipping.")
            continue

        model_size, is_solar = model_registry[m_name]
        try:
            benchmark_engine = ModelBenchmark(
                model_key=m_name,
                model_size=model_size,
                device="cpu",
                compute_type="int8",
                cpu_threads=4,
            )
        except Exception as e:
            print(f"Failed to initialize {m_name}: {e}")
            continue

        for audio_path in audio_files:
            print(f"\nEvaluating '{audio_path.name}' on {m_name}...")
            # Look for matching reference text file (e.g., sample.wav -> sample.txt)
            ref_path = audio_path.with_suffix(".txt")
            ref_text = ref_path.read_text(encoding="utf-8").strip() if ref_path.exists() else None

            res = benchmark_engine.transcribe(str(audio_path), is_solar_approach=is_solar)
            res["filename"] = audio_path.name
            if ref_text:
                res["reference_text"] = ref_text
                res["wer"] = calculate_wer(ref_text, res["original_text"])
            else:
                res["wer"] = None

            print(f" -> Duration: {res['audio_duration_sec']}s | Time: {res['process_time_sec']}s | RTF: {res['real_time_factor']}x")
            print(f" -> Lang: {res['detected_lang']} ({res['lang_prob']})")
            print(f" -> Original: {res['original_text'][:90]}...")
            if is_solar:
                print(f" -> English:  {res['english_text'][:90]}...")
            if res.get("wer") is not None:
                print(f" -> WER: {res['wer']}%")

            results.append(res)

    # Save JSON report
    report_json = output_dir / "benchmark_results.json"
    with open(report_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # Format Markdown Table
    md_lines = [
        "# STT Benchmark Results\n",
        "| Audio File | Model | Duration (s) | Proc Time (s) | RTF (Speed) | Lang (Prob) | WER (%) | Original Preview | English Preview |",
        "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
    ]
    for r in results:
        wer_str = f"{r['wer']}%" if r['wer'] is not None else "N/A"
        orig_prev = r['original_text'].replace("\n", " ")[:40] + ("..." if len(r['original_text']) > 40 else "")
        eng_prev = r['english_text'].replace("\n", " ")[:40] + ("..." if len(r['english_text']) > 40 else "")
        md_lines.append(
            f"| `{r['filename']}` | **{r['model']}** | {r['audio_duration_sec']}s | {r['process_time_sec']}s | **{r['real_time_factor']}x** | {r['detected_lang']} ({r['lang_prob']}) | {wer_str} | {orig_prev} | {eng_prev} |"
        )

    md_report = output_dir / "benchmark_results.md"
    md_report.write_text("\n".join(md_lines), encoding="utf-8")
    print(f"\n Benchmark complete! Results saved to:\n  - {report_json}\n  - {md_report}")

def main():
    parser = argparse.ArgumentParser(description="TaskCatch STT Benchmark")
    parser.add_argument("--audio-dir", type=str, default="fixtures/audio", help="Directory containing audio clips (.wav, .mp3, .m4a, .webm)")
    parser.add_argument("--file", type=str, help="Single audio file to benchmark")
    parser.add_argument("--models", nargs="+", default=["solar-approach", "solar-small", "small"], help="Models to benchmark: solar-approach, solar-small, small, medium, large-v3")
    parser.add_argument("--output-dir", type=str, default="benchmark_output", help="Output directory for reports")
    args = parser.parse_args()

    audio_files = []
    if args.file:
        p = Path(args.file)
        if p.exists():
            audio_files.append(p)
        else:
            print(f"File not found: {args.file}")
            sys.exit(1)
    else:
        audio_dir = Path(args.audio_dir)
        if not audio_dir.exists() or not list(audio_dir.glob("*")):
            print(f"Directory '{args.audio_dir}' does not exist or is empty.")
            print("Please create fixtures/audio and add 10 recordings in Hindi, Gujarati, Hinglish, and English.")
            print("Optional: Add matching .txt files with ground truth to calculate WER automatically.")
            sys.exit(0)
        audio_files = [
            f for f in audio_dir.iterdir()
            if f.suffix.lower() in [".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac"]
        ]

    if not audio_files:
        print("No compatible audio files found.")
        sys.exit(1)

    run_benchmarks(audio_files, args.models, Path(args.output_dir))

if __name__ == "__main__":
    main()
