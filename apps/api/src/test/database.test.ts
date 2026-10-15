import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initDatabase, pool } from "../db/index.js";
import { dbQueries } from "../db/queries.js";

describe("PostgreSQL Database & GIN tsvector Search", () => {
  beforeAll(async () => {
    await initDatabase();
    await pool.query(
      `INSERT INTO users (id, name) VALUES ('user_test_pg', 'Test User PG') ON CONFLICT (id) DO NOTHING`
    );
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM tasks WHERE user_id = 'user_test_pg'`);
  });

  it("creates tasks and performs full-text search via Postgres tsvector & GIN index", async () => {
    const testUserId = "user_test_pg";
    const task = await dbQueries.createTask({
      userId: testUserId,
      title: "Deploy solar inverter firmware v2",
      description: "Critical bugfix for DC-DC boost stage and Modbus RTU communication timeout.",
      priority: "urgent",
      tags: ["solar", "firmware"],
      confidence: 0.95,
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe("Deploy solar inverter firmware v2");

    // Full text search via tsvector @@ plainto_tsquery for "firmware"
    const search1 = await dbQueries.searchTasks(testUserId, "firmware");
    expect(search1.length).toBeGreaterThan(0);
    expect(search1[0].id).toBe(task.id);

    // Search for "Modbus"
    const search2 = await dbQueries.searchTasks(testUserId, "Modbus");
    expect(search2.length).toBeGreaterThan(0);
    expect(search2[0].id).toBe(task.id);

    // Update task and test search on updated field
    await dbQueries.updateTask(task.id, { title: "Updated inverter patch" });
    const search3 = await dbQueries.searchTasks(testUserId, "Updated patch");
    expect(search3.length).toBeGreaterThan(0);
  });

  it("handles sessions and bookmarks correctly", async () => {
    const session = await dbQueries.createSession({
      userId: "user_test_pg",
      deviceId: "laptop_thinkpad",
      status: "recording",
    });

    expect(session.status).toBe("recording");

    const bm = await dbQueries.addBookmark(session.id, 15000, "Important discussion");
    expect(bm.timestamp_ms).toBe(15000);
    expect(bm.label).toBe("Important discussion");

    const bookmarks = await dbQueries.getBookmarks(session.id);
    expect(bookmarks.length).toBe(1);
    expect(bookmarks[0].id).toBe(bm.id);
  });
});
