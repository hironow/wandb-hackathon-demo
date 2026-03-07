import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDb, type AppDatabase } from "../db/client.ts";
import { users, teams } from "../db/schema.ts";
import { listUsers, getUser } from "./users.ts";

const TEST_DB_PATH = ".run/test-users.db";

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
  db.run(`CREATE TABLE IF NOT EXISTS "users" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "display_name" text,
    "active" integer DEFAULT 1 NOT NULL,
    "admin" integer DEFAULT 0 NOT NULL,
    "created_at" text DEFAULT (datetime('now')) NOT NULL,
    "updated_at" text DEFAULT (datetime('now')) NOT NULL
  )`);
  return db;
}

describe("listUsers", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanup();
    db = setupDb();
  });

  afterEach(cleanup);

  test("returns empty list when no users exist", () => {
    // when
    const result = listUsers(db, {});

    // then
    expect(result.items).toEqual([]);
    expect(result.hasNextPage).toBe(false);
  });

  test("returns all users", () => {
    // given
    db.insert(users).values({ id: "u1", name: "Alice", email: "alice@test.com" }).run();
    db.insert(users).values({ id: "u2", name: "Bob", email: "bob@test.com" }).run();

    // when
    const result = listUsers(db, {});

    // then
    expect(result.items).toHaveLength(2);
  });

  test("filters users by query (name match)", () => {
    // given
    db.insert(users).values({ id: "u1", name: "Alice", email: "alice@test.com" }).run();
    db.insert(users).values({ id: "u2", name: "Bob", email: "bob@test.com" }).run();

    // when
    const result = listUsers(db, { query: "Alice" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Alice");
  });

  test("filters users by query (email match)", () => {
    // given
    db.insert(users).values({ id: "u1", name: "Alice", email: "alice@test.com" }).run();
    db.insert(users).values({ id: "u2", name: "Bob", email: "bob@test.com" }).run();

    // when
    const result = listUsers(db, { query: "bob@" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.email).toBe("bob@test.com");
  });

  test("respects limit and returns cursor for pagination", () => {
    // given
    db.insert(users).values({ id: "u1", name: "A", email: "a@t.com" }).run();
    db.insert(users).values({ id: "u2", name: "B", email: "b@t.com" }).run();
    db.insert(users).values({ id: "u3", name: "C", email: "c@t.com" }).run();

    // when
    const page1 = listUsers(db, { limit: 2 });
    const page2 = listUsers(db, { limit: 2, cursor: page1.cursor });

    // then
    expect(page1.items).toHaveLength(2);
    expect(page1.hasNextPage).toBe(true);
    expect(page2.items).toHaveLength(1);
    expect(page2.hasNextPage).toBe(false);
  });
});

describe("getUser", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanup();
    db = setupDb();
    db.insert(users)
      .values({ id: "u1", name: "Alice", email: "alice@test.com", displayName: "Alice W" })
      .run();
  });

  afterEach(cleanup);

  test("finds user by ID", () => {
    // when
    const result = getUser(db, { query: "u1" });

    // then
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Alice");
  });

  test("finds user by name", () => {
    // when
    const result = getUser(db, { query: "Alice" });

    // then
    expect(result).not.toBeNull();
    expect(result!.id).toBe("u1");
  });

  test("finds user by email", () => {
    // when
    const result = getUser(db, { query: "alice@test.com" });

    // then
    expect(result).not.toBeNull();
    expect(result!.id).toBe("u1");
  });

  test("returns null for non-existent user", () => {
    // when
    const result = getUser(db, { query: "nonexistent" });

    // then
    expect(result).toBeNull();
  });

  test("'me' returns default user when configured", () => {
    // given - set default user env var
    const original = process.env.LOCAL_ISSUES_DEFAULT_USER;
    process.env.LOCAL_ISSUES_DEFAULT_USER = "u1";

    // when
    const result = getUser(db, { query: "me" });

    // then
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Alice");

    // cleanup
    if (original === undefined) {
      delete process.env.LOCAL_ISSUES_DEFAULT_USER;
    } else {
      process.env.LOCAL_ISSUES_DEFAULT_USER = original;
    }
  });

  test("'me' returns null with error hint when not configured", () => {
    // given
    const original = process.env.LOCAL_ISSUES_DEFAULT_USER;
    delete process.env.LOCAL_ISSUES_DEFAULT_USER;

    // when/then
    expect(() => getUser(db, { query: "me" })).toThrow(
      /LOCAL_ISSUES_DEFAULT_USER/,
    );

    // cleanup
    if (original !== undefined) {
      process.env.LOCAL_ISSUES_DEFAULT_USER = original;
    }
  });
});
