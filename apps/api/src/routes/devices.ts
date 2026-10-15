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
    const devices = await dbQueries.getUserDevices(config.defaultUserId);
    return reply.send({ devices });
  });
};
