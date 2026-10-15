import type { FastifyPluginAsync } from "fastify";
import { dbQueries } from "../db/queries.js";
import { wsService } from "../services/websocketService.js";
import { config } from "../config.js";
import { z } from "zod";

const CreateTaskBodySchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(1),
  due_at: z.string().nullable().optional(),
  priority: z.enum(["low", "med", "high", "urgent"]).optional(),
  tags: z.array(z.string()).optional(),
  requested_by: z.string().nullable().optional(),
});

const UpdateTaskBodySchema = z.object({
  title: z.string().max(80).optional(),
  description: z.string().optional(),
  status: z.enum(["needs_review", "open", "done", "discarded"]).optional(),
  priority: z.enum(["low", "med", "high", "urgent"]).optional(),
  due_at: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  snoozed_until: z.string().nullable().optional(),
  needs_clarification: z.boolean().optional(),
  clarification_question: z.string().nullable().optional(),
});

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  // ── List Tasks ─────────────────────────────────────────────────────────────
  fastify.get("/", async (req, reply) => {
    const query = req.query as {
      status?: any;
      sessionId?: string;
      limit?: string;
    };
    const userId = config.defaultUserId;
    const tasks = await dbQueries.listTasks({
      userId,
      status: query.status,
      sessionId: query.sessionId,
      limit: query.limit ? parseInt(query.limit, 10) : 100,
    });
    return reply.send({ tasks });
  });

  // ── Today View ─────────────────────────────────────────────────────────────
  fastify.get("/today", async (req, reply) => {
    const userId = config.defaultUserId;
    const allOpenTasks = await dbQueries.listTasks({ userId, limit: 200 });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

    const overdue: typeof allOpenTasks = [];
    const dueToday: typeof allOpenTasks = [];
    const upcoming: typeof allOpenTasks = [];
    const noDate: typeof allOpenTasks = [];

    for (const t of allOpenTasks) {
      if (t.status === "done" || t.status === "discarded") continue;

      if (!t.due_at) {
        noDate.push(t);
        continue;
      }

      const dueTime = new Date(t.due_at).getTime();
      if (dueTime < startOfToday) {
        overdue.push(t);
      } else if (dueTime <= endOfToday) {
        dueToday.push(t);
      } else {
        upcoming.push(t);
      }
    }

    return reply.send({
      overdue,
      dueToday,
      upcoming: upcoming.slice(0, 10),
      noDate,
    });
  });

  // ── Full-Text Search (Postgres tsvector plainto_tsquery) ───────────────────
  fastify.get("/search", async (req, reply) => {
    const query = (req.query as { q?: string }).q || "";
    const userId = config.defaultUserId;
    const results = await dbQueries.searchTasks(userId, query);
    return reply.send({ tasks: results });
  });

  // ── Get Task by ID ─────────────────────────────────────────────────────────
  fastify.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await dbQueries.getTask(id);
    if (!task) return reply.status(404).send({ error: "Task not found" });
    return reply.send({ task });
  });

  // ── Create Quick Task ──────────────────────────────────────────────────────
  fastify.post("/", async (req, reply) => {
    const parsed = CreateTaskBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const userId = config.defaultUserId;
    const task = await dbQueries.createTask({
      userId,
      title: parsed.data.title,
      description: parsed.data.description,
      dueAt: parsed.data.due_at,
      priority: parsed.data.priority || "med",
      status: "open", // Directly open for manual entries
      tags: parsed.data.tags || [],
      requestedBy: parsed.data.requested_by,
      confidence: 1.0,
    });

    wsService.broadcastToUser(userId, {
      type: "task.created",
      task,
    });

    return reply.status(201).send({ task });
  });

  // ── Update Task ────────────────────────────────────────────────────────────
  fastify.patch("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateTaskBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const updated = await dbQueries.updateTask(id, parsed.data);
    if (!updated) {
      return reply.status(404).send({ error: "Task not found" });
    }

    // Broadcast update across devices
    wsService.broadcastToUser(updated.user_id, {
      type: "task.updated",
      task: updated,
    });

    return reply.send({ task: updated });
  });

  // ── Clarify Task ───────────────────────────────────────────────────────────
  fastify.post("/:id/clarify", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { clarification: string };

    const task = await dbQueries.getTask(id);
    if (!task) return reply.status(404).send({ error: "Task not found" });

    const updated = await dbQueries.updateTask(id, {
      description: `${task.description}\n\nClarification Note: ${body.clarification || "User answered clarification."}`,
      needs_clarification: false,
    });

    if (updated) {
      wsService.broadcastToUser(updated.user_id, {
        type: "task.updated",
        task: updated,
      });
    }

    return reply.send({ task: updated });
  });
};
