import type { FastifyPluginAsync } from "fastify";
import { dbQueries } from "../db/queries.js";
import { jobQueue } from "../jobs/queue.js";
import { wsService } from "../services/websocketService.js";
import { config } from "../config.js";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // Ensure storage directories exist
  const uploadDir = config.storageDir;
  const chunkDir = path.join(uploadDir, "chunks");
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(chunkDir, { recursive: true });

  // ── List Sessions ──────────────────────────────────────────────────────────
  fastify.get("/", async (req, reply) => {
    const userId = config.defaultUserId;
    const sessions = await dbQueries.listSessions(userId);
    return reply.send({ sessions });
  });

  // ── Get Session Details ────────────────────────────────────────────────────
  fastify.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await dbQueries.getSession(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    const segments = await dbQueries.getSegments(id);
    const bookmarks = await dbQueries.getBookmarks(id);
    const tasks = await dbQueries.listTasks({ userId: session.user_id, sessionId: id });
    const notes = await dbQueries.getSessionNotes(id);

    return reply.send({
      session,
      segments,
      bookmarks,
      tasks,
      notes,
    });
  });

  // ── Create Recording Session ───────────────────────────────────────────────
  fastify.post("/", async (req, reply) => {
    const body = req.body as {
      deviceId?: string;
      status?: "recording" | "uploaded";
    };

    const session = await dbQueries.createSession({
      userId: config.defaultUserId,
      deviceId: body.deviceId || "device_web",
      status: body.status || "recording",
    });

    wsService.broadcastToUser(session.user_id, {
      type: "session.updated",
      session,
    });

    return reply.status(201).send({ session });
  });

  // ── Add Bookmark ───────────────────────────────────────────────────────────
  fastify.post("/:id/bookmarks", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { timestampMs: number; label?: string };

    const session = await dbQueries.getSession(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    const bookmark = await dbQueries.addBookmark(id, body.timestampMs, body.label);
    return reply.status(201).send({ bookmark });
  });

  // ── Upload Chunk (Resumable Chunked Upload) ─────────────────────────────────
  fastify.post("/:id/chunks", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await dbQueries.getSession(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "No audio chunk uploaded" });

    const partNumber = (data.fields.partNumber as any)?.value || "0";
    const chunkPath = path.join(chunkDir, `${id}_part_${String(partNumber).padStart(5, "0")}.webm`);

    const writeStream = fs.createWriteStream(chunkPath);
    await data.file.pipe(writeStream);

    return reply.send({ success: true, partNumber });
  });

  // ── Finish Chunked Session ─────────────────────────────────────────────────
  fastify.post("/:id/finish", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await dbQueries.getSession(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    // Find and sort all uploaded chunks for this session
    const chunkFiles = fs
      .readdirSync(chunkDir)
      .filter((f) => f.startsWith(`${id}_part_`))
      .sort();

    const outputWav = path.join(uploadDir, `${id}.wav`);

    if (chunkFiles.length > 0) {
      // Create a concat list for ffmpeg
      const concatListFile = path.join(chunkDir, `${id}_concat.txt`);
      const fileLines = chunkFiles.map((f) => `file '${path.join(chunkDir, f)}'`).join("\n");
      fs.writeFileSync(concatListFile, fileLines);

      try {
        // Concat and normalize to 16kHz mono WAV using ffmpeg
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListFile}" -ar 16000 -ac 1 "${outputWav}"`);
      } catch (err) {
        console.warn(`[Sessions] ffmpeg concat warning, attempting single input:`, err);
      } finally {
        if (fs.existsSync(concatListFile)) fs.unlinkSync(concatListFile);
      }
    } else {
      // Fallback: create empty or placeholder WAV
      await execAsync(`ffmpeg -y -f lavfi -i anullsrc=r=16000:cl=mono -t 1 "${outputWav}"`);
    }

    await dbQueries.updateSession(id, {
      audio_path: outputWav,
      status: "uploaded",
    });

    // Enqueue async processing pipeline job
    await jobQueue.enqueueJob("process_session", { sessionId: id });

    return reply.send({ success: true, status: "uploaded", audioPath: outputWav });
  });

  // ── Direct Audio File Upload (e.g. Phone Voice Recorder / Web Share) ────────
  fastify.post("/upload", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "No audio file provided" });

    const sessionId = `sess_${Date.now()}`;
    const rawExt = path.extname(data.filename) || ".webm";
    const rawPath = path.join(uploadDir, `${sessionId}_raw${rawExt}`);
    const normalizedWav = path.join(uploadDir, `${sessionId}.wav`);

    const writeStream = fs.createWriteStream(rawPath);
    await data.file.pipe(writeStream);

    // Normalize with ffmpeg to 16 kHz mono WAV
    try {
      await execAsync(`ffmpeg -y -i "${rawPath}" -ar 16000 -ac 1 "${normalizedWav}"`);
    } catch {
      // If conversion fails, keep raw
      fs.copyFileSync(rawPath, normalizedWav);
    }

    const session = await dbQueries.createSession({
      id: sessionId,
      userId: config.defaultUserId,
      deviceId: "import",
      audioPath: normalizedWav,
      status: "uploaded",
    });

    // Enqueue processing
    await jobQueue.enqueueJob("process_session", { sessionId: session.id });

    return reply.status(201).send({ session });
  });

  // ── Reprocess Session ──────────────────────────────────────────────────────
  fastify.post("/:id/reprocess", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await dbQueries.getSession(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    await dbQueries.updateSession(id, { status: "uploaded" });
    await jobQueue.enqueueJob("process_session", { sessionId: id });

    return reply.send({ success: true, message: "Session enqueued for reprocessing" });
  });

  // ── Stream Audio ───────────────────────────────────────────────────────────
  fastify.get("/:id/audio", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await dbQueries.getSession(id);
    if (!session || !session.audio_path || !fs.existsSync(session.audio_path)) {
      return reply.status(404).send({ error: "Audio not found" });
    }

    const stat = fs.statSync(session.audio_path);
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(session.audio_path, { start, end });

      reply.raw.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "audio/wav",
      });
      return file.pipe(reply.raw);
    } else {
      reply.raw.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": "audio/wav",
      });
      return fs.createReadStream(session.audio_path).pipe(reply.raw);
    }
  });
};
