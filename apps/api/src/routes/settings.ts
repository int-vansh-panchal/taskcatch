import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db/index.js";
import { config } from "../config.js";
import { z } from "zod";

const UpdateSettingsSchema = z.object({
  digest_time: z.string().optional(),
  reminder_offsets_minutes: z.array(z.number()).optional(),
  vocabulary_hints: z.string().optional(),
  speech_provider: z.string().optional(),
  llm_provider: z.string().optional(),
  quiet_hours_start: z.string().optional(),
  quiet_hours_end: z.string().optional(),
});

export const settingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (req, reply) => {
    const userId = config.defaultUserId;
    const res = await pool.query(`SELECT * FROM settings WHERE user_id = $1`, [userId]);
    const row = res.rows[0] || {};

    return reply.send({
      settings: {
        ...row,
        reminder_offsets_minutes:
          typeof row.reminder_offsets_minutes === "string"
            ? JSON.parse(row.reminder_offsets_minutes)
            : row.reminder_offsets_minutes || [1440, 60, 0],
      },
    });
  });

  fastify.put("/", async (req, reply) => {
    const parsed = UpdateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    const userId = config.defaultUserId;
    const currentRes = await pool.query(`SELECT * FROM settings WHERE user_id = $1`, [userId]);
    const current = currentRes.rows[0] || {};

    const digestTime = parsed.data.digest_time ?? current.digest_time ?? "09:00";
    const offsets = parsed.data.reminder_offsets_minutes
      ? JSON.stringify(parsed.data.reminder_offsets_minutes)
      : typeof current.reminder_offsets_minutes === "string"
        ? current.reminder_offsets_minutes
        : JSON.stringify(current.reminder_offsets_minutes || [1440, 60, 0]);
    const vocab = parsed.data.vocabulary_hints ?? current.vocabulary_hints ?? "";
    const speechProv = parsed.data.speech_provider ?? current.speech_provider ?? "faster-whisper";
    const llmProv = parsed.data.llm_provider ?? current.llm_provider ?? "ollama";
    const quietStart = parsed.data.quiet_hours_start ?? current.quiet_hours_start ?? "22:00";
    const quietEnd = parsed.data.quiet_hours_end ?? current.quiet_hours_end ?? "08:00";

    const updateRes = await pool.query(
      `
      INSERT INTO settings (user_id, digest_time, reminder_offsets_minutes, vocabulary_hints, speech_provider, llm_provider, quiet_hours_start, quiet_hours_end, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, now())
      ON CONFLICT(user_id) DO UPDATE SET
        digest_time = excluded.digest_time,
        reminder_offsets_minutes = excluded.reminder_offsets_minutes,
        vocabulary_hints = excluded.vocabulary_hints,
        speech_provider = excluded.speech_provider,
        llm_provider = excluded.llm_provider,
        quiet_hours_start = excluded.quiet_hours_start,
        quiet_hours_end = excluded.quiet_hours_end,
        updated_at = now()
      RETURNING *
      `,
      [userId, digestTime, offsets, vocab, speechProv, llmProv, quietStart, quietEnd]
    );

    const updated = updateRes.rows[0];

    return reply.send({
      settings: {
        ...updated,
        reminder_offsets_minutes:
          typeof updated.reminder_offsets_minutes === "string"
            ? JSON.parse(updated.reminder_offsets_minutes)
            : updated.reminder_offsets_minutes || [],
      },
    });
  });
};
