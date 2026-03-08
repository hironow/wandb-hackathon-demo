import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDb, type AppDatabase } from "../db/client.ts";
import { teams } from "../db/schema.ts";
import { listTeams, getTeam } from "./teams.ts";

const TEST_DB_PATH = ".run/test-teams.db";

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function cleanup(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = TEST_DB_PATH + suffix;
    if (existsSync(file)) unlinkSync(file);
  }
}

function setupDb(): AppDatabase {
  ensureDir(TEST_DB_PATH);
  const db = createDb(TEST_DB_PATH);
  db.run(`CREATE TABLE IF NOT EXISTS "teams" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "key" text NOT NULL,
    "icon" text,
    "archived_at" text,
    "created_at" text DEFAULT (datetime('now')) NOT NULL,
    "updated_at" text DEFAULT (datetime('now')) NOT NULL
  )`);
  return db;
}

describe("listTeams", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanup();
    db = setupDb();
  });

  afterEach(cleanup);

  test("returns empty nodes and pageInfo when no teams exist", () => {
    // when
    const result = listTeams(db, {});

    // then
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(result.pageInfo.endCursor).toBeUndefined();
  });

  test("returns all teams in nodes array", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "Alpha", key: "ALP" }).run();
    db.insert(teams).values({ id: "t2", name: "Beta", key: "BET" }).run();

    // when
    const result = listTeams(db, {});

    // then
    expect(result.nodes).toHaveLength(2);
  });

  test("returns teams in DESC order by default", () => {
    // given — insert with explicit timestamps to verify ordering
    db.run(`INSERT INTO teams (id, name, key, created_at, updated_at) VALUES ('t1', 'First', 'A', '2025-01-01 00:00:00', '2025-01-01 00:00:00')`);
    db.run(`INSERT INTO teams (id, name, key, created_at, updated_at) VALUES ('t2', 'Second', 'B', '2025-01-02 00:00:00', '2025-01-02 00:00:00')`);

    // when
    const result = listTeams(db, {});

    // then — most recent first (DESC)
    expect(result.nodes[0]!.name).toBe("Second");
    expect(result.nodes[1]!.name).toBe("First");
  });

  test("filters teams by query (name match)", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "Alpha Team", key: "ALP" }).run();
    db.insert(teams).values({ id: "t2", name: "Beta Team", key: "BET" }).run();

    // when
    const result = listTeams(db, { query: "Alpha" });

    // then
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.name).toBe("Alpha Team");
  });

  test("filters teams by query (key match)", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "Alpha", key: "ALP" }).run();
    db.insert(teams).values({ id: "t2", name: "Beta", key: "BET" }).run();

    // when
    const result = listTeams(db, { query: "BET" });

    // then
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.key).toBe("BET");
  });

  test("respects limit and returns endCursor in pageInfo", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "A", key: "A" }).run();
    db.insert(teams).values({ id: "t2", name: "B", key: "B" }).run();
    db.insert(teams).values({ id: "t3", name: "C", key: "C" }).run();

    // when
    const result = listTeams(db, { limit: 2 });

    // then
    expect(result.nodes).toHaveLength(2);
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.endCursor).toBeDefined();
  });

  test("cursor-based pagination works with nodes/pageInfo", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "A", key: "A" }).run();
    db.insert(teams).values({ id: "t2", name: "B", key: "B" }).run();
    db.insert(teams).values({ id: "t3", name: "C", key: "C" }).run();

    // when — first page
    const page1 = listTeams(db, { limit: 2 });
    // when — second page using endCursor
    const page2 = listTeams(db, { limit: 2, cursor: page1.pageInfo.endCursor });

    // then
    expect(page1.nodes).toHaveLength(2);
    expect(page2.nodes).toHaveLength(1);
    expect(page2.pageInfo.hasNextPage).toBe(false);
  });

  test("filters teams by createdAt date filter", () => {
    // given
    db.run(`INSERT INTO teams (id, name, key, created_at, updated_at) VALUES ('t1', 'Old', 'OLD', '2025-01-01 00:00:00', '2025-01-01 00:00:00')`);
    db.run(`INSERT INTO teams (id, name, key, created_at, updated_at) VALUES ('t2', 'New', 'NEW', '2025-06-01 00:00:00', '2025-06-01 00:00:00')`);

    // when — filter for teams created after 2025-03-01
    const result = listTeams(db, { createdAt: "2025-03-01T00:00:00" });

    // then
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.name).toBe("New");
  });

  test("filters teams by updatedAt date filter", () => {
    // given
    db.run(`INSERT INTO teams (id, name, key, created_at, updated_at) VALUES ('t1', 'Stale', 'STL', '2025-01-01 00:00:00', '2025-01-01 00:00:00')`);
    db.run(`INSERT INTO teams (id, name, key, created_at, updated_at) VALUES ('t2', 'Fresh', 'FRH', '2025-01-01 00:00:00', '2025-06-01 00:00:00')`);

    // when — filter for teams updated after 2025-03-01
    const result = listTeams(db, { updatedAt: "2025-03-01T00:00:00" });

    // then
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.name).toBe("Fresh");
  });

  test("excludes archived teams when includeArchived is false", () => {
    // given
    db.run(`INSERT INTO teams (id, name, key) VALUES ('t1', 'Active', 'ACT')`);
    db.run(`INSERT INTO teams (id, name, key, archived_at) VALUES ('t2', 'Archived', 'ARC', '2025-06-01 00:00:00')`);

    // when
    const result = listTeams(db, { includeArchived: false });

    // then
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.name).toBe("Active");
  });

  test("includes archived teams when includeArchived is true (default)", () => {
    // given
    db.run(`INSERT INTO teams (id, name, key) VALUES ('t1', 'Active', 'ACT')`);
    db.run(`INSERT INTO teams (id, name, key, archived_at) VALUES ('t2', 'Archived', 'ARC', '2025-06-01 00:00:00')`);

    // when
    const result = listTeams(db, { includeArchived: true });

    // then
    expect(result.nodes).toHaveLength(2);
  });
});

describe("getTeam", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanup();
    db = setupDb();
    db.insert(teams).values({ id: "t1", name: "Engineering", key: "ENG", icon: "wrench" }).run();
  });

  afterEach(cleanup);

  test("finds team by UUID", () => {
    // when
    const result = getTeam(db, { query: "t1" });

    // then
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Engineering");
  });

  test("finds team by key", () => {
    // when
    const result = getTeam(db, { query: "ENG" });

    // then
    expect(result).not.toBeNull();
    expect(result!.id).toBe("t1");
  });

  test("finds team by name", () => {
    // when
    const result = getTeam(db, { query: "Engineering" });

    // then
    expect(result).not.toBeNull();
    expect(result!.key).toBe("ENG");
  });

  test("returns null for non-existent team", () => {
    // when
    const result = getTeam(db, { query: "nonexistent" });

    // then
    expect(result).toBeNull();
  });
});
