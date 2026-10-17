import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initDatabase, pool } from "../db/index.js";
import { dbQueries } from "../db/queries.js";
import { PipelineOrchestrator } from "../pipeline/orchestrator.js";
import { MockSpeechProvider } from "../providers/mockSpeechProvider.js";
import { MockLLMProvider } from "../providers/mockLLMProvider.js";

describe("Pipeline Orchestrator with PostgreSQL", () => {
  const testUserId = "user_test_pipeline_pg";

  beforeAll(async () => {
    await initDatabase();
    await pool.query(
      `INSERT INTO users (id, name, email) VALUES ($1, 'Test Pipeline User PG', 'test_pipeline@taskcatch.test') ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );
    await pool.query(`DELETE FROM tasks WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [testUserId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM tasks WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  });

  it("processes a multilingual Hindi session end-to-end and saves to Postgres", async () => {
    const orchestrator = new PipelineOrchestrator(
      new MockSpeechProvider(),
      new MockLLMProvider()
    );

    // Create session with audio path hinting hindi
    const session = await dbQueries.createSession({
      userId: testUserId,
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
      userId: testUserId,
      sessionId: session.id,
    });
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].status).toBe("needs_review");
    // Verify bookmark confidence boost (was 0.85 + 0.15 = 1.0)
    expect(tasks[0].confidence).toBe(1.0);
  });
});
