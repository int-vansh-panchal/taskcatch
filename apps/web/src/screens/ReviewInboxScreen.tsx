import React, { useState, useEffect, useCallback } from "react";
import {
  Check,
  X,
  Play,
  Volume2,
  Calendar,
  AlertCircle,
  HelpCircle,
  Sparkles,
  CheckCheck,
  Edit2,
  RefreshCw,
  Tag,
  Clock,
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import { apiRequest } from "../api";
import { AudioPlayer } from "../components/AudioPlayer";
import { useWebSocket } from "../context/WebSocketContext";

interface ReviewTask {
  id: string;
  title: string;
  description: string;
  priority: "low" | "med" | "high" | "urgent";
  status: "needs_review" | "open" | "done" | "discarded";
  due_at?: string | null;
  requested_by?: string | null;
  tags?: string[] | null;
  confidence?: number;
  needs_clarification?: boolean;
  clarification_question?: string | null;
  source_quote_original?: string | null;
  source_quote_english?: string | null;
  start_ms?: number | null;
  end_ms?: number | null;
  session_id?: string | null;
}

export const ReviewInboxScreen: React.FC = () => {
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAudioTaskId, setActiveAudioTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<ReviewTask | null>(null);
  const [clarificationInputs, setClarificationInputs] = useState<Record<string, string>>({});
  const [isBulkConfirming, setIsBulkConfirming] = useState(false);

  const { socket } = useWebSocket();

  const loadReviewTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ tasks: ReviewTask[] }>("/api/tasks?status=needs_review");
      setTasks(res.tasks || []);
    } catch (err: any) {
      setError(err.message || "Failed to load review inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviewTasks();
  }, [loadReviewTasks]);

  // WebSocket live updates
  useEffect(() => {
    if (!socket) return;
    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "task.created" || msg.type === "session.processed") {
          loadReviewTasks();
        }
      } catch {
        // ignore
      }
    };
    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [socket, loadReviewTasks]);

  const handleConfirm = async (taskId: string) => {
    try {
      await apiRequest(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "open" }),
      });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: any) {
      alert("Failed to confirm task: " + err.message);
    }
  };

  const handleDiscard = async (taskId: string) => {
    try {
      await apiRequest(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "discarded" }),
      });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: any) {
      alert("Failed to discard task: " + err.message);
    }
  };

  const handleBulkConfirm = async () => {
    if (tasks.length === 0) return;
    setIsBulkConfirming(true);
    try {
      for (const t of tasks) {
        await apiRequest(`/api/tasks/${t.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "open" }),
        });
      }
      setTasks([]);
    } catch (err: any) {
      alert("Failed during bulk confirm: " + err.message);
    } finally {
      setIsBulkConfirming(false);
    }
  };

  const handleAnswerClarification = async (taskId: string) => {
    const text = clarificationInputs[taskId];
    if (!text || !text.trim()) return;

    try {
      await apiRequest(`/api/tasks/${taskId}/clarify`, {
        method: "POST",
        body: JSON.stringify({ clarification: text.trim() }),
      });
      loadReviewTasks();
    } catch (err: any) {
      alert("Failed to submit clarification: " + err.message);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    try {
      await apiRequest(`/api/tasks/${editingTask.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editingTask.title,
          description: editingTask.description,
          priority: editingTask.priority,
          due_at: editingTask.due_at || null,
        }),
      });
      setEditingTask(null);
      loadReviewTasks();
    } catch (err: any) {
      alert("Failed to update task: " + err.message);
    }
  };

  const confidenceBadge = (confidence?: number) => {
    const val = Math.round((confidence ?? 0.8) * 100);
    let colorClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
    if (val < 65) {
      colorClass = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800";
    } else if (val < 85) {
      colorClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${colorClass}`}>
        {val}% confidence
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Review Inbox</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-mono font-semibold">
              {tasks.length} Pending
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Review newly extracted tasks, confirm accuracy, or clarify ambiguities before scheduling
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadReviewTasks}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh inbox"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {tasks.length > 0 && (
            <button
              onClick={handleBulkConfirm}
              disabled={isBulkConfirming}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              <span>{isBulkConfirming ? "Confirming..." : `Confirm All (${tasks.length})`}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-36 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40 animate-pulse" />
          <div className="h-36 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40 animate-pulse" />
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="text-center py-20 px-4 bg-white dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
          <Sparkles className="w-12 h-12 text-emerald-500/60 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Inbox Zero! No tasks pending review.
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
            All extracted tasks have been confirmed or discarded. When you record next, new tasks will appear here.
          </p>
        </div>
      )}

      {/* Task Cards */}
      <div className="space-y-4">
        {tasks.map((task) => {
          const isAudioOpen = activeAudioTaskId === task.id;
          return (
            <div
              key={task.id}
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-4"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {confidenceBadge(task.confidence)}
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                      {task.priority}
                    </span>
                    {task.requested_by && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        requested by <strong className="text-slate-700 dark:text-slate-200">{task.requested_by}</strong>
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {task.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {task.description}
                  </p>
                </div>

                {/* Top Action Buttons (Confirm / Discard) */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                  <button
                    onClick={() => setEditingTask(task)}
                    className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Edit task"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDiscard(task.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors"
                    title="Discard task"
                  >
                    <X className="w-4 h-4" />
                    <span>Discard</span>
                  </button>
                  <button
                    onClick={() => handleConfirm(task.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
                    title="Confirm task"
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm</span>
                  </button>
                </div>
              </div>

              {/* Clarification Alert & Input */}
              {task.needs_clarification && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-300 dark:border-amber-800/80 text-xs space-y-2">
                  <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300 font-semibold">
                    <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span>Clarification Question: </span>
                      <span className="font-normal">{task.clarification_question || "Please verify the deadline or requirements."}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type your clarification answer..."
                      value={clarificationInputs[task.id] || ""}
                      onChange={(e) =>
                        setClarificationInputs({ ...clarificationInputs, [task.id]: e.target.value })
                      }
                      className="flex-1 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      onClick={() => handleAnswerClarification(task.id)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shrink-0"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              )}

              {/* Source Quotes & Timestamp Audio Player */}
              {(task.source_quote_original || task.source_quote_english) && (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-400 uppercase text-[10px] tracking-wider">
                      Spoken Source Quote
                    </span>
                    {task.session_id && task.start_ms !== undefined && task.start_ms !== null && (
                      <button
                        onClick={() =>
                          setActiveAudioTaskId(isAudioOpen ? null : task.id)
                        }
                        className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{isAudioOpen ? "Hide Audio" : "Play Spoken Audio"}</span>
                      </button>
                    )}
                  </div>

                  {task.source_quote_original && (
                    <div className="text-slate-700 dark:text-slate-300 italic font-serif">
                      "{task.source_quote_original}"
                    </div>
                  )}

                  {task.source_quote_english && task.source_quote_english !== task.source_quote_original && (
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Translation: "{task.source_quote_english}"
                    </div>
                  )}

                  {/* Inline Audio Player Slice */}
                  {isAudioOpen && task.session_id && (
                    <div className="pt-2">
                      <AudioPlayer
                        sessionId={task.session_id}
                        initialSeekMs={task.start_ms || 0}
                        highlightRange={{
                          startMs: task.start_ms || 0,
                          endMs: task.end_ms || (task.start_ms || 0) + 15000,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Card Meta Footer */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                <div className="flex items-center gap-3">
                  {task.due_at && (
                    <span className="flex items-center gap-1 font-mono text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(task.due_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {task.tags && task.tags.length > 0 && (
                    <span className="flex items-center gap-1 text-[11px]">
                      <Tag className="w-3 h-3 text-slate-400" />
                      {task.tags.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Edit Extracted Task</h3>
              <button
                onClick={() => setEditingTask(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Self-Contained Description
                </label>
                <textarea
                  rows={4}
                  value={editingTask.description}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Priority
                  </label>
                  <select
                    value={editingTask.priority}
                    onChange={(e: any) =>
                      setEditingTask({ ...editingTask, priority: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="low">Low</option>
                    <option value="med">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Due Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={
                      editingTask.due_at
                        ? new Date(editingTask.due_at).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        due_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
