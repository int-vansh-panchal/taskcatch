import React, { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Cpu,
  Brain,
  Bell,
  Clock,
  Shield,
  Trash2,
  Download,
  Upload,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Sparkles,
  Wifi,
} from "lucide-react";
import { apiRequest } from "../api";
import { useWebSocket } from "../context/WebSocketContext";

interface ProviderHealth {
  speech: { provider: string; healthy: boolean; message?: string };
  llm: { provider: string; healthy: boolean; message?: string };
}

interface UserSettings {
  digest_time?: string;
  reminder_offsets_minutes?: number[];
  vocabulary_hints?: string;
  speech_provider?: string;
  speech_model?: string;
  llm_provider?: string;
  llm_model?: string;
  profile?: "fast" | "accurate";
  whisper_dual_pass?: boolean;
  retention_days?: number;
  working_hours_start?: string;
  working_hours_end?: string;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  enable_gemini_fallback?: boolean;
  gemini_api_key?: string;
}

export const SettingsScreen: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>({});
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);

  const { socket } = useWebSocket();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, healthRes] = await Promise.all([
        apiRequest<{ settings: UserSettings }>("/api/settings"),
        apiRequest<ProviderHealth>("/api/settings/providers/status").catch(() => null),
      ]);
      setSettings(settingsRes.settings || {});
      if (healthRes) setHealth(healthRes);
    } catch (err: any) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket config update listener
  useEffect(() => {
    if (!socket) return;
    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "config.updated") {
          setSettings(msg.settings);
        }
      } catch {
        // ignore
      }
    };
    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [socket]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await apiRequest<{ settings: UserSettings }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert("Failed to save settings: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportVocab = () => {
    window.open("/api/settings/vocabulary/export", "_blank");
  };

  const handleImportVocab = async () => {
    if (!importText.trim()) return;
    try {
      await apiRequest("/api/settings/vocabulary/import", {
        method: "POST",
        body: JSON.stringify({ text: importText, merge: true }),
      });
      setShowImportModal(false);
      setImportText("");
      loadData();
    } catch (err: any) {
      alert("Failed to import vocabulary: " + err.message);
    }
  };

  const handleRunAudioCleanup = async () => {
    if (!confirm("Delete audio files older than your retention period? Transcripts and tasks will remain intact.")) return;
    setIsCleaning(true);
    setCleanupMessage(null);
    try {
      const res = await apiRequest<{ message: string }>("/api/sessions/cleanup-audio", {
        method: "POST",
      });
      setCleanupMessage(res.message);
    } catch (err: any) {
      alert("Cleanup failed: " + err.message);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Settings & Dynamic Config
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Live configuration for AI speech, LLM extraction, reminder engine, and storage retention
          </p>
        </div>

        <button
          onClick={loadData}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors self-start sm:self-auto"
          title="Refresh settings"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Provider Health Banner */}
      {health && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-brand-600" />
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Speech-to-Text Provider
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {health.speech.provider}
                </span>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono ${
                health.speech.healthy
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-300 dark:border-emerald-800"
                  : "bg-rose-500/10 text-rose-600 border border-rose-300 dark:border-rose-800"
              }`}
            >
              {health.speech.healthy ? "Ready" : "Offline"}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="w-5 h-5 text-brand-600" />
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  LLM Extraction Provider
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {health.llm.provider}
                </span>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono ${
                health.llm.healthy
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-300 dark:border-emerald-800"
                  : "bg-rose-500/10 text-rose-600 border border-rose-300 dark:border-rose-800"
              }`}
            >
              {health.llm.healthy ? "Ready" : "Offline"}
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Speech-to-Text & Translation */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Cpu className="w-5 h-5 text-brand-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Speech-to-Text & Indian Language Settings
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                STT Provider
              </label>
              <select
                value={settings.speech_provider || "faster-whisper"}
                onChange={(e) => setSettings({ ...settings, speech_provider: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="faster-whisper">Faster-Whisper Sidecar (Local int8)</option>
                <option value="mock">Mock Speech Provider (Testing)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Whisper Model
              </label>
              <select
                value={settings.speech_model || "small"}
                onChange={(e) => setSettings({ ...settings, speech_model: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="small">small (Recommended: fits 5GB RAM, accurate Gujarati/Hindi)</option>
                <option value="base">base (Fastest, low memory, lower Gujarati accuracy)</option>
                <option value="medium">medium (Highest quality, requires ~3.5GB RAM)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Speed/Accuracy Profile
              </label>
              <select
                value={settings.profile || "accurate"}
                onChange={(e: any) => setSettings({ ...settings, profile: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="accurate">Accurate (Default: Single pass + LLM Translation)</option>
                <option value="fast">Fast (Greedy search, beam size 1)</option>
              </select>
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settings.whisper_dual_pass || false}
                  onChange={(e) => setSettings({ ...settings, whisper_dual_pass: e.target.checked })}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                />
                <span>Enable Dual Whisper Pass (Transcribe + Translate, doubles CPU)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Section 2: LLM Task Extraction */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Brain className="w-5 h-5 text-brand-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Local LLM Task Extraction (Ollama)
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                LLM Provider
              </label>
              <select
                value={settings.llm_provider || "ollama"}
                onChange={(e) => setSettings({ ...settings, llm_provider: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="ollama">Ollama (Local on CPU, keep_alive: 2m)</option>
                <option value="mock">Mock LLM Provider (Testing)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                LLM Model
              </label>
              <select
                value={settings.llm_model || "qwen2.5:7b-instruct"}
                onChange={(e) => setSettings({ ...settings, llm_model: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="qwen2.5:7b-instruct">qwen2.5:7b-instruct (Recommended: excellent Indian date resolution)</option>
                <option value="qwen2.5:3b">qwen2.5:3b (Ultra-lightweight ~2GB RAM)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Vocabulary Hints */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Domain Vocabulary & Acronym Hints
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportVocab}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import</span>
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Comma-separated domain terms, coworker names, and acronyms provided to Whisper's initial_prompt:
          </p>
          <textarea
            rows={3}
            value={settings.vocabulary_hints || ""}
            onChange={(e) => setSettings({ ...settings, vocabulary_hints: e.target.value })}
            placeholder="Solar, Inverter, Net metering, DISCOM, PR, Generation, SCADA, Ahmedabad, Vansh"
            className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Section 4: Reminders & Quiet Hours */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Bell className="w-5 h-5 text-brand-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Reminders, Digests & Quiet Hours
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Morning Digest Time
              </label>
              <input
                type="time"
                value={settings.digest_time || "09:00"}
                onChange={(e) => setSettings({ ...settings, digest_time: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Quiet Hours Start
              </label>
              <input
                type="time"
                value={settings.quiet_hours_start || "22:00"}
                onChange={(e) => setSettings({ ...settings, quiet_hours_start: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Quiet Hours End
              </label>
              <input
                type="time"
                value={settings.quiet_hours_end || "08:00"}
                onChange={(e) => setSettings({ ...settings, quiet_hours_end: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Section 5: Audio Retention & Storage */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Trash2 className="w-5 h-5 text-brand-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Storage & Audio Retention
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Auto-Delete Audio After (Days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={settings.retention_days || 30}
                onChange={(e) =>
                  setSettings({ ...settings, retention_days: parseInt(e.target.value, 10) })
                }
                className="w-32 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                Deletes raw audio files to save disk; transcripts & tasks are always preserved.
              </span>
            </div>

            <button
              type="button"
              onClick={handleRunAudioCleanup}
              disabled={isCleaning}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-900 rounded-xl text-xs font-semibold self-start sm:self-auto transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isCleaning ? "Cleaning..." : "Clean Expired Audio Now"}</span>
            </button>
          </div>

          {cleanupMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs">
              {cleanupMessage}
            </div>
          )}
        </div>

        {/* Section 6: Tailscale Connectivity Self-Check */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Wifi className="w-5 h-5 text-brand-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Tailscale Connectivity
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Your Ubuntu laptop hosts TaskCatch over Tailscale HTTPS for phone access without port-forwarding or public IP exposure:
          </p>
          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-[11px] text-slate-800 dark:text-slate-200 overflow-x-auto">
            tailscale serve --https=443 http://localhost:3000
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="flex items-center justify-between pt-2">
          {saveSuccess ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold animate-in fade-in">
              <CheckCircle className="w-4 h-4" />
              <span>Settings updated & broadcasted!</span>
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            {saving ? "Saving Changes..." : "Save Settings"}
          </button>
        </div>
      </form>

      {/* Vocabulary Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Import Vocabulary Hints
            </h3>
            <p className="text-xs text-slate-500">
              Paste keywords or names separated by commas or newlines:
            </p>
            <textarea
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Module, Inverter, DISCOM, Substation, SCADA"
              className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportVocab}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl"
              >
                Merge Vocabulary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
