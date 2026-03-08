import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedDefaultTeam, seedDefaultStatuses, DEFAULT_TEAM_ID } from "../db/seed.ts";
import { listIssueStatuses, getIssueStatus } from "./issue-statuses.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-issue-statuses.db";

function setupTestDb(): AppDatabase {
  mkdirSync(dirname(TEST_DB_PATH), { recursive: true });
  const db = createDb(TEST_DB_PATH);
  ensureTables(db);
  seedDefaultTeam(db);
  seedDefaultStatuses(db);
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

describe("listIssueStatuses", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns all default statuses for the default team", () => {
    // when
    const result = listIssueStatuses(db, {});

    // then
    expect(result).toHaveLength(5);
    const names = result.map((s) => s.name);
    expect(names).toContain("Backlog");
    expect(names).toContain("Todo");
    expect(names).toContain("In Progress");
    expect(names).toContain("Done");
    expect(names).toContain("Canceled");
  });

  test("each status has createdAt and updatedAt timestamps", () => {
    // when
    const result = listIssueStatuses(db, {});

    // then
    for (const status of result) {
      expect(status.createdAt).toBeDefined();
      expect(status.updatedAt).toBeDefined();
      expect(new Date(status.createdAt).toISOString()).toBe(status.createdAt);
      expect(new Date(status.updatedAt).toISOString()).toBe(status.updatedAt);
    }
  });

  test("filters statuses by team", () => {
    // when
    const result = listIssueStatuses(db, { team: DEFAULT_TEAM_ID });

    // then
    expect(result).toHaveLength(5);
    for (const status of result) {
      expect(status.teamId).toBe(DEFAULT_TEAM_ID);
    }
  });

  test("throws error for non-existent team", () => {
    // when/then
    expect(() => listIssueStatuses(db, { team: "non-existent-team" })).toThrow(
      "Team not found: non-existent-team",
    );
  });

  test("statuses are ordered by position", () => {
    // when
    const result = listIssueStatuses(db, { team: DEFAULT_TEAM_ID });

    // then
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.position).toBeGreaterThanOrEqual(result[i - 1]!.position);
    }
  });
});

describe("getIssueStatus", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("finds status by id", () => {
    // when
    const result = getIssueStatus(db, { id: `status-${DEFAULT_TEAM_ID}-backlog` });

    // then
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Backlog");
    expect(result!.type).toBe("backlog");
  });

  test("finds status by name and team", () => {
    // when
    const result = getIssueStatus(db, { name: "In Progress", team: DEFAULT_TEAM_ID });

    // then
    expect(result).not.toBeNull();
    expect(result!.type).toBe("started");
  });

  test("returns null for non-existent id", () => {
    // when
    const result = getIssueStatus(db, { id: "non-existent" });

    // then
    expect(result).toBeNull();
  });

  test("returns null when name does not match any status", () => {
    // when
    const result = getIssueStatus(db, { name: "Unknown Status" });

    // then
    expect(result).toBeNull();
  });

  test("throws error for non-existent team", () => {
    // when/then
    expect(() => getIssueStatus(db, { name: "Backlog", team: "non-existent-team" })).toThrow(
      "Team not found: non-existent-team",
    );
  });
});
