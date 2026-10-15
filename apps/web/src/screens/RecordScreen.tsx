import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  Square,
  Bookmark,
  Volume2,
  Clock,
  Sparkles,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import { audioRecorder } from "../services/audioRecorder";
import { AudioWaveform } from "../components/AudioWaveform";
import { apiRequest } from "../api";
import { useWebSocket } from "../context/WebSocketContext";

interface RecordScreenProps {
  onSessionFinished?: (sessionId: string) => void;
  onNavigateToReview?: () => void;
}

export const RecordScreen: React.FC<RecordScreenProps> = ({
  onSessionFinished,
  onNavigateToReview,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [volume, setVolume] = useState(0);
  const [freqData, setFreqData] = useState<Uint8Array | undefined>(undefined);
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; time: number; label: string }>>([]);
  const [statusText, setStatusText] = useState("Ready to record");
  const [isFinishing, setIsFinishing] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const { isConnected } = useWebSocket();

  // Setup visualizer callback
  useEffect(() => {
    audioRecorder.onVolumeChange = (vol, freq) => {
      setVolume(vol);
      setFreqData(freq);
    };
    audioRecorder.onChunkUploaded = (partNumber) => {
      setStatusText(`Streaming chunk #${partNumber + 1} to server...`);
    };
    return () => {
      audioRecorder.onVolumeChange = undefined;
      audioRecorder.onChunkUploaded = undefined;
    };
  }, []);

  // Timer interval
  useEffect(() => {
    if (isRecording) {
      startTimeRef.current = Date.now() - elapsedSeconds * 1000;
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const handleStartRecording = async () => {
    setError(null);
    setCompletedSessionId(null);
    setBookmarks([]);
    setElapsedSeconds(0);
    try {
      // 1. Create a session on the server
      setStatusText("Initializing session...");
      const res = await apiRequest<{ session: { id: string } }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          deviceId: "pwa_mobile",
          status: "recording",
        }),
      });

      const newSessionId = res.session.id;
      setSessionId(newSessionId);

      // 2. Start recording with audioRecorder service
      await audioRecorder.startRecording(newSessionId);
      setIsRecording(true);
      setStatusText("Recording live conversation... Wake Lock active");
    } catch (err: any) {
      setError(err.message || "Failed to start microphone recording. Check permissions.");
      setStatusText("Recording error");
    }
  };

  const handleStopRecording = async () => {
    if (!sessionId) return;
    setIsFinishing(true);
    setStatusText("Saving audio & queuing AI transcription...");
    try {
      const finishedId = await audioRecorder.stopRecording();
      setIsRecording(false);
      setCompletedSessionId(finishedId);
      setStatusText("Recording completed! Background processing queued.");
      if (onSessionFinished) onSessionFinished(finishedId);
    } catch (err: any) {
      setError("Error finalizing recording: " + err.message);
      setStatusText("Finalization error");
    } finally {
      setIsFinishing(false);
    }
  };

  const handleAddBookmark = async () => {
    if (!isRecording || !sessionId) return;
    const currentMs = elapsedSeconds * 1000;
    try {
      const res = await audioRecorder.addBookmark(`Bookmark at ${formatTime(elapsedSeconds)}`);
      setBookmarks((prev) => [
        ...prev,
        {
          id: res?.bookmark?.id || String(Date.now()),
          time: elapsedSeconds,
          label: `Bookmark ${prev.length + 1}`,
        },
      ]);
    } catch (err) {
      console.warn("Bookmark failed", err);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] text-center space-y-6">
      {/* Top Title & Distraction-Free Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {isRecording ? "Listening to Conversation" : "Audio Capture"}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isRecording
            ? "TaskCatch is securely recording instructions in the background"
            : "Record live conversations in Hindi, Gujarati, Hinglish or English"}
        </p>
      </div>

      {/* Timer Display */}
      <div className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 font-mono text-3xl font-bold text-slate-800 dark:text-slate-100">
        <Clock className={`w-6 h-6 ${isRecording ? "text-rose-500 animate-pulse" : "text-slate-400"}`} />
        <span>{formatTime(elapsedSeconds)}</span>
      </div>

      {/* Waveform Visualizer */}
      <div className="w-full max-w-sm">
        <AudioWaveform volume={volume} frequencyData={freqData} isRecording={isRecording} />
      </div>

      {/* Primary Action Button (Huge tactile button) */}
      <div className="relative my-2">
        {!isRecording ? (
          <button
            onClick={handleStartRecording}
            disabled={isFinishing}
            className="w-28 h-28 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-xl shadow-rose-500/25 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 group"
          >
            <Mic className="w-10 h-10 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Record</span>
          </button>
        ) : (
          <button
            onClick={handleStopRecording}
            disabled={isFinishing}
            className="w-28 h-28 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-700 dark:to-slate-800 text-white shadow-xl shadow-slate-900/30 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 border-4 border-rose-500 animate-pulse"
          >
            <Square className="w-8 h-8 fill-current text-rose-500" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Stop</span>
          </button>
        )}
      </div>

      {/* Bookmark Button (Tactile Action during recording) */}
      {isRecording && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleAddBookmark}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <Bookmark className="w-4 h-4 fill-current" />
            <span>Bookmark Moment</span>
          </button>
          <span className="text-[11px] text-slate-400">
            Boosts AI confidence for tasks discussed near this timestamp
          </span>
        </div>
      )}

      {/* Bookmarks captured count */}
      {bookmarks.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-mono">
          <Bookmark className="w-3.5 h-3.5 fill-current" />
          <span>{bookmarks.length} bookmark(s) saved</span>
        </div>
      )}

      {/* Status Bar */}
      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5 font-medium">
        <span
          className={`w-2 h-2 rounded-full ${
            isRecording
              ? "bg-rose-500 animate-ping"
              : isFinishing
              ? "bg-amber-500 animate-pulse"
              : "bg-slate-400"
          }`}
        />
        <span>{statusText}</span>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 max-w-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-left">{error}</span>
        </div>
      )}

      {/* Post-recording Next Steps */}
      {completedSessionId && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs space-y-3 max-w-sm w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Session uploaded & queued for processing!</span>
          </div>
          <p className="text-emerald-700 dark:text-emerald-400 text-[11px] leading-relaxed">
            The background worker is running faster-whisper and LLM task extraction. You will receive a notification when tasks are ready for review.
          </p>
          {onNavigateToReview && (
            <button
              onClick={onNavigateToReview}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs shadow-sm"
            >
              Go to Review Inbox
            </button>
          )}
        </div>
      )}

      {/* Privacy reminder */}
      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-4">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
        <span>Audio is processed locally on your machine and strictly private.</span>
      </div>
    </div>
  );
};
