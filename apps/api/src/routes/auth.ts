import { FastifyInstance } from "fastify";
import "@fastify/cookie";
import { z } from "zod";
import { AuthService } from "../services/authService.js";
import { db } from "../db/index.js";
import { users, settings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

const RegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const JWT_SECRET = process.env.JWT_SECRET || "taskcatch_jwt_secret_dev_32_characters_long_min";

export async function authRoutes(fastify: FastifyInstance) {
  // GET /api/auth/status
  fastify.get("/api/auth/status", async (request, reply) => {
    const status = await AuthService.getAuthStatus();
    let consent = false;
    if (status.isSetup) {
      const s = await db.select().from(settings).where(eq(settings.user_id, status.defaultUserId));
      consent = s[0]?.consent_acknowledged ?? false;
    }
    return reply.send({
      isSetup: status.isSetup,
      consentAcknowledged: consent,
    });
  });

  // POST /api/auth/register (first-run single user)
  fastify.post("/api/auth/register", async (request, reply) => {
    const parse = RegisterSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid registration data", details: parse.error.issues });
    }

    try {
      const result = await AuthService.registerSingleUser(
        parse.data.name,
        parse.data.email,
        parse.data.password
      );

      // Set httpOnly cookie for web PWA
      reply.setCookie("access_token", result.tokens.accessToken, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
  });

  // POST /api/auth/login
  fastify.post("/api/auth/login", async (request, reply) => {
    const parse = LoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: "Invalid credentials format." });
    }

    try {
      const result = await AuthService.login(parse.data.email, parse.data.password);

      reply.setCookie("access_token", result.tokens.accessToken, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send(result);
    } catch (err: any) {
      return reply.status(401).send({ error: err.message });
    }
  });

  // POST /api/auth/refresh
  fastify.post("/api/auth/refresh", async (request, reply) => {
    const refreshToken = (request.body as any)?.refreshToken || (request as any).cookies?.refresh_token;
    if (!refreshToken) {
      return reply.status(400).send({ error: "Refresh token required." });
    }

    try {
      const tokens = await AuthService.refresh(refreshToken);
      reply.setCookie("access_token", tokens.accessToken, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
      });
      return reply.send({ tokens });
    } catch (err: any) {
      return reply.status(401).send({ error: err.message });
    }
  });

  // GET /api/auth/me
  fastify.get("/api/auth/me", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const foundUsers = await db.select().from(users).where(eq(users.id, userId));
    if (foundUsers.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }

    const userSettings = await db.select().from(settings).where(eq(settings.user_id, userId));

    return reply.send({
      user: {
        id: foundUsers[0].id,
        name: foundUsers[0].name,
        email: foundUsers[0].email,
        consentAcknowledged: userSettings[0]?.consent_acknowledged ?? false,
      },
      settings: userSettings[0] ?? null,
    });
  });

  // POST /api/auth/consent
  fastify.post("/api/auth/consent", async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    await AuthService.acknowledgeConsent(userId);
    return reply.send({ status: "acknowledged", consentAcknowledged: true });
  });

  // POST /api/auth/logout
  fastify.post("/api/auth/logout", async (request, reply) => {
    if (request.user?.id) {
      await AuthService.logout(request.user.id);
    }
    reply.clearCookie("access_token", { path: "/" });
    return reply.send({ status: "logged_out" });
  });

  // POST /api/audio/:sessionId/token -> Signed URL generator for audio playback
  fastify.post("/api/audio/:sessionId/token", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Generate 1-hour signed playback token
    const token = jwt.sign(
      { sub: userId, sessionId, type: "audio_stream" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    return reply.send({
      token,
      streamUrl: `/api/audio/stream/${sessionId}?token=${token}`,
      expiresIn: 3600,
    });
  });
}
