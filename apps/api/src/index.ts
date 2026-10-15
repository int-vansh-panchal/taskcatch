import { buildApp } from "./app.js";
import { config } from "./config.js";
import { jobQueue } from "./jobs/queue.js";
import { registerJobHandlers } from "./jobs/handlers.js";

async function main() {
  const app = buildApp();

  // Register worker handlers and start job processor
  registerJobHandlers();
  jobQueue.start();

  // In-process Reminder Scheduler (checks every 30 seconds)
  const reminderInterval = setInterval(() => {
    jobQueue.enqueueJob("check_reminders", { triggeredAt: new Date().toISOString() });
  }, 30_000);

  // Initial reminder check on startup (handles missed reminders while laptop was off)
  jobQueue.enqueueJob("check_reminders", { triggeredAt: new Date().toISOString(), onStartup: true });

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
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
