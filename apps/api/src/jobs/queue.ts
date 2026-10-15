import { dbQueries } from "../db/queries.js";
import type { Job } from "@taskcatch/shared";

type JobHandler = (payload: any, job: Job) => Promise<void>;

export class JobQueueManager {
  private handlers: Map<string, JobHandler> = new Map();
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;

  constructor(pollIntervalMs = 1000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  registerWorker(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  async enqueueJob(type: string, payload: any, runAtIso?: string): Promise<Job> {
    return await dbQueries.enqueueJob(type, payload, runAtIso);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextTick();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextTick(): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      try {
        await this.processNextJob();
      } catch (err) {
        console.error("[JobQueue] Unexpected error in worker loop:", err);
      } finally {
        this.scheduleNextTick();
      }
    }, this.pollIntervalMs);
  }

  async processNextJob(): Promise<boolean> {
    const job = await dbQueries.claimNextJob();
    if (!job) return false;

    const handler = this.handlers.get(job.type);
    if (!handler) {
      await dbQueries.failJob(job.id, `No worker handler registered for job type: ${job.type}`, null);
      return false;
    }

    try {
      const parsedPayload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
      await handler(parsedPayload, job);
      await dbQueries.completeJob(job.id);
      return true;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      if (job.attempts < job.max_attempts) {
        // Exponential backoff: 5s, 10s, 20s, 40s, 80s (max 300s)
        const backoffSec = Math.min(300, Math.pow(2, job.attempts) * 5);
        await dbQueries.failJob(job.id, errorMsg, backoffSec);
      } else {
        await dbQueries.failJob(job.id, `Max attempts reached. Last error: ${errorMsg}`, null);
      }
      return false;
    }
  }
}

export const jobQueue = new JobQueueManager(1000);
