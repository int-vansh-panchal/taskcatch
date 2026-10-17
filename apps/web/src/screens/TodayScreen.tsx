import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Calendar,
  MoreVertical,
  Plus,
  RefreshCw,
  HelpCircle,
  Tag,
  Search,
  Trash2,
  Edit3,
  X,
  ChevronRight,
  Filter,
  Check,
  RotateCcw,
  User,
  ArrowUpRight,
  ListTodo,
  CheckCheck,
  Flame,
  AlertTriangle,
} from "lucide-react";
import { apiRequest } from "../api";
import { useWebSocket } from "../context/WebSocketContext";

export interface TaskItem {
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
  created_at?: string;
  updated_at?: string;
}

interface TodayData {
  overdue: TaskItem[];
  dueToday: TaskItem[];
  upcoming: TaskItem[];
  noDate: TaskItem[];
  completed?: TaskItem[];
}

const COMMON_TAGS = ["Work", "Meeting", "Client", "Review", "Bug", "Personal", "Follow-up"];

export const TodayScreen: React.FC<{ onNavigateToReview?: () => void }> = ({
  onNavigateToReview,
}) => {
  const [data, setData] = useState<TodayData>({
    overdue: [],
    dueToday: [],
    upcoming: [],
    noDate: [],
    completed: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [viewTab, setViewTab] = useState<"active" | "today" | "completed" | "all">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "urgent" | "high" | "med" | "low">("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<TaskItem | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Form State for Creation
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    priority: "med" as "low" | "med" | "high" | "urgent",
    dueDate: "",
    dueTime: "17:00",
    hasTime: false,
    tags: [] as string[],
    newTagInput: "",
    requestedBy: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State for Editing
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    priority: "med" as "low" | "med" | "high" | "urgent",
    status: "open" as "needs_review" | "open" | "done" | "discarded",
    dueDate: "",
    dueTime: "17:00",
    hasTime: false,
    tags: [] as string[],
    newTagInput: "",
    requestedBy: "",
  });

  const { socket } = useWebSocket();

  // Load tasks from backend
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

  // WebSocket Live Updates
  useEffect(() => {
    if (!socket) return;
    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (
          msg.type === "task.created" ||
          msg.type === "task.updated" ||
          msg.type === "task.deleted" ||
          msg.type === "session.processed"
        ) {
          loadTasks();
        }
      } catch {
        // ignore invalid json
      }
    };
    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [socket, loadTasks]);

  // Keyboard shortcut: 'n' opens new task modal, 'Escape' closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape") {
          setShowCreateModal(false);
          setEditingTask(null);
          setTaskToDelete(null);
          setActiveMenuId(null);
        }
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openCreateModal();
      }
      if (e.key === "Escape") {
        setShowCreateModal(false);
        setEditingTask(null);
        setTaskToDelete(null);
        setActiveMenuId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Compute aggregated collections
  const allActiveTasks = useMemo(() => {
    return [...data.overdue, ...data.dueToday, ...data.upcoming, ...data.noDate];
  }, [data]);

  const completedTasks = useMemo(() => {
    return data.completed || [];
  }, [data]);

  // Filter tasks based on viewTab, search, priority, tag
  const filteredTasks = useMemo(() => {
    let list: TaskItem[] = [];
    if (viewTab === "active") {
      list = allActiveTasks;
    } else if (viewTab === "today") {
      list = data.dueToday;
    } else if (viewTab === "completed") {
      list = completedTasks;
    } else {
      list = [...allActiveTasks, ...completedTasks];
    }

    return list.filter((t) => {
      // Priority filter
      if (priorityFilter !== "all" && t.priority !== priorityFilter) {
        return false;
      }
      // Tag filter
      if (selectedTag && (!t.tags || !t.tags.includes(selectedTag))) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description?.toLowerCase().includes(q);
        const matchesRequester = t.requested_by?.toLowerCase().includes(q);
        const matchesTags = t.tags?.some((tag) => tag.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDesc && !matchesRequester && !matchesTags) {
          return false;
        }
      }
      return true;
    });
  }, [viewTab, allActiveTasks, completedTasks, data.dueToday, priorityFilter, selectedTag, searchQuery]);

  // Quick Action Handlers
  const handleToggleComplete = async (task: TaskItem) => {
    const newStatus = task.status === "done" ? "open" : "done";
    try {
      // Optimistic update
      setData((prev) => {
        if (newStatus === "done") {
          return {
            overdue: prev.overdue.filter((t) => t.id !== task.id),
            dueToday: prev.dueToday.filter((t) => t.id !== task.id),
            upcoming: prev.upcoming.filter((t) => t.id !== task.id),
            noDate: prev.noDate.filter((t) => t.id !== task.id),
            completed: [{ ...task, status: "done" }, ...(prev.completed || [])],
          };
        } else {
          const restoredTask = { ...task, status: "open" as const };
          return {
            ...prev,
            completed: (prev.completed || []).filter((t) => t.id !== task.id),
            noDate: [restoredTask, ...prev.noDate],
          };
        }
      });

      await apiRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      loadTasks();
    } catch (err: any) {
      alert("Failed to update task: " + err.message);
      loadTasks();
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await apiRequest(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      setTaskToDelete(null);
      if (editingTask?.id === taskId) {
        setEditingTask(null);
      }
      loadTasks();
    } catch (err: any) {
      alert("Failed to delete task: " + err.message);
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

  // Open Create Modal with clean defaults
  const openCreateModal = (presetDate?: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    setCreateForm({
      title: "",
      description: "",
      priority: "med",
      dueDate: presetDate !== undefined ? presetDate : todayStr,
      dueTime: "17:00",
      hasTime: false,
      tags: [],
      newTagInput: "",
      requestedBy: "",
    });
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) return;

    try {
      setIsSubmitting(true);
      let dueIso: string | null = null;
      if (createForm.dueDate) {
        if (createForm.hasTime && createForm.dueTime) {
          dueIso = new Date(`${createForm.dueDate}T${createForm.dueTime}:00`).toISOString();
        } else {
          dueIso = new Date(`${createForm.dueDate}T23:59:59`).toISOString();
        }
      }

      await apiRequest("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim() || createForm.title.trim(),
          priority: createForm.priority,
          due_at: dueIso,
          tags: createForm.tags,
          requested_by: createForm.requestedBy.trim() || null,
        }),
      });

      setShowCreateModal(false);
      loadTasks();
    } catch (err: any) {
      alert("Failed to create task: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (task: TaskItem) => {
    let dateStr = "";
    let timeStr = "17:00";
    let hasTimeVal = false;

    if (task.due_at) {
      const d = new Date(task.due_at);
      dateStr = d.toISOString().split("T")[0];
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      timeStr = `${hours}:${mins}`;
      hasTimeVal = hours !== "23" || mins !== "59";
    }

    setEditForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueDate: dateStr,
      dueTime: timeStr,
      hasTime: hasTimeVal,
      tags: task.tags || [],
      newTagInput: "",
      requestedBy: task.requested_by || "",
    });
    setEditingTask(task);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editForm.title.trim()) return;

    try {
      setIsSubmitting(true);
      let dueIso: string | null = null;
      if (editForm.dueDate) {
        if (editForm.hasTime && editForm.dueTime) {
          dueIso = new Date(`${editForm.dueDate}T${editForm.dueTime}:00`).toISOString();
        } else {
          dueIso = new Date(`${editForm.dueDate}T23:59:59`).toISOString();
        }
      }

      await apiRequest(`/api/tasks/${editingTask.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          priority: editForm.priority,
          status: editForm.status,
          due_at: dueIso,
          tags: editForm.tags,
          requested_by: editForm.requestedBy.trim() || null,
        }),
      });

      setEditingTask(null);
      loadTasks();
    } catch (err: any) {
      alert("Failed to update task: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper formatting
  const formatDateTime = (dueAt?: string | null) => {
    if (!dueAt) return null;
    const d = new Date(dueAt);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    if (isToday) {
      return `Today at ${timeStr}`;
    }

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${timeStr}`;
    }

    return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const getPriorityBadge = (p: TaskItem["priority"]) => {
    switch (p) {
      case "urgent":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <Flame className="w-3 h-3 text-rose-500 animate-pulse" />
            Urgent
          </span>
        );
      case "high":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            High
          </span>
        );
      case "med":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Med
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-md bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20">
            Low
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* ── Header Section ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Tasks & Reminders
            </h1>
            <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              {allActiveTasks.length} active
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Voice-captured action items, scheduled deadlines, and personal task manager
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadTasks()}
            disabled={loading}
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-all border border-zinc-200/60 dark:border-zinc-800"
            title="Refresh tasks"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-brand-600" : ""}`} />
          </button>

          <button
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl shadow-sm transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
            <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[9px] font-mono bg-zinc-700 dark:bg-zinc-300 text-zinc-200 dark:text-zinc-800 rounded">
              N
            </kbd>
          </button>
        </div>
      </div>

      {/* ── Metric Summary Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setViewTab("active")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            viewTab === "active"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-sm"
              : "bg-white dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
          }`}
        >
          <div className="text-[11px] font-medium tracking-wide uppercase opacity-75">All Active</div>
          <div className="text-2xl font-bold mt-1 tracking-tight font-mono">{allActiveTasks.length}</div>
        </div>

        <div
          onClick={() => setViewTab("today")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            viewTab === "today"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-sm"
              : "bg-white dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
          }`}
        >
          <div className="text-[11px] font-medium tracking-wide uppercase opacity-75">Due Today</div>
          <div className="text-2xl font-bold mt-1 tracking-tight font-mono text-emerald-600 dark:text-emerald-400">
            {data.dueToday.length}
          </div>
        </div>

        <div
          onClick={() => setViewTab("active")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            data.overdue.length > 0 ? "border-rose-300/80 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20" : "bg-white dark:bg-zinc-900/60 border-zinc-200/80 dark:border-zinc-800/80"
          }`}
        >
          <div className="text-[11px] font-medium tracking-wide uppercase text-rose-600 dark:text-rose-400">
            Overdue
          </div>
          <div className="text-2xl font-bold mt-1 tracking-tight font-mono text-rose-600 dark:text-rose-400">
            {data.overdue.length}
          </div>
        </div>

        <div
          onClick={() => setViewTab("completed")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            viewTab === "completed"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-sm"
              : "bg-white dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700"
          }`}
        >
          <div className="text-[11px] font-medium tracking-wide uppercase opacity-75">Completed</div>
          <div className="text-2xl font-bold mt-1 tracking-tight font-mono text-zinc-500 dark:text-zinc-400">
            {completedTasks.length}
          </div>
        </div>
      </div>

      {/* ── Toolbar: View Tabs, Search & Filters ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/60 p-2.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs">
        {/* View Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setViewTab("active")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
              viewTab === "active"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
            }`}
          >
            Active ({allActiveTasks.length})
          </button>
          <button
            onClick={() => setViewTab("today")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
              viewTab === "today"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
            }`}
          >
            Today ({data.dueToday.length})
          </button>
          <button
            onClick={() => setViewTab("completed")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
              viewTab === "completed"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
            }`}
          >
            Completed ({completedTasks.length})
          </button>
          <button
            onClick={() => setViewTab("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
              viewTab === "all"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
            }`}
          >
            All ({allActiveTasks.length + completedTasks.length})
          </button>
        </div>

        {/* Search & Priority Selector */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search tasks, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="med">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* ── Active Tag Filter (if selected) ─────────────────────────────────── */}
      {selectedTag && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">Filtering by tag:</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400 font-medium">
            #{selectedTag}
            <button onClick={() => setSelectedTag(null)} className="hover:text-brand-800">
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      {/* ── Error Banner ────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <button onClick={() => loadTasks()} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {/* ── Task List ───────────────────────────────────────────────────────── */}
      {filteredTasks.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-8 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800/70 flex items-center justify-center text-zinc-400">
            {viewTab === "completed" ? <CheckCheck className="w-6 h-6" /> : <ListTodo className="w-6 h-6" />}
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
            {viewTab === "completed"
              ? "No completed tasks yet"
              : searchQuery
              ? "No tasks match your search"
              : "All caught up! No active tasks."}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            {viewTab === "completed"
              ? "Completed tasks will be recorded here so you can review or restore them anytime."
              : "Capture instructions via microphone or add a task manually."}
          </p>
          {viewTab !== "completed" && !searchQuery && (
            <button
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline pt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create your first task</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredTasks.map((task) => {
            const isDone = task.status === "done";
            const isMenuOpen = activeMenuId === task.id;
            const isOverdue =
              !isDone && task.due_at && new Date(task.due_at).getTime() < new Date().setHours(0, 0, 0, 0);

            return (
              <div
                key={task.id}
                className={`group relative rounded-2xl border transition-all duration-150 p-4 ${
                  isDone
                    ? "bg-zinc-50/70 dark:bg-zinc-900/30 border-zinc-200/60 dark:border-zinc-800/50 opacity-75"
                    : isOverdue
                    ? "bg-white dark:bg-zinc-900/90 border-rose-300/60 dark:border-rose-900/40 shadow-xs hover:shadow-md"
                    : "bg-white dark:bg-zinc-900/90 border-zinc-200/80 dark:border-zinc-800/80 shadow-xs hover:shadow-md"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Complete / Uncomplete Toggle Checkbox */}
                  <button
                    onClick={() => handleToggleComplete(task)}
                    className="mt-0.5 shrink-0 text-zinc-400 hover:text-emerald-500 dark:text-zinc-500 dark:hover:text-emerald-400 transition-colors"
                    title={isDone ? "Mark as active / uncomplete" : "Mark as completed"}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400 fill-emerald-500/10" />
                    ) : (
                      <Circle className="w-5 h-5 group-hover:border-emerald-500 transition-colors" />
                    )}
                  </button>

                  {/* Task Content */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => openEditModal(task)}
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {getPriorityBadge(task.priority)}

                      {task.due_at && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md border ${
                            isOverdue
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-semibold"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {formatDateTime(task.due_at)}
                        </span>
                      )}

                      {task.requested_by && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <User className="w-3 h-3" />
                          <span>{task.requested_by}</span>
                        </span>
                      )}

                      {task.needs_clarification && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-md">
                          <HelpCircle className="w-3 h-3" />
                          Needs Clarification
                        </span>
                      )}
                    </div>

                    <h3
                      className={`text-sm font-semibold tracking-tight transition-colors ${
                        isDone
                          ? "line-through text-zinc-400 dark:text-zinc-500"
                          : "text-zinc-900 dark:text-zinc-50"
                      }`}
                    >
                      {task.title}
                    </h3>

                    {task.description && task.description !== task.title && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {/* Tags */}
                    {task.tags && task.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                        {task.tags.map((tg) => (
                          <span
                            key={tg}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTag(tg);
                            }}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
                          >
                            #{tg}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions Dropdown & Quick Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditModal(task)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit task details"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setTaskToDelete(task)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="relative">
                      <button
                        onClick={() => setActiveMenuId(isMenuOpen ? null : task.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="More options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 top-8 w-48 bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700/80 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
                          <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                            Snooze / Reschedule
                          </div>
                          <button
                            onClick={() => handleSnooze(task, 60)}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/60"
                          >
                            +1 Hour
                          </button>
                          <button
                            onClick={() => handleSnooze(task, 1440)}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/60"
                          >
                            Tomorrow Morning
                          </button>
                          <button
                            onClick={() => handleSnooze(task, 10080)}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/60"
                          >
                            Next Week
                          </button>
                          <div className="border-t border-zinc-100 dark:border-zinc-700 my-1" />
                          <button
                            onClick={() => {
                              openEditModal(task);
                              setActiveMenuId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 flex items-center justify-between"
                          >
                            <span>Edit Details</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                          <button
                            onClick={() => {
                              handleToggleComplete(task);
                              setActiveMenuId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 flex items-center justify-between"
                          >
                            <span>{isDone ? "Restore Task" : "Mark Complete"}</span>
                            {isDone ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <div className="border-t border-zinc-100 dark:border-zinc-700 my-1" />
                          <button
                            onClick={() => {
                              setTaskToDelete(task);
                              setActiveMenuId(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-between"
                          >
                            <span>Delete Task</span>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Create Task (Industry Level) ──────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-lg w-full p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-base">Create New Task</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Set deadlines, priority level, tags, and detailed notes
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Finalize Solar Inverter deployment telemetry PR"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus
                  required
                />
              </div>

              {/* Description / Notes */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Description & Context Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Add background details, checklist items, or links..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500 leading-relaxed"
                />
              </div>

              {/* Priority Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Priority
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["low", "med", "high", "urgent"] as const).map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setCreateForm({ ...createForm, priority: p })}
                      className={`py-2 text-xs font-semibold rounded-xl uppercase tracking-wider transition-all border ${
                        createForm.priority === p
                          ? p === "urgent"
                            ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                            : p === "high"
                            ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                            : p === "med"
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-zinc-800 text-white border-zinc-800 shadow-xs"
                          : "bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80 hover:bg-zinc-100 dark:hover:bg-zinc-700/60"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due Date & Time */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Due Date & Time
                  </label>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date().toISOString().split("T")[0];
                        setCreateForm({ ...createForm, dueDate: today });
                      }}
                      className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const tom = new Date();
                        tom.setDate(tom.getDate() + 1);
                        setCreateForm({ ...createForm, dueDate: tom.toISOString().split("T")[0] });
                      }}
                      className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200"
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextW = new Date();
                        nextW.setDate(nextW.getDate() + 7);
                        setCreateForm({ ...createForm, dueDate: nextW.toISOString().split("T")[0] });
                      }}
                      className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200"
                    >
                      +7 Days
                    </button>
                    {createForm.dueDate && (
                      <button
                        type="button"
                        onClick={() => setCreateForm({ ...createForm, dueDate: "", hasTime: false })}
                        className="text-rose-500 hover:underline ml-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={createForm.dueDate}
                    onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <input
                    type="time"
                    value={createForm.dueTime}
                    onChange={(e) => setCreateForm({ ...createForm, dueTime: e.target.value, hasTime: true })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Tags Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Tags & Categories
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COMMON_TAGS.map((tag) => {
                    const isSelected = createForm.tags.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => {
                          setCreateForm({
                            ...createForm,
                            tags: isSelected
                              ? createForm.tags.filter((t) => t !== tag)
                              : [...createForm.tags, tag],
                          });
                        }}
                        className={`px-2.5 py-1 text-[11px] rounded-lg font-mono transition-all border ${
                          isSelected
                            ? "bg-brand-600 text-white border-brand-600"
                            : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80 hover:bg-zinc-200"
                        }`}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>

                {/* Custom tag addition */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Custom tag (press enter to add)..."
                    value={createForm.newTagInput}
                    onChange={(e) => setCreateForm({ ...createForm, newTagInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = createForm.newTagInput.trim().replace(/^#/, "");
                        if (val && !createForm.tags.includes(val)) {
                          setCreateForm({
                            ...createForm,
                            tags: [...createForm.tags, val],
                            newTagInput: "",
                          });
                        }
                      }
                    }}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = createForm.newTagInput.trim().replace(/^#/, "");
                      if (val && !createForm.tags.includes(val)) {
                        setCreateForm({
                          ...createForm,
                          tags: [...createForm.tags, val],
                          newTagInput: "",
                        });
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Requested By */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Requested / Assigned By (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul / Client Meeting / Self"
                  value={createForm.requestedBy}
                  onChange={(e) => setCreateForm({ ...createForm, requestedBy: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !createForm.title.trim()}
                  className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 rounded-xl shadow-xs transition-all"
                >
                  {isSubmitting ? "Creating..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Edit & Inspect Task (Industry Level) ──────────────────────── */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-lg w-full p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-base">Edit Task</h3>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded-md ${
                    editForm.status === "done"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {editForm.status}
                </span>
              </div>
              <button
                onClick={() => setEditingTask(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Description & Context
                </label>
                <textarea
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500 leading-relaxed font-sans"
                />
              </div>

              {/* Priority & Status Controls */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Priority
                  </label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="low">Low Priority</option>
                    <option value="med">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Lifecycle Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="open">Active / Open</option>
                    <option value="done">Completed / Done</option>
                    <option value="needs_review">Needs Review</option>
                    <option value="discarded">Discarded</option>
                  </select>
                </div>
              </div>

              {/* Due Date & Time */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Due Date & Time
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <input
                    type="time"
                    value={editForm.dueTime}
                    onChange={(e) => setEditForm({ ...editForm, dueTime: e.target.value, hasTime: true })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editForm.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-mono rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, tags: editForm.tags.filter((t) => t !== tag) })}
                        className="hover:text-rose-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Add tag..."
                    value={editForm.newTagInput}
                    onChange={(e) => setEditForm({ ...editForm, newTagInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = editForm.newTagInput.trim().replace(/^#/, "");
                        if (val && !editForm.tags.includes(val)) {
                          setEditForm({
                            ...editForm,
                            tags: [...editForm.tags, val],
                            newTagInput: "",
                          });
                        }
                      }
                    }}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = editForm.newTagInput.trim().replace(/^#/, "");
                      if (val && !editForm.tags.includes(val)) {
                        setEditForm({
                          ...editForm,
                          tags: [...editForm.tags, val],
                          newTagInput: "",
                        });
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Requested By */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Requested By
                </label>
                <input
                  type="text"
                  value={editForm.requestedBy}
                  onChange={(e) => setEditForm({ ...editForm, requestedBy: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setTaskToDelete(editingTask);
                    setEditingTask(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-xl shadow-xs transition-all"
                  >
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Delete Confirmation ──────────────────────────────────────── */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-sm w-full p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-base">Delete this task?</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                "{taskToDelete.title}" will be permanently removed from your workspace. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="px-3.5 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTask(taskToDelete.id)}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
