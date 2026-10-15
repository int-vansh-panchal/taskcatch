import { dbQueries } from "../db/queries.js";
import { wsService } from "../services/websocketService.js";
import { sendPushNotification } from "../services/notificationService.js";
import {
  ExtractionPipelineResultSchema,
  type SpeechProvider,
  type LLMProvider,
} from "@taskcatch/shared";
import { MockSpeechProvider } from "../providers/mockSpeechProvider.js";
import { MockLLMProvider } from "../providers/mockLLMProvider.js";
import { config } from "../config.js";

export class PipelineOrchestrator {
  private defaultSpeechProvider: SpeechProvider;
  private defaultLLMProvider: LLMProvider;

  constructor(speechProvider?: SpeechProvider, llmProvider?: LLMProvider) {
    this.defaultSpeechProvider = speechProvider || new MockSpeechProvider();
    this.defaultLLMProvider = llmProvider || new MockLLMProvider();
  }

  async processSession(
    sessionId: string,
    customSpeechProvider?: SpeechProvider,
    customLLMProvider?: LLMProvider
  ): Promise<void> {
    const session = await dbQueries.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === "processed") {
      // Idempotency: skip if already processed
      return;
    }

    const speechProvider = customSpeechProvider || this.defaultSpeechProvider;
    const llmProvider = customLLMProvider || this.defaultLLMProvider;

    // 1. Mark session as processing
    const processingSession = await dbQueries.updateSession(sessionId, { status: "processing" });
    if (processingSession) {
      wsService.broadcastToUser(session.user_id, {
        type: "session.updated",
        session: processingSession,
      });
    }

    try {
      const audioPath = session.audio_path || "mock_audio.wav";

      // 2. Transcribe Audio
      const sttResult = await speechProvider.transcribe(audioPath);

      // Save segments
      await dbQueries.insertSegments(sessionId, sttResult.segments);

      // 3. Load Bookmarks
      const bookmarks = await dbQueries.getBookmarks(sessionId);

      // 4. Translate & Extract Tasks via LLM
      const sessionDate = new Date(session.created_at);
      let rawExtraction = await llmProvider.translateAndExtract(
        sttResult.segments,
        bookmarks,
        sessionDate,
        config.timezone
      );

      // 5. Zod Validation with 1 Repair Fallback
      let validated = ExtractionPipelineResultSchema.safeParse(rawExtraction);
      if (!validated.success) {
        console.warn("[Pipeline] Extraction schema validation failed, retrying repair...");
        rawExtraction = await llmProvider.translateAndExtract(
          sttResult.segments,
          bookmarks,
          sessionDate,
          config.timezone
        );
        validated = ExtractionPipelineResultSchema.safeParse(rawExtraction);
        if (!validated.success) {
          throw new Error(`Extraction validation failed: ${validated.error.message}`);
        }
      }

      const { summary, fyi_notes, tasks } = validated.data;

      // 6. Save Extracted Tasks & Schedule Default Reminders
      const createdTasks = [];
      for (const t of tasks) {
        const created = await dbQueries.createTask({
          userId: session.user_id,
          sessionId: session.id,
          title: t.title,
          description: t.description,
          requestedBy: t.requested_by,
          dueAt: t.due_at,
          priority: t.priority,
          status: "needs_review",
          tags: t.tags,
          sourceQuoteOriginal: t.source_quote_original,
          sourceQuoteEnglish: t.source_quote_english,
          startMs: t.start_ms,
          endMs: t.end_ms,
          confidence: t.confidence,
          needsClarification: t.needs_clarification,
          clarificationQuestion: t.clarification_question,
        });

        createdTasks.push(created);

        // Schedule default reminders if task has due_at
        if (created.due_at) {
          const dueTime = new Date(created.due_at).getTime();
          const oneDayBefore = new Date(dueTime - 24 * 60 * 60 * 1000);
          const oneHourBefore = new Date(dueTime - 60 * 60 * 1000);
          const now = Date.now();

          // 1 day before (if still in future)
          if (oneDayBefore.getTime() > now) {
            await dbQueries.createReminder({
              userId: session.user_id,
              taskId: created.id,
              fireAt: oneDayBefore.toISOString(),
              channel: "fcm",
            });
          }

          // 1 hour before
          if (oneHourBefore.getTime() > now) {
            await dbQueries.createReminder({
              userId: session.user_id,
              taskId: created.id,
              fireAt: oneHourBefore.toISOString(),
              channel: "fcm",
            });
          }

          // At due time
          if (dueTime > now) {
            await dbQueries.createReminder({
              userId: session.user_id,
              taskId: created.id,
              fireAt: new Date(dueTime).toISOString(),
              channel: "fcm",
            });
          }
        }
      }

      // 7. Save FYI Notes
      for (const note of fyi_notes) {
        await dbQueries.createNote({
          sessionId: session.id,
          userId: session.user_id,
          content: note,
          tags: ["fyi"],
        });
      }

      // 8. Update Session to Processed
      const completedSession = await dbQueries.updateSession(sessionId, {
        status: "processed",
        summary,
        language_detected: sttResult.language_detected,
      });

      if (completedSession) {
        // Emit WebSocket Realtime Events
        wsService.broadcastToUser(session.user_id, {
          type: "session.updated",
          session: completedSession,
        });
        wsService.broadcastToUser(session.user_id, {
          type: "session.processed",
          sessionId: session.id,
          tasksCount: createdTasks.length,
        });

        // Trigger FCM Push notification
        await sendPushNotification({
          userId: session.user_id,
          title: "Session Processed",
          body: `${createdTasks.length} new tasks extracted from conversation need review.`,
          payload: {
            sessionId: session.id,
            tasksCount: createdTasks.length,
          },
        });
      }
    } catch (err: any) {
      console.error(`[Pipeline] Failed to process session ${sessionId}:`, err);
      await dbQueries.updateSession(sessionId, { status: "failed" });
      throw err;
    }
  }
}

export const pipelineOrchestrator = new PipelineOrchestrator();
