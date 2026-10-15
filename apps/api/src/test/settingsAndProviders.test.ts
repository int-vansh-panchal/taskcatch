import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { ProviderFactory } from "../providers/factory.js";
import { MockSpeechProvider } from "../providers/mockSpeechProvider.js";
import { MockLLMProvider } from "../providers/mockLLMProvider.js";
import { pool } from "../db/index.js";
import type { FastifyInstance } from "fastify";

describe("Settings and Provider Fallback", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("returns default settings on GET /api/settings", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/settings",
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data.settings).toBeDefined();
    expect(data.settings.speech_provider).toBeDefined();
  });

  it("updates settings dynamically on PUT /api/settings", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: {
        profile: "fast",
        retention_days: 45,
        digest_time: "08:30",
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data.settings.profile).toBe("fast");
    expect(data.settings.retention_days).toBe(45);
    expect(data.settings.digest_time).toBe("08:30");
  });

  it("falls back to MockSpeechProvider when unknown speech provider is specified", async () => {
    const provider = await ProviderFactory.getSpeechProvider("unknown_speech_engine");
    expect(provider).toBeInstanceOf(MockSpeechProvider);
    expect(provider.name).toBe("mock-speech-provider");
  });

  it("falls back to MockLLMProvider when unknown LLM provider is requested", async () => {
    const provider = await ProviderFactory.getLLMProvider("unknown_llm");
    expect(provider).toBeInstanceOf(MockLLMProvider);
    expect(provider.name).toBe("mock-llm-provider");
  });

  it("imports and merges vocabulary hints without duplicates", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/settings/vocabulary/import",
      payload: {
        words: ["Inverter", "DISCOM", "SCADA", "Inverter"],
        merge: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data.vocabulary_hints).toContain("Inverter");
    expect(data.vocabulary_hints).toContain("DISCOM");
    expect(data.vocabulary_hints).toContain("SCADA");
  });

  it("exports vocabulary hints formatted as a clean list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/settings/vocabulary/export",
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(Array.isArray(data.vocabulary)).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(1);
  });
});
