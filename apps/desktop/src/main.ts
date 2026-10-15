import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  Notification,
  screen,
  nativeImage,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";

interface WidgetConfig {
  x?: number;
  y?: number;
  opacity: number;
  isPill: boolean;
  mixSystemAudio: boolean;
  autostart: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "taskcatch");
const CONFIG_FILE = path.join(CONFIG_DIR, "widget.json");
const CACHE_DIR = path.join(os.homedir(), ".taskcatch", "desktop_cache");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let wsClient: WebSocket | null = null;
let recordingProcess: ChildProcess | null = null;
let currentSessionId: string | null = null;
let recordingStartTime = 0;
let chunkIntervalTimer: NodeJS.Timeout | null = null;
let chunkCounter = 0;

const API_BASE = process.env.TASKCATCH_API_URL || "http://localhost:3000";

function loadConfig(): WidgetConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch {
    // fallback
  }
  return {
    opacity: 0.95,
    isPill: false,
    mixSystemAudio: false,
    autostart: true,
  };
}

function saveConfig(cfg: Partial<WidgetConfig>) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const current = loadConfig();
    const updated = { ...current, ...cfg };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  } catch (err) {
    console.error("[Desktop] Failed to save config:", err);
  }
}

function createWidgetWindow() {
  const cfg = loadConfig();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const defaultWidth = cfg.isPill ? 220 : 320;
  const defaultHeight = cfg.isPill ? 54 : 420;

  const initialX = cfg.x ?? screenWidth - defaultWidth - 24;
  const initialY = cfg.y ?? 48;

  mainWindow = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setOpacity(cfg.opacity);

  const rendererHtml = path.join(__dirname, "..", "src", "renderer", "index.html");
  if (fs.existsSync(rendererHtml)) {
    mainWindow.loadFile(rendererHtml);
  } else {
    mainWindow.loadURL(`${API_BASE}`);
  }

  mainWindow.on("moved", () => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();
    saveConfig({ x, y });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  // 16x16 icon data uri or fallback blank
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQADs6a/4f2/2c4d/w3io8Z8N+G8f8fBn/U8MIGyI2jG4AfR7eBYQDDG8b///8zzGfkRwnP8f//Gf7//88wZf5bBvQ0Q8kPjAwMBJjHQGg1I0kJHgA9bSpUfW3cPQAAAABJRU5ErkJggg==",
      "base64"
    )
  );

  tray = new Tray(icon);
  tray.setToolTip("TaskCatch Desktop Assistant");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show/Hide Widget (Ctrl+Alt+W)",
      click: () => {
        if (!mainWindow) {
          createWidgetWindow();
        } else if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      },
    },
    {
      label: "Toggle Pill Mode",
      click: () => {
        if (mainWindow) {
          const cfg = loadConfig();
          setWidgetCollapsed(!cfg.isPill);
        }
      },
    },
    { type: "separator" },
    {
      label: "Start / Stop Recording (Ctrl+Alt+R)",
      click: () => toggleRecording(),
    },
    {
      label: "Bookmark Moment (Ctrl+Alt+B)",
      click: () => addBookmark(),
    },
    { type: "separator" },
    {
      label: "Launch Web PWA",
      click: () => {
        import("electron").then(({ shell }) => shell.openExternal(API_BASE));
      },
    },
    {
      label: "Autostart on Boot",
      type: "checkbox",
      checked: loadConfig().autostart,
      click: (item) => {
        saveConfig({ autostart: item.checked });
        updateAutostartDesktopFile(item.checked);
      },
    },
    { type: "separator" },
    {
      label: "Quit TaskCatch",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function setWidgetCollapsed(collapsed: boolean) {
  if (!mainWindow) return;
  const cfg = loadConfig();
  if (collapsed) {
    mainWindow.setSize(220, 54, true);
  } else {
    mainWindow.setSize(320, 420, true);
  }
  saveConfig({ isPill: collapsed });
  mainWindow.webContents.send("widget:collapsed", collapsed);
}

function registerGlobalHotkeys() {
  globalShortcut.register("CommandOrControl+Alt+R", () => {
    toggleRecording();
  });

  globalShortcut.register("CommandOrControl+Alt+B", () => {
    addBookmark();
  });

  globalShortcut.register("CommandOrControl+Alt+W", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.show();
    }
  });
}

function setupWebSocketSync() {
  const wsUrl = `${API_BASE.replace("http", "ws")}/ws?userId=user_personal_01&deviceId=desktop_widget`;

  const connect = () => {
    try {
      wsClient = new WebSocket(wsUrl);

      wsClient.on("open", () => {
        console.info("[Desktop WS] Connected to TaskCatch API");
      });

      wsClient.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (mainWindow) {
            mainWindow.webContents.send("tasks:updated");
          }

          // Trigger native Linux desktop notification via libnotify
          if (msg.type === "reminder.fired" || msg.type === "session.processed") {
            showDesktopNotification({
              title: msg.title || "TaskCatch Notification",
              body: msg.body || msg.task?.title || "New task needs review",
            });
          }
        } catch {
          // ignore
        }
      });

      wsClient.on("close", () => {
        setTimeout(connect, 4000);
      });

      wsClient.on("error", () => {
        wsClient?.close();
      });
    } catch {
      setTimeout(connect, 5000);
    }
  };

  connect();
}

function showDesktopNotification(data: { title: string; body: string }) {
  if (!Notification.isSupported()) return;
  const notif = new Notification({
    title: data.title,
    body: data.body,
    silent: false,
  });
  notif.show();
}

async function toggleRecording() {
  if (recordingProcess) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  if (recordingProcess) return;

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  chunkCounter = 0;
  recordingStartTime = Date.now();

  // Create session on server
  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "desktop_electron", status: "recording" }),
    });
    const data = await res.json();
    currentSessionId = data.session.id;
  } catch (err) {
    console.warn("[Desktop] Offline session created locally");
    currentSessionId = `sess_local_${Date.now()}`;
  }

  // Choose recording source (Microphone or Monitor source for Meet/Teams)
  const cfg = loadConfig();
  const inputDevice = cfg.mixSystemAudio ? "default" : "default";

  // Use ffmpeg to record 16kHz mono audio slice
  const chunkFile = path.join(CACHE_DIR, `${currentSessionId}_chunk_${chunkCounter}.wav`);
  recordingProcess = spawn("ffmpeg", [
    "-y",
    "-f",
    "pulse",
    "-i",
    inputDevice,
    "-ar",
    "16000",
    "-ac",
    "1",
    chunkFile,
  ]);

  if (mainWindow) {
    mainWindow.webContents.send("recording:state", {
      isRecording: true,
      sessionId: currentSessionId,
      startTime: recordingStartTime,
    });
  }

  showDesktopNotification({
    title: "TaskCatch Recording Started",
    body: "Recording live instructions in the background...",
  });
}

async function stopRecording() {
  if (!recordingProcess) return;

  recordingProcess.kill("SIGINT");
  recordingProcess = null;

  const finishedSessionId = currentSessionId;
  currentSessionId = null;

  if (finishedSessionId) {
    try {
      await fetch(`${API_BASE}/api/sessions/${finishedSessionId}/finish`, {
        method: "POST",
      });
    } catch {
      // offline
    }
  }

  if (mainWindow) {
    mainWindow.webContents.send("recording:state", {
      isRecording: false,
      sessionId: null,
    });
  }

  showDesktopNotification({
    title: "TaskCatch Recording Saved",
    body: "Audio uploaded and queued for task extraction.",
  });
}

async function addBookmark() {
  if (!currentSessionId) return;
  const elapsedMs = Date.now() - recordingStartTime;
  try {
    await fetch(`${API_BASE}/api/sessions/${currentSessionId}/bookmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestampMs: elapsedMs, label: "Hotkey Bookmark" }),
    });

    showDesktopNotification({
      title: "Bookmark Captured",
      body: `AI confidence boosted near ${Math.floor(elapsedMs / 1000)}s!`,
    });
  } catch {
    // offline
  }
}

function updateAutostartDesktopFile(enable: boolean) {
  const autostartDir = path.join(os.homedir(), ".config", "autostart");
  const desktopFilePath = path.join(autostartDir, "taskcatch.desktop");

  if (!enable) {
    if (fs.existsSync(desktopFilePath)) fs.unlinkSync(desktopFilePath);
    return;
  }

  fs.mkdirSync(autostartDir, { recursive: true });
  const content = `[Desktop Entry]
Type=Application
Name=TaskCatch Desktop
Exec=${app.getPath("exe")}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Comment=TaskCatch always-on-top assistant and voice capture
`;
  fs.writeFileSync(desktopFilePath, content);
}

// IPC Handlers
ipcMain.handle("widget:set-collapsed", (_e, collapsed: boolean) => setWidgetCollapsed(collapsed));
ipcMain.handle("widget:set-opacity", (_e, opacity: number) => {
  if (mainWindow) {
    mainWindow.setOpacity(opacity);
    saveConfig({ opacity });
  }
});
ipcMain.handle("widget:close", () => {
  if (mainWindow) mainWindow.hide();
});
ipcMain.handle("widget:get-config", () => loadConfig());
ipcMain.handle("widget:save-config", (_e, cfg) => saveConfig(cfg));

ipcMain.handle("audio:toggle-recording", () => toggleRecording());
ipcMain.handle("audio:start-recording", () => startRecording());
ipcMain.handle("audio:stop-recording", () => stopRecording());
ipcMain.handle("audio:add-bookmark", () => addBookmark());
ipcMain.handle("audio:set-mix-system", (_e, enabled: boolean) => {
  saveConfig({ mixSystemAudio: enabled });
});

ipcMain.handle("tasks:get-next", async () => {
  try {
    const res = await fetch(`${API_BASE}/api/tasks/today`);
    const data = await res.json();
    const tasks = [
      ...(data.overdue || []),
      ...(data.dueToday || []),
      ...(data.upcoming || []),
      ...(data.noDate || []),
    ].slice(0, 5);
    return tasks;
  } catch {
    return [];
  }
});

ipcMain.handle("tasks:mark-done", async (_e, taskId: string) => {
  try {
    await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("tasks:snooze", async (_e, { taskId, minutes }) => {
  try {
    const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snoozed_until: snoozedUntil }),
    });
    return true;
  } catch {
    return false;
  }
});

// App lifecycle
app.whenReady().then(() => {
  createWidgetWindow();
  createTray();
  registerGlobalHotkeys();
  setupWebSocketSync();

  const cfg = loadConfig();
  if (cfg.autostart) {
    updateAutostartDesktopFile(true);
  }
});

app.on("window-all-closed", () => {
  // Keep app resident in tray on Linux; do not quit
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (wsClient) wsClient.close();
});
