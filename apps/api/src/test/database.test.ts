import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initDatabase, sqlite } from "../db/index.js";
import { dbQueries } from "../db/queries.js";

describe("SQLite Database & FTS5 Search", () => {
  beforeAll(() => {
    initDatabase();
    sqlite.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)").run("user_test_db", "Test User");
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM tasks WHERE user_id = 'user_test_db'");
  });

  it("creates tasks and performs full-text search via FTS5", () => {
    const testUserId = "user_test_db";
    const task = dbQueries.createTask({
      userId: testUserId,
      title: "Deploy solar inverter firmware v2",
      description: "Critical bugfix for DC-DC boost stage and Modbus RTU communication timeout.",
      priority: "urgent",
      tags: ["solar", "firmware"],
      confidence: 0.95,
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe("Deploy solar inverter firmware v2");

    // FTS search for "firmware"
    const search1 = dbQueries.searchTasks(testUserId, "firmware");
    expect(search1.length).toBeGreaterThan(0);
    expect(search1[0].id).toBe(task.id);

    // FTS search for "Modbus"
    const search2 = dbQueries.searchTasks(testUserId, "Modbus");
    expect(search2.length).toBeGreaterThan(0);
    expect(search2[0].id).toBe(task.id);

    // Update title and test FTS update trigger
    dbQueries.updateTask(task.id, { title: "Updated inverter patch" });
    const search3 = dbQueries.searchTasks(testUserId, "Updated patch");
    expect(search3.length).toBeGreaterThan(0);
  });

  it("handles sessions and bookmarks correctly", () => {
    const session = dbQueries.createSession({
      userId: "user_test_db",
      deviceId: "laptop_thinkpad",
      status: "recording",
    });

    expect(session.status).toBe("recording");

    const bm = dbQueries.addBookmark(session.id, 15000, "Important discussion");
    expect(bm.timestamp_ms).toBe(15000);
    expect(bm.label).toBe("Important discussion");

    const bookmarks = dbQueries.getBookmarks(session.id);
    expect(bookmarks.length).toBe(1);
    expect(bookmarks[0].id).toBe(bm.id);
  });
});
