import React, { useState, useEffect, useCallback } from "react";
import {
  Smartphone,
  Laptop,
  Globe,
  Bell,
  Trash2,
  Send,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { apiRequest } from "../api";

interface Device {
  id: string;
  name: string;
  platform: "web" | "phone" | "desktop";
  fcm_token?: string | null;
  created_at: string;
}

export const DevicesScreen: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ devices: Device[] }>("/api/devices");
      setDevices(res.devices || []);
    } catch (err: any) {
      setError(err.message || "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleSendTestPush = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await apiRequest<{ message: string; sent: number; failed: number }>(
        "/api/devices/test-push",
        { method: "POST" }
      );
      setTestResult(res.message);
    } catch (err: any) {
      alert("Test push failed: " + err.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleRegisterCurrentDevice = async () => {
    try {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const platform = isMobile ? "phone" : "web";
      const name = isMobile
        ? `Phone (${navigator.userAgent.includes("Android") ? "Android" : "iOS"})`
        : `Browser (${navigator.userAgent.includes("Chrome") ? "Chrome" : "Web"})`;

      let deviceId = localStorage.getItem("taskcatch_device_id");
      if (!deviceId) {
        deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        localStorage.setItem("taskcatch_device_id", deviceId);
      }

      await apiRequest("/api/devices/register", {
        method: "POST",
        body: JSON.stringify({
          id: deviceId,
          name,
          platform,
          fcmToken: null, // Will be updated if PWA service-worker registers FCM
        }),
      });

      alert("Device registered successfully!");
      loadDevices();
    } catch (err: any) {
      alert("Registration failed: " + err.message);
    }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!confirm("Are you sure you want to remove this device?")) return;
    try {
      await apiRequest(`/api/devices/${id}`, { method: "DELETE" });
      loadDevices();
    } catch (err: any) {
      alert("Failed to delete device: " + err.message);
    }
  };

  const getPlatformIcon = (platform: Device["platform"]) => {
    switch (platform) {
      case "phone":
        return <Smartphone className="w-5 h-5 text-brand-600" />;
      case "desktop":
        return <Laptop className="w-5 h-5 text-indigo-600" />;
      default:
        return <Globe className="w-5 h-5 text-sky-600" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Connected Devices</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 font-mono font-semibold">
              {devices.length} Registered
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage your Android/iOS phone, Ubuntu desktop widget, and web browser capture clients
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDevices}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleRegisterCurrentDevice}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            <Plus className="w-4 h-4" />
            <span>Register Current Device</span>
          </button>
          <button
            onClick={handleSendTestPush}
            disabled={isSendingTest}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSendingTest ? "Sending..." : "Test Push Notification"}</span>
          </button>
        </div>
      </div>

      {testResult && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{testResult}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Devices List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map((device) => (
          <div
            key={device.id}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  {getPlatformIcon(device.platform)}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {device.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      {device.platform}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                        device.fcm_token
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-slate-500/10 text-slate-500"
                      }`}
                    >
                      {device.fcm_token ? "FCM Push Enabled" : "WebSocket Only"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDeleteDevice(device.id)}
                className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors"
                title="Remove device"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="text-[11px] text-slate-400 font-mono pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between">
              <span>ID: {device.id.substring(0, 14)}...</span>
              <span>Added: {new Date(device.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Guide Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-brand-600" />
            <span>Install on Android Phone</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Open your Tailscale URL in Chrome (e.g. <code>https://taskcatch.your-tailnet.ts.net</code>), tap the 3 dots menu and select <strong>"Add to Home screen" / "Install app"</strong>. This activates Web Share Target and the offline audio recording queue.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Laptop className="w-4 h-4 text-indigo-600" />
            <span>Ubuntu Desktop Widget</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Run the TaskCatch desktop app (<code>apps/desktop</code>) on Ubuntu. It provides an always-on-top 320x420 widget, global hotkeys (<code>Ctrl+Alt+R</code> to record, <code>Ctrl+Alt+B</code> to bookmark), and PipeWire system-audio recording for Meet/Teams calls.
          </p>
        </div>
      </div>
    </div>
  );
};
