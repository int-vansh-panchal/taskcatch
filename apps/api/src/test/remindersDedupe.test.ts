import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbQueries } from "../db/queries.js";
import { initDatabase, pool } from "../db/index.js";

describe("Reminder Engine Deduplication & Scheduling", () => {
  const testUserId = "user_test_reminders_dedupe";

  beforeAll(async () => {
    await initDatabase();
    await pool.query(
      `INSERT INTO users (id, name, email) VALUES ($1, 'Test Reminders User', 'test_reminders@taskcatch.test') ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );
    await pool.query(`DELETE FROM tasks WHERE user_id = $1`, [testUserId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tasks WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    await pool.end();
  });

  it("creates scheduled reminders for a task with due_at", async () => {
    const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hrs from now
    const task = await dbQueries.createTask({
      userId: testUserId,
      title: "Test Reminder Task",
      description: "Ensure reminders schedule properly",
      dueAt,
      priority: "high",
    });

    expect(task.id).toBeDefined();

    const reminder = await dbQueries.createReminder({
      userId: testUserId,
      taskId: task.id,
      fireAt: dueAt,
      channel: "fcm",
    });

    expect(reminder.id).toBeDefined();
    expect(reminder.status).toBe("pending");
    expect(reminder.sent_at).toBeNull();
  });

  it("never returns sent reminders in subsequent pending queries (idempotent polling)", async () => {
    const pastTime = new Date(Date.now() - 60 * 1000).toISOString();
    const task = await dbQueries.createTask({
      userId: testUserId,
      title: "Overdue Dedupe Task",
      description: "Testing duplicate prevention",
      dueAt: pastTime,
      priority: "urgent",
    });

    const reminder = await dbQueries.createReminder({
      userId: testUserId,
      taskId: task.id,
      fireAt: pastTime,
      channel: "desktop",
    });

    // 1. Initial pending check finds this reminder
    const nowIso = new Date().toISOString();
    const firstCheck = await dbQueries.getPendingReminders(nowIso);
    const found = firstCheck.find((r) => r.id === reminder.id);
    expect(found).toBeDefined();

    // 2. Mark reminder sent
    await dbQueries.markReminderSent(reminder.id);

    // 3. Second check immediately after finds 0 instances (deduped across restarts / workers)
    const secondCheck = await dbQueries.getPendingReminders(nowIso);
    const foundSecond = secondCheck.find((r) => r.id === reminder.id);
    expect(foundSecond).toBeUndefined();
  });

  it("snoozes a task and properly updates snoozed_until", async () => {
    const task = await dbQueries.createTask({
      userId: testUserId,
      title: "Task to Snooze",
      description: "Testing snooze action",
      priority: "med",
    });

    const snoozeTarget = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const updated = await dbQueries.updateTask(task.id, {
      snoozed_until: snoozeTarget,
    });

    expect(updated?.snoozed_until).toBe(snoozeTarget);
  });
});
