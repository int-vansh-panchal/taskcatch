import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { closeDatabase } from "../db/index.js";
import type { FastifyInstance } from "fastify";

describe("Fastify API Endpoints with PostgreSQL", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
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
  });
});
