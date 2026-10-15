import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

import { runMigrations } from "./migrate.js";

let initPromise: Promise<void> | null = null;

export async function initDatabase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await runMigrations();

    // Ensure default user and settings exist
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO users (id, email, name, password_hash)
        VALUES ('${config.defaultUserId}', 'user@taskcatch.local', 'Personal User', 'default_hash_pending_setup')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO settings (user_id)
        VALUES ('${config.defaultUserId}')
        ON CONFLICT (user_id) DO NOTHING;
      `);
      console.info("[Database] Database initialized and default user/settings verified.");
    } finally {
      client.release();
    }
  })();
  return initPromise;
}

export async function closeDatabase() {
  await pool.end();
}

