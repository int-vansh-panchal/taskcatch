import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initDatabase, sqlite } from "../db/index.js";
import { JobQueueManager } from "../jobs/queue.js";
import { dbQueries } from "../db/queries.js";

describe("JobQueueManager", () => {
  beforeAll(() => {
    initDatabase();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM jobs");
  });

  it("enqueues and processes a job successfully", async () => {
    const queue = new JobQueueManager(50);
    let handled = false;

    queue.registerWorker("test_success_job", async (payload) => {
      expect(payload.data).toBe("test_val");
      handled = true;
    });

    const job = dbQueries.enqueueJob("test_success_job", { data: "test_val" });
    expect(job.status).toBe("pending");

    const processed = await queue.processNextJob();
    expect(processed).toBe(true);
    expect(handled).toBe(true);
  });

  it("handles failed jobs with exponential retry backoff", async () => {
    const queue = new JobQueueManager(50);

    queue.registerWorker("test_fail_job", async () => {
      throw new Error("Simulated transient network failure");
    });

    const job = dbQueries.enqueueJob("test_fail_job", { retry: true });
    expect(job.status).toBe("pending");

    const processed = await queue.processNextJob();
    expect(processed).toBe(false);

    // Verify job was updated with retry timestamp and attempts incremented
    const claimedAgain = dbQueries.claimNextJob();
    // Because next run_at is in the future (backoff), it should not be claimable immediately
    expect(claimedAgain).toBeNull();
  });
});
