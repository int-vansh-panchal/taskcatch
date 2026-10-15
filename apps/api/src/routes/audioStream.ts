import { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "taskcatch_jwt_secret_dev_32_characters_long_min";

export async function audioStreamRoutes(fastify: FastifyInstance) {
  fastify.get("/api/audio/stream/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const token = (request.query as any)?.token || (request as any).cookies?.access_token;

    // Verify token if provided, or allow in dev/test
    if (token) {
      try {
        jwt.verify(token, JWT_SECRET);
      } catch {
        return reply.status(401).send({ error: "Invalid or expired audio stream token." });
      }
    } else if (process.env.NODE_ENV === "production") {
      return reply.status(401).send({ error: "Audio playback requires a signed token." });
    }

    const found = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (found.length === 0 || !found[0].audio_path) {
      return reply.status(404).send({ error: "Session audio not found." });
    }

    const audioPath = path.resolve(found[0].audio_path);
    if (!fs.existsSync(audioPath)) {
      return reply.status(404).send({ error: "Audio file missing from storage." });
    }

    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;
    const range = request.headers.range;

    // Determine MIME type
    const ext = path.extname(audioPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".wav": "audio/wav",
      ".webm": "audio/webm",
      ".mp3": "audio/mpeg",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
    };
    const contentType = mimeMap[ext] || "audio/webm";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        reply.header("Content-Range", `bytes */${fileSize}`);
        return reply.status(416).send({ error: "Requested range not satisfiable." });
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(audioPath, { start, end });

      reply.status(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      reply.header("Accept-Ranges", "bytes");
      reply.header("Content-Length", chunkSize);
      reply.header("Content-Type", contentType);

      return reply.send(fileStream);
    } else {
      reply.status(200);
      reply.header("Content-Length", fileSize);
      reply.header("Accept-Ranges", "bytes");
      reply.header("Content-Type", contentType);
      const fileStream = fs.createReadStream(audioPath);
      return reply.send(fileStream);
    }
  });
}
