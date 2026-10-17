import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Check,
  X,
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
  Filter,
  CheckCircle2,
  ChevronRight,
  Info,
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
  const [activeFilter, setActiveFilter] = useState<"all" | "clarification" | "high_conf">("all");

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
        if (
          msg.type === "task.created" ||
          msg.type === "session.processed" ||
          msg.type === "task.updated" ||
          msg.type === "task.deleted"
        ) {
          loadReviewTasks();
        }
      } catch {
        // ignore non-json
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
        method: "DELETE",
      });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err: any) {
      alert("Failed to delete task: " + err.message);
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
      setClarificationInputs((prev) => ({ ...prev, [taskId]: "" }));
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

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (activeFilter === "clarification") return t.needs_clarification;
      if (activeFilter === "high_conf") return (t.confidence ?? 0.8) >= 0.85;
      return true;
    });
  }, [tasks, activeFilter]);

  const confidenceBadge = (confidence?: number) => {
    const val = Math.round((confidence ?? 0.8) * 100);
    let colorClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (val < 65) {
      colorClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
    } else if (val < 85) {
      colorClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
    }
    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${colorClass}`}>
        {val}% confidence
      </span>
    );
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "high":
        return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "med":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "low":
      default:
        return "text-zinc-400 bg-zinc-800 border-zinc-700/60";
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Review Inbox</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {tasks.length} Pending
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Verify extracted instructions, listen to source audio quotes, or clarify questions before scheduling.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadReviewTasks}
            className="p-2.5 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700 transition-all"
            title="Refresh inbox"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {tasks.length > 0 && (
            <button
              onClick={handleBulkConfirm}
              disabled={isBulkConfirming}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4 text-emerald-600" />
              <span>{isBulkConfirming ? "Confirming..." : `Confirm All (${tasks.length})`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      {tasks.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeFilter === "all"
                ? "bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            }`}
          >
            All Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setActiveFilter("clarification")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeFilter === "clarification"
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Needs Clarification ({tasks.filter((t) => t.needs_clarification).length})</span>
          </button>
          <button
            onClick={() => setActiveFilter("high_conf")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeFilter === "high_conf"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>High Confidence ({tasks.filter((t) => (t.confidence ?? 0.8) >= 0.85).length})</span>
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
          <div className="h-32 rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="text-center py-20 px-4 bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-800 backdrop-blur-sm">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-zinc-200">Inbox Zero</h2>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1 leading-relaxed">
            All extracted tasks have been confirmed or scheduled. Record another session to capture new work items.
          </p>
        </div>
      )}

      {/* Task Cards */}
      <div className="space-y-4">
        {filteredTasks.map((task) => {
          const isAudioOpen = activeAudioTaskId === task.id;
          return (
            <div
              key={task.id}
              className="bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl p-5 shadow-sm transition-all space-y-4 backdrop-blur-sm group"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {confidenceBadge(task.confidence)}
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border ${priorityColor(
                        task.priority
                      )}`}
                    >
                      {task.priority}
                    </span>
                    {task.requested_by && (
                      <span className="text-xs text-zinc-400">
                        from <strong className="text-zinc-200 font-medium">{task.requested_by}</strong>
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100 leading-snug">
                    {task.title}
                  </h3>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {task.description}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                  <button
                    onClick={() => setEditingTask(task)}
                    className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors"
                    title="Edit task"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDiscard(task.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-colors"
                    title="Discard task"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Discard</span>
                  </button>
                  <button
                    onClick={() => handleConfirm(task.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold shadow-sm transition-transform active:scale-95"
                    title="Confirm task"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                    <span>Confirm</span>
                  </button>
                </div>
              </div>

              {/* Clarification Alert & Input */}
              {task.needs_clarification && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs space-y-2.5">
                  <div className="flex items-start gap-2 text-amber-300 font-medium">
                    <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <span className="font-semibold text-amber-200">Clarification Needed: </span>
                      <span>{task.clarification_question || "Please verify the deadline or requirements."}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type clarification note to append to task..."
                      value={clarificationInputs[task.id] || ""}
                      onChange={(e) =>
                        setClarificationInputs({ ...clarificationInputs, [task.id]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAnswerClarification(task.id);
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-zinc-950/70 text-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-zinc-500"
                    />
                    <button
                      onClick={() => handleAnswerClarification(task.id)}
                      className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-lg shrink-0 transition-colors"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              )}

              {/* Source Quotes & Timestamp Audio Player */}
              {(task.source_quote_original || task.source_quote_english) && (
                <div className="bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800/80 text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                      Spoken Source Quote
                    </span>
                    {task.session_id && (
                      <button
                        type="button"
                        onClick={() => setActiveAudioTaskId(isAudioOpen ? null : task.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{isAudioOpen ? "Hide Audio Player" : "Listen to Clip"}</span>
                      </button>
                    )}
                  </div>

                  {task.source_quote_original && (
                    <div className="text-zinc-200 italic font-serif text-[13px] leading-relaxed">
                      "{task.source_quote_original}"
                    </div>
                  )}

                  {task.source_quote_english && task.source_quote_english !== task.source_quote_original && (
                    <div className="text-zinc-400 text-[11px] leading-relaxed">
                      Translation: "{task.source_quote_english}"
                    </div>
                  )}

                  {/* Inline Audio Player Slice */}
                  {isAudioOpen && task.session_id && (
                    <div className="pt-2 animate-in fade-in duration-200">
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
              <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-zinc-850">
                <div className="flex items-center gap-4 flex-wrap">
                  {task.due_at && (
                    <span className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-300">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      {new Date(task.due_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {task.tags && task.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Tag className="w-3 h-3 text-zinc-500" />
                      {task.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-100 text-base">Edit Extracted Task</h3>
              <button
                onClick={() => setEditingTask(null)}
                className="text-zinc-400 hover:text-zinc-200 text-sm p-1 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={4}
                  value={editingTask.description}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Priority
                  </label>
                  <select
                    value={editingTask.priority}
                    onChange={(e: any) => setEditingTask({ ...editingTask, priority: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  >
                    <option value="low">Low</option>
                    <option value="med">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Due Date (Optional)
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
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl shadow-sm transition-transform active:scale-95"
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
