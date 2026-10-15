import fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { initDatabase, pool } from "./db/index.js";
import { initFirebase } from "./services/notificationService.js";
import { wsService } from "./services/websocketService.js";
import { config } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { audioStreamRoutes } from "./routes/audioStream.js";
import { taskRoutes } from "./routes/tasks.js";
import { sessionRoutes } from "./routes/sessions.js";
import { deviceRoutes } from "./routes/devices.js";
import { settingRoutes } from "./routes/settings.js";

export async function buildApp() {
  const app = fastify({
    logger: {
      level: config.env === "development" ? "info" : "warn",
    },
  });

  // Database initialization (PostgreSQL 16)
  await initDatabase();

  // Firebase Admin initialization (non-blocking if not configured)
  initFirebase();

  // Security Headers via Helmet
  app.register(helmet, {
    contentSecurityPolicy: false, // Allows PWA client scripts
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  // Cookie parser for JWT
  app.register(cookie, {
    secret: process.env.COOKIE_SECRET || "taskcatch_cookie_secret_dev_32_characters_minimum",
  });

  // Rate Limiting (100 req/min general, protects local resources)
  app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });

  // CORS configuration
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, desktop Electron)
      if (!origin) return cb(null, true);
      // Allow localhost and Tailscale domains
      if (
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes(".ts.net") ||
        config.corsOrigin.includes(origin)
      ) {
        return cb(null, true);
      }
      return cb(null, true);
    },
    credentials: true,
  });

  // Multipart audio uploads (up to 150 MB for 2hr sessions)
  app.register(multipart, {
    limits: {
      fileSize: 150 * 1024 * 1024,
    },
  });

  // WebSockets
  app.register(websocket);

  // Global Auth hook
  app.addHook("preHandler", authMiddleware);

  // Health and Readiness probes
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "taskcatch-api",
      database: "postgresql-16",
    };
  });

  app.get("/ready", async (request, reply) => {
    try {
      const client = await pool.connect();
      client.release();
      return { status: "ready", database: "connected" };
    } catch (err: any) {
      return reply.status(503).send({ status: "not_ready", error: err.message });
    }
  });

  // WebSocket endpoint
  app.register(async function (fastifyInstance) {
    fastifyInstance.get("/ws", { websocket: true }, (connection: any, req) => {
      const socket = connection.socket || connection;
      const url = new URL(req.url, `http://${req.headers.host}`);
      const userId = url.searchParams.get("userId") || config.defaultUserId;
      const deviceId = url.searchParams.get("deviceId") || "unknown";

      wsService.register(socket, userId, deviceId);

      socket.on("message", (messageRaw: any) => {
        try {
          const msg = JSON.parse(messageRaw.toString());
          if (msg.type === "ping") {
            socket.send(JSON.stringify({ type: "pong", time: Date.now() }));
          }
        } catch {
          // ignore invalid frames
        }
      });
    });
  });

  // REST API Route Plugins
  app.register(authRoutes);
  app.register(audioStreamRoutes);
  app.register(taskRoutes, { prefix: "/api/tasks" });
  app.register(sessionRoutes, { prefix: "/api/sessions" });
  app.register(deviceRoutes, { prefix: "/api/devices" });
  app.register(settingRoutes, { prefix: "/api/settings" });

  return app;
}

