import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedAll, DEFAULT_TEAM_ID } from "../db/seed.ts";
import { listCycles } from "./cycles.ts";
import { cycles } from "../db/schema.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-cycles.db";

function setupTestDb(): AppDatabase {
  mkdirSync(dirname(TEST_DB_PATH), { recursive: true });
  const db = createDb(TEST_DB_PATH);
  ensureTables(db);
  seedAll(db);
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

function insertCycle(
  db: AppDatabase,
  overrides: Partial<typeof cycles.$inferInsert> = {},
): typeof cycles.$inferSelect {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    name: "Cycle",
    number: 1,
    teamId: DEFAULT_TEAM_ID,
    startsAt: null,
    endsAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  db.insert(cycles).values(row).run();
  return row as typeof cycles.$inferSelect;
}

describe("listCycles", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns empty array when no cycles exist", () => {
    // when
    const result = listCycles(db, { teamId: DEFAULT_TEAM_ID });

    // then
    expect(result).toEqual([]);
  });

  test("returns all cycles for a team", () => {
    // given
    insertCycle(db, { number: 1, name: "Sprint 1" });
    insertCycle(db, { number: 2, name: "Sprint 2" });

    // when
    const result = listCycles(db, { teamId: DEFAULT_TEAM_ID });

    // then
    expect(result).toHaveLength(2);
  });

  test("filters by type=current (now between startsAt and endsAt)", () => {
    // given
    const now = new Date();
    const past = new Date(now.getTime() - 86400000).toISOString();
    const future = new Date(now.getTime() + 86400000).toISOString();
    const farPast = new Date(now.getTime() - 172800000).toISOString();

    insertCycle(db, { number: 1, startsAt: past, endsAt: future, name: "Current" });
    insertCycle(db, { number: 2, startsAt: farPast, endsAt: past, name: "Past" });

    // when
    const result = listCycles(db, { teamId: DEFAULT_TEAM_ID, type: "current" });

    // then
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Current");
  });

  test("filters by type=previous (endsAt before now)", () => {
    // given
    const now = new Date();
    const past = new Date(now.getTime() - 86400000).toISOString();
    const future = new Date(now.getTime() + 86400000).toISOString();
    const farPast = new Date(now.getTime() - 172800000).toISOString();

    insertCycle(db, { number: 1, startsAt: past, endsAt: future, name: "Current" });
    insertCycle(db, { number: 2, startsAt: farPast, endsAt: past, name: "Past" });

    // when
    const result = listCycles(db, { teamId: DEFAULT_TEAM_ID, type: "previous" });

    // then
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Past");
  });

  test("filters by type=next (startsAt after now)", () => {
    // given
    const now = new Date();
    const future = new Date(now.getTime() + 86400000).toISOString();
    const farFuture = new Date(now.getTime() + 172800000).toISOString();
    const past = new Date(now.getTime() - 86400000).toISOString();

    insertCycle(db, { number: 1, startsAt: past, endsAt: future, name: "Current" });
    insertCycle(db, { number: 2, startsAt: future, endsAt: farFuture, name: "Next" });

    // when
    const result = listCycles(db, { teamId: DEFAULT_TEAM_ID, type: "next" });

    // then
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Next");
  });

  test("returns empty array for nonexistent team", () => {
    // given
    insertCycle(db, { number: 1 });

    // when
    const result = listCycles(db, { teamId: "nonexistent-team" });

    // then
    expect(result).toEqual([]);
  });
});
