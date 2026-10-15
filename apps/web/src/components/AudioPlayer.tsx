import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, RotateCcw, Volume2 } from "lucide-react";
import { apiRequest } from "../api";

interface AudioPlayerProps {
  sessionId: string;
  initialSeekMs?: number;
  highlightRange?: { startMs: number; endMs: number };
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  sessionId,
  initialSeekMs,
  highlightRange,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [streamUrl, setStreamUrl] = useState<string>("");

  useEffect(() => {
    let unmounted = false;
    async function loadSignedStream() {
      try {
        const tokenRes = await apiRequest<{ token: string; streamUrl: string }>(
          `/api/audio/${sessionId}/token`,
          { method: "POST" }
        );
        if (!unmounted) {
          setStreamUrl(tokenRes.streamUrl);
        }
      } catch {
        // Fallback to direct session stream
        if (!unmounted) {
          setStreamUrl(`/api/audio/stream/${sessionId}`);
        }
      }
    }
    loadSignedStream();
    return () => {
      unmounted = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (initialSeekMs !== undefined && audioRef.current) {
      audioRef.current.currentTime = initialSeekMs / 1000;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [initialSeekMs]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = target;
      setCurrentTime(target);
    }
  };

  const cycleSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextRate = speeds[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
      {streamUrl && (
        <audio
          ref={audioRef}
          src={streamUrl}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
              if (
                highlightRange &&
                audioRef.current.currentTime >= highlightRange.endMs / 1000
              ) {
                audioRef.current.pause();
                setIsPlaying(false);
              }
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) setDuration(audioRef.current.duration || 0);
          }}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div className="flex items-center space-x-3">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center transition-colors shadow-sm"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>

        <div className="flex-1 space-y-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full accent-brand-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <button
          onClick={cycleSpeed}
          className="px-2 py-1 text-xs font-semibold rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
          title="Playback speed"
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
};
