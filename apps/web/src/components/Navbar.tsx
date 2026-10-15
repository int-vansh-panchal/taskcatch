import React, { useEffect, useState } from "react";
import {
  Calendar,
  Mic,
  Inbox,
  Clock,
  UploadCloud,
  Search,
  Settings,
  Smartphone,
  Moon,
  Sun,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useWebSocket } from "../context/WebSocketContext";
import { apiRequest } from "../api";

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  reviewCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  reviewCount = 0,
}) => {
  const { isConnected } = useWebSocket();
  const [isDark, setIsDark] = useState<boolean>(() => {
    return (
      localStorage.getItem("taskcatch_theme") === "dark" ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("taskcatch_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("taskcatch_theme", "light");
    }
  }, [isDark]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const navItems = [
    { id: "today", label: "Today", icon: Calendar },
    { id: "record", label: "Record", icon: Mic },
    {
      id: "review",
      label: "Review",
      icon: Inbox,
      badge: reviewCount > 0 ? reviewCount : undefined,
    },
    { id: "sessions", label: "Sessions", icon: Clock },
    { id: "import", label: "Import", icon: UploadCloud },
    { id: "search", label: "Search", icon: Search },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "devices", label: "Devices", icon: Smartphone },
  ];

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-600 text-white text-xs font-semibold py-1.5 px-4 text-center flex items-center justify-center space-x-2 animate-pulse sticky top-0 z-50">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline mode active. Recordings will be queued in IndexedDB and uploaded on reconnect.</span>
        </div>
      )}

      {/* Top Header Desktop/Tablet */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectTab("today")}>
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-sm font-bold text-sm">
              TC
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
                TaskCatch
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Personal AI Capture</span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Status & Theme Controls */}
          <div className="flex items-center space-x-3">
            {/* Live Socket Status Dot */}
            <div
              className="flex items-center space-x-1.5 text-xs text-slate-500 font-mono"
              title={isConnected ? "WebSocket Connected" : "Connecting..."}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`}
              />
              <span className="hidden sm:inline">{isConnected ? "Live" : "Offline"}</span>
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 flex items-center justify-around py-1.5 px-1 shadow-lg">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center p-2 rounded-xl transition-all ${
                isActive
                  ? "text-brand-600 dark:text-brand-400 font-semibold"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? "scale-110" : ""}`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 px-1 rounded-full text-[9px] font-bold bg-amber-500 text-white">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
