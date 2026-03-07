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

  test("returns empty list when no teams exist", () => {
    // when
    const result = listTeams(db, {});

    // then
    expect(result.items).toEqual([]);
    expect(result.hasNextPage).toBe(false);
  });

  test("returns all teams", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "Alpha", key: "ALP" }).run();
    db.insert(teams).values({ id: "t2", name: "Beta", key: "BET" }).run();

    // when
    const result = listTeams(db, {});

    // then
    expect(result.items).toHaveLength(2);
  });

  test("filters teams by query (name match)", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "Alpha Team", key: "ALP" }).run();
    db.insert(teams).values({ id: "t2", name: "Beta Team", key: "BET" }).run();

    // when
    const result = listTeams(db, { query: "Alpha" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Alpha Team");
  });

  test("filters teams by query (key match)", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "Alpha", key: "ALP" }).run();
    db.insert(teams).values({ id: "t2", name: "Beta", key: "BET" }).run();

    // when
    const result = listTeams(db, { query: "BET" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.key).toBe("BET");
  });

  test("respects limit parameter", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "A", key: "A" }).run();
    db.insert(teams).values({ id: "t2", name: "B", key: "B" }).run();
    db.insert(teams).values({ id: "t3", name: "C", key: "C" }).run();

    // when
    const result = listTeams(db, { limit: 2 });

    // then
    expect(result.items).toHaveLength(2);
    expect(result.hasNextPage).toBe(true);
    expect(result.cursor).toBeDefined();
  });

  test("cursor-based pagination works", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "A", key: "A" }).run();
    db.insert(teams).values({ id: "t2", name: "B", key: "B" }).run();
    db.insert(teams).values({ id: "t3", name: "C", key: "C" }).run();

    // when - first page
    const page1 = listTeams(db, { limit: 2 });
    // when - second page
    const page2 = listTeams(db, { limit: 2, cursor: page1.cursor });

    // then
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
    expect(page2.hasNextPage).toBe(false);
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
