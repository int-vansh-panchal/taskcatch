import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db/index.js";
import { dbQueries } from "../db/queries.js";
import { config } from "../config.js";
import { wsService } from "../services/websocketService.js";
import { ProviderFactory } from "../providers/factory.js";
import { z } from "zod";

const UpdateSettingsSchema = z.object({
  digest_time: z.string().optional(),
  reminder_offsets_minutes: z.array(z.number()).optional(),
  vocabulary_hints: z.string().optional(),
  speech_provider: z.string().optional(),
  speech_model: z.string().optional(),
  llm_provider: z.string().optional(),
  llm_model: z.string().optional(),
  profile: z.enum(["fast", "accurate"]).optional(),
  whisper_dual_pass: z.boolean().optional(),
  retention_days: z.number().int().min(1).max(365).optional(),
  working_hours_start: z.string().optional(),
  working_hours_end: z.string().optional(),
  quiet_hours_start: z.string().optional(),
  quiet_hours_end: z.string().optional(),
  enable_gemini_fallback: z.boolean().optional(),
  gemini_api_key: z.string().optional(),
});

export const settingRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Get Current Settings ───────────────────────────────────────────────────
  fastify.get("/", async (req, reply) => {
    const userId = (req as any).user?.id || config.defaultUserId;
    const settings = await dbQueries.getSettings(userId);
    return reply.send({ settings: settings || {} });
  });

  // ── Update Settings ────────────────────────────────────────────────────────
  fastify.put("/", async (req, reply) => {
    const parsed = UpdateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const userId = (req as any).user?.id || config.defaultUserId;
    const updated = await dbQueries.updateSettings(userId, parsed.data);

    // Broadcast config update over WebSocket so UI and sidecars hot-reload live
    wsService.broadcastToUser(userId, {
      type: "config.updated" as any,
      settings: updated,
    } as any);

    return reply.send({ settings: updated });
  });

  // ── Check Provider Health ──────────────────────────────────────────────────
  fastify.get("/providers/status", async (req, reply) => {
    const userId = (req as any).user?.id || config.defaultUserId;
    const userSettings = await dbQueries.getSettings(userId);

    const speechProvider = await ProviderFactory.getSpeechProvider(userSettings?.speech_provider);
    const llmProvider = await ProviderFactory.getLLMProvider(
      userSettings?.llm_provider,
      userSettings?.llm_model
    );

    const speechHealth = speechProvider.healthCheck
      ? await speechProvider.healthCheck()
      : { ok: true, message: "Ready" };
    const llmHealth = llmProvider.healthCheck
      ? await llmProvider.healthCheck()
      : { ok: true, message: "Ready" };

    return reply.send({
      speech: {
        provider: speechProvider.name,
        healthy: speechHealth.ok,
        message: speechHealth.message,
      },
      llm: {
        provider: llmProvider.name,
        healthy: llmHealth.ok,
        message: llmHealth.message,
      },
    });
  });

  // ── Export Vocabulary Hints ────────────────────────────────────────────────
  fastify.get("/vocabulary/export", async (req, reply) => {
    const userId = (req as any).user?.id || config.defaultUserId;
    const s = await dbQueries.getSettings(userId);
    const vocab = s?.vocabulary_hints || "";
    const list = vocab
      .split(/[,;\n]+/)
      .map((w: string) => w.trim())
      .filter(Boolean);

    reply.header("Content-Disposition", 'attachment; filename="taskcatch_vocabulary.json"');
    return reply.send({
      count: list.length,
      vocabulary: list,
      raw: vocab,
    });
  });

  // ── Import Vocabulary Hints ────────────────────────────────────────────────
  fastify.post("/vocabulary/import", async (req, reply) => {
    const userId = (req as any).user?.id || config.defaultUserId;
    const body = req.body as { words?: string[]; text?: string; merge?: boolean };

    const currentSettings = await dbQueries.getSettings(userId);
    const existing = (currentSettings?.vocabulary_hints || "")
      .split(/[,;\n]+/)
      .map((w: string) => w.trim())
      .filter(Boolean);

    let incoming: string[] = [];
    if (Array.isArray(body.words)) {
      incoming = body.words.map((w) => w.trim()).filter(Boolean);
    } else if (typeof body.text === "string") {
      incoming = body.text.split(/[,;\n]+/).map((w) => w.trim()).filter(Boolean);
    }

    const merged = body.merge !== false
      ? Array.from(new Set([...existing, ...incoming]))
      : Array.from(new Set(incoming));

    const updatedStr = merged.join(", ");
    await dbQueries.updateSettings(userId, { vocabulary_hints: updatedStr });

    return reply.send({
      success: true,
      totalCount: merged.length,
      vocabulary_hints: updatedStr,
    });
  });
};
