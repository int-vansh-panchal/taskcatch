import { describe, it, expect, beforeAll } from "vitest";
import { initDatabase, pool } from "../db/index.js";
import { dbQueries } from "../db/queries.js";
import { PipelineOrchestrator } from "../pipeline/orchestrator.js";
import { MockSpeechProvider } from "../providers/mockSpeechProvider.js";
import { MockLLMProvider } from "../providers/mockLLMProvider.js";

describe("Pipeline Orchestrator with PostgreSQL", () => {
  beforeAll(async () => {
    await initDatabase();
    await pool.query(
      `INSERT INTO users (id, name) VALUES ('user_test_pipeline_pg', 'Test Pipeline User PG') ON CONFLICT (id) DO NOTHING`
    );
  });

  it("processes a multilingual Hindi session end-to-end and saves to Postgres", async () => {
    const orchestrator = new PipelineOrchestrator(
      new MockSpeechProvider(),
      new MockLLMProvider()
    );

    // Create session with audio path hinting hindi
    const session = await dbQueries.createSession({
      userId: "user_test_pipeline_pg",
      deviceId: "phone_android",
      audioPath: "hindi_conversation.wav",
      status: "uploaded",
    });

    // Add bookmark near 0ms
    await dbQueries.addBookmark(session.id, 500, "Leader assigning task");

    await orchestrator.processSession(session.id);

    // Verify session updated to processed
    const updated = await dbQueries.getSession(session.id);
    expect(updated?.status).toBe("processed");
    expect(updated?.language_detected).toBe("hi");
    expect(updated?.summary).toBeDefined();

    // Verify segments stored
    const segments = await dbQueries.getSegments(session.id);
    expect(segments.length).toBe(2);
    expect(segments[0].text_original).toContain("कल सुबह");

    // Verify tasks extracted and saved to PostgreSQL
    const tasks = await dbQueries.listTasks({
      userId: "user_test_pipeline_pg",
      sessionId: session.id,
    });
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].status).toBe("needs_review");
    // Verify bookmark confidence boost (was 0.85 + 0.15 = 1.0)
    expect(tasks[0].confidence).toBe(1.0);
  });
});
