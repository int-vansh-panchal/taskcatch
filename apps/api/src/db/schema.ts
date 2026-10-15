import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom tsvector type for Postgres full-text search
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Devices ──────────────────────────────────────────────────────────────────
export const devices = pgTable(
  "devices",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: text("platform", { enum: ["web", "phone", "desktop"] }).notNull(),
    fcm_token: text("fcm_token"),
    last_active_at: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_devices_user_id").on(table.user_id),
  })
);

// ── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    device_id: text("device_id").notNull(),
    audio_path: text("audio_path"),
    duration_sec: doublePrecision("duration_sec").default(0).notNull(),
    status: text("status", {
      enum: ["recording", "interrupted", "uploaded", "processing", "processed", "failed"],
    }).notNull(),
    summary: text("summary"),
    language_detected: text("language_detected"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index("idx_sessions_user_status").on(table.user_id, table.status),
  })
);

// ── Transcript Segments ──────────────────────────────────────────────────────
export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: text("id").primaryKey(),
    session_id: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    segment_index: integer("segment_index").notNull(),
    start_ms: integer("start_ms").notNull(),
    end_ms: integer("end_ms").notNull(),
    speaker: text("speaker").default("Speaker 1").notNull(),
    text_original: text("text_original").notNull(),
    text_english: text("text_english").notNull(),
    search_vector: tsvector("search_vector"),
  },
  (table) => ({
    sessionIdx: index("idx_segments_session").on(table.session_id, table.start_ms),
    searchIdx: index("idx_segments_search").using("gin", table.search_vector),
  })
);

// ── Bookmarks ────────────────────────────────────────────────────────────────
export const bookmarks = pgTable(
  "bookmarks",
  {
    id: text("id").primaryKey(),
    session_id: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    timestamp_ms: integer("timestamp_ms").notNull(),
    label: text("label"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index("idx_bookmarks_session").on(table.session_id, table.timestamp_ms),
  })
);

// ── Tasks ────────────────────────────────────────────────────────────────────
export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    session_id: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    requested_by: text("requested_by"),
    due_at: timestamp("due_at", { withTimezone: true }),
    priority: text("priority", { enum: ["low", "med", "high", "urgent"] })
      .default("med")
      .notNull(),
    status: text("status", { enum: ["needs_review", "open", "done", "discarded"] })
      .default("needs_review")
      .notNull(),
    tags: jsonb("tags").default([]).notNull(),
    source_quote_original: text("source_quote_original").default("").notNull(),
    source_quote_english: text("source_quote_english").default("").notNull(),
    start_ms: integer("start_ms").default(0).notNull(),
    end_ms: integer("end_ms").default(0).notNull(),
    confidence: doublePrecision("confidence").default(0.8).notNull(),
    needs_clarification: boolean("needs_clarification").default(false).notNull(),
    clarification_question: text("clarification_question"),
    snoozed_until: timestamp("snoozed_until", { withTimezone: true }),
    search_vector: tsvector("search_vector"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusDueIdx: index("idx_tasks_status_due").on(table.status, table.due_at),
    userIdx: index("idx_tasks_user").on(table.user_id),
    searchIdx: index("idx_tasks_search").using("gin", table.search_vector),
  })
);

// ── Reminders ────────────────────────────────────────────────────────────────
export const reminders = pgTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    task_id: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fire_at: timestamp("fire_at", { withTimezone: true }).notNull(),
    channel: text("channel", { enum: ["fcm", "desktop"] }).notNull(),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    status: text("status", { enum: ["pending", "sent", "failed", "cancelled"] })
      .default("pending")
      .notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fireSentIdx: index("idx_reminders_fire_sent")
      .on(table.fire_at)
      .where(sql`sent_at IS NULL`),
  })
);

// ── Notes (FYI items) ────────────────────────────────────────────────────────
export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    session_id: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    tags: jsonb("tags").default([]).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index("idx_notes_session").on(table.session_id),
  })
);

// ── Jobs ─────────────────────────────────────────────────────────────────────
export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status", { enum: ["pending", "processing", "completed", "failed"] })
      .default("pending")
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    max_attempts: integer("max_attempts").default(5).notNull(),
    run_at: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
    error: text("error"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusRunIdx: index("idx_jobs_status_run").on(table.status, table.run_at),
  })
);

// ── User Settings ────────────────────────────────────────────────────────────
export const settings = pgTable("settings", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  digest_time: text("digest_time").default("09:00").notNull(),
  reminder_offsets_minutes: jsonb("reminder_offsets_minutes").default([1440, 60, 0]).notNull(),
  vocabulary_hints: text("vocabulary_hints").default("").notNull(),
  speech_provider: text("speech_provider").default("faster-whisper").notNull(),
  llm_provider: text("llm_provider").default("ollama").notNull(),
  quiet_hours_start: text("quiet_hours_start").default("22:00").notNull(),
  quiet_hours_end: text("quiet_hours_end").default("08:00").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
