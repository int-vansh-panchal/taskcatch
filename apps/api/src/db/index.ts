import Database, { type Database as DatabaseType } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

// Ensure data directory exists
const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const sqlite: DatabaseType = new Database(config.databasePath);

// Enable WAL mode, foreign keys, and 5s busy timeout
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export function initDatabase() {
  sqlite.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Devices table
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('web', 'phone', 'desktop')),
      fcm_token TEXT,
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      audio_path TEXT,
      duration_sec REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('recording', 'interrupted', 'uploaded', 'processing', 'processed', 'failed')),
      summary TEXT,
      language_detected TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Transcript segments table
    CREATE TABLE IF NOT EXISTS transcript_segments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      segment_index INTEGER NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      speaker TEXT NOT NULL DEFAULT 'Speaker 1',
      text_original TEXT NOT NULL,
      text_english TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    -- Bookmarks table
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    -- Tasks table
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      requested_by TEXT,
      due_at TEXT,
      priority TEXT NOT NULL CHECK(priority IN ('low', 'med', 'high', 'urgent')) DEFAULT 'med',
      status TEXT NOT NULL CHECK(status IN ('needs_review', 'open', 'done', 'discarded')) DEFAULT 'needs_review',
      tags TEXT NOT NULL DEFAULT '[]', -- JSON array
      source_quote_original TEXT NOT NULL DEFAULT '',
      source_quote_english TEXT NOT NULL DEFAULT '',
      start_ms INTEGER NOT NULL DEFAULT 0,
      end_ms INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0.8,
      needs_clarification INTEGER NOT NULL DEFAULT 0,
      clarification_question TEXT,
      snoozed_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

    -- Reminders table
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      fire_at TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('fcm', 'desktop')),
      sent_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed', 'cancelled')) DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Notes (FYI notes) table
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    -- Jobs table for async processing queue
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL, -- JSON
      status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      run_at TEXT NOT NULL DEFAULT (datetime('now')),
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- User settings table
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      digest_time TEXT NOT NULL DEFAULT '09:00',
      reminder_offsets_minutes TEXT NOT NULL DEFAULT '[1440, 60, 0]', -- JSON
      vocabulary_hints TEXT NOT NULL DEFAULT '',
      speech_provider TEXT NOT NULL DEFAULT 'faster-whisper',
      llm_provider TEXT NOT NULL DEFAULT 'ollama',
      quiet_hours_start TEXT NOT NULL DEFAULT '22:00',
      quiet_hours_end TEXT NOT NULL DEFAULT '08:00',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_fire_sent ON reminders(fire_at, sent_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_segments_session ON transcript_segments(session_id, start_ms);
    CREATE INDEX IF NOT EXISTS idx_jobs_status_run ON jobs(status, run_at);

    -- FTS5 Full-Text Search Table for Tasks
    CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
      task_id UNINDEXED,
      title,
      description,
      tags,
      tokenize='porter unicode61'
    );

    -- FTS Triggers
    CREATE TRIGGER IF NOT EXISTS tasks_after_insert AFTER INSERT ON tasks BEGIN
      INSERT INTO tasks_fts(task_id, title, description, tags)
      VALUES (new.id, new.title, new.description, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS tasks_after_update AFTER UPDATE ON tasks BEGIN
      DELETE FROM tasks_fts WHERE task_id = old.id;
      INSERT INTO tasks_fts(task_id, title, description, tags)
      VALUES (new.id, new.title, new.description, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS tasks_after_delete AFTER DELETE ON tasks BEGIN
      DELETE FROM tasks_fts WHERE task_id = old.id;
    END;
  `);

  // Ensure default user exists
  const insertUser = sqlite.prepare(`
    INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)
  `);
  insertUser.run(config.defaultUserId, "Personal User");

  // Ensure default settings exist
  const insertSettings = sqlite.prepare(`
    INSERT OR IGNORE INTO settings (user_id) VALUES (?)
  `);
  insertSettings.run(config.defaultUserId);
}
