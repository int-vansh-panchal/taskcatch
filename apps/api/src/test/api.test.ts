import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { closeDatabase, pool } from "../db/index.js";
import type { FastifyInstance } from "fastify";

describe("Fastify API Endpoints with PostgreSQL", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await pool.query("DELETE FROM tasks WHERE title LIKE 'Test quick manual task%'");
    await app.close();
    await closeDatabase();
  });

  it("GET /health returns status ok and database postgresql-16", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("taskcatch-api");
    expect(body.database).toBe("postgresql-16");
  });

  it("POST /api/tasks creates a quick task and PATCH /api/tasks/:id updates it", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Test quick manual task",
        description: "Review pull request #42 for database indexing.",
        priority: "high",
        tags: ["pr", "review"],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.payload).task;
    expect(created.title).toBe("Test quick manual task");
    expect(created.status).toBe("open");

    // Patch status to done
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${created.id}`,
      payload: {
        status: "done",
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const updated = JSON.parse(patchRes.payload).task;
    expect(updated.status).toBe("done");

    // Delete task
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${created.id}`,
    });
    expect(delRes.statusCode).toBe(200);
    expect(JSON.parse(delRes.payload).success).toBe(true);
  });

  it("GET /api/tasks/today returns structured today view", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tasks/today",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("overdue");
    expect(body).toHaveProperty("dueToday");
    expect(body).toHaveProperty("upcoming");
    expect(body).toHaveProperty("noDate");
    expect(body).toHaveProperty("completed");
  });

  it("GET /api/sessions and POST /api/sessions", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        deviceId: "device_thinkpad_e495",
        status: "recording",
      },
    });

    expect(createRes.statusCode).toBe(201);
    const session = JSON.parse(createRes.payload).session;
    expect(session.id).toBeDefined();

    const getRes = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}`,
    });

    expect(getRes.statusCode).toBe(200);
    const sessionDetail = JSON.parse(getRes.payload);
    expect(sessionDetail.session.id).toBe(session.id);

    // Test Export
    const exportRes = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/export`,
    });
    expect(exportRes.statusCode).toBe(200);
    const exported = JSON.parse(exportRes.payload);
    expect(exported.session.id).toBe(session.id);

    // Test Delete
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/sessions/${session.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);
  });

  it("GET /api/settings/providers/status and vocabulary import/export", async () => {
    const statusRes = await app.inject({
      method: "GET",
      url: "/api/settings/providers/status",
    });
    expect(statusRes.statusCode).toBe(200);
    const status = JSON.parse(statusRes.payload);
    expect(status).toHaveProperty("speech");
    expect(status).toHaveProperty("llm");

    // Import vocabulary
    const importRes = await app.inject({
      method: "POST",
      url: "/api/settings/vocabulary/import",
      payload: {
        words: ["solar", "inverter", "modbus", "firmware"],
      },
    });
    expect(importRes.statusCode).toBe(200);
    const imported = JSON.parse(importRes.payload);
    expect(imported.totalCount).toBeGreaterThanOrEqual(4);

    // Export vocabulary
    const exportRes = await app.inject({
      method: "GET",
      url: "/api/settings/vocabulary/export",
    });
    expect(exportRes.statusCode).toBe(200);
    const exported = JSON.parse(exportRes.payload);
    expect(exported.vocabulary).toContain("solar");
  });
});
