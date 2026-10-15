import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Devices table
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('web', 'phone', 'desktop')),
        fcm_token TEXT,
        last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL,
        audio_path TEXT,
        duration_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('recording', 'interrupted', 'uploaded', 'processing', 'processed', 'failed')),
        summary TEXT,
        language_detected TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);

      -- Transcript segments table with tsvector & GIN index
      CREATE TABLE IF NOT EXISTS transcript_segments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        segment_index INTEGER NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        speaker TEXT NOT NULL DEFAULT 'Speaker 1',
        text_original TEXT NOT NULL,
        text_english TEXT NOT NULL,
        search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('simple', coalesce(text_original, '') || ' ' || coalesce(text_english, ''))
        ) STORED
      );
      CREATE INDEX IF NOT EXISTS idx_segments_session ON transcript_segments(session_id, start_ms);
      CREATE INDEX IF NOT EXISTS idx_segments_search ON transcript_segments USING GIN(search_vector);

      -- Bookmarks table
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        timestamp_ms INTEGER NOT NULL,
        label TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_bookmarks_session ON bookmarks(session_id, timestamp_ms);

      -- Tasks table with tsvector & GIN index
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        requested_by TEXT,
        due_at TIMESTAMPTZ,
        priority TEXT NOT NULL CHECK(priority IN ('low', 'med', 'high', 'urgent')) DEFAULT 'med',
        status TEXT NOT NULL CHECK(status IN ('needs_review', 'open', 'done', 'discarded')) DEFAULT 'needs_review',
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        source_quote_original TEXT NOT NULL DEFAULT '',
        source_quote_english TEXT NOT NULL DEFAULT '',
        start_ms INTEGER NOT NULL DEFAULT 0,
        end_ms INTEGER NOT NULL DEFAULT 0,
        confidence DOUBLE PRECISION NOT NULL DEFAULT 0.8,
        needs_clarification BOOLEAN NOT NULL DEFAULT false,
        clarification_question TEXT,
        snoozed_until TIMESTAMPTZ,
        search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(tags::text, ''))
        ) STORED,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_search ON tasks USING GIN(search_vector);

      -- Reminders table with partial index
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        fire_at TIMESTAMPTZ NOT NULL,
        channel TEXT NOT NULL CHECK(channel IN ('fcm', 'desktop')),
        sent_at TIMESTAMPTZ,
        status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed', 'cancelled')) DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_reminders_fire_sent ON reminders(fire_at) WHERE sent_at IS NULL;

      -- Notes table
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_notes_session ON notes(session_id);

      -- Jobs table for async processing queue
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status_run ON jobs(status, run_at);

      -- User settings table
      CREATE TABLE IF NOT EXISTS settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        digest_time TEXT NOT NULL DEFAULT '09:00',
        reminder_offsets_minutes JSONB NOT NULL DEFAULT '[1440, 60, 0]'::jsonb,
        vocabulary_hints TEXT NOT NULL DEFAULT '',
        speech_provider TEXT NOT NULL DEFAULT 'faster-whisper',
        llm_provider TEXT NOT NULL DEFAULT 'ollama',
        quiet_hours_start TEXT NOT NULL DEFAULT '22:00',
        quiet_hours_end TEXT NOT NULL DEFAULT '08:00',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Seed default user and settings
      INSERT INTO users (id, name) VALUES ('${config.defaultUserId}', 'Personal User')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO settings (user_id) VALUES ('${config.defaultUserId}')
      ON CONFLICT (user_id) DO NOTHING;
    `);
    console.info("[Database] PostgreSQL tables, indexes, and full-text search initialized successfully.");
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  await pool.end();
}
