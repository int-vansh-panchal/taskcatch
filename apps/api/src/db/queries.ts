import { pool } from "./index.js";
import type {
  Task,
  Session,
  TranscriptSegment,
  Bookmark,
  Device,
  Reminder,
  Note,
  Job,
} from "@taskcatch/shared";
import crypto from "node:crypto";

function toIso(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : d.toISOString();
  }
  return new Date(val).toISOString();
}

function toTask(row: any): Task {
  return {
    ...row,
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags || [],
    due_at: toIso(row.due_at),
    snoozed_until: toIso(row.snoozed_until),
    created_at: toIso(row.created_at) || new Date().toISOString(),
    updated_at: toIso(row.updated_at) || new Date().toISOString(),
  };
}

function toReminder(r: any): Reminder {
  return {
    ...r,
    fire_at: toIso(r.fire_at) || new Date().toISOString(),
    sent_at: toIso(r.sent_at),
    created_at: toIso(r.created_at) || new Date().toISOString(),
  };
}

function toJob(r: any): Job {
  return {
    ...r,
    payload: typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload),
    run_at: toIso(r.run_at) || new Date().toISOString(),
    created_at: toIso(r.created_at) || new Date().toISOString(),
    updated_at: toIso(r.updated_at) || new Date().toISOString(),
  };
}

function toSession(row: any): Session {
  return {
    ...row,
    created_at: toIso(row.created_at) || new Date().toISOString(),
    updated_at: toIso(row.updated_at) || new Date().toISOString(),
  };
}

export const dbQueries = {
  // ── Sessions ───────────────────────────────────────────────────────────────
  async createSession(data: {
    id?: string;
    userId: string;
    deviceId: string;
    audioPath?: string | null;
    status: Session["status"];
    languageDetected?: string | null;
  }): Promise<Session> {
    const id = data.id || `sess_${crypto.randomUUID()}`;
    const res = await pool.query(
      `
      INSERT INTO sessions (id, user_id, device_id, audio_path, status, language_detected)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        id,
        data.userId,
        data.deviceId,
        data.audioPath || null,
        data.status,
        data.languageDetected || null,
      ]
    );
    return toSession(res.rows[0]);
  },

  async getSession(id: string): Promise<Session | null> {
    const res = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);
    return res.rows[0] ? toSession(res.rows[0]) : null;
  },

  async updateSession(
    id: string,
    updates: Partial<
      Pick<Session, "status" | "audio_path" | "duration_sec" | "summary" | "language_detected">
    >
  ): Promise<Session | null> {
    const setClauses: string[] = ["updated_at = now()"];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.audio_path !== undefined) {
      setClauses.push(`audio_path = $${idx++}`);
      values.push(updates.audio_path);
    }
    if (updates.duration_sec !== undefined) {
      setClauses.push(`duration_sec = $${idx++}`);
      values.push(updates.duration_sec);
    }
    if (updates.summary !== undefined) {
      setClauses.push(`summary = $${idx++}`);
      values.push(updates.summary);
    }
    if (updates.language_detected !== undefined) {
      setClauses.push(`language_detected = $${idx++}`);
      values.push(updates.language_detected);
    }

    values.push(id);
    const res = await pool.query(
      `
      UPDATE sessions SET ${setClauses.join(", ")}
      WHERE id = $${idx}
      RETURNING *
      `,
      values
    );
    return res.rows[0] ? toSession(res.rows[0]) : null;
  },

  async listSessions(userId: string, limit = 50, offset = 0): Promise<Session[]> {
    const res = await pool.query(
      `SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return res.rows.map(toSession);
  },

  // ── Transcript Segments ────────────────────────────────────────────────────
  async insertSegments(
    sessionId: string,
    segments: Array<{
      start_ms: number;
      end_ms: number;
      speaker?: string;
      text_original: string;
      text_english: string;
    }>
  ): Promise<void> {
    if (!segments.length) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let idx = 0; idx < segments.length; idx++) {
        const item = segments[idx];
        await client.query(
          `
          INSERT INTO transcript_segments (
            id, session_id, segment_index, start_ms, end_ms, speaker, text_original, text_english
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            `seg_${crypto.randomUUID()}`,
            sessionId,
            idx,
            item.start_ms,
            item.end_ms,
            item.speaker || "Speaker 1",
            item.text_original,
            item.text_english,
          ]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  async getSegments(sessionId: string): Promise<TranscriptSegment[]> {
    const res = await pool.query(
      `SELECT * FROM transcript_segments WHERE session_id = $1 ORDER BY segment_index ASC`,
      [sessionId]
    );
    return res.rows;
  },

  // ── Bookmarks ──────────────────────────────────────────────────────────────
  async addBookmark(sessionId: string, timestampMs: number, label?: string | null): Promise<Bookmark> {
    const id = `bm_${crypto.randomUUID()}`;
    const res = await pool.query(
      `
      INSERT INTO bookmarks (id, session_id, timestamp_ms, label)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [id, sessionId, timestampMs, label || null]
    );
    const r = res.rows[0];
    return {
      ...r,
      created_at: toIso(r.created_at) || new Date().toISOString(),
    };
  },

  async getBookmarks(sessionId: string): Promise<Bookmark[]> {
    const res = await pool.query(
      `SELECT * FROM bookmarks WHERE session_id = $1 ORDER BY timestamp_ms ASC`,
      [sessionId]
    );
    return res.rows.map((r) => ({
      ...r,
      created_at: toIso(r.created_at) || new Date().toISOString(),
    }));
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  async createTask(data: {
    userId: string;
    sessionId?: string | null;
    title: string;
    description: string;
    requestedBy?: string | null;
    dueAt?: string | null;
    priority?: Task["priority"];
    status?: Task["status"];
    tags?: string[];
    sourceQuoteOriginal?: string;
    sourceQuoteEnglish?: string;
    startMs?: number;
    endMs?: number;
    confidence?: number;
    needsClarification?: boolean;
    clarificationQuestion?: string | null;
  }): Promise<Task> {
    const id = `task_${crypto.randomUUID()}`;
    const res = await pool.query(
      `
      INSERT INTO tasks (
        id, user_id, session_id, title, description, requested_by, due_at,
        priority, status, tags, source_quote_original, source_quote_english,
        start_ms, end_ms, confidence, needs_clarification, clarification_question
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
      `,
      [
        id,
        data.userId,
        data.sessionId || null,
        data.title,
        data.description,
        data.requestedBy || null,
        data.dueAt ? new Date(data.dueAt) : null,
        data.priority || "med",
        data.status || "needs_review",
        JSON.stringify(data.tags || []),
        data.sourceQuoteOriginal || "",
        data.sourceQuoteEnglish || "",
        data.startMs || 0,
        data.endMs || 0,
        data.confidence ?? 0.8,
        data.needsClarification ? true : false,
        data.clarificationQuestion || null,
      ]
    );

    return toTask(res.rows[0]);
  },

  async getTask(id: string): Promise<Task | null> {
    const res = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? toTask(row) : null;
  },

  async listTasks(filters: {
    userId: string;
    status?: Task["status"];
    sessionId?: string;
    limit?: number;
  }): Promise<Task[]> {
    const conditions = ["user_id = $1"];
    const params: any[] = [filters.userId];
    let idx = 2;

    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters.sessionId) {
      conditions.push(`session_id = $${idx++}`);
      params.push(filters.sessionId);
    }

    const limit = filters.limit || 100;
    params.push(limit);

    const res = await pool.query(
      `
      SELECT * FROM tasks
      WHERE ${conditions.join(" AND ")}
      ORDER BY due_at ASC NULLS LAST, created_at DESC
      LIMIT $${idx}
      `,
      params
    );

    return res.rows.map(toTask);
  },

  async updateTask(
    id: string,
    updates: Partial<
      Pick<
        Task,
        | "title"
        | "description"
        | "status"
        | "priority"
        | "due_at"
        | "tags"
        | "snoozed_until"
        | "needs_clarification"
        | "clarification_question"
      >
    >
  ): Promise<Task | null> {
    const setClauses: string[] = ["updated_at = now()"];
    const values: any[] = [];
    let idx = 1;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${idx++}`);
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${idx++}`);
      values.push(updates.description);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.priority !== undefined) {
      setClauses.push(`priority = $${idx++}`);
      values.push(updates.priority);
    }
    if (updates.due_at !== undefined) {
      setClauses.push(`due_at = $${idx++}`);
      values.push(updates.due_at ? new Date(updates.due_at) : null);
    }
    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${idx++}`);
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.snoozed_until !== undefined) {
      setClauses.push(`snoozed_until = $${idx++}`);
      values.push(updates.snoozed_until ? new Date(updates.snoozed_until) : null);
    }
    if (updates.needs_clarification !== undefined) {
      setClauses.push(`needs_clarification = $${idx++}`);
      values.push(updates.needs_clarification);
    }
    if (updates.clarification_question !== undefined) {
      setClauses.push(`clarification_question = $${idx++}`);
      values.push(updates.clarification_question);
    }
    if ((updates as any).requested_by !== undefined) {
      setClauses.push(`requested_by = $${idx++}`);
      values.push((updates as any).requested_by || null);
    }

    values.push(id);
    const res = await pool.query(
      `
      UPDATE tasks SET ${setClauses.join(", ")}
      WHERE id = $${idx}
      RETURNING *
      `,
      values
    );

    const row = res.rows[0];
    return row ? toTask(row) : null;
  },

  async deleteTask(id: string): Promise<boolean> {
    const res = await pool.query(`DELETE FROM tasks WHERE id = $1 RETURNING id`, [id]);
    return (res.rowCount ?? 0) > 0;
  },

  async searchTasks(userId: string, query: string, limit = 50): Promise<Task[]> {
    if (!query.trim()) return [];
    try {
      const res = await pool.query(
        `
        SELECT * FROM tasks
        WHERE user_id = $1 AND search_vector @@ plainto_tsquery('english', $2)
        ORDER BY ts_rank(search_vector, plainto_tsquery('english', $2)) DESC
        LIMIT $3
        `,
        [userId, query.trim(), limit]
      );

      return res.rows.map(toTask);
    } catch (err) {
      console.warn("[Postgres Search] Search query failed:", err);
      return [];
    }
  },

  // ── Reminders ──────────────────────────────────────────────────────────────
  async createReminder(data: {
    userId: string;
    taskId: string;
    fireAt: string;
    channel: Reminder["channel"];
  }): Promise<Reminder> {
    const id = `rem_${crypto.randomUUID()}`;
    const res = await pool.query(
      `
      INSERT INTO reminders (id, user_id, task_id, fire_at, channel, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *
      `,
      [id, data.userId, data.taskId, new Date(data.fireAt), data.channel]
    );
    return toReminder(res.rows[0]);
  },

  async getPendingReminders(nowIso: string): Promise<Array<Reminder & { task: Task }>> {
    const res = await pool.query(
      `
      SELECT r.*, t.title as task_title, t.description as task_description,
             t.due_at as task_due_at, t.priority as task_priority, t.status as task_status
      FROM reminders r
      JOIN tasks t ON t.id = r.task_id
      WHERE r.status = 'pending' AND r.fire_at <= $1 AND t.status IN ('needs_review', 'open')
      ORDER BY r.fire_at ASC
      `,
      [new Date(nowIso)]
    );

    return res.rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      task_id: r.task_id,
      fire_at: toIso(r.fire_at) || new Date().toISOString(),
      channel: r.channel,
      sent_at: toIso(r.sent_at),
      status: r.status,
      created_at: toIso(r.created_at) || new Date().toISOString(),
      task: {
        id: r.task_id,
        user_id: r.user_id,
        session_id: null,
        title: r.task_title,
        description: r.task_description,
        requested_by: null,
        due_at: toIso(r.task_due_at),
        priority: r.task_priority,
        status: r.task_status,
        tags: [],
        source_quote_original: "",
        source_quote_english: "",
        start_ms: 0,
        end_ms: 0,
        confidence: 1.0,
        needs_clarification: false,
        clarification_question: null,
        snoozed_until: null,
        created_at: toIso(r.created_at) || new Date().toISOString(),
        updated_at: toIso(r.created_at) || new Date().toISOString(),
      },
    }));
  },

  async markReminderSent(id: string): Promise<void> {
    await pool.query(`UPDATE reminders SET status = 'sent', sent_at = now() WHERE id = $1`, [id]);
  },

  async markReminderFailed(id: string): Promise<void> {
    await pool.query(`UPDATE reminders SET status = 'failed' WHERE id = $1`, [id]);
  },

  // ── Devices ────────────────────────────────────────────────────────────────
  async upsertDevice(data: {
    id: string;
    userId: string;
    name: string;
    platform: Device["platform"];
    fcmToken?: string | null;
  }): Promise<Device> {
    const res = await pool.query(
      `
      INSERT INTO devices (id, user_id, name, platform, fcm_token, last_active_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        platform = excluded.platform,
        fcm_token = COALESCE(excluded.fcm_token, devices.fcm_token),
        last_active_at = now()
      RETURNING *
      `,
      [data.id, data.userId, data.name, data.platform, data.fcmToken || null]
    );
    const r = res.rows[0];
    return {
      ...r,
      last_active_at: toIso(r.last_active_at) || new Date().toISOString(),
      created_at: toIso(r.created_at) || new Date().toISOString(),
    };
  },

  async getUserDevices(userId: string): Promise<Device[]> {
    const res = await pool.query(`SELECT * FROM devices WHERE user_id = $1`, [userId]);
    return res.rows.map((r) => ({
      ...r,
      last_active_at: toIso(r.last_active_at) || new Date().toISOString(),
      created_at: toIso(r.created_at) || new Date().toISOString(),
    }));
  },

  async removeInvalidTokens(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    await pool.query(`UPDATE devices SET fcm_token = NULL WHERE fcm_token = ANY($1::text[])`, [
      tokens,
    ]);
  },

  // ── Jobs (Atomic claim with SELECT ... FOR UPDATE SKIP LOCKED) ──────────────
  async enqueueJob(type: string, payload: any, runAtIso?: string): Promise<Job> {
    const id = `job_${crypto.randomUUID()}`;
    const runAt = runAtIso ? new Date(runAtIso) : new Date();
    const res = await pool.query(
      `
      INSERT INTO jobs (id, type, payload, run_at, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
      `,
      [id, type, JSON.stringify(payload), runAt]
    );
    return toJob(res.rows[0]);
  },

  async claimNextJob(): Promise<Job | null> {
    // Atomic claim with SELECT ... FOR UPDATE SKIP LOCKED
    const res = await pool.query(`
      WITH next_job AS (
        SELECT id FROM jobs
        WHERE status = 'pending' AND run_at <= (now() + interval '1 second')
        ORDER BY run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE jobs
      SET status = 'processing', attempts = attempts + 1, updated_at = now()
      WHERE id IN (SELECT id FROM next_job)
      RETURNING *;
    `);

    const r = res.rows[0];
    return r ? toJob(r) : null;
  },

  async completeJob(id: string): Promise<void> {
    await pool.query(`UPDATE jobs SET status = 'completed', updated_at = now() WHERE id = $1`, [id]);
  },

  async failJob(id: string, error: string, retryDelaySec: number | null): Promise<void> {
    if (retryDelaySec !== null) {
      await pool.query(
        `
        UPDATE jobs
        SET status = 'pending', error = $1, run_at = (now() + ($2 || ' seconds')::interval), updated_at = now()
        WHERE id = $3
        `,
        [error, String(retryDelaySec), id]
      );
    } else {
      await pool.query(
        `UPDATE jobs SET status = 'failed', error = $1, updated_at = now() WHERE id = $2`,
        [error, id]
      );
    }
  },

  // ── Notes ──────────────────────────────────────────────────────────────────
  async createNote(data: {
    sessionId?: string | null;
    userId: string;
    content: string;
    tags?: string[];
  }): Promise<Note> {
    const id = `note_${crypto.randomUUID()}`;
    const res = await pool.query(
      `
      INSERT INTO notes (id, session_id, user_id, content, tags)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [id, data.sessionId || null, data.userId, data.content, JSON.stringify(data.tags || [])]
    );
    const row = res.rows[0];
    return {
      ...row,
      tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags || [],
      created_at: toIso(row.created_at) || new Date().toISOString(),
    };
  },

  async getSessionNotes(sessionId: string): Promise<Note[]> {
    const res = await pool.query(`SELECT * FROM notes WHERE session_id = $1`, [sessionId]);
    return res.rows.map((row) => ({
      ...row,
      tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags || [],
      created_at: toIso(row.created_at) || new Date().toISOString(),
    }));
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  async getSettings(userId: string): Promise<any> {
    const res = await pool.query(`SELECT * FROM settings WHERE user_id = $1`, [userId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      reminder_offsets_minutes:
        typeof r.reminder_offsets_minutes === "string"
          ? JSON.parse(r.reminder_offsets_minutes)
          : r.reminder_offsets_minutes || [1440, 60, 0],
      updated_at: toIso(r.updated_at) || new Date().toISOString(),
    };
  },

  async updateSettings(userId: string, data: Record<string, any>): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [k, v] of Object.entries(data)) {
      if (k === "user_id" || k === "updated_at") continue;
      fields.push(`${k} = $${idx++}`);
      values.push(k === "reminder_offsets_minutes" ? JSON.stringify(v) : v);
    }

    if (fields.length === 0) {
      return this.getSettings(userId);
    }

    fields.push(`updated_at = now()`);
    values.push(userId);

    const res = await pool.query(
      `
      UPDATE settings
      SET ${fields.join(", ")}
      WHERE user_id = $${idx}
      RETURNING *
      `,
      values
    );

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r,
      reminder_offsets_minutes:
        typeof r.reminder_offsets_minutes === "string"
          ? JSON.parse(r.reminder_offsets_minutes)
          : r.reminder_offsets_minutes || [1440, 60, 0],
      updated_at: toIso(r.updated_at) || new Date().toISOString(),
    };
  },
};
