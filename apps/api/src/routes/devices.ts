import type { FastifyPluginAsync } from "fastify";
import { dbQueries } from "../db/queries.js";
import { config } from "../config.js";
import { z } from "zod";

const RegisterDeviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platform: z.enum(["web", "phone", "desktop"]),
  fcmToken: z.string().nullable().optional(),
});

export const deviceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/register", async (req, reply) => {
    const parsed = RegisterDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const device = await dbQueries.upsertDevice({
      id: parsed.data.id,
      userId: config.defaultUserId,
      name: parsed.data.name,
      platform: parsed.data.platform,
      fcmToken: parsed.data.fcmToken,
    });

    return reply.send({ device });
  });

  fastify.get("/", async (req, reply) => {
    const userId = (req as any).user?.id || config.defaultUserId;
    const devices = await dbQueries.getUserDevices(userId);
    return reply.send({ devices });
  });

  fastify.post("/test-push", async (req, reply) => {
    const userId = (req as any).user?.id || config.defaultUserId;
    const { sendPushNotification } = await import("../services/notificationService.js");

    const result = await sendPushNotification({
      userId,
      title: "TaskCatch Test Push",
      body: "Firebase push notification is working perfectly on this device!",
      payload: { type: "test", timestamp: Date.now() },
    });

    return reply.send({
      success: true,
      sent: result.sent,
      failed: result.failed,
      message:
        result.sent > 0
          ? `Notification successfully sent to ${result.sent} device(s)!`
          : "No active FCM tokens registered for this user yet.",
    });
  });

  fastify.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { pool } = await import("../db/index.js");
    const client = await pool.connect();
    try {
      await client.query("DELETE FROM devices WHERE id = $1", [id]);
    } finally {
      client.release();
    }
    return reply.send({ success: true, message: "Device removed" });
  });
};
