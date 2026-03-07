import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "./client.ts";
import { ensureTables } from "./migrate.ts";
import { seedAll, isSeedCompleted, DEFAULT_TEAM_ID } from "./seed.ts";
import { issueStatuses } from "./schema.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

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

describe("seedAll", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
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

  test("seeds default statuses for default team", () => {
    // when
    seedAll(db);

    // then
    const statuses = db.select().from(issueStatuses).all();
    expect(statuses).toHaveLength(5);
    const names = statuses.map((s) => s.name);
    expect(names).toContain("Backlog");
    expect(names).toContain("Todo");
    expect(names).toContain("In Progress");
    expect(names).toContain("Done");
    expect(names).toContain("Canceled");
  });
});
