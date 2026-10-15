import type {
  LLMProvider,
  SpeechSegmentResult,
  Bookmark,
  ExtractionPipelineResult,
} from "@taskcatch/shared";
import { resolveIndianRelativeDate } from "@taskcatch/shared";

export class MockLLMProvider implements LLMProvider {
  name = "mock-llm-provider";

  async translateAndExtract(
    segments: SpeechSegmentResult[],
    bookmarks: Bookmark[],
    sessionDate: Date,
    timezone: string
  ): Promise<ExtractionPipelineResult> {
    const fullEnglish = segments.map((s) => s.text_english).join(" ");
    const tasks: ExtractionPipelineResult["tasks"] = [];
    const fyiNotes: string[] = [];

    for (const seg of segments) {
      const lower = seg.text_english.toLowerCase();

      // Check if near a bookmark (within 10 seconds)
      const nearBookmark = bookmarks.some(
        (b) => Math.abs(b.timestamp_ms - seg.start_ms) <= 10000
      );
      const confidenceBoost = nearBookmark ? 0.15 : 0.0;

      if (
        lower.includes("report") ||
        lower.includes("meeting") ||
        lower.includes("release") ||
        lower.includes("notes") ||
        lower.includes("verify") ||
        lower.includes("review") ||
        lower.includes("prepare")
      ) {
        // Resolve due date
        const dueAt = resolveIndianRelativeDate(seg.text_original + " " + seg.text_english, {
          baseDate: sessionDate,
          timezone,
        });

        const isUrgent =
          lower.includes("production") ||
          lower.includes("urgent") ||
          lower.includes("immediately");

        tasks.push({
          title: seg.text_english.length > 75 ? seg.text_english.slice(0, 75) + "..." : seg.text_english,
          description: `Detailed task assignment from conversation: "${seg.text_english}". Extracted from segment recorded at ${sessionDate.toISOString()}.`,
          requested_by: "Meeting Lead",
          due_at: dueAt,
          priority: isUrgent ? "urgent" : "high",
          tags: ["work", isUrgent ? "urgent" : "general"],
          source_quote_original: seg.text_original,
          source_quote_english: seg.text_english,
          start_ms: seg.start_ms,
          end_ms: seg.end_ms,
          confidence: Math.min(1.0, 0.85 + confidenceBoost),
          needs_clarification: false,
          clarification_question: null,
        });
      } else {
        fyiNotes.push(`FYI: ${seg.text_english}`);
      }
    }

    // If nothing matched, generate at least one fallback task or clarify
    if (tasks.length === 0 && segments.length > 0) {
      tasks.push({
        title: "Review discussed conversation points",
        description: `Follow up on items mentioned in conversation: "${fullEnglish.slice(0, 100)}"`,
        requested_by: null,
        due_at: resolveIndianRelativeDate("kal shaam", { baseDate: sessionDate, timezone }),
        priority: "med",
        tags: ["follow-up"],
        source_quote_original: segments[0].text_original,
        source_quote_english: segments[0].text_english,
        start_ms: segments[0].start_ms,
        end_ms: segments[0].end_ms,
        confidence: 0.75,
        needs_clarification: true,
        clarification_question: "Could you confirm specific deliverables and deadlines for this item?",
      });
    }

    return {
      summary: `Conversation covered ${segments.length} dialogue segments regarding deliverables, deadlines, and coordination items. Key actionable instructions were extracted for tracking.`,
      fyi_notes: fyiNotes,
      tasks,
    };
  }
}
