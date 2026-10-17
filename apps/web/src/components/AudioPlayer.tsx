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
  const pendingSeekRef = useRef<number | null>(initialSeekMs !== undefined ? initialSeekMs / 1000 : null);
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
        if (!unmounted && tokenRes?.streamUrl) {
          setStreamUrl(tokenRes.streamUrl);
          return;
        }
      } catch {
        // Fallback to direct stream
      }

      if (!unmounted) {
        setStreamUrl(`/api/audio/stream/${sessionId}`);
      }
    }
    loadSignedStream();
    return () => {
      unmounted = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (initialSeekMs !== undefined) {
      const seekSec = initialSeekMs / 1000;
      if (audioRef.current && audioRef.current.readyState >= 1) {
        audioRef.current.currentTime = seekSec;
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        pendingSeekRef.current = seekSec;
      }
    }
  }, [initialSeekMs]);

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration || 0;
    setDuration(dur);

    if (pendingSeekRef.current !== null) {
      audioRef.current.currentTime = pendingSeekRef.current;
      pendingSeekRef.current = null;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

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
    if (isNaN(sec) || !isFinite(sec)) return "0:00";
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="bg-zinc-950/80 dark:bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-3 shadow-lg backdrop-blur-md">
      {streamUrl && (
        <audio
          ref={audioRef}
          src={streamUrl}
          preload="metadata"
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
              if (
                highlightRange &&
                highlightRange.endMs &&
                audioRef.current.currentTime >= highlightRange.endMs / 1000
              ) {
                audioRef.current.pause();
                setIsPlaying(false);
              }
            }
          }}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => {
            if (pendingSeekRef.current !== null && audioRef.current) {
              audioRef.current.currentTime = pendingSeekRef.current;
              pendingSeekRef.current = null;
              audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={togglePlay}
          className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-white text-zinc-900 flex items-center justify-center transition-transform active:scale-95 shadow-sm shrink-0"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

        <div className="flex-1 space-y-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full accent-white h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={cycleSpeed}
          className="px-2 py-1 text-[11px] font-mono font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0"
          title="Playback speed"
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
};
