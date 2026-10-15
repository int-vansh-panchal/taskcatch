import { dbQueries } from "../db/queries.js";
import { wsService } from "../services/websocketService.js";
import { sendPushNotification } from "../services/notificationService.js";
import {
  ExtractionPipelineResultSchema,
  type SpeechProvider,
  type LLMProvider,
  type SpeechSegmentResult,
} from "@taskcatch/shared";
import { ProviderFactory } from "../providers/factory.js";
import { config } from "../config.js";

export class PipelineOrchestrator {
  private defaultSpeechProvider?: SpeechProvider;
  private defaultLLMProvider?: LLMProvider;

  constructor(speechProvider?: SpeechProvider, llmProvider?: LLMProvider) {
    this.defaultSpeechProvider = speechProvider;
    this.defaultLLMProvider = llmProvider;
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
      return; // Idempotent
    }

    // Load user settings for provider selection & parameters
    const userSettings = await dbQueries.getSettings(session.user_id);

    const speechProvider =
      customSpeechProvider ||
      this.defaultSpeechProvider ||
      (await ProviderFactory.getSpeechProvider(userSettings?.speech_provider));

    const llmProvider =
      customLLMProvider ||
      this.defaultLLMProvider ||
      (await ProviderFactory.getLLMProvider(userSettings?.llm_provider, userSettings?.llm_model));

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

      // 2. Transcribe Audio (Single pass by default; dual pass only if configured)
      const dualPassEnabled = userSettings?.whisper_dual_pass ?? false;
      const sttResult = await speechProvider.transcribe(
        audioPath,
        userSettings?.vocabulary_hints || undefined,
        {
          task: dualPassEnabled ? "translate" : "transcribe",
          modelSize: userSettings?.speech_model || "small",
        }
      );

      // Save segments to Postgres
      await dbQueries.insertSegments(sessionId, sttResult.segments);

      // 3. Load Bookmarks
      const bookmarks = await dbQueries.getBookmarks(sessionId);

      // 4. Translate & Extract Tasks via LLM
      const sessionDate = new Date(session.created_at);
      const extraction = await llmProvider.translateAndExtract(
        sttResult.segments,
        bookmarks,
        sessionDate,
        config.timezone,
        {
          model: userSettings?.llm_model,
          vocabularyHints: userSettings?.vocabulary_hints || undefined,
        }
      );

      await this.saveExtractedTasksAndNotes(session, extraction, bookmarks);

      // 5. Update Session to Processed
      const completedSession = await dbQueries.updateSession(sessionId, {
        status: "processed",
        summary: extraction.summary,
        language_detected: sttResult.language_detected,
      });

      if (completedSession) {
        wsService.broadcastToUser(session.user_id, {
          type: "session.updated",
          session: completedSession,
        });
        wsService.broadcastToUser(session.user_id, {
          type: "session.processed",
          sessionId: session.id,
          tasksCount: extraction.tasks.length,
        });

        // Trigger FCM Push notification
        await sendPushNotification({
          userId: session.user_id,
          title: "Tasks Extracted",
          body: `${extraction.tasks.length} new tasks extracted from conversation need review.`,
          payload: {
            sessionId: session.id,
            tasksCount: extraction.tasks.length,
          },
        });
      }
    } catch (err: any) {
      console.error(`[Pipeline] Failed to process session ${sessionId}:`, err);
      await dbQueries.updateSession(sessionId, { status: "failed" });
      throw err;
    }
  }

  /**
   * Re-run only task extraction on an existing session (useful after editing segments or adding bookmarks).
   */
  async reExtractSession(sessionId: string, customLLMProvider?: LLMProvider): Promise<void> {
    const session = await dbQueries.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const userSettings = await dbQueries.getSettings(session.user_id);
    const llmProvider =
      customLLMProvider ||
      this.defaultLLMProvider ||
      (await ProviderFactory.getLLMProvider(userSettings?.llm_provider, userSettings?.llm_model));

    const dbSegments = await dbQueries.getSegments(sessionId);
    const speechSegments: SpeechSegmentResult[] = dbSegments.map((s) => ({
      start_ms: s.start_ms,
      end_ms: s.end_ms,
      speaker: s.speaker,
      text_original: s.text_original,
      text_english: s.text_english,
      confidence: s.confidence,
    }));

    const bookmarks = await dbQueries.getBookmarks(sessionId);
    const sessionDate = new Date(session.created_at);

    const extraction = await llmProvider.translateAndExtract(
      speechSegments,
      bookmarks,
      sessionDate,
      config.timezone,
      {
        model: userSettings?.llm_model,
        vocabularyHints: userSettings?.vocabulary_hints || undefined,
      }
    );

    // Delete existing unconfirmed tasks from this session
    await this.saveExtractedTasksAndNotes(session, extraction, bookmarks);

    await dbQueries.updateSession(sessionId, {
      summary: extraction.summary,
    });

    wsService.broadcastToUser(session.user_id, {
      type: "session.processed",
      sessionId: session.id,
      tasksCount: extraction.tasks.length,
    });
  }

  private async saveExtractedTasksAndNotes(
    session: any,
    extraction: any,
    bookmarks: any[]
  ): Promise<any[]> {
    const createdTasks = [];

    for (const t of extraction.tasks) {
      // Confidence boosting near bookmarks (within 15 seconds)
      let confidence = t.confidence ?? 0.8;
      const isNearBookmark = bookmarks.some(
        (b) => Math.abs(b.timestamp_ms - t.start_ms) < 15000 || Math.abs(b.timestamp_ms - t.end_ms) < 15000
      );
      if (isNearBookmark) {
        confidence = Math.min(1.0, confidence + 0.15);
      }

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
        confidence,
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

        if (oneDayBefore.getTime() > now) {
          await dbQueries.createReminder({
            userId: session.user_id,
            taskId: created.id,
            fireAt: oneDayBefore.toISOString(),
            channel: "fcm",
          });
        }

        if (oneHourBefore.getTime() > now) {
          await dbQueries.createReminder({
            userId: session.user_id,
            taskId: created.id,
            fireAt: oneHourBefore.toISOString(),
            channel: "fcm",
          });
        }

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

    // Save FYI Notes
    for (const note of extraction.fyi_notes || []) {
      await dbQueries.createNote({
        sessionId: session.id,
        userId: session.user_id,
        content: note,
        tags: ["fyi"],
      });
    }

    return createdTasks;
  }
}

export const pipelineOrchestrator = new PipelineOrchestrator();
