import type {
  LLMProvider,
  SpeechSegmentResult,
  Bookmark,
  ExtractionPipelineResult,
} from "@taskcatch/shared";
import {
  ExtractionPipelineResultSchema,
  resolveIndianRelativeDate,
} from "@taskcatch/shared";
import { config } from "../config.js";

export class OllamaLLMProvider implements LLMProvider {
  name = "ollama";

  constructor(
    private baseUrl: string = config.ollamaBaseUrl,
    private defaultModel: string = config.ollamaModel
  ) {}

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = (await res.json()) as any;
        const models = (data.models || []).map((m: any) => m.name).join(", ");
        return { ok: true, message: `Ollama active. Available models: ${models || "none"}` };
      }
      return { ok: false, message: `Ollama returned HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: `Ollama service unreachable at ${this.baseUrl}: ${err.message}` };
    }
  }

  async translateAndExtract(
    segments: SpeechSegmentResult[],
    bookmarks: Bookmark[],
    sessionDate: Date,
    timezone: string,
    options?: { model?: string; vocabularyHints?: string }
  ): Promise<ExtractionPipelineResult> {
    const model = options?.model || this.defaultModel;
    const sessionDateIso = sessionDate.toISOString();
    const vocabHints = options?.vocabularyHints ? `Domain Vocabulary Hints: ${options.vocabularyHints}` : "";

    // Format transcript segments for context
    const transcriptText = segments
      .map(
        (s, i) =>
          `[Segment ${i + 1}] (${Math.round(s.start_ms / 1000)}s - ${Math.round(s.end_ms / 1000)}s) [Speaker: ${s.speaker}]` +
          `\nOriginal: ${s.text_original}` +
          (s.text_english ? `\nEnglish Translation: ${s.text_english}` : "")
      )
      .join("\n\n");

    const bookmarkNotes =
      bookmarks.length > 0
        ? `User Bookmarks / High Priority Moments:\n` +
          bookmarks.map((b) => `- At ${Math.round(b.timestamp_ms / 1000)}s: ${b.label || "Important section"}`).join("\n")
        : "";

    // ── Prompt Engineering for Structured Task Extraction ─────────────────────
    const systemPrompt = `You are an elite executive assistant and task extractor for an engineer working in an Indian workplace.
Your job is to capture EVERY actionable task, assignment, deadline, and key information from transcripts of verbal conversations spoken in Hindi, Gujarati, Hinglish, or English.

Guidelines:
1. NEVER invent tasks or hallucinate details. Extract only what was spoken.
2. If an item is an actionable task, create a self-contained task item:
   - title: Concise action title (<= 80 chars).
   - description: Comprehensive, unambiguous description so the user understands everything even a month later.
   - requested_by: Name or role of the requester if mentioned, else null.
   - priority: "low" | "med" | "high" | "urgent".
   - tags: Array of keywords (e.g. ["solar", "deployment", "review"]).
   - source_quote_original: Exact spoken excerpt.
   - source_quote_english: English translation of the spoken excerpt.
   - start_ms & end_ms: Timestamps in milliseconds matching the audio quote.
   - confidence: 0.0 to 1.0 score. Boost confidence for tasks near user bookmarks.
   - due_at: ISO 8601 string or relative reference in India (Asia/Calcutta).
   - needs_clarification: true if deadline or scope is ambiguous.
   - clarification_question: Suggested question to ask the manager/peer.
3. If an item is general information or a decision (not an assigned task), put it into "fyi_notes".
4. Provide a 3-5 line concise English session summary.
5. Output MUST be valid JSON adhering strictly to the schema.`;

    const userPrompt = `Recording Date / Time: ${sessionDateIso} (Timezone: ${timezone})
${vocabHints}
${bookmarkNotes}

Conversation Transcript:
${transcriptText}

Extract tasks and summary as JSON with this exact structure:
{
  "summary": "3 to 5 lines summarizing the conversation...",
  "fyi_notes": ["Note 1", "Note 2"],
  "tasks": [
    {
      "title": "Title here (max 80 chars)",
      "description": "Full self-contained detail...",
      "requested_by": null,
      "due_at": "YYYY-MM-DDTHH:mm:ssZ" or null,
      "priority": "med",
      "tags": ["tag1"],
      "source_quote_original": "spoken quote",
      "source_quote_english": "english quote",
      "start_ms": 0,
      "end_ms": 3000,
      "confidence": 0.85,
      "needs_clarification": false,
      "clarification_question": null
    }
  ]
}`;

    // Pass 1 & 2 Execution via Ollama with keep_alive to enforce memory budget
    const rawResult = await this.callOllamaWithRetry(model, systemPrompt, userPrompt);

    // Resolve relative dates in tasks against sessionDate and Indian context
    if (rawResult && Array.isArray(rawResult.tasks)) {
      for (const task of rawResult.tasks) {
        if (task.due_at) {
          // If due_at is not already a valid ISO string, try resolving it
          const parsed = Date.parse(task.due_at);
          if (isNaN(parsed)) {
            const resolved = resolveIndianRelativeDate(task.due_at, {
              baseDate: sessionDate,
              timezone,
            });
            task.due_at = resolved;
          }
        }
      }
    }

    return rawResult;
  }

  private async callOllamaWithRetry(
    model: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<ExtractionPipelineResult> {
    const payload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      format: "json",
      options: {
        temperature: 0.1, // Near-deterministic
        num_ctx: 4096,
      },
      keep_alive: "2m", // Unload from RAM after 2 minutes to respect machine resource limit
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama extraction failed HTTP ${res.status}: ${err}`);
    }

    const data = (await res.json()) as any;
    const content = data.message?.content || "{}";

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      // First repair attempt: find JSON block in output
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        parsedJson = JSON.parse(match[0]);
      } else {
        throw new Error("Ollama did not return a valid JSON object.");
      }
    }

    // Validate with Zod
    const validation = ExtractionPipelineResultSchema.safeParse(parsedJson);
    if (validation.success) {
      return validation.data;
    }

    // One automatic repair retry if schema validation failed
    console.warn(`[Ollama] Output failed Zod validation, attempting 1 automatic repair retry: ${validation.error.message}`);
    const repairPrompt = `Your previous JSON output failed validation with error: ${validation.error.message}
Fix the JSON so it strictly matches the schema and return ONLY valid JSON:
${content}`;

    const repairPayload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: repairPrompt },
      ],
      stream: false,
      format: "json",
      keep_alive: "1m",
    };

    const repairRes = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(repairPayload),
    });

    if (repairRes.ok) {
      const repairData = (await repairRes.json()) as any;
      const repairedJson = JSON.parse(repairData.message?.content || "{}");
      const repairedValidation = ExtractionPipelineResultSchema.safeParse(repairedJson);
      if (repairedValidation.success) {
        return repairedValidation.data;
      }
    }

    // Graceful fallback: construct clean result using whatever tasks parsed
    return {
      summary: parsedJson.summary || "Summary generation incomplete.",
      fyi_notes: Array.isArray(parsedJson.fyi_notes) ? parsedJson.fyi_notes : [],
      tasks: Array.isArray(parsedJson.tasks)
        ? parsedJson.tasks.map((t: any) => ({
            title: String(t.title || "Untitled task").slice(0, 80),
            description: String(t.description || t.title || "Extracted task"),
            requested_by: t.requested_by || null,
            due_at: t.due_at || null,
            priority: ["low", "med", "high", "urgent"].includes(t.priority) ? t.priority : "med",
            tags: Array.isArray(t.tags) ? t.tags : [],
            source_quote_original: t.source_quote_original || "",
            source_quote_english: t.source_quote_english || "",
            start_ms: t.start_ms || 0,
            end_ms: t.end_ms || 0,
            confidence: typeof t.confidence === "number" ? t.confidence : 0.75,
            needs_clarification: !!t.needs_clarification,
            clarification_question: t.clarification_question || null,
          }))
        : [],
    };
  }
}
