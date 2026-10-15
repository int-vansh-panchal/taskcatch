import { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "../services/authService.js";
import { config } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      email?: string;
    };
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Public auth and health routes bypass authentication
  const path = request.url;
  if (
    path.startsWith("/health") ||
    path.startsWith("/ready") ||
    path.startsWith("/api/auth/status") ||
    path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/register") ||
    path.startsWith("/api/auth/refresh") ||
    path.startsWith("/api/audio/stream") ||
    path.startsWith("/ws")
  ) {
    return;
  }

  // 1. Check Authorization Bearer header
  const authHeader = request.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if ((request as any).cookies?.access_token) {
    token = (request as any).cookies.access_token;
  }

  if (token) {
    try {
      const decoded = AuthService.verifyToken(token, "access");
      request.user = { id: decoded.sub, email: decoded.email };
      return;
    } catch {
      return reply.status(401).send({ error: "Invalid or expired access token." });
    }
  }

  // If in development/test mode and no token was provided, fall back to default user
  if (process.env.NODE_ENV !== "production") {
    request.user = { id: config.defaultUserId, email: "user@taskcatch.local" };
    return;
  }

  return reply.status(401).send({ error: "Authentication required." });
}
