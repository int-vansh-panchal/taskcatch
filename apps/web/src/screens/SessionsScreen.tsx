import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Play,
  RotateCw,
  Download,
  Trash2,
  Bookmark,
  CheckCircle2,
  AlertCircle,
  FileText,
  Volume2,
  Languages,
  Edit2,
  Save,
  X,
  RefreshCw,
  Sparkles,
  ChevronRight,
  ListTodo,
} from "lucide-react";
import { apiRequest } from "../api";
import { AudioPlayer } from "../components/AudioPlayer";
import { useWebSocket } from "../context/WebSocketContext";

interface SessionMeta {
  id: string;
  created_at: string;
  device_id?: string;
  status: "recording" | "uploaded" | "processing" | "completed" | "failed" | "interrupted";
  language?: string | null;
  audio_path?: string | null;
}

interface Segment {
  id: string;
  start_ms: number;
  end_ms: number;
  text_original: string;
  text_english: string;
  confidence: number;
  speaker?: string | null;
}

interface BookmarkItem {
  id: string;
  timestamp_ms: number;
  label?: string | null;
}

interface NoteItem {
  id: string;
  content: string;
}

interface TaskItem {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  due_at?: string | null;
  start_ms?: number | null;
}

interface SessionDetails {
  session: SessionMeta;
  segments: Segment[];
  bookmarks: BookmarkItem[];
  tasks: TaskItem[];
  notes: NoteItem[];
}

export const SessionsScreen: React.FC = () => {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [seekTimeMs, setSeekTimeMs] = useState<number | undefined>(undefined);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [isReExtracting, setIsReExtracting] = useState(false);

  const { socket } = useWebSocket();

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ sessions: SessionMeta[] }>("/api/sessions");
      setSessions(res.sessions || []);
      if (!selectedSessionId && res.sessions && res.sessions.length > 0) {
        setSelectedSessionId(res.sessions[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId]);

  const loadSessionDetails = useCallback(async (id: string) => {
    try {
      setLoadingDetails(true);
      const res = await apiRequest<SessionDetails>(`/api/sessions/${id}`);
      setSessionData(res);
    } catch (err: any) {
      alert("Failed to load session details: " + err.message);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionDetails(selectedSessionId);
    }
  }, [selectedSessionId, loadSessionDetails]);

  // WebSocket updates
  useEffect(() => {
    if (!socket) return;
    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "session.updated" || msg.type === "session.processed") {
          loadSessions();
          if (selectedSessionId && msg.session?.id === selectedSessionId) {
            loadSessionDetails(selectedSessionId);
          }
        }
      } catch {
        // ignore
      }
    };
    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [socket, selectedSessionId, loadSessions, loadSessionDetails]);

  const handleEditSegment = (seg: Segment) => {
    setEditingSegmentId(seg.id);
    setEditedText(showOriginal ? seg.text_original : seg.text_english);
  };

  const handleSaveSegment = async (segId: string) => {
    if (!selectedSessionId) return;
    try {
      const payload = showOriginal
        ? { textOriginal: editedText }
        : { textEnglish: editedText };

      await apiRequest(`/api/sessions/${selectedSessionId}/segments/${segId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setEditingSegmentId(null);
      loadSessionDetails(selectedSessionId);
    } catch (err: any) {
      alert("Failed to save segment edit: " + err.message);
    }
  };

  const handleReExtract = async () => {
    if (!selectedSessionId) return;
    setIsReExtracting(true);
    try {
      await apiRequest(`/api/sessions/${selectedSessionId}/re-extract`, {
        method: "POST",
      });
      alert("Task re-extraction completed using the corrected transcript!");
      loadSessionDetails(selectedSessionId);
    } catch (err: any) {
      alert("Re-extraction error: " + err.message);
    } finally {
      setIsReExtracting(false);
    }
  };

  const handleExportJson = () => {
    if (!selectedSessionId) return;
    window.open(`/api/sessions/${selectedSessionId}/export`, "_blank");
  };

  const handleDeleteSession = async () => {
    if (!selectedSessionId) return;
    if (!confirm("Are you sure you want to delete this session and its audio?")) return;
    try {
      await apiRequest(`/api/sessions/${selectedSessionId}`, { method: "DELETE" });
      setSelectedSessionId(null);
      setSessionData(null);
      loadSessions();
    } catch (err: any) {
      alert("Failed to delete session: " + err.message);
    }
  };

  const statusBadge = (st: SessionMeta["status"]) => {
    switch (st) {
      case "recording":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-900 animate-pulse">
            Recording
          </span>
        );
      case "uploaded":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-900">
            Uploaded
          </span>
        );
      case "processing":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-300 dark:border-sky-900 animate-pulse">
            Processing...
          </span>
        );
      case "completed":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-900">
            Completed
          </span>
        );
      case "interrupted":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-900">
            Interrupted
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-400">
            {st}
          </span>
        );
    }
  };

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Recorded Sessions</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 font-mono font-semibold">
              {sessions.length}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Audio archives, dual-script transcripts, timeline bookmarks, and extracted action items
          </p>
        </div>

        <button
          onClick={loadSessions}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors self-start sm:self-auto"
          title="Refresh sessions"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Layout: Left Session List, Right Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sessions List */}
        <div className="lg:col-span-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            Session History
          </h2>
          {sessions.length === 0 && !loading && (
            <div className="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              No sessions found. Record your first conversation!
            </div>
          )}

          <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
            {sessions.map((sess) => {
              const isSelected = selectedSessionId === sess.id;
              const date = new Date(sess.created_at);
              return (
                <div
                  key={sess.id}
                  onClick={() => setSelectedSessionId(sess.id)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-brand-50/70 dark:bg-brand-950/40 border-brand-300 dark:border-brand-800 shadow-sm"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {sess.id.replace("sess_", "")}
                    </span>
                    {statusBadge(sess.status)}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{date.toLocaleDateString([], { month: "short", day: "numeric" })} at {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {sess.language && (
                      <span className="uppercase font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {sess.language}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detailed View */}
        <div className="lg:col-span-8 space-y-5">
          {loadingDetails && (
            <div className="h-96 rounded-2xl bg-slate-200/50 dark:bg-slate-800/40 animate-pulse" />
          )}

          {!loadingDetails && sessionData && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-6 shadow-sm">
              {/* Session Header & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Session Details
                    </h2>
                    {statusBadge(sessionData.session.status)}
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    ID: {sessionData.session.id} | Recorded on {new Date(sessionData.session.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReExtract}
                    disabled={isReExtracting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/50 transition-colors disabled:opacity-50"
                    title="Re-run task extraction on edited transcript"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isReExtracting ? "animate-spin" : ""}`} />
                    <span>{isReExtracting ? "Extracting..." : "Re-extract Tasks"}</span>
                  </button>

                  <button
                    onClick={handleExportJson}
                    className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    title="Export session JSON"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleDeleteSession}
                    className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                    title="Delete session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Audio Playback Player */}
              {sessionData.session.audio_path && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Audio Recording
                  </span>
                  <AudioPlayer
                    sessionId={sessionData.session.id}
                    initialSeekMs={seekTimeMs}
                  />
                </div>
              )}

              {/* Bookmarks Timeline */}
              {sessionData.bookmarks.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                    <span>Bookmarks Timeline</span>
                  </span>
                  <div className="flex gap-2 flex-wrap">
                    {sessionData.bookmarks.map((bm) => (
                      <button
                        key={bm.id}
                        onClick={() => setSeekTimeMs(bm.timestamp_ms)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs font-mono transition-colors"
                      >
                        <Bookmark className="w-3 h-3 fill-current" />
                        <span>{formatMs(bm.timestamp_ms)}</span>
                        {bm.label && <span className="font-sans font-medium text-[11px] text-slate-600 dark:text-slate-300">{bm.label}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted Tasks Summary */}
              {sessionData.tasks.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <ListTodo className="w-3.5 h-3.5 text-brand-500" />
                    <span>Tasks Extracted ({sessionData.tasks.length})</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {sessionData.tasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => {
                          if (task.start_ms !== undefined && task.start_ms !== null) {
                            setSeekTimeMs(task.start_ms);
                          }
                        }}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 cursor-pointer hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-semibold uppercase tracking-wider text-slate-500">
                            {task.priority}
                          </span>
                          <span className="font-mono text-slate-400">
                            {task.status}
                          </span>
                        </div>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 leading-tight">
                          {task.title}
                        </h4>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcripts with Language Toggle and Inline Editing */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Languages className="w-3.5 h-3.5 text-brand-500" />
                    <span>Interactive Transcript ({sessionData.segments.length} segments)</span>
                  </span>

                  {/* Original Script / English Translation Toggle */}
                  <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => setShowOriginal(false)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                        !showOriginal
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      English
                    </button>
                    <button
                      onClick={() => setShowOriginal(true)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                        showOriginal
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      Original Script
                    </button>
                  </div>
                </div>

                {sessionData.segments.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    No transcript segments yet. If session is processing, segments will stream in shortly.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {sessionData.segments.map((seg) => {
                      const isEditing = editingSegmentId === seg.id;
                      const displayText = showOriginal ? seg.text_original : seg.text_english;
                      const confPct = Math.round((seg.confidence || 0.8) * 100);
                      const isLowConf = confPct < 65;

                      return (
                        <div
                          key={seg.id}
                          className="group p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-center justify-between text-[11px] mb-1.5">
                            <button
                              onClick={() => setSeekTimeMs(seg.start_ms)}
                              className="flex items-center gap-1 font-mono font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>{formatMs(seg.start_ms)} - {formatMs(seg.end_ms)}</span>
                            </button>

                            <div className="flex items-center gap-2">
                              <span
                                className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
                                  isLowConf
                                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold"
                                    : "text-slate-400"
                                }`}
                              >
                                {confPct}% conf
                              </span>
                              {!isEditing && (
                                <button
                                  onClick={() => handleEditSegment(seg)}
                                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded"
                                  title="Edit segment"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="space-y-2 mt-2">
                              <textarea
                                value={editedText}
                                onChange={(e) => setEditedText(e.target.value)}
                                className="w-full text-xs p-2 rounded-lg border border-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                                rows={2}
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => setEditingSegmentId(null)}
                                  className="px-2.5 py-1 text-xs rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleSaveSegment(seg.id)}
                                  className="px-2.5 py-1 text-xs rounded bg-brand-600 hover:bg-brand-700 text-white font-semibold flex items-center gap-1"
                                >
                                  <Save className="w-3 h-3" />
                                  <span>Save</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
                              {displayText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loadingDetails && !sessionData && (
            <div className="text-center py-24 text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              Select a session on the left to inspect its audio, transcripts, and tasks.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
