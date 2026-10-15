import React, { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  MoreVertical,
  Plus,
  RefreshCw,
  HelpCircle,
  ChevronDown,
  Sparkles,
  ArrowRight,
  Tag,
  MessageSquare,
} from "lucide-react";
import { apiRequest } from "../api";
import { useWebSocket } from "../context/WebSocketContext";

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: "needs_review" | "open" | "done" | "discarded";
  priority: "low" | "med" | "high" | "urgent";
  due_at?: string | null;
  requested_by?: string | null;
  tags?: string[] | null;
  confidence?: number;
  needs_clarification?: boolean;
  clarification_question?: string | null;
  snoozed_until?: string | null;
  session_id?: string | null;
}

interface TodayData {
  overdue: TaskItem[];
  dueToday: TaskItem[];
  upcoming: TaskItem[];
  noDate: TaskItem[];
}

export const TodayScreen: React.FC<{ onNavigateToReview?: () => void }> = ({
  onNavigateToReview,
}) => {
  const [data, setData] = useState<TodayData>({
    overdue: [],
    dueToday: [],
    upcoming: [],
    noDate: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<"low" | "med" | "high" | "urgent">("med");
  const [isCreating, setIsCreating] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const { socket } = useWebSocket();

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<TodayData>("/api/tasks/today");
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // WebSocket live updates
  useEffect(() => {
    if (!socket) return;
    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "task.created" || msg.type === "task.updated" || msg.type === "session.processed") {
          loadTasks();
        }
      } catch {
        // ignore
      }
    };
    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [socket, loadTasks]);

  const handleMarkDone = async (task: TaskItem) => {
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      });
      loadTasks();
    } catch (err: any) {
      alert("Failed to mark task as done: " + err.message);
    }
  };

  const handleSnooze = async (task: TaskItem, durationMinutes: number) => {
    try {
      const snoozedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      await apiRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ snoozed_until: snoozedUntil }),
      });
      setActiveMenuId(null);
      loadTasks();
    } catch (err: any) {
      alert("Failed to snooze task: " + err.message);
    }
  };

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    try {
      setIsCreating(true);
      await apiRequest("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: quickTitle.trim(),
          description: quickTitle.trim(),
          priority: quickPriority,
        }),
      });
      setQuickTitle("");
      setShowNewTaskModal(false);
      loadTasks();
    } catch (err: any) {
      alert("Failed to create task: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const formatDue = (dueAt?: string | null) => {
    if (!dueAt) return null;
    const d = new Date(dueAt);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dueAt?: string | null) => {
    if (!dueAt) return null;
    const d = new Date(dueAt);
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case "urgent":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50";
      case "high":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50";
      case "med":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900/50";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800";
    }
  };

  const renderTaskCard = (task: TaskItem) => {
    const isMenuOpen = activeMenuId === task.id;

    return (
      <div
        key={task.id}
        className="group relative bg-white dark:bg-slate-900/90 rounded-xl p-4 border border-slate-200 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <button
              onClick={() => handleMarkDone(task)}
              className="mt-0.5 text-slate-400 hover:text-emerald-500 transition-colors shrink-0"
              title="Mark as done"
            >
              <CheckCircle2 className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border ${priorityColor(
                    task.priority
                  )}`}
                >
                  {task.priority}
                </span>
                {task.needs_clarification && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-md">
                    <HelpCircle className="w-3 h-3" />
                    Clarify
                  </span>
                )}
                {task.requested_by && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    by <span className="font-medium text-slate-700 dark:text-slate-200">{task.requested_by}</span>
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-snug break-words">
                {task.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                {task.description}
              </p>
            </div>
          </div>

          <div className="relative shrink-0">
            <button
              onClick={() => setActiveMenuId(isMenuOpen ? null : task.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-7 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Snooze
                </div>
                <button
                  onClick={() => handleSnooze(task, 10)}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                >
                  10 Minutes
                </button>
                <button
                  onClick={() => handleSnooze(task, 60)}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                >
                  1 Hour
                </button>
                <button
                  onClick={() => handleSnooze(task, 1440)}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                >
                  Tomorrow Morning
                </button>
                <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                <button
                  onClick={() => {
                    setSelectedTask(task);
                    setActiveMenuId(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                >
                  View Details
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Meta */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-1.5">
            {task.due_at ? (
              <span className="flex items-center gap-1 font-mono text-[11px]">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {formatDate(task.due_at)} {formatDue(task.due_at)}
              </span>
            ) : (
              <span className="text-[11px] italic text-slate-400">No deadline</span>
            )}
          </div>
          {task.tags && task.tags.length > 0 && (
            <div className="flex items-center gap-1">
              <Tag className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] text-slate-400 font-medium">{task.tags.slice(0, 2).join(", ")}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const totalTasks =
    data.overdue.length + data.dueToday.length + data.upcoming.length + data.noDate.length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Today's Focus</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 font-mono font-medium">
              {totalTasks} Active
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tasks extracted from your verbal meetings and instructions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTasks}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowNewTaskModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-28 rounded-xl bg-slate-200/60 dark:bg-slate-800/40 animate-pulse" />
          <div className="h-28 rounded-xl bg-slate-200/60 dark:bg-slate-800/40 animate-pulse" />
        </div>
      )}

      {!loading && totalTasks === 0 && (
        <div className="text-center py-16 px-4 bg-white dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
          <Sparkles className="w-12 h-12 text-brand-500/60 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            All clear! No tasks due today.
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
            Record a meeting or audio note to let TaskCatch automatically extract and schedule deadlines.
          </p>
        </div>
      )}

      {/* Overdue Section */}
      {!loading && data.overdue.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-xs tracking-wider uppercase">
            <AlertTriangle className="w-4 h-4" />
            <span>Overdue ({data.overdue.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.overdue.map(renderTaskCard)}
          </div>
        </section>
      )}

      {/* Due Today Section */}
      {!loading && data.dueToday.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400 font-semibold text-xs tracking-wider uppercase">
            <Calendar className="w-4 h-4" />
            <span>Due Today ({data.dueToday.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.dueToday.map(renderTaskCard)}
          </div>
        </section>
      )}

      {/* Upcoming Section */}
      {!loading && data.upcoming.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-semibold text-xs tracking-wider uppercase">
            <Clock className="w-4 h-4" />
            <span>Upcoming ({data.upcoming.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.upcoming.map(renderTaskCard)}
          </div>
        </section>
      )}

      {/* No Date Section */}
      {!loading && data.noDate.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-500 font-semibold text-xs tracking-wider uppercase">
            <span>No Scheduled Date ({data.noDate.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.noDate.map(renderTaskCard)}
          </div>
        </section>
      )}

      {/* Add Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Quick Add Task</h3>
              <button
                onClick={() => setShowNewTaskModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleQuickCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Share project report with manager"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Priority
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["low", "med", "high", "urgent"] as const).map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setQuickPriority(p)}
                      className={`py-1.5 text-xs font-semibold rounded-lg uppercase transition-all ${
                        quickPriority === p
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !quickTitle.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-xl"
                >
                  {isCreating ? "Adding..." : "Add Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border ${priorityColor(
                    selectedTask.priority
                  )}`}
                >
                  {selectedTask.priority}
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white text-base mt-2">
                  {selectedTask.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div>
                <span className="font-semibold text-slate-400 uppercase text-[10px] block mb-1">
                  Full Description
                </span>
                <p className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/50 dark:border-slate-700/50 whitespace-pre-wrap">
                  {selectedTask.description}
                </p>
              </div>

              {selectedTask.requested_by && (
                <div>
                  <span className="font-semibold text-slate-400 uppercase text-[10px] block">
                    Requested By
                  </span>
                  <span>{selectedTask.requested_by}</span>
                </div>
              )}

              {selectedTask.due_at && (
                <div>
                  <span className="font-semibold text-slate-400 uppercase text-[10px] block">
                    Due Date & Time
                  </span>
                  <span>{new Date(selectedTask.due_at).toLocaleString()}</span>
                </div>
              )}

              {selectedTask.needs_clarification && selectedTask.clarification_question && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
                  <span className="font-semibold text-[11px] block mb-1">Clarification Needed:</span>
                  <span>{selectedTask.clarification_question}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  handleMarkDone(selectedTask);
                  setSelectedTask(null);
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark Done</span>
              </button>

              <button
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
