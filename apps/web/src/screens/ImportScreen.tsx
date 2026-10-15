import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileAudio,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { apiRequest } from "../api";

interface ImportScreenProps {
  onImportComplete?: (sessionId: string) => void;
  onNavigateToReview?: () => void;
}

export const ImportScreen: React.FC<ImportScreenProps> = ({
  onImportComplete,
  onNavigateToReview,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedSessionId, setUploadedSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check if Web Share Target supplied a file via URL params or IndexedDB
  useEffect(() => {
    // If incoming shared file was stored, retrieve it
    const checkSharedFile = async () => {
      // In PWA share target, files can be passed via form POST to /import or cached
    };
    checkSharedFile();
  }, []);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setError(null);
    setUploadedSessionId(null);
    const validExtensions = [".m4a", ".mp3", ".ogg", ".webm", ".wav", ".aac", ".flac"];
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();

    if (!validExtensions.includes(ext) && !file.type.startsWith("audio/")) {
      setError(`Unsupported audio format (${ext}). Supported: m4a, mp3, ogg, webm, wav.`);
      return;
    }

    if (file.size > 150 * 1024 * 1024) {
      setError("File exceeds 150 MB limit. Please trim the recording.");
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadProgress(10);
    setError(null);

    const formData = new FormData();
    formData.append("audio", selectedFile, selectedFile.name);

    try {
      const token = localStorage.getItem("taskcatch_access_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      setUploadProgress(40);
      const res = await fetch("/api/sessions/upload", {
        method: "POST",
        headers,
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed HTTP ${res.status}`);
      }

      setUploadProgress(100);
      const data = await res.json();
      const newSessionId = data.session?.id || "";
      setUploadedSessionId(newSessionId);
      setSelectedFile(null);
      if (onImportComplete) onImportComplete(newSessionId);
    } catch (err: any) {
      setError(err.message || "Failed to upload audio recording");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Import Audio Recording
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Upload phone voice memos, call recordings, or shared meeting files
        </p>
      </div>

      {/* Drag & Drop Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`p-8 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-all flex flex-col items-center justify-center space-y-3 ${
          dragOver
            ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 scale-[1.01]"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 hover:border-slate-400 dark:hover:border-slate-600"
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="audio/*,.m4a,.mp3,.ogg,.webm,.wav"
          className="hidden"
        />

        <div className="w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-900/60 text-brand-600 dark:text-brand-400 flex items-center justify-center shadow-sm">
          <UploadCloud className="w-7 h-7" />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Click to upload or drag & drop audio
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Supports M4A, MP3, WAV, WebM, OGG up to 150 MB
          </p>
        </div>

        <span className="text-[11px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">
          Normalized automatically to 16 kHz mono WAV via ffmpeg
        </span>
      </div>

      {/* Selected File Details */}
      {selectedFile && (
        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileAudio className="w-6 h-6 text-brand-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                {selectedFile.name}
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>

          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50 shrink-0"
          >
            {isUploading ? "Uploading..." : "Start Processing"}
          </button>
        </div>
      )}

      {/* Upload Progress Bar */}
      {isUploading && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500 font-mono">
            <span>Uploading audio...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Success Banner */}
      {uploadedSessionId && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs space-y-3 animate-in fade-in">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Audio uploaded & queued for faster-whisper transcription!</span>
          </div>
          <p className="text-emerald-700 dark:text-emerald-400 text-[11px] leading-relaxed">
            The worker will normalize audio, run VAD, transcribe in native script, translate to English, and extract tasks into the Review Inbox.
          </p>
          {onNavigateToReview && (
            <button
              onClick={onNavigateToReview}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs shadow-sm flex items-center justify-center gap-1.5"
            >
              <span>Go to Review Inbox</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Android Web Share Target Instruction */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
        <h3 className="font-semibold text-slate-700 dark:text-slate-300">
          Android Web Share Target
        </h3>
        <p className="text-[11px] leading-relaxed">
          When installed on Android via Chrome, you can share voice notes directly from Samsung Voice Recorder, WhatsApp Audio, or Files to TaskCatch.
        </p>
      </div>
    </div>
  );
};
