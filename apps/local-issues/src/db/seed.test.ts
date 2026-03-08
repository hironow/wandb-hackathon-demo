import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDb, type AppDatabase } from "./client.ts";
import { ensureTables } from "./migrate.ts";
import { seed, seedAll, isSeedCompleted } from "./seed.ts";
import { teams, users, issueStatuses, localConfig } from "./schema.ts";
import { eq } from "drizzle-orm";

const TEST_DB_PATH = ".run/test-seed.db";

function setupTestDb(): AppDatabase {
  mkdirSync(dirname(TEST_DB_PATH), { recursive: true });
  const db = createDb(TEST_DB_PATH);
  ensureTables(db);
  return db;
}

function cleanupDb(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = TEST_DB_PATH + suffix;
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}

describe("seed", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(cleanupDb);

  test("creates default team and archived team", () => {
    // when
    seed(db);

    // then
    const result = db.select().from(teams).all();
    expect(result).toHaveLength(2);
    const names = result.map((t) => t.name).sort();
    expect(names).toEqual(["Archived Team", "Default Team"]);
    const archived = result.find((t) => t.name === "Archived Team");
    expect(archived!.archivedAt).toBe("2025-01-01T00:00:00");
  });

  test("creates default workflow statuses", () => {
    // when
    seed(db);

    // then
    const result = db.select().from(issueStatuses).all();
    expect(result).toHaveLength(5);

    const names = result.map((s) => s.name).sort();
    expect(names).toEqual(["Backlog", "Canceled", "Done", "In Progress", "Todo"]);
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
    expect(teamCount).toHaveLength(2);

    const userCount = db.select().from(users).all();
    expect(userCount).toHaveLength(2);

    const statusCount = db.select().from(issueStatuses).all();
    expect(statusCount).toHaveLength(5);

    const configCount = db.select().from(localConfig).all();
    expect(configCount).toHaveLength(1);
  });

  test("records seed completion in metadata", () => {
    // given
    expect(isSeedCompleted(db)).toBe(false);

    // when
    seedAll(db);

    // then
    expect(isSeedCompleted(db)).toBe(true);
  });

  test("skips seed when already completed", () => {
    // given
    seedAll(db);
    const firstCount = db.select().from(issueStatuses).all().length;

    // when — run again
    seedAll(db);
    const secondCount = db.select().from(issueStatuses).all().length;

    // then — same count, no duplicates
    expect(secondCount).toBe(firstCount);
    expect(isSeedCompleted(db)).toBe(true);
  });
});
