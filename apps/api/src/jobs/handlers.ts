import { jobQueue } from "./queue.js";
import { pipelineOrchestrator } from "../pipeline/orchestrator.js";
import { dbQueries } from "../db/queries.js";
import { sendPushNotification } from "../services/notificationService.js";
import { wsService } from "../services/websocketService.js";

export function registerJobHandlers() {
  // 1. Process Session Job
  jobQueue.registerWorker("process_session", async (payload: { sessionId: string }) => {
    await pipelineOrchestrator.processSession(payload.sessionId);
  });

  // 2. Check Reminders Job
  jobQueue.registerWorker("check_reminders", async () => {
    const nowIso = new Date().toISOString();
    const pending = dbQueries.getPendingReminders(nowIso);

    for (const item of pending) {
      try {
        // Send FCM Push
        await sendPushNotification({
          userId: item.user_id,
          title: `Reminder: ${item.task.title}`,
          body: item.task.description.slice(0, 120),
          payload: {
            taskId: item.task_id,
            reminderId: item.id,
            type: "reminder",
          },
        });

        // Broadcast to active Desktop / Web clients over WebSocket
        wsService.broadcastToUser(item.user_id, {
          type: "reminder.fired",
          reminder: item,
          task: item.task,
        });

        // Mark sent
        dbQueries.markReminderSent(item.id);
      } catch (err) {
        console.error(`[Reminder] Failed to send reminder ${item.id}:`, err);
        dbQueries.markReminderFailed(item.id);
      }
    }
  });
}
