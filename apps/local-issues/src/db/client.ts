import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.ts";

const DEFAULT_DB_PATH = ".run/local-issues.db";

export function getDbPath(): string {
  return process.env.LOCAL_ISSUES_DB_PATH ?? DEFAULT_DB_PATH;
}

export function createDb(dbPath?: string) {
  const resolvedPath = dbPath ?? getDbPath();
  const sqlite = new Database(resolvedPath, { create: true });

  // SQLite pragmas for correctness and performance
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.run("PRAGMA busy_timeout = 5000");

  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof createDb>;
