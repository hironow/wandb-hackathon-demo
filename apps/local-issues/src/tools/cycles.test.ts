import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedAll, DEFAULT_TEAM_ID } from "../db/seed.ts";
import { listCycles, validateCycleDates } from "./cycles.ts";
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

  test("type=current excludes cycles with null startsAt", () => {
    // given
    const now = new Date();
    const future = new Date(now.getTime() + 86400000).toISOString();
    insertCycle(db, { number: 1, startsAt: null, endsAt: future, name: "No Start" });

    // when
    const result = listCycles(db, { teamId: DEFAULT_TEAM_ID, type: "current" });

    // then
    expect(result).toEqual([]);
  });

  test("type=current excludes cycles with null endsAt", () => {
    // given
    const now = new Date();
    const past = new Date(now.getTime() - 86400000).toISOString();
    insertCycle(db, { number: 1, startsAt: past, endsAt: null, name: "No End" });

    // when
    const result = listCycles(db, { teamId: DEFAULT_TEAM_ID, type: "current" });

    // then
    expect(result).toEqual([]);
  });

  test("type=previous excludes cycles with null endsAt", () => {
    // given
    insertCycle(db, { number: 1, startsAt: null, endsAt: null, name: "No Dates" });

    // when
    const result = listCycles(db, { teamId: DEFAULT_TEAM_ID, type: "previous" });

    // then
    expect(result).toEqual([]);
  });

  test("type=next excludes cycles with null startsAt", () => {
    // given
    insertCycle(db, { number: 1, startsAt: null, endsAt: null, name: "No Dates" });

    // when
    const result = listCycles(db, { teamId: DEFAULT_TEAM_ID, type: "next" });

    // then
    expect(result).toEqual([]);
  });
});

describe("validateCycleDates", () => {
  test("throws error when startsAt is after endsAt", () => {
    // given
    const startsAt = "2026-03-10T00:00:00.000Z";
    const endsAt = "2026-03-05T00:00:00.000Z";

    // when / then
    expect(() => validateCycleDates(startsAt, endsAt)).toThrow("start_date must not be after end_date");
  });

  test("does not throw when startsAt equals endsAt", () => {
    // given
    const date = "2026-03-10T00:00:00.000Z";

    // when / then
    expect(() => validateCycleDates(date, date)).not.toThrow();
  });

  test("does not throw when startsAt is before endsAt", () => {
    // given
    const startsAt = "2026-03-05T00:00:00.000Z";
    const endsAt = "2026-03-10T00:00:00.000Z";

    // when / then
    expect(() => validateCycleDates(startsAt, endsAt)).not.toThrow();
  });

  test("does not throw when startsAt is null", () => {
    // when / then
    expect(() => validateCycleDates(null, "2026-03-10T00:00:00.000Z")).not.toThrow();
  });

  test("does not throw when endsAt is null", () => {
    // when / then
    expect(() => validateCycleDates("2026-03-05T00:00:00.000Z", null)).not.toThrow();
  });

  test("does not throw when both are null", () => {
    // when / then
    expect(() => validateCycleDates(null, null)).not.toThrow();
  });
});
