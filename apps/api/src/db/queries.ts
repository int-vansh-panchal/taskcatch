import { sqlite } from "./index.js";
import type {
  Task,
  Session,
  TranscriptSegment,
  Bookmark,
  Device,
  Reminder,
  Note,
  Job,
  UserSettings,
} from "@taskcatch/shared";
import crypto from "node:crypto";

export const dbQueries = {
  // ── Sessions ───────────────────────────────────────────────────────────────
  createSession(data: {
    id?: string;
    userId: string;
    deviceId: string;
    audioPath?: string | null;
    status: Session["status"];
    languageDetected?: string | null;
  }): Session {
    const id = data.id || `sess_${crypto.randomUUID()}`;
    const stmt = sqlite.prepare(`
      INSERT INTO sessions (id, user_id, device_id, audio_path, status, language_detected)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `);
    const row = stmt.get(
      id,
      data.userId,
      data.deviceId,
      data.audioPath || null,
      data.status,
      data.languageDetected || null
    ) as any;
    return row;
  },

  getSession(id: string): Session | null {
    const stmt = sqlite.prepare(`SELECT * FROM sessions WHERE id = ?`);
    return (stmt.get(id) as Session) || null;
  },

  updateSession(
    id: string,
    updates: Partial<Pick<Session, "status" | "audio_path" | "duration_sec" | "summary" | "language_detected">>
  ): Session | null {
    const setClauses: string[] = ["updated_at = datetime('now')"];
    const values: any[] = [];

    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }
    if (updates.audio_path !== undefined) {
      setClauses.push("audio_path = ?");
      values.push(updates.audio_path);
    }
    if (updates.duration_sec !== undefined) {
      setClauses.push("duration_sec = ?");
      values.push(updates.duration_sec);
    }
    if (updates.summary !== undefined) {
      setClauses.push("summary = ?");
      values.push(updates.summary);
    }
    if (updates.language_detected !== undefined) {
      setClauses.push("language_detected = ?");
      values.push(updates.language_detected);
    }

    values.push(id);
    const stmt = sqlite.prepare(`
      UPDATE sessions SET ${setClauses.join(", ")}
      WHERE id = ?
      RETURNING *
    `);
    return (stmt.get(...values) as Session) || null;
  },

  listSessions(userId: string, limit = 50, offset = 0): Session[] {
    const stmt = sqlite.prepare(`
      SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(userId, limit, offset) as Session[];
  },

  // ── Transcript Segments ────────────────────────────────────────────────────
  insertSegments(
    sessionId: string,
    segments: Array<{
      start_ms: number;
      end_ms: number;
      speaker?: string;
      text_original: string;
      text_english: string;
    }>
  ) {
    const stmt = sqlite.prepare(`
      INSERT INTO transcript_segments (id, session_id, segment_index, start_ms, end_ms, speaker, text_original, text_english)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = sqlite.transaction((items) => {
      items.forEach((item: any, idx: number) => {
        stmt.run(
          `seg_${crypto.randomUUID()}`,
          sessionId,
          idx,
          item.start_ms,
          item.end_ms,
          item.speaker || "Speaker 1",
          item.text_original,
          item.text_english
        );
      });
    });
    insertMany(segments);
  },

  getSegments(sessionId: string): TranscriptSegment[] {
    const stmt = sqlite.prepare(`
      SELECT * FROM transcript_segments WHERE session_id = ? ORDER BY segment_index ASC
    `);
    return stmt.all(sessionId) as TranscriptSegment[];
  },

  // ── Bookmarks ──────────────────────────────────────────────────────────────
  addBookmark(sessionId: string, timestampMs: number, label?: string | null): Bookmark {
    const id = `bm_${crypto.randomUUID()}`;
    const stmt = sqlite.prepare(`
      INSERT INTO bookmarks (id, session_id, timestamp_ms, label)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `);
    return stmt.get(id, sessionId, timestampMs, label || null) as Bookmark;
  },

  getBookmarks(sessionId: string): Bookmark[] {
    const stmt = sqlite.prepare(`
      SELECT * FROM bookmarks WHERE session_id = ? ORDER BY timestamp_ms ASC
    `);
    return stmt.all(sessionId) as Bookmark[];
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  createTask(data: {
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
  }): Task {
    const id = `task_${crypto.randomUUID()}`;
    const stmt = sqlite.prepare(`
      INSERT INTO tasks (
        id, user_id, session_id, title, description, requested_by, due_at,
        priority, status, tags, source_quote_original, source_quote_english,
        start_ms, end_ms, confidence, needs_clarification, clarification_question
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const row = stmt.get(
      id,
      data.userId,
      data.sessionId || null,
      data.title,
      data.description,
      data.requestedBy || null,
      data.dueAt || null,
      data.priority || "med",
      data.status || "needs_review",
      JSON.stringify(data.tags || []),
      data.sourceQuoteOriginal || "",
      data.sourceQuoteEnglish || "",
      data.startMs || 0,
      data.endMs || 0,
      data.confidence ?? 0.8,
      data.needsClarification ? 1 : 0,
      data.clarificationQuestion || null
    ) as any;

    return {
      ...row,
      tags: JSON.parse(row.tags || "[]"),
      needs_clarification: Boolean(row.needs_clarification),
    };
  },

  getTask(id: string): Task | null {
    const stmt = sqlite.prepare(`SELECT * FROM tasks WHERE id = ?`);
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      ...row,
      tags: JSON.parse(row.tags || "[]"),
      needs_clarification: Boolean(row.needs_clarification),
    };
  },

  listTasks(filters: {
    userId: string;
    status?: Task["status"];
    sessionId?: string;
    limit?: number;
  }): Task[] {
    const conditions = ["user_id = ?"];
    const params: any[] = [filters.userId];

    if (filters.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }
    if (filters.sessionId) {
      conditions.push("session_id = ?");
      params.push(filters.sessionId);
    }

    const limit = filters.limit || 100;
    params.push(limit);

    const stmt = sqlite.prepare(`
      SELECT * FROM tasks
      WHERE ${conditions.join(" AND ")}
      ORDER BY due_at ASC NULLS LAST, created_at DESC
      LIMIT ?
    `);

    return stmt.all(...params).map((row: any) => ({
      ...row,
      tags: JSON.parse(row.tags || "[]"),
      needs_clarification: Boolean(row.needs_clarification),
    }));
  },

  updateTask(
    id: string,
    updates: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "due_at" | "tags" | "snoozed_until" | "needs_clarification" | "clarification_question">>
  ): Task | null {
    const setClauses: string[] = ["updated_at = datetime('now')"];
    const values: any[] = [];

    if (updates.title !== undefined) {
      setClauses.push("title = ?");
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      setClauses.push("description = ?");
      values.push(updates.description);
    }
    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }
    if (updates.priority !== undefined) {
      setClauses.push("priority = ?");
      values.push(updates.priority);
    }
    if (updates.due_at !== undefined) {
      setClauses.push("due_at = ?");
      values.push(updates.due_at);
    }
    if (updates.tags !== undefined) {
      setClauses.push("tags = ?");
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.snoozed_until !== undefined) {
      setClauses.push("snoozed_until = ?");
      values.push(updates.snoozed_until);
    }
    if (updates.needs_clarification !== undefined) {
      setClauses.push("needs_clarification = ?");
      values.push(updates.needs_clarification ? 1 : 0);
    }
    if (updates.clarification_question !== undefined) {
      setClauses.push("clarification_question = ?");
      values.push(updates.clarification_question);
    }

    values.push(id);
    const stmt = sqlite.prepare(`
      UPDATE tasks SET ${setClauses.join(", ")}
      WHERE id = ?
      RETURNING *
    `);

    const row = stmt.get(...values) as any;
    if (!row) return null;
    return {
      ...row,
      tags: JSON.parse(row.tags || "[]"),
      needs_clarification: Boolean(row.needs_clarification),
    };
  },

  searchTasks(userId: string, query: string, limit = 50): Task[] {
    if (!query.trim()) return [];
    // Clean search string for FTS5
    const cleanQuery = query.replace(/[^\w\s]/gi, "").trim();
    if (!cleanQuery) return [];

    const ftsQuery = cleanQuery.split(/\s+/).map((w) => `"${w}"*`).join(" OR ");
    const stmt = sqlite.prepare(`
      SELECT t.* FROM tasks_fts f
      JOIN tasks t ON t.id = f.task_id
      WHERE tasks_fts MATCH ? AND t.user_id = ?
      ORDER BY rank
      LIMIT ?
    `);

    try {
      return stmt.all(ftsQuery, userId, limit).map((row: any) => ({
        ...row,
        tags: JSON.parse(row.tags || "[]"),
        needs_clarification: Boolean(row.needs_clarification),
      }));
    } catch {
      return [];
    }
  },

  // ── Reminders ──────────────────────────────────────────────────────────────
  createReminder(data: {
    userId: string;
    taskId: string;
    fireAt: string;
    channel: Reminder["channel"];
  }): Reminder {
    const id = `rem_${crypto.randomUUID()}`;
    const stmt = sqlite.prepare(`
      INSERT INTO reminders (id, user_id, task_id, fire_at, channel, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
      RETURNING *
    `);
    return stmt.get(id, data.userId, data.taskId, data.fireAt, data.channel) as Reminder;
  },

  getPendingReminders(nowIso: string): Array<Reminder & { task: Task }> {
    const stmt = sqlite.prepare(`
      SELECT r.*, t.title as task_title, t.description as task_description,
             t.due_at as task_due_at, t.priority as task_priority, t.status as task_status
      FROM reminders r
      JOIN tasks t ON t.id = r.task_id
      WHERE r.status = 'pending' AND datetime(r.fire_at) <= datetime(?) AND t.status IN ('needs_review', 'open')
      ORDER BY r.fire_at ASC
    `);

    const rows = stmt.all(nowIso) as any[];
    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      task_id: r.task_id,
      fire_at: r.fire_at,
      channel: r.channel,
      sent_at: r.sent_at,
      status: r.status,
      created_at: r.created_at,
      task: {
        id: r.task_id,
        user_id: r.user_id,
        session_id: null,
        title: r.task_title,
        description: r.task_description,
        requested_by: null,
        due_at: r.task_due_at,
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
        created_at: r.created_at,
        updated_at: r.created_at,
      },
    }));
  },

  markReminderSent(id: string): void {
    const stmt = sqlite.prepare(`
      UPDATE reminders SET status = 'sent', sent_at = datetime('now') WHERE id = ?
    `);
    stmt.run(id);
  },

  markReminderFailed(id: string): void {
    const stmt = sqlite.prepare(`
      UPDATE reminders SET status = 'failed' WHERE id = ?
    `);
    stmt.run(id);
  },

  // ── Devices ────────────────────────────────────────────────────────────────
  upsertDevice(data: {
    id: string;
    userId: string;
    name: string;
    platform: Device["platform"];
    fcmToken?: string | null;
  }): Device {
    const stmt = sqlite.prepare(`
      INSERT INTO devices (id, user_id, name, platform, fcm_token, last_active_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        platform = excluded.platform,
        fcm_token = COALESCE(excluded.fcm_token, devices.fcm_token),
        last_active_at = datetime('now')
      RETURNING *
    `);
    return stmt.get(data.id, data.userId, data.name, data.platform, data.fcmToken || null) as Device;
  },

  getUserDevices(userId: string): Device[] {
    const stmt = sqlite.prepare(`SELECT * FROM devices WHERE user_id = ?`);
    return stmt.all(userId) as Device[];
  },

  removeInvalidTokens(tokens: string[]): void {
    if (!tokens.length) return;
    const placeholders = tokens.map(() => "?").join(",");
    const stmt = sqlite.prepare(`
      UPDATE devices SET fcm_token = NULL WHERE fcm_token IN (${placeholders})
    `);
    stmt.run(...tokens);
  },

  // ── Jobs ───────────────────────────────────────────────────────────────────
  enqueueJob(type: string, payload: any, runAtIso?: string): Job {
    const id = `job_${crypto.randomUUID()}`;
    const runAt = runAtIso || new Date().toISOString();
    const stmt = sqlite.prepare(`
      INSERT INTO jobs (id, type, payload, run_at, status)
      VALUES (?, ?, ?, ?, 'pending')
      RETURNING *
    `);
    return stmt.get(id, type, JSON.stringify(payload), runAt) as Job;
  },

  claimNextJob(): Job | null {
    // Atomically find and claim the next pending job
    const claim = sqlite.transaction(() => {
      const findStmt = sqlite.prepare(`
        SELECT * FROM jobs
        WHERE status = 'pending' AND datetime(run_at) <= datetime('now', '+1 second')
        ORDER BY run_at ASC
        LIMIT 1
      `);
      const job = findStmt.get() as Job | undefined;
      if (!job) return null;

      const updateStmt = sqlite.prepare(`
        UPDATE jobs SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(job.id);
      return { ...job, status: "processing" as const, attempts: job.attempts + 1 };
    });

    return claim();
  },

  completeJob(id: string): void {
    const stmt = sqlite.prepare(`
      UPDATE jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(id);
  },

  failJob(id: string, error: string, retryDelaySec: number | null): void {
    if (retryDelaySec !== null) {
      const nextRunAt = new Date(Date.now() + retryDelaySec * 1000).toISOString();
      const stmt = sqlite.prepare(`
        UPDATE jobs
        SET status = 'pending', error = ?, run_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(error, nextRunAt, id);
    } else {
      const stmt = sqlite.prepare(`
        UPDATE jobs
        SET status = 'failed', error = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(error, id);
    }
  },

  // ── Notes ──────────────────────────────────────────────────────────────────
  createNote(data: { sessionId?: string | null; userId: string; content: string; tags?: string[] }): Note {
    const id = `note_${crypto.randomUUID()}`;
    const stmt = sqlite.prepare(`
      INSERT INTO notes (id, session_id, user_id, content, tags)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `);
    const row = stmt.get(
      id,
      data.sessionId || null,
      data.userId,
      data.content,
      JSON.stringify(data.tags || [])
    ) as any;
    return { ...row, tags: JSON.parse(row.tags || "[]") };
  },

  getSessionNotes(sessionId: string): Note[] {
    const stmt = sqlite.prepare(`SELECT * FROM notes WHERE session_id = ?`);
    return stmt.all(sessionId).map((row: any) => ({
      ...row,
      tags: JSON.parse(row.tags || "[]"),
    }));
  },
};
