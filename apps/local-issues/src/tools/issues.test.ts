import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedAll, DEFAULT_TEAM_ID } from "../db/seed.ts";
import { saveIssue, getIssue, listIssues } from "./issues.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-issues.db";

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

describe("saveIssue (create)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("creates an issue with required fields", () => {
    // when
    const issue = saveIssue(db, { title: "Test issue", team: DEFAULT_TEAM_ID });

    // then
    expect(issue.title).toBe("Test issue");
    expect(issue.teamId).toBe(DEFAULT_TEAM_ID);
    expect(issue.id).toBeDefined();
    expect(issue.identifier).toMatch(/^DEF-\d+$/);
    expect(issue.status).toBe("Backlog");
    expect(issue.priority).toEqual({ value: 0, name: "None" });
  });

  test("creates an issue with description", () => {
    // when
    const issue = saveIssue(db, {
      title: "With description",
      team: DEFAULT_TEAM_ID,
      description: "Some details here",
    });

    // then
    expect(issue.description).toBe("Some details here");
  });

  test("creates an issue with priority", () => {
    // when
    const issue = saveIssue(db, {
      title: "Urgent issue",
      team: DEFAULT_TEAM_ID,
      priority: 1,
    });

    // then
    expect(issue.priority).toEqual({ value: 1, name: "Urgent" });
  });

  test("creates an issue with estimate", () => {
    // when
    const issue = saveIssue(db, {
      title: "Estimated issue",
      team: DEFAULT_TEAM_ID,
      estimate: 3,
    });

    // then
    expect(issue.estimate).toEqual({ value: 3, name: "3 Points" });
  });

  test("auto-increments identifier per team", () => {
    // when
    const issue1 = saveIssue(db, { title: "First", team: DEFAULT_TEAM_ID });
    const issue2 = saveIssue(db, { title: "Second", team: DEFAULT_TEAM_ID });

    // then
    expect(issue1.identifier).toBe("DEF-1");
    expect(issue2.identifier).toBe("DEF-2");
  });

  test("creates an issue with a specific state", () => {
    // when
    const issue = saveIssue(db, {
      title: "In progress issue",
      team: DEFAULT_TEAM_ID,
      state: "In Progress",
    });

    // then
    expect(issue.status).toBe("In Progress");
  });

  test("throws error when team is missing on create", () => {
    // when/then
    expect(() => saveIssue(db, { title: "No team" })).toThrow();
  });

  test("throws error when title is missing on create", () => {
    // when/then
    expect(() => saveIssue(db, { team: DEFAULT_TEAM_ID })).toThrow();
  });
});

describe("saveIssue (update)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("updates issue title", () => {
    // given
    const created = saveIssue(db, { title: "Original", team: DEFAULT_TEAM_ID });

    // when
    const updated = saveIssue(db, { id: created.id, title: "Updated title" });

    // then
    expect(updated.title).toBe("Updated title");
    expect(updated.id).toBe(created.id);
    expect(updated.identifier).toBe(created.identifier);
  });

  test("updates issue description", () => {
    // given
    const created = saveIssue(db, {
      title: "Test",
      team: DEFAULT_TEAM_ID,
      description: "Original desc",
    });

    // when
    const updated = saveIssue(db, { id: created.id, description: "New desc" });

    // then
    expect(updated.description).toBe("New desc");
  });

  test("updates issue state", () => {
    // given
    const created = saveIssue(db, { title: "Test", team: DEFAULT_TEAM_ID });

    // when
    const updated = saveIssue(db, { id: created.id, state: "Done" });

    // then
    expect(updated.status).toBe("Done");
  });

  test("updates issue priority", () => {
    // given
    const created = saveIssue(db, { title: "Test", team: DEFAULT_TEAM_ID });

    // when
    const updated = saveIssue(db, { id: created.id, priority: 2 });

    // then
    expect(updated.priority).toEqual({ value: 2, name: "High" });
  });

  test("throws error when issue not found", () => {
    // when/then
    expect(() => saveIssue(db, { id: "nonexistent", title: "Test" })).toThrow();
  });
});

describe("getIssue", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns issue by id", () => {
    // given
    const created = saveIssue(db, { title: "Find me", team: DEFAULT_TEAM_ID });

    // when
    const found = getIssue(db, { id: created.id });

    // then
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Find me");
    expect(found!.id).toBe(created.id);
  });

  test("returns issue by identifier", () => {
    // given
    const created = saveIssue(db, { title: "Find by identifier", team: DEFAULT_TEAM_ID });

    // when
    const found = getIssue(db, { id: created.identifier });

    // then
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Find by identifier");
  });

  test("returns null for nonexistent issue", () => {
    // when
    const found = getIssue(db, { id: "nonexistent" });

    // then
    expect(found).toBeNull();
  });
});

describe("listIssues", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns empty result when no issues exist", () => {
    // when
    const result = listIssues(db, {});

    // then
    expect(result.items).toHaveLength(0);
    expect(result.hasNextPage).toBe(false);
  });

  test("returns created issues", () => {
    // given
    saveIssue(db, { title: "Issue 1", team: DEFAULT_TEAM_ID });
    saveIssue(db, { title: "Issue 2", team: DEFAULT_TEAM_ID });

    // when
    const result = listIssues(db, {});

    // then
    expect(result.items).toHaveLength(2);
  });

  test("filters by team", () => {
    // given
    saveIssue(db, { title: "Team issue", team: DEFAULT_TEAM_ID });

    // when
    const result = listIssues(db, { team: DEFAULT_TEAM_ID });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Team issue");
  });

  test("filters by state", () => {
    // given
    saveIssue(db, { title: "Backlog issue", team: DEFAULT_TEAM_ID });
    saveIssue(db, { title: "Done issue", team: DEFAULT_TEAM_ID, state: "Done" });

    // when
    const result = listIssues(db, { state: "Done" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Done issue");
  });

  test("filters by query (title search)", () => {
    // given
    saveIssue(db, { title: "Important bug fix", team: DEFAULT_TEAM_ID });
    saveIssue(db, { title: "Feature request", team: DEFAULT_TEAM_ID });

    // when
    const result = listIssues(db, { query: "bug" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Important bug fix");
  });

  test("filters by priority", () => {
    // given
    saveIssue(db, { title: "Urgent", team: DEFAULT_TEAM_ID, priority: 1 });
    saveIssue(db, { title: "Normal", team: DEFAULT_TEAM_ID, priority: 3 });

    // when
    const result = listIssues(db, { priority: 1 });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Urgent");
  });

  test("respects limit parameter", () => {
    // given
    saveIssue(db, { title: "A", team: DEFAULT_TEAM_ID });
    saveIssue(db, { title: "B", team: DEFAULT_TEAM_ID });
    saveIssue(db, { title: "C", team: DEFAULT_TEAM_ID });

    // when
    const result = listIssues(db, { limit: 2 });

    // then
    expect(result.items).toHaveLength(2);
    expect(result.hasNextPage).toBe(true);
  });
});
