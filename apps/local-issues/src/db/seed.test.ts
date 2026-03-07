import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDb } from "./client.ts";
import { seed } from "./seed.ts";
import { teams, users, issueStatuses, localConfig } from "./schema.ts";
import { eq } from "drizzle-orm";

const TEST_DB_PATH = ".run/test-seed.db";

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function cleanup(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = TEST_DB_PATH + suffix;
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}

describe("seed", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    cleanup();
    ensureDir(TEST_DB_PATH);
    db = createDb(TEST_DB_PATH);
    applySchema(db);
  });

  afterEach(cleanup);

  test("creates default team", () => {
    // when
    seed(db);

    // then
    const result = db.select().from(teams).all();
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Default Team");
  });

  test("creates default workflow statuses", () => {
    // when
    seed(db);

    // then
    const result = db.select().from(issueStatuses).all();
    expect(result).toHaveLength(5);

    const names = result.map((s) => s.name).sort();
    expect(names).toEqual(["Backlog", "Cancelled", "Done", "In Progress", "Todo"]);
  });

  test("creates statuses with correct types", () => {
    // when
    seed(db);

    // then
    const backlog = db.select().from(issueStatuses).where(eq(issueStatuses.name, "Backlog")).all();
    expect(backlog[0]!.type).toBe("backlog");

    const done = db.select().from(issueStatuses).where(eq(issueStatuses.name, "Done")).all();
    expect(done[0]!.type).toBe("completed");
  });

  test("creates two seed users", () => {
    // when
    seed(db);

    // then
    const result = db.select().from(users).all();
    expect(result).toHaveLength(2);

    const names = result.map((u) => u.name).sort();
    expect(names).toEqual(["Default User", "Second User"]);
  });

  test("sets default_user_id in local_config", () => {
    // when
    seed(db);

    // then
    const config = db
      .select()
      .from(localConfig)
      .where(eq(localConfig.key, "default_user_id"))
      .all();
    expect(config).toHaveLength(1);
    expect(config[0]!.value).toBe("default-user");
  });

  test("is idempotent — running twice produces same result", () => {
    // when
    seed(db);
    seed(db);

    // then
    const teamCount = db.select().from(teams).all();
    expect(teamCount).toHaveLength(1);

    const userCount = db.select().from(users).all();
    expect(userCount).toHaveLength(2);

    const statusCount = db.select().from(issueStatuses).all();
    expect(statusCount).toHaveLength(5);

    const configCount = db.select().from(localConfig).all();
    expect(configCount).toHaveLength(1);
  });
});

function applySchema(db: ReturnType<typeof createDb>): void {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "teams" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "key" text NOT NULL,
      "icon" text,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "users" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "email" text NOT NULL,
      "display_name" text,
      "active" integer DEFAULT 1 NOT NULL,
      "admin" integer DEFAULT 0 NOT NULL,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "issue_statuses" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "type" text NOT NULL,
      "color" text,
      "position" integer DEFAULT 0 NOT NULL,
      "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "local_config" (
      "key" text PRIMARY KEY NOT NULL,
      "value" text NOT NULL,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
  ];
  for (const stmt of statements) {
    db.run(stmt);
  }
}
