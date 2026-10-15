import fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { initDatabase } from "./db/index.js";
import { initFirebase } from "./services/notificationService.js";
import { wsService } from "./services/websocketService.js";
import { config } from "./config.js";
import { taskRoutes } from "./routes/tasks.js";
import { sessionRoutes } from "./routes/sessions.js";
import { deviceRoutes } from "./routes/devices.js";
import { settingRoutes } from "./routes/settings.js";

export function buildApp() {
  const app = fastify({
    logger: {
      level: config.env === "development" ? "info" : "warn",
    },
  });

  // Database initialization
  initDatabase();

  // Firebase Admin initialization (non-blocking if not configured)
  initFirebase();

  // Middleware plugins
  app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB max for audio
    },
  });

  app.register(websocket);

  // Health check endpoint
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "taskcatch-api",
    };
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
  app.register(taskRoutes, { prefix: "/api/tasks" });
  app.register(sessionRoutes, { prefix: "/api/sessions" });
  app.register(deviceRoutes, { prefix: "/api/devices" });
  app.register(settingRoutes, { prefix: "/api/settings" });

  return app;
}
