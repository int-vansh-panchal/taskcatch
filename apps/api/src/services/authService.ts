import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { eq, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, settings } from "../db/schema.js";
import { config } from "../config.js";

const JWT_SECRET = process.env.JWT_SECRET || "taskcatch_jwt_secret_dev_32_characters_long_min";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  consentAcknowledged: boolean;
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456, // 19 MB
      timeCost: 2,
      parallelism: 1,
    });
  }

  static async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  static generateTokens(userId: string, email: string): AuthTokens {
    const accessToken = jwt.sign({ sub: userId, email, type: "access" }, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
    const refreshToken = jwt.sign({ sub: userId, email, type: "refresh" }, JWT_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 mins
    };
  }

  static verifyToken(token: string, expectedType: "access" | "refresh" = "access"): { sub: string; email: string } {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email: string; type: string };
    if (decoded.type !== expectedType) {
      throw new Error(`Invalid token type: expected ${expectedType}`);
    }
    return decoded;
  }

  static async getAuthStatus(): Promise<{ isSetup: boolean; hasUser: boolean; defaultUserId: string }> {
    const allUsers = await db.select().from(users);
    // Setup is completed if there is a configured user with a valid argon2 hash (not the default pending placeholder)
    const configuredUser = allUsers.find(
      (u) => u.password_hash && u.password_hash.startsWith("$argon2")
    );
    return {
      isSetup: !!configuredUser,
      hasUser: allUsers.length > 0,
      defaultUserId: configuredUser ? configuredUser.id : config.defaultUserId,
    };
  }

  static async registerSingleUser(name: string, email: string, passwordPlain: string): Promise<{ user: UserSummary; tokens: AuthTokens }> {
    const status = await this.getAuthStatus();
    if (status.isSetup) {
      throw new Error("Setup already completed. Single-user system allows only one owner.");
    }

    const passwordHash = await this.hashPassword(passwordPlain);
    const userId = config.defaultUserId; // Reuse or create primary single user

    const tokens = this.generateTokens(userId, email);

    // Upsert user
    await db
      .insert(users)
      .values({
        id: userId,
        name,
        email,
        password_hash: passwordHash,
        refresh_token: tokens.refreshToken,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name,
          email,
          password_hash: passwordHash,
          refresh_token: tokens.refreshToken,
        },
      });

    // Ensure settings exist
    await db
      .insert(settings)
      .values({
        user_id: userId,
        consent_acknowledged: false,
      })
      .onConflictDoNothing();

    return {
      user: {
        id: userId,
        name,
        email,
        consentAcknowledged: false,
      },
      tokens,
    };
  }

  static async login(email: string, passwordPlain: string): Promise<{ user: UserSummary; tokens: AuthTokens }> {
    const foundUsers = await db.select().from(users).where(eq(users.email, email));
    if (foundUsers.length === 0) {
      throw new Error("Invalid email or password.");
    }

    const user = foundUsers[0];
    if (!user.password_hash || !user.email) {
      throw new Error("User credentials not configured. Please complete initial setup.");
    }
    const valid = await this.verifyPassword(user.password_hash, passwordPlain);
    if (!valid) {
      throw new Error("Invalid email or password.");
    }

    const tokens = this.generateTokens(user.id, user.email);

    // Save refresh token
    await db.update(users).set({ refresh_token: tokens.refreshToken }).where(eq(users.id, user.id));

    const userSettings = await db.select().from(settings).where(eq(settings.user_id, user.id));
    const consentAcknowledged = userSettings[0]?.consent_acknowledged ?? false;

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        consentAcknowledged,
      },
      tokens,
    };
  }

  static async refresh(refreshToken: string): Promise<AuthTokens> {
    const decoded = this.verifyToken(refreshToken, "refresh");
    const foundUsers = await db.select().from(users).where(eq(users.id, decoded.sub));
    if (foundUsers.length === 0 || foundUsers[0].refresh_token !== refreshToken || !foundUsers[0].email) {
      throw new Error("Invalid or revoked refresh token.");
    }

    const newTokens = this.generateTokens(foundUsers[0].id, foundUsers[0].email);
    await db.update(users).set({ refresh_token: newTokens.refreshToken }).where(eq(users.id, foundUsers[0].id));

    return newTokens;
  }

  static async logout(userId: string): Promise<void> {
    await db.update(users).set({ refresh_token: null }).where(eq(users.id, userId));
  }

  static async acknowledgeConsent(userId: string): Promise<void> {
    await db.update(settings).set({ consent_acknowledged: true }).where(eq(settings.user_id, userId));
  }
}
