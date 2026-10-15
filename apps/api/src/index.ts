import { buildApp } from "./app.js";
import { config } from "./config.js";
import { jobQueue } from "./jobs/queue.js";
import { registerJobHandlers } from "./jobs/handlers.js";
import { closeDatabase } from "./db/index.js";

async function main() {
  const app = await buildApp();

  // Register worker handlers and start job processor
  registerJobHandlers();
  jobQueue.start();

  // In-process Reminder Scheduler (checks every 30 seconds)
  const reminderInterval = setInterval(async () => {
    try {
      await jobQueue.enqueueJob("check_reminders", { triggeredAt: new Date().toISOString() });
    } catch (err) {
      console.error("[Scheduler] Error queuing reminder check:", err);
    }
  }, 30_000);

  // Initial reminder check on startup (handles missed reminders while laptop was off)
  await jobQueue.enqueueJob("check_reminders", { triggeredAt: new Date().toISOString(), onStartup: true });

  try {
    await app.listen({ port: config.port, host: config.host });
    console.info(`TaskCatch API server listening on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown handling
  const shutdown = async () => {
    console.info("Shutting down gracefully...");
    clearInterval(reminderInterval);
    jobQueue.stop();
    await app.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
