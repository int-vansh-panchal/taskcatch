import admin, { type ServiceAccount } from "firebase-admin";
import fs from "node:fs";
import { config } from "../config.js";
import { dbQueries } from "../db/queries.js";

let firebaseInitialized = false;

function loadServiceAccount(): ServiceAccount | null {
  // 1. Raw JSON string in environment
  if (config.firebaseServiceAccountJson) {
    try {
      const parsed = JSON.parse(config.firebaseServiceAccountJson);
      return {
        projectId: parsed.project_id ?? parsed.projectId,
        clientEmail: parsed.client_email ?? parsed.clientEmail,
        privateKey: parsed.private_key ?? parsed.privateKey,
      };
    } catch {
      console.warn("[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON is present but invalid JSON");
    }
  }

  // 2. Explicit path to JSON file
  if (config.firebaseServiceAccountPath) {
    try {
      if (fs.existsSync(config.firebaseServiceAccountPath)) {
        const raw = fs.readFileSync(config.firebaseServiceAccountPath, "utf8");
        const parsed = JSON.parse(raw);
        return {
          projectId: parsed.project_id ?? parsed.projectId,
          clientEmail: parsed.client_email ?? parsed.clientEmail,
          privateKey: parsed.private_key ?? parsed.privateKey,
        };
      } else {
        console.warn(`[Firebase] Path does not exist: ${config.firebaseServiceAccountPath}`);
      }
    } catch (err) {
      console.warn(`[Firebase] Failed to read service account path:`, err);
    }
  }

  // 3. Discrete env vars
  if (config.firebaseProjectId && config.firebaseClientEmail && config.firebasePrivateKey) {
    return {
      projectId: config.firebaseProjectId,
      clientEmail: config.firebaseClientEmail,
      privateKey: config.firebasePrivateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

export function initFirebase(): boolean {
  if (firebaseInitialized || admin.apps.length > 0) {
    firebaseInitialized = true;
    return true;
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.warn("[Firebase] Service account configuration missing. Push notifications disabled.");
    return false;
  }

  try {
    if (serviceAccount.projectId?.toLowerCase().includes("intellisolar")) {
      console.warn("\n⚠️ [Firebase Warning] Configured project is the IntelliSolar CRM project!");
      console.warn("TaskCatch recommends creating a dedicated free Firebase personal project (Spark plan) to keep personal task notifications separate. See docs/FIREBASE_SETUP.md.\n");
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
    console.info("[Firebase] Firebase Admin SDK successfully initialized.");
    return true;
  } catch (error) {
    console.error("[Firebase] Failed to initialize Firebase Admin SDK:", error);
    return false;
  }
}

export async function sendPushNotification(data: {
  userId: string;
  title: string;
  body: string;
  payload?: Record<string, any>;
}): Promise<{ sent: number; failed: number }> {
  if (!initFirebase()) {
    return { sent: 0, failed: 0 };
  }

  const devices = await dbQueries.getUserDevices(data.userId);
  const tokens = devices
    .map((d) => d.fcm_token)
    .filter((token): token is string => Boolean(token && token.trim()));

  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  // Convert custom payload fields to string dictionary
  const stringData: Record<string, string> = {};
  if (data.payload) {
    for (const [k, v] of Object.entries(data.payload)) {
      if (v !== undefined && v !== null) {
        stringData[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
    }
  }

  const messages = tokens.map((token) => ({
    token,
    notification: {
      title: data.title,
      body: data.body,
    },
    data: stringData,
    android: { priority: "high" as const },
    apns: { payload: { aps: { sound: "default" } } },
  }));

  try {
    const response = await admin.messaging().sendEach(messages);
    const invalidTokens: string[] = [];

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await dbQueries.removeInvalidTokens(invalidTokens);
    }

    return { sent: response.successCount, failed: response.failureCount };
  } catch (error) {
    console.error("[Firebase] Error sending batch notifications:", error);
    return { sent: 0, failed: tokens.length };
  }
}
