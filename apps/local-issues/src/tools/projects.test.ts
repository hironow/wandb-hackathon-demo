import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedAll, DEFAULT_TEAM_ID } from "../db/seed.ts";
import {
  saveProject,
  getProject,
  listProjects,
  listProjectLabels,
} from "./projects.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-projects.db";

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

describe("saveProject (create)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("creates a project with required fields", () => {
    // when
    const project = saveProject(db, { name: "Test Project", team: DEFAULT_TEAM_ID });

    // then
    expect(project.id).toBeDefined();
    expect(project.name).toBe("Test Project");
    expect(project.state).toBe("planned");
  });

  test("creates a project with description", () => {
    // when
    const project = saveProject(db, {
      name: "Described Project",
      team: DEFAULT_TEAM_ID,
      description: "A detailed description",
    });

    // then
    expect(project.description).toBe("A detailed description");
  });

  test("creates a project with optional fields", () => {
    // when
    const project = saveProject(db, {
      name: "Full Project",
      team: DEFAULT_TEAM_ID,
      icon: "rocket",
      color: "#ff0000",
      startDate: "2026-01-01",
      targetDate: "2026-12-31",
    });

    // then
    expect(project.name).toBe("Full Project");
  });

  test("throws error when name is missing on create", () => {
    // when/then
    expect(() => saveProject(db, { team: DEFAULT_TEAM_ID })).toThrow(
      "name",
    );
  });

  test("throws error when team is missing on create", () => {
    // when/then
    expect(() => saveProject(db, { name: "No Team" })).toThrow(
      "team",
    );
  });

  test("throws error on duplicate project name", () => {
    // given
    saveProject(db, { name: "Unique Project", team: DEFAULT_TEAM_ID });

    // when/then
    expect(() =>
      saveProject(db, { name: "Unique Project", team: DEFAULT_TEAM_ID }),
    ).toThrow("duplicate");
  });
});

describe("saveProject (update)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("updates project name", () => {
    // given
    const created = saveProject(db, { name: "Original", team: DEFAULT_TEAM_ID });

    // when
    const updated = saveProject(db, { id: created.id, name: "Updated" });

    // then
    expect(updated.name).toBe("Updated");
    expect(updated.id).toBe(created.id);
  });

  test("updates project description", () => {
    // given
    const created = saveProject(db, {
      name: "Test",
      team: DEFAULT_TEAM_ID,
      description: "Old desc",
    });

    // when
    const updated = saveProject(db, { id: created.id, description: "New desc" });

    // then
    expect(updated.description).toBe("New desc");
  });

  test("throws error when project not found", () => {
    // when/then
    expect(() => saveProject(db, { id: "nonexistent", name: "Test" })).toThrow();
  });

  test("allows valid state transitions: planned -> started", () => {
    // given
    const created = saveProject(db, { name: "Transition Test", team: DEFAULT_TEAM_ID });

    // when
    const updated = saveProject(db, { id: created.id, state: "started" });

    // then
    expect(updated.state).toBe("started");
  });

  test("allows valid state transitions: started -> paused", () => {
    // given
    const created = saveProject(db, { name: "Pause Test", team: DEFAULT_TEAM_ID });
    saveProject(db, { id: created.id, state: "started" });

    // when
    const paused = saveProject(db, { id: created.id, state: "paused" });

    // then
    expect(paused.state).toBe("paused");
  });

  test("allows valid state transitions: started -> completed", () => {
    // given
    const created = saveProject(db, { name: "Complete Test", team: DEFAULT_TEAM_ID });
    saveProject(db, { id: created.id, state: "started" });

    // when
    const completed = saveProject(db, { id: created.id, state: "completed" });

    // then
    expect(completed.state).toBe("completed");
  });

  test("allows completed -> started reverse transition (reopen)", () => {
    // given
    const created = saveProject(db, { name: "Reopen Test", team: DEFAULT_TEAM_ID });
    saveProject(db, { id: created.id, state: "started" });
    saveProject(db, { id: created.id, state: "completed" });

    // when
    const reopened = saveProject(db, { id: created.id, state: "started" });

    // then
    expect(reopened.state).toBe("started");
  });

  test("rejects completed -> planned transition", () => {
    // given
    const created = saveProject(db, { name: "Invalid Transition", team: DEFAULT_TEAM_ID });
    saveProject(db, { id: created.id, state: "started" });
    saveProject(db, { id: created.id, state: "completed" });

    // when/then
    expect(() =>
      saveProject(db, { id: created.id, state: "planned" }),
    ).toThrow();
  });

  test("validates targetDate format", () => {
    // given
    const created = saveProject(db, { name: "Date Test", team: DEFAULT_TEAM_ID });

    // when/then
    expect(() =>
      saveProject(db, { id: created.id, targetDate: "not-a-date" }),
    ).toThrow();
  });

  test("allows canceled -> planned transition (reactivation)", () => {
    // given
    const created = saveProject(db, { name: "Cancel Reactivate", team: DEFAULT_TEAM_ID });
    saveProject(db, { id: created.id, state: "started" });
    saveProject(db, { id: created.id, state: "canceled" });

    // when
    const reactivated = saveProject(db, { id: created.id, state: "planned" });

    // then
    expect(reactivated.state).toBe("planned");
  });

  test("rejects canceled -> started transition", () => {
    // given
    const created = saveProject(db, { name: "Cancel No Start", team: DEFAULT_TEAM_ID });
    saveProject(db, { id: created.id, state: "started" });
    saveProject(db, { id: created.id, state: "canceled" });

    // when/then
    expect(() =>
      saveProject(db, { id: created.id, state: "started" }),
    ).toThrow();
  });

  test("rejects canceled -> completed transition", () => {
    // given
    const created = saveProject(db, { name: "Cancel No Complete", team: DEFAULT_TEAM_ID });
    saveProject(db, { id: created.id, state: "started" });
    saveProject(db, { id: created.id, state: "canceled" });

    // when/then
    expect(() =>
      saveProject(db, { id: created.id, state: "completed" }),
    ).toThrow();
  });
});

describe("getProject", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns project by id", () => {
    // given
    const created = saveProject(db, { name: "Find Me", team: DEFAULT_TEAM_ID });

    // when
    const found = getProject(db, { query: created.id });

    // then
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Find Me");
  });

  test("returns project by name", () => {
    // given
    saveProject(db, { name: "By Name", team: DEFAULT_TEAM_ID });

    // when
    const found = getProject(db, { query: "By Name" });

    // then
    expect(found).not.toBeNull();
    expect(found!.name).toBe("By Name");
  });

  test("returns null for nonexistent project", () => {
    // when
    const found = getProject(db, { query: "nonexistent" });

    // then
    expect(found).toBeNull();
  });
});

describe("listProjects", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns empty result when no projects exist", () => {
    // when
    const result = listProjects(db, {});

    // then
    expect(result.items).toHaveLength(0);
    expect(result.hasNextPage).toBe(false);
  });

  test("returns created projects", () => {
    // given
    saveProject(db, { name: "Project A", team: DEFAULT_TEAM_ID });
    saveProject(db, { name: "Project B", team: DEFAULT_TEAM_ID });

    // when
    const result = listProjects(db, {});

    // then
    expect(result.items).toHaveLength(2);
  });

  test("filters by team", () => {
    // given
    saveProject(db, { name: "Team Project", team: DEFAULT_TEAM_ID });

    // when
    const result = listProjects(db, { team: DEFAULT_TEAM_ID });

    // then
    expect(result.items).toHaveLength(1);
  });

  test("filters by state", () => {
    // given
    saveProject(db, { name: "Planned", team: DEFAULT_TEAM_ID });
    const started = saveProject(db, { name: "Started", team: DEFAULT_TEAM_ID });
    saveProject(db, { id: started.id, state: "started" });

    // when
    const result = listProjects(db, { state: "started" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Started");
  });

  test("filters by query", () => {
    // given
    saveProject(db, { name: "Alpha Project", team: DEFAULT_TEAM_ID });
    saveProject(db, { name: "Beta Project", team: DEFAULT_TEAM_ID });

    // when
    const result = listProjects(db, { query: "Alpha" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Alpha Project");
  });

  test("respects limit", () => {
    // given
    saveProject(db, { name: "A", team: DEFAULT_TEAM_ID });
    saveProject(db, { name: "B", team: DEFAULT_TEAM_ID });
    saveProject(db, { name: "C", team: DEFAULT_TEAM_ID });

    // when
    const result = listProjects(db, { limit: 2 });

    // then
    expect(result.items).toHaveLength(2);
    expect(result.hasNextPage).toBe(true);
  });
});

describe("listProjectLabels", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns empty result when no labels exist", () => {
    // when
    const result = listProjectLabels(db, {});

    // then
    expect(result.items).toHaveLength(0);
    expect(result.hasNextPage).toBe(false);
  });
});
