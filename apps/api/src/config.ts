import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

export const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
  corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:3000").split(","),

  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH || "./data/taskcatch.sqlite"),
  storageDir: path.resolve(process.cwd(), process.env.STORAGE_DIR || "./data/uploads"),

  defaultUserId: process.env.DEFAULT_USER_ID || "user_personal_01",
  timezone: process.env.TIMEZONE || "Asia/Calcutta",

  // STT Config
  sttProvider: process.env.STT_PROVIDER || "faster-whisper",
  sttServiceUrl: process.env.STT_SERVICE_URL || "http://127.0.0.1:8000",
  whisperModelSize: process.env.WHISPER_MODEL_SIZE || "base",

  // LLM Config
  llmProvider: process.env.LLM_PROVIDER || "ollama",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct",

  // Firebase Push
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "",
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || "",
};
