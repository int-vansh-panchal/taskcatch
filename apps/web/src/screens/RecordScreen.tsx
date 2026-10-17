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
  ShieldCheck,
  Radio,
  ArrowRight,
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
      setStatusText(`Streaming chunk #${partNumber + 1} to local sidecar...`);
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
      setStatusText("Initializing recording session...");
      const res = await apiRequest<{ session: { id: string } }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          deviceId: "pwa_web",
          status: "recording",
        }),
      });

      const newSessionId = res.session.id;
      setSessionId(newSessionId);

      // 2. Start recording with audioRecorder service
      await audioRecorder.startRecording(newSessionId);
      setIsRecording(true);
      setStatusText("Listening live • Background audio capture active");
    } catch (err: any) {
      setError(err.message || "Failed to start microphone. Please check browser microphone permissions.");
      setStatusText("Microphone error");
    }
  };

  const handleStopRecording = async () => {
    if (!sessionId) return;
    setIsFinishing(true);
    setStatusText("Finalizing audio & queuing AI transcription...");
    try {
      const finishedId = await audioRecorder.stopRecording();
      setIsRecording(false);
      setCompletedSessionId(finishedId);
      setStatusText("Session captured! Processing pipeline running.");
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
      const res = await audioRecorder.addBookmark(currentMs, `Bookmark at ${formatTime(elapsedSeconds)}`);
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
    <div className="max-w-xl mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] text-center space-y-6">
      {/* Top Title */}
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-mono mb-2">
          <Radio className={`w-3.5 h-3.5 ${isRecording ? "text-rose-500 animate-pulse" : "text-zinc-500"}`} />
          <span>{isRecording ? "Live Capture Session" : "Voice Capture Ready"}</span>
        </div>
        <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">
          {isRecording ? "Listening to Conversation" : "Capture Instructions"}
        </h1>
        <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
          {isRecording
            ? "Speak naturally in Hindi, Gujarati, Hinglish or English. TaskCatch extracts tasks and deadlines."
            : "Record team standups, phone calls, or verbal instructions for automated task extraction."}
        </p>
      </div>

      {/* Timer Display */}
      <div className="flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 font-mono text-3xl font-bold text-zinc-100 shadow-inner">
        <Clock className={`w-6 h-6 ${isRecording ? "text-rose-500 animate-pulse" : "text-zinc-600"}`} />
        <span>{formatTime(elapsedSeconds)}</span>
      </div>

      {/* Waveform Visualizer */}
      <div className="w-full max-w-sm px-4">
        <AudioWaveform volume={volume} frequencyData={freqData} isRecording={isRecording} />
      </div>

      {/* Primary Tactile Record / Stop Action Button */}
      <div className="relative my-3">
        {!isRecording ? (
          <button
            onClick={handleStartRecording}
            disabled={isFinishing}
            className="w-28 h-28 rounded-full bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white shadow-2xl shadow-rose-600/30 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5 group cursor-pointer border border-rose-400/30"
          >
            <Mic className="w-10 h-10 group-hover:scale-110 transition-transform stroke-[2]" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Record</span>
          </button>
        ) : (
          <button
            onClick={handleStopRecording}
            disabled={isFinishing}
            className="w-28 h-28 rounded-full bg-zinc-900 hover:bg-zinc-850 text-white shadow-2xl shadow-rose-500/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5 border-2 border-rose-500 cursor-pointer animate-pulse"
          >
            <Square className="w-8 h-8 fill-rose-500 text-rose-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Stop</span>
          </button>
        )}
      </div>

      {/* Bookmark Button (Tactile Action during recording) */}
      {isRecording && (
        <div className="flex flex-col items-center gap-2 animate-in fade-in duration-200">
          <button
            onClick={handleAddBookmark}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Bookmark className="w-3.5 h-3.5 fill-current" />
            <span>Bookmark Moment</span>
          </button>
          <span className="text-[11px] text-zinc-500">
            Boosts AI confidence for tasks discussed near this timestamp
          </span>
        </div>
      )}

      {/* Bookmarks captured count */}
      {bookmarks.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono">
          <Bookmark className="w-3.5 h-3.5 fill-current" />
          <span>{bookmarks.length} bookmark(s) saved</span>
        </div>
      )}

      {/* Status Bar */}
      <div className="text-xs text-zinc-400 flex items-center justify-center gap-2 font-medium">
        <span
          className={`w-2 h-2 rounded-full ${
            isRecording
              ? "bg-rose-500 animate-ping"
              : isFinishing
              ? "bg-amber-400 animate-pulse"
              : "bg-zinc-600"
          }`}
        />
        <span>{statusText}</span>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5 max-w-sm text-left">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Post-recording Next Steps */}
      {completedSessionId && (
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-emerald-500/30 text-zinc-200 text-xs space-y-3.5 max-w-sm w-full animate-in fade-in slide-in-from-bottom-2 duration-300 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2.5 font-semibold text-emerald-400">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Audio saved & pipeline running!</span>
          </div>
          <p className="text-zinc-400 text-[11px] leading-relaxed text-left">
            Faster-Whisper and Ollama ({localStorage.getItem("taskcatch_ollama_model") || "qwen2.5:1.5b-instruct"}) are transcribing and extracting actionable tasks.
          </p>
          {onNavigateToReview && (
            <button
              onClick={onNavigateToReview}
              className="w-full py-2.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl font-semibold text-xs shadow-md flex items-center justify-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
            >
              <span>Go to Review Inbox</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Privacy reminder */}
      <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 pt-4">
        <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
        <span>Audio and transcripts are processed 100% on this local machine.</span>
      </div>
    </div>
  );
};
