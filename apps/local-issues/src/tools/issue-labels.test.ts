import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedDefaultTeam, DEFAULT_TEAM_ID } from "../db/seed.ts";
import { listIssueLabels, createIssueLabel } from "./issue-labels.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-issue-labels.db";

function setupTestDb(): AppDatabase {
  mkdirSync(dirname(TEST_DB_PATH), { recursive: true });
  const db = createDb(TEST_DB_PATH);
  ensureTables(db);
  seedDefaultTeam(db);
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

describe("listIssueLabels", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns empty array when no labels exist", () => {
    // when
    const result = listIssueLabels(db, {});

    // then
    expect(result.items).toHaveLength(0);
    expect(result.hasNextPage).toBe(false);
  });

  test("returns created labels", () => {
    // given
    createIssueLabel(db, { name: "Bug", color: "#d73a4a" });
    createIssueLabel(db, { name: "Feature", color: "#0075ca" });

    // when
    const result = listIssueLabels(db, {});

    // then
    expect(result.items).toHaveLength(2);
  });

  test("filters labels by name", () => {
    // given
    createIssueLabel(db, { name: "Bug", color: "#d73a4a" });
    createIssueLabel(db, { name: "Feature", color: "#0075ca" });

    // when
    const result = listIssueLabels(db, { name: "Bug" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Bug");
  });

  test("filters labels by team", () => {
    // given
    createIssueLabel(db, { name: "Team Label", color: "#ff0000", teamId: DEFAULT_TEAM_ID });
    createIssueLabel(db, { name: "Workspace Label", color: "#00ff00" });

    // when
    const result = listIssueLabels(db, { team: DEFAULT_TEAM_ID });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Team Label");
  });

  test("respects limit parameter", () => {
    // given
    createIssueLabel(db, { name: "A", color: "#111111" });
    createIssueLabel(db, { name: "B", color: "#222222" });
    createIssueLabel(db, { name: "C", color: "#333333" });

    // when
    const result = listIssueLabels(db, { limit: 2 });

    // then
    expect(result.items).toHaveLength(2);
    expect(result.hasNextPage).toBe(true);
  });

  test("returns cursor in result when hasNextPage is true", () => {
    // given
    createIssueLabel(db, { name: "A", color: "#111111" });
    createIssueLabel(db, { name: "B", color: "#222222" });
    createIssueLabel(db, { name: "C", color: "#333333" });

    // when
    const result = listIssueLabels(db, { limit: 2 });

    // then
    expect(result.hasNextPage).toBe(true);
    expect(result.cursor).toBeDefined();
    expect(typeof result.cursor).toBe("string");
  });

  test("does not return cursor when hasNextPage is false", () => {
    // given
    createIssueLabel(db, { name: "A", color: "#111111" });

    // when
    const result = listIssueLabels(db, { limit: 10 });

    // then
    expect(result.hasNextPage).toBe(false);
    expect(result.cursor).toBeUndefined();
  });

  test("fetches next page using cursor from previous result", () => {
    // given
    createIssueLabel(db, { name: "A", color: "#111111" });
    createIssueLabel(db, { name: "B", color: "#222222" });
    createIssueLabel(db, { name: "C", color: "#333333" });

    // when - first page
    const page1 = listIssueLabels(db, { limit: 2 });
    // when - second page using cursor
    const page2 = listIssueLabels(db, { limit: 2, cursor: page1.cursor });

    // then
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
    expect(page2.hasNextPage).toBe(false);
    expect(page2.cursor).toBeUndefined();

    // ensure no overlap
    const allNames = [...page1.items, ...page2.items].map((l) => l.name);
    expect(new Set(allNames).size).toBe(3);
  });

  test("cursor pagination works with filters", () => {
    // given
    createIssueLabel(db, { name: "A", color: "#111111", teamId: DEFAULT_TEAM_ID });
    createIssueLabel(db, { name: "B", color: "#222222", teamId: DEFAULT_TEAM_ID });
    createIssueLabel(db, { name: "C", color: "#333333", teamId: DEFAULT_TEAM_ID });
    createIssueLabel(db, { name: "Other", color: "#444444" }); // workspace-level

    // when
    const page1 = listIssueLabels(db, { limit: 2, team: DEFAULT_TEAM_ID });
    const page2 = listIssueLabels(db, { limit: 2, team: DEFAULT_TEAM_ID, cursor: page1.cursor });

    // then
    expect(page1.items).toHaveLength(2);
    expect(page1.hasNextPage).toBe(true);
    expect(page2.items).toHaveLength(1);
    expect(page2.hasNextPage).toBe(false);
  });
});

describe("createIssueLabel", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("creates a label with required fields", () => {
    // when
    const label = createIssueLabel(db, { name: "Bug", color: "#d73a4a" });

    // then
    expect(label.name).toBe("Bug");
    expect(label.color).toBe("#d73a4a");
    expect(label.id).toBeDefined();
  });

  test("creates a label with all optional fields", () => {
    // when
    const label = createIssueLabel(db, {
      name: "Priority",
      color: "#ff0000",
      description: "High priority items",
      teamId: DEFAULT_TEAM_ID,
    });

    // then
    expect(label.name).toBe("Priority");
    expect(label.description).toBe("High priority items");
    expect(label.teamId).toBe(DEFAULT_TEAM_ID);
  });

  test("creates a label with parentId for label groups", () => {
    // given
    const parent = createIssueLabel(db, { name: "Priority" });

    // when
    const child = createIssueLabel(db, {
      name: "Urgent",
      color: "#ff0000",
      parentId: parent.id,
    });

    // then
    expect(child.parentId).toBe(parent.id);
  });

  test("assigns default color when not specified", () => {
    // when
    const label = createIssueLabel(db, { name: "NoColor" });

    // then
    expect(label.color).toBeDefined();
    expect(label.color.length).toBeGreaterThan(0);
  });

  test("throws error for empty name", () => {
    // when/then
    expect(() => createIssueLabel(db, { name: "" })).toThrow();
  });

  test("throws error for duplicate name within same scope", () => {
    // given
    createIssueLabel(db, { name: "Bug", teamId: DEFAULT_TEAM_ID });

    // when/then
    expect(() => createIssueLabel(db, { name: "Bug", teamId: DEFAULT_TEAM_ID })).toThrow();
  });
});
