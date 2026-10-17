import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { closeDatabase, pool } from "../db/index.js";
import type { FastifyInstance } from "fastify";

describe("Single-User Authentication & Security Flow", () => {
  let app: FastifyInstance;

  let originalUser: { email: string; name: string; password_hash: string } | null = null;

  beforeAll(async () => {
    // Save personal user's profile and hash if set and clear it during auth testing
    const existing = await pool.query("SELECT email, name, password_hash FROM users WHERE id = 'user_personal_01'");
    if (existing.rows[0]) {
      originalUser = existing.rows[0];
      await pool.query("UPDATE users SET password_hash = NULL WHERE id = 'user_personal_01'");
    }
    await pool.query("DELETE FROM users WHERE email = 'test_owner@taskcatch.local'");
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (originalUser) {
      await pool.query(
        "UPDATE users SET email = $1, name = $2, password_hash = $3 WHERE id = 'user_personal_01'",
        [originalUser.email, originalUser.name, originalUser.password_hash]
      );
    }
    await app.close();
    await closeDatabase();
  });

  let accessToken: string;
  let refreshToken: string;

  it("checks auth status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/status",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty("isSetup");
    expect(body).toHaveProperty("consentAcknowledged");
  });

  it("registers initial owner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Test Owner",
        email: "test_owner@taskcatch.local",
        password: "SuperSecretPassword123!",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.user.email).toBe("test_owner@taskcatch.local");
    expect(body.tokens.accessToken).toBeDefined();
    expect(body.tokens.refreshToken).toBeDefined();

    accessToken = body.tokens.accessToken;
    refreshToken = body.tokens.refreshToken;
  });

  it("blocks duplicate registration in single-user system", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        name: "Intruder",
        email: "intruder@taskcatch.local",
        password: "AnotherPassword123!",
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain("Setup already completed");
  });

  it("fails login with wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test_owner@taskcatch.local",
        password: "WrongPassword999!",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("logs in successfully with correct credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test_owner@taskcatch.local",
        password: "SuperSecretPassword123!",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.tokens.accessToken).toBeDefined();
    accessToken = body.tokens.accessToken;
    refreshToken = body.tokens.refreshToken;
  });

  it("fetches authenticated user profile and records consent", async () => {
    const meRes = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(meRes.statusCode).toBe(200);
    const me = JSON.parse(meRes.payload);
    expect(me.user.email).toBe("test_owner@taskcatch.local");

    // Acknowledge recording consent
    const consentRes = await app.inject({
      method: "POST",
      url: "/api/auth/consent",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    expect(consentRes.statusCode).toBe(200);
    expect(JSON.parse(consentRes.payload).consentAcknowledged).toBe(true);
  });

  it("refreshes access token with valid refresh token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: {
        refreshToken,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.tokens.accessToken).toBeDefined();
  });
});
