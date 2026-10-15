import React, { useState, useEffect } from "react";
import {
  Search,
  CheckCircle2,
  Clock,
  Tag,
  AlertCircle,
  Sparkles,
  Calendar,
  Filter,
} from "lucide-react";
import { apiRequest } from "../api";

interface TaskResult {
  id: string;
  title: string;
  description: string;
  status: "needs_review" | "open" | "done" | "discarded";
  priority: "low" | "med" | "high" | "urgent";
  due_at?: string | null;
  requested_by?: string | null;
  tags?: string[] | null;
  confidence?: number;
  session_id?: string | null;
}

export const SearchScreen: React.FC = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TaskResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiRequest<{ tasks: TaskResult[] }>(
          `/api/tasks/search?q=${encodeURIComponent(query.trim())}`
        );
        setResults(res.tasks || []);
        setHasSearched(true);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const filteredResults = results.filter((t) => {
    if (statusFilter === "all") return true;
    return t.status === statusFilter;
  });

  const handleMarkDone = async (task: TaskResult) => {
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      });
      setResults((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: "done" } : t))
      );
    } catch (err: any) {
      alert("Failed to update task: " + err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Full-Text Search
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Search across spoken instructions, tasks, tags, and transcripts powered by PostgreSQL GIN indexing
        </p>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
        <input
          type="text"
          placeholder="Search by keyword, person, Gujarati/Hindi term, or tag..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 text-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
          autoFocus
        />
        {loading && (
          <div className="absolute right-4 top-3.5 text-xs text-slate-400 animate-pulse font-mono">
            Searching...
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
        {["all", "open", "needs_review", "done", "discarded"].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1 rounded-lg font-medium transition-colors uppercase text-[11px] ${
              statusFilter === st
                ? "bg-brand-600 text-white font-semibold"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {st.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Results List */}
      <div className="space-y-3">
        {filteredResults.map((task) => (
          <div
            key={task.id}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <button
                  onClick={() => handleMarkDone(task)}
                  disabled={task.status === "done"}
                  className={`mt-0.5 transition-colors shrink-0 ${
                    task.status === "done"
                      ? "text-emerald-500"
                      : "text-slate-400 hover:text-emerald-500"
                  }`}
                  title="Mark as done"
                >
                  <CheckCircle2 className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {task.priority}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 uppercase">
                      {task.status.replace("_", " ")}
                    </span>
                    {task.requested_by && (
                      <span className="text-xs text-slate-500">
                        by <strong className="text-slate-700 dark:text-slate-300">{task.requested_by}</strong>
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {task.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {task.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {task.due_at && (
                  <span className="flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(task.due_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
              {task.tags && task.tags.length > 0 && (
                <div className="flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  <span>{task.tags.join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {hasSearched && filteredResults.length === 0 && (
          <div className="text-center py-16 px-4 bg-white dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-400 text-xs">
            No tasks or transcripts matched "{query}". Try checking other keywords.
          </div>
        )}

        {!hasSearched && (
          <div className="text-center py-16 px-4 text-slate-400 text-xs">
            Type in the search bar above to look up tasks and spoken words.
          </div>
        )}
      </div>
    </div>
  );
};
