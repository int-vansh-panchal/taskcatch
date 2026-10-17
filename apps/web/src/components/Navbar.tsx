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
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800/80 transition-colors">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectTab("today")}>
            <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-zinc-50 flex items-center justify-center text-white dark:text-zinc-900 font-bold text-xs tracking-wider shadow-xs">
              TC
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight tracking-tight text-sm">
                TaskCatch
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Personal AI Capture</span>
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
                  className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
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
          <div className="flex items-center space-x-2.5">
            {/* Live Socket Status Badge */}
            <div
              className={`flex items-center space-x-1.5 px-2 py-1 rounded-full text-[11px] font-mono border transition-all ${
                isConnected
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
              }`}
              title={isConnected ? "WebSocket Connected" : "Connecting..."}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`}
              />
              <span className="hidden sm:inline">{isConnected ? "Connected" : "Offline"}</span>
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-1.5 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
              title="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-lg border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-around py-1.5 px-1 shadow-lg">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center p-2 rounded-xl transition-all ${
                isActive
                  ? "text-zinc-900 dark:text-zinc-100 font-semibold"
                  : "text-zinc-500 dark:text-zinc-400"
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
