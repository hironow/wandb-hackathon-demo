import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createDb, type AppDatabase } from "../db/client.ts";
import { teams, users } from "../db/schema.ts";
import { registerAllTools } from "./register.ts";

const TEST_DB_PATH = ".run/test-register.db";

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function cleanup(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = TEST_DB_PATH + suffix;
    if (existsSync(file)) unlinkSync(file);
  }
}

function setupDb(): AppDatabase {
  ensureDir(TEST_DB_PATH);
  const db = createDb(TEST_DB_PATH);
  db.run(`CREATE TABLE IF NOT EXISTS "teams" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "key" text NOT NULL,
    "icon" text,
    "archived_at" text,
    "created_at" text DEFAULT (datetime('now')) NOT NULL,
    "updated_at" text DEFAULT (datetime('now')) NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS "users" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "display_name" text,
    "active" integer DEFAULT 1 NOT NULL,
    "admin" integer DEFAULT 0 NOT NULL,
    "team_id" text REFERENCES "teams"("id") ON DELETE SET NULL,
    "created_at" text DEFAULT (datetime('now')) NOT NULL,
    "updated_at" text DEFAULT (datetime('now')) NOT NULL
  )`);
  return db;
}

describe("registerAllTools", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanup();
    db = setupDb();
  });

  afterEach(cleanup);

  test("registers all 4 tools without error", () => {
    // given
    const server = new McpServer({ name: "test", version: "0.0.1" });

    // when/then - should not throw
    registerAllTools(server, db);
  });
});
