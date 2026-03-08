import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedAll, DEFAULT_TEAM_ID } from "../db/seed.ts";
import { saveProject } from "./projects.ts";
import {
  saveMilestone,
  getMilestone,
  listMilestones,
} from "./milestones.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-milestones.db";

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

function createTestProject(db: AppDatabase): string {
  const project = saveProject(db, { name: `Project-${crypto.randomUUID().slice(0, 8)}`, team: DEFAULT_TEAM_ID });
  return project.id;
}

describe("saveMilestone (create)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("creates a milestone with required fields", () => {
    // given
    const projectId = createTestProject(db);

    // when
    const milestone = saveMilestone(db, { name: "v1.0", projectId });

    // then
    expect(milestone.id).toBeDefined();
    expect(milestone.name).toBe("v1.0");
    expect(milestone.projectId).toBe(projectId);
  });

  test("creates a milestone with description and targetDate", () => {
    // given
    const projectId = createTestProject(db);

    // when
    const milestone = saveMilestone(db, {
      name: "v2.0",
      projectId,
      description: "Major release",
      targetDate: "2026-06-30",
    });

    // then
    expect(milestone.description).toBe("Major release");
    expect(milestone.targetDate).toBe("2026-06-30");
  });

  test("throws error when name is missing", () => {
    // given
    const projectId = createTestProject(db);

    // when/then
    expect(() => saveMilestone(db, { projectId })).toThrow("name");
  });

  test("throws error when projectId is missing", () => {
    // when/then
    expect(() => saveMilestone(db, { name: "No Project" })).toThrow("projectId");
  });

  test("throws error for nonexistent project", () => {
    // when/then
    expect(() =>
      saveMilestone(db, { name: "Bad Ref", projectId: "nonexistent" }),
    ).toThrow();
  });

  test("validates targetDate format", () => {
    // given
    const projectId = createTestProject(db);

    // when/then
    expect(() =>
      saveMilestone(db, { name: "Bad Date", projectId, targetDate: "not-a-date" }),
    ).toThrow();
  });
});

describe("saveMilestone (update)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("updates milestone name", () => {
    // given
    const projectId = createTestProject(db);
    const created = saveMilestone(db, { name: "Original", projectId });

    // when
    const updated = saveMilestone(db, { id: created.id, name: "Updated" });

    // then
    expect(updated.name).toBe("Updated");
    expect(updated.id).toBe(created.id);
  });

  test("updates milestone description", () => {
    // given
    const projectId = createTestProject(db);
    const created = saveMilestone(db, { name: "Test", projectId });

    // when
    const updated = saveMilestone(db, { id: created.id, description: "New desc" });

    // then
    expect(updated.description).toBe("New desc");
  });

  test("updates milestone targetDate", () => {
    // given
    const projectId = createTestProject(db);
    const created = saveMilestone(db, { name: "Test", projectId });

    // when
    const updated = saveMilestone(db, { id: created.id, targetDate: "2026-12-31" });

    // then
    expect(updated.targetDate).toBe("2026-12-31");
  });

  test("throws error when milestone not found", () => {
    // when/then
    expect(() => saveMilestone(db, { id: "nonexistent", name: "Test" })).toThrow();
  });
});

describe("getMilestone", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns milestone by id", () => {
    // given
    const projectId = createTestProject(db);
    const created = saveMilestone(db, { name: "Find Me", projectId });

    // when
    const found = getMilestone(db, { id: created.id });

    // then
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Find Me");
  });

  test("returns null for nonexistent milestone", () => {
    // when
    const found = getMilestone(db, { id: "nonexistent" });

    // then
    expect(found).toBeNull();
  });
});

describe("listMilestones", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns empty when no milestones exist for project", () => {
    // given
    const projectId = createTestProject(db);

    // when
    const result = listMilestones(db, { projectId });

    // then
    expect(result).toHaveLength(0);
  });

  test("returns milestones for a project", () => {
    // given
    const projectId = createTestProject(db);
    saveMilestone(db, { name: "v1.0", projectId });
    saveMilestone(db, { name: "v2.0", projectId });

    // when
    const result = listMilestones(db, { projectId });

    // then
    expect(result).toHaveLength(2);
  });

  test("only returns milestones for specified project", () => {
    // given
    const projectId1 = createTestProject(db);
    const projectId2 = createTestProject(db);
    saveMilestone(db, { name: "P1 Milestone", projectId: projectId1 });
    saveMilestone(db, { name: "P2 Milestone", projectId: projectId2 });

    // when
    const result = listMilestones(db, { projectId: projectId1 });

    // then
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("P1 Milestone");
  });
});
