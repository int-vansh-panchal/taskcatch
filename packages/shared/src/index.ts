import { z } from "zod";
export * from "./dateResolver.js";

// ── Enums and Constant Literals ──────────────────────────────────────────────

export const TaskPrioritySchema = z.enum(["low", "med", "high", "urgent"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskStatusSchema = z.enum(["needs_review", "open", "done", "discarded"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const SessionStatusSchema = z.enum([
  "recording",
  "interrupted",
  "uploaded",
  "processing",
  "processed",
  "failed"
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const DevicePlatformSchema = z.enum(["web", "phone", "desktop"]);
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

export const ReminderChannelSchema = z.enum(["fcm", "desktop"]);
export type ReminderChannel = z.infer<typeof ReminderChannelSchema>;

export const ReminderStatusSchema = z.enum(["pending", "sent", "failed", "cancelled"]);
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;

// ── LLM Extraction Output Schemas ───────────────────────────────────────────

export const ExtractedTaskItemSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(80, "Title must be 80 characters or fewer"),
  description: z
    .string()
    .min(1, "Full self-contained detail is required so it can be understood a month later"),
  requested_by: z.string().nullable().default(null),
  due_at: z
    .string()
    .nullable()
    .describe("ISO 8601 timestamp string resolved against the recording date in Asia/Calcutta; null if unspecified"),
  priority: TaskPrioritySchema.default("med"),
  tags: z.array(z.string()).default([]),
  source_quote_original: z.string().default(""),
  source_quote_english: z.string().default(""),
  start_ms: z.number().int().nonnegative().default(0),
  end_ms: z.number().int().nonnegative().default(0),
  confidence: z.number().min(0).max(1).default(0.8),
  needs_clarification: z.boolean().default(false),
  clarification_question: z.string().nullable().default(null),
});
export type ExtractedTaskItem = z.infer<typeof ExtractedTaskItemSchema>;

export const ExtractionPipelineResultSchema = z.object({
  summary: z.string().describe("A 3 to 5 line English session summary"),
  fyi_notes: z.array(z.string()).default([]).describe("Key decisions, facts, or information items that are not actionable tasks"),
  tasks: z.array(ExtractedTaskItemSchema).default([]),
});
export type ExtractionPipelineResult = z.infer<typeof ExtractionPipelineResultSchema>;

// ── Database Models ─────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  created_at: string;
}

export interface Device {
  id: string;
  user_id: string;
  name: string;
  platform: DevicePlatform;
  fcm_token: string | null;
  last_active_at: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  device_id: string;
  audio_path: string | null;
  duration_sec: number;
  status: SessionStatus;
  summary: string | null;
  language_detected: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  id: string;
  session_id: string;
  segment_index: number;
  start_ms: number;
  end_ms: number;
  speaker: string;
  text_original: string;
  text_english: string;
  confidence?: number;
}

export interface Bookmark {
  id: string;
  session_id: string;
  timestamp_ms: number;
  label: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  session_id: string | null;
  title: string;
  description: string;
  requested_by: string | null;
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  tags: string[];
  source_quote_original: string;
  source_quote_english: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  needs_clarification: boolean;
  clarification_question: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  task_id: string;
  fire_at: string;
  channel: ReminderChannel;
  sent_at: string | null;
  status: ReminderStatus;
  created_at: string;
}

export interface Note {
  id: string;
  session_id: string | null;
  user_id: string;
  content: string;
  tags: string[];
  created_at: string;
}

export interface Job {
  id: string;
  type: string;
  payload: string; // JSON
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  run_at: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  digest_time: string; // '09:00'
  reminder_offsets_minutes: number[]; // [1440, 60, 0]
  vocabulary_hints: string;
  speech_provider: string; // 'faster-whisper' | 'indic' | 'groq'
  llm_provider: string; // 'ollama' | 'gemini'
  quiet_hours_start: string; // '22:00'
  quiet_hours_end: string; // '08:00'
  updated_at: string;
}

// ── Provider Interfaces ─────────────────────────────────────────────────────

export interface SpeechSegmentResult {
  start_ms: number;
  end_ms: number;
  speaker: string;
  text_original: string;
  text_english: string;
  confidence?: number;
}

export interface SpeechTranscriptionResult {
  language_detected: string;
  language_probability: number;
  segments: SpeechSegmentResult[];
}

export interface SpeechProvider {
  name: string;
  transcribe(audioFilePath: string, vocabularyHints?: string, options?: { task?: "transcribe" | "translate"; modelSize?: string }): Promise<SpeechTranscriptionResult>;
  healthCheck?(): Promise<{ ok: boolean; message?: string }>;
}

export interface LLMProvider {
  name: string;
  translateAndExtract(
    segments: SpeechSegmentResult[],
    bookmarks: Bookmark[],
    sessionDate: Date,
    timezone: string,
    options?: { model?: string; vocabularyHints?: string }
  ): Promise<ExtractionPipelineResult>;
  healthCheck?(): Promise<{ ok: boolean; message?: string }>;
}

// ── WebSocket Realtime Events ───────────────────────────────────────────────

export type WebSocketServerEvent =
  | { type: "session.updated"; session: Session }
  | { type: "session.processed"; sessionId: string; tasksCount: number }
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task }
  | { type: "task.dismissed"; taskId: string }
  | { type: "reminder.fired"; reminder: Reminder; task: Task };

export type WebSocketClientMessage =
  | { type: "subscribe"; userId: string; deviceId: string }
  | { type: "ping" };
