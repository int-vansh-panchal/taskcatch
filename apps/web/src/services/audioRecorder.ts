import { set, get, del, entries } from "idb-keyval";
import { apiRequest } from "../api";

export interface AudioChunkRecord {
  id: string; // `${sessionId}_${partNumber}`
  sessionId: string;
  partNumber: number;
  blob: Blob;
  createdAt: number;
}

export class AudioRecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private wakeLock: any = null;
  private sessionId: string | null = null;
  private partCounter = 0;
  private isRecording = false;

  public onVolumeChange?: (volume: number, frequencyData: Uint8Array) => void;
  public onChunkUploaded?: (partNumber: number) => void;

  async startRecording(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    this.partCounter = 0;

    // 1. Request Microphone stream
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 2. Setup Web Audio Analyser for live waveform visualization
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);
      this.startAnalyserLoop();
    }

    // 3. Acquire Screen Wake Lock if supported
    if ("wakeLock" in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request("screen");
      } catch (err) {
        console.warn("[Recorder] Wake Lock request failed:", err);
      }
    }

    // 4. Setup MediaRecorder with 10-second chunking
    const mimeType = this.getSupportedMimeType();
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      audioBitsPerSecond: 32000, // 32kbps opus mono is extremely lightweight and clear
    });

    this.mediaRecorder.ondataavailable = async (event: BlobEvent) => {
      if (event.data && event.data.size > 0 && this.sessionId) {
        const partNumber = this.partCounter++;
        await this.handleChunk(this.sessionId, partNumber, event.data);
      }
    };

    // Handle sudden interruptions (phone lock, tab backgrounded, call received)
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    this.isRecording = true;
    this.mediaRecorder.start(10000); // 10s chunk slices
  }

  async stopRecording(): Promise<string> {
    const currentSessionId = this.sessionId;
    this.isRecording = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch {
        // ignore
      }
      this.wakeLock = null;
    }

    document.removeEventListener("visibilitychange", this.handleVisibilityChange);

    // Finalize session on server
    if (currentSessionId) {
      await this.flushQueue(currentSessionId);
      await apiRequest(`/api/sessions/${currentSessionId}/finish`, {
        method: "POST",
      });
    }

    return currentSessionId || "";
  }

  async addBookmark(label?: string): Promise<any> {
    if (!this.sessionId) return;
    return apiRequest(`/api/sessions/${this.sessionId}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({
        timestampMs: Date.now(), // Handled relatively on server
        label: label || "Bookmark",
      }),
    });
  }

  private async handleChunk(sessionId: string, partNumber: number, blob: Blob) {
    const key = `chunk_${sessionId}_${partNumber}`;
    const record: AudioChunkRecord = {
      id: key,
      sessionId,
      partNumber,
      blob,
      createdAt: Date.now(),
    };

    // 1. Save to IndexedDB first (Crash-safe persistence)
    await set(key, record);

    // 2. Upload to server
    try {
      await this.uploadChunk(record);
      await del(key); // Remove from offline queue after successful upload
      if (this.onChunkUploaded) this.onChunkUploaded(partNumber);
    } catch (err) {
      console.warn(`[Recorder] Chunk ${partNumber} failed to upload, safely kept in IndexedDB queue:`, err);
    }
  }

  private async uploadChunk(record: AudioChunkRecord) {
    const formData = new FormData();
    formData.append("chunk", record.blob, `chunk_${record.partNumber}.webm`);
    formData.append("partNumber", String(record.partNumber));

    const token = localStorage.getItem("taskcatch_access_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/sessions/${record.sessionId}/chunks`, {
      method: "POST",
      headers,
      body: formData,
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`Upload failed HTTP ${res.status}`);
    }
  }

  private async flushQueue(sessionId: string) {
    try {
      const allEntries = await entries();
      for (const [key, val] of allEntries) {
        const item = val as AudioChunkRecord;
        if (item && item.sessionId === sessionId && item.blob) {
          try {
            await this.uploadChunk(item);
            await del(key);
          } catch {
            // Will retry on reconnect
          }
        }
      }
    } catch {
      // IndexedDB flush error
    }
  }

  private handleVisibilityChange = () => {
    if (document.hidden && this.isRecording && this.sessionId) {
      console.info("[Recorder] App backgrounded, recording continues with Wake Lock.");
    }
  };

  private startAnalyserLoop() {
    if (!this.analyser) return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const update = () => {
      if (!this.isRecording || !this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const volume = Math.min(1.0, avg / 128.0);

      if (this.onVolumeChange) {
        this.onVolumeChange(volume, dataArray);
      }
      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  private getSupportedMimeType(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/aac",
    ];
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }
}

export const audioRecorder = new AudioRecordingService();
