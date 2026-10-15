import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Widget controls
  setCollapsed: (collapsed: boolean) => ipcRenderer.invoke("widget:set-collapsed", collapsed),
  setOpacity: (opacity: number) => ipcRenderer.invoke("widget:set-opacity", opacity),
  closeWidget: () => ipcRenderer.invoke("widget:close"),
  getConfig: () => ipcRenderer.invoke("widget:get-config"),
  saveConfig: (cfg: any) => ipcRenderer.invoke("widget:save-config", cfg),

  // Recording controls
  toggleRecording: () => ipcRenderer.invoke("audio:toggle-recording"),
  startRecording: () => ipcRenderer.invoke("audio:start-recording"),
  stopRecording: () => ipcRenderer.invoke("audio:stop-recording"),
  addBookmark: () => ipcRenderer.invoke("audio:add-bookmark"),

  // Audio mix setting (PipeWire monitor)
  setMixSystemAudio: (enabled: boolean) => ipcRenderer.invoke("audio:set-mix-system", enabled),

  // Tasks & Reminders
  getTasks: () => ipcRenderer.invoke("tasks:get-next"),
  markTaskDone: (taskId: string) => ipcRenderer.invoke("tasks:mark-done", taskId),
  snoozeTask: (taskId: string, minutes: number) =>
    ipcRenderer.invoke("tasks:snooze", { taskId, minutes }),

  // Event Listeners from Main
  onRecordingStateChanged: (callback: (state: any) => void) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on("recording:state", handler);
    return () => ipcRenderer.removeListener("recording:state", handler);
  },
  onTasksChanged: (callback: (tasks: any[]) => void) => {
    const handler = (_event: any, tasks: any[]) => callback(tasks);
    ipcRenderer.on("tasks:updated", handler);
    return () => ipcRenderer.removeListener("tasks:updated", handler);
  },
  onReminderFired: (callback: (reminder: any) => void) => {
    const handler = (_event: any, reminder: any) => callback(reminder);
    ipcRenderer.on("reminder:fired", handler);
    return () => ipcRenderer.removeListener("reminder:fired", handler);
  },
});
