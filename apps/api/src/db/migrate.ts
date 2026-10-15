import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";
import path from "node:path";
import fs from "node:fs";

export async function runMigrations() {
  // Check candidate migration folders (apps/api/drizzle or ./drizzle depending on cwd)
  let migrationsFolder = path.resolve(process.cwd(), "drizzle");
  if (!fs.existsSync(migrationsFolder)) {
    migrationsFolder = path.resolve(process.cwd(), "apps/api/drizzle");
  }
  
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(847291)");
    try {
      console.info(`[Database] Running Drizzle migrations from ${migrationsFolder}...`);
      await migrate(db, { migrationsFolder });
      console.info("[Database] Drizzle migrations applied successfully.");
    } finally {
      await client.query("SELECT pg_advisory_unlock(847291)");
    }
  } finally {
    client.release();
  }
}

if (process.argv.includes("--run") || process.env.RUN_MIGRATION_DIRECT === "true") {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[Database] Migration failed:", err);
      await pool.end();
      process.exit(1);
    });
}
