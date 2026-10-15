import fs from "node:fs";
import path from "node:path";
import type { SpeechProvider, SpeechTranscriptionResult, SpeechSegmentResult } from "@taskcatch/shared";
import { config } from "../config.js";

export class FasterWhisperSpeechProvider implements SpeechProvider {
  name = "faster-whisper";

  constructor(private serviceUrl: string = config.sttServiceUrl) {}

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await fetch(`${this.serviceUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = (await res.json()) as any;
        return { ok: true, message: `STT sidecar active (model: ${data.active_model || "unloaded"})` };
      }
      return { ok: false, message: `STT sidecar returned HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: `Cannot connect to STT sidecar at ${this.serviceUrl}: ${err.message}` };
    }
  }

  async transcribe(
    audioFilePath: string,
    vocabularyHints?: string,
    options?: { task?: "transcribe" | "translate"; modelSize?: string }
  ): Promise<SpeechTranscriptionResult> {
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    const fileBuffer = fs.readFileSync(audioFilePath);
    const fileName = path.basename(audioFilePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append("file", blob, fileName);

    if (vocabularyHints) {
      formData.append("initial_prompt", vocabularyHints);
    }
    if (options?.task) {
      formData.append("task", options.task);
    }
    if (options?.modelSize) {
      formData.append("model_size", options.modelSize);
    }

    const response = await fetch(`${this.serviceUrl}/transcribe`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`STT Sidecar transcription failed [${response.status}]: ${errText}`);
    }

    const data = (await response.json()) as any;

    const segments: SpeechSegmentResult[] = (data.segments || []).map((seg: any) => ({
      start_ms: seg.start_ms || 0,
      end_ms: seg.end_ms || 0,
      speaker: seg.speaker || "Speaker 1",
      text_original: seg.text_original || "",
      text_english: seg.text_english || seg.text_original || "",
      confidence: seg.confidence !== undefined ? seg.confidence : 0.85,
    }));

    return {
      language_detected: data.language_detected || "en",
      language_probability: data.language_probability || 0.9,
      segments,
    };
  }
}
