import React, { useState, useEffect, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { WebSocketProvider, useWebSocket } from "./context/WebSocketContext";
import { Navbar } from "./components/Navbar";
import { ConsentModal } from "./components/ConsentModal";
import { AuthScreen } from "./screens/AuthScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { RecordScreen } from "./screens/RecordScreen";
import { ReviewInboxScreen } from "./screens/ReviewInboxScreen";
import { SessionsScreen } from "./screens/SessionsScreen";
import { ImportScreen } from "./screens/ImportScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { DevicesScreen } from "./screens/DevicesScreen";
import { apiRequest } from "./api";

const MainContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>("today");
  const [reviewCount, setReviewCount] = useState<number>(0);
  const { socket } = useWebSocket();

  const updateReviewCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiRequest<{ tasks: any[] }>("/api/tasks?status=needs_review");
      setReviewCount(res.tasks?.length || 0);
    } catch {
      // ignore
    }
  }, [isAuthenticated]);

  useEffect(() => {
    updateReviewCount();
  }, [updateReviewCount, currentTab]);

  // WebSocket listener for live review inbox count updates & notifications
  useEffect(() => {
    if (!socket) return;
    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (
          msg.type === "task.created" ||
          msg.type === "task.updated" ||
          msg.type === "session.processed"
        ) {
          updateReviewCount();
        }

        // Native browser notification if supported and granted
        if (msg.type === "reminder.fired" && "Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification(msg.title || "TaskCatch Reminder", {
              body: msg.body || msg.task?.title || "You have a task reminder",
              icon: "/icon.svg",
            });
          }
        }
      } catch {
        // ignore
      }
    };

    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [socket, updateReviewCount]);

  // Request browser notification permission once
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500 font-mono">Loading TaskCatch...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-zinc-50/70 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors pb-20 md:pb-8">
      {/* Privacy Consent Modal on first login */}
      <ConsentModal />

      {/* Navigation Top Header & Mobile Bar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        reviewCount={reviewCount}
      />

      {/* Main Tab Screen View */}
      <main className="flex-1 w-full animate-in fade-in duration-150">
        {currentTab === "today" && (
          <TodayScreen onNavigateToReview={() => setCurrentTab("review")} />
        )}
        {currentTab === "record" && (
          <RecordScreen
            onSessionFinished={() => updateReviewCount()}
            onNavigateToReview={() => setCurrentTab("review")}
          />
        )}
        {currentTab === "review" && <ReviewInboxScreen />}
        {currentTab === "sessions" && <SessionsScreen />}
        {currentTab === "import" && (
          <ImportScreen
            onImportComplete={() => updateReviewCount()}
            onNavigateToReview={() => setCurrentTab("review")}
          />
        )}
        {currentTab === "search" && <SearchScreen />}
        {currentTab === "settings" && <SettingsScreen />}
        {currentTab === "devices" && <DevicesScreen />}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <MainContent />
      </WebSocketProvider>
    </AuthProvider>
  );
};

export default App;
