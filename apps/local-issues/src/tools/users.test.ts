import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDb, type AppDatabase } from "../db/client.ts";
import { users, localConfig } from "../db/schema.ts";
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
  db.run(`CREATE TABLE IF NOT EXISTS "local_config" (
    "key" text PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
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

  test("returns empty nodes and pageInfo when no users exist", () => {
    // when
    const result = listUsers(db, {});

    // then
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(result.pageInfo.endCursor).toBeUndefined();
  });

  test("returns all users in nodes array", () => {
    // given
    db.insert(users).values({ id: "u1", name: "Alice", email: "alice@test.com" }).run();
    db.insert(users).values({ id: "u2", name: "Bob", email: "bob@test.com" }).run();

    // when
    const result = listUsers(db, {});

    // then
    expect(result.nodes).toHaveLength(2);
  });

  test("returns users in DESC order by default", () => {
    // given — insert with explicit timestamps
    db.run(`INSERT INTO users (id, name, email, created_at, updated_at) VALUES ('u1', 'First', 'first@t.com', '2025-01-01 00:00:00', '2025-01-01 00:00:00')`);
    db.run(`INSERT INTO users (id, name, email, created_at, updated_at) VALUES ('u2', 'Second', 'second@t.com', '2025-01-02 00:00:00', '2025-01-02 00:00:00')`);

    // when
    const result = listUsers(db, {});

    // then — most recent first (DESC)
    expect(result.nodes[0]!.name).toBe("Second");
    expect(result.nodes[1]!.name).toBe("First");
  });

  test("filters users by query (name match)", () => {
    // given
    db.insert(users).values({ id: "u1", name: "Alice", email: "alice@test.com" }).run();
    db.insert(users).values({ id: "u2", name: "Bob", email: "bob@test.com" }).run();

    // when
    const result = listUsers(db, { query: "Alice" });

    // then
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.name).toBe("Alice");
  });

  test("filters users by query (email match)", () => {
    // given
    db.insert(users).values({ id: "u1", name: "Alice", email: "alice@test.com" }).run();
    db.insert(users).values({ id: "u2", name: "Bob", email: "bob@test.com" }).run();

    // when
    const result = listUsers(db, { query: "bob@" });

    // then
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.email).toBe("bob@test.com");
  });

  test("respects limit and returns endCursor for pagination", () => {
    // given
    db.insert(users).values({ id: "u1", name: "A", email: "a@t.com" }).run();
    db.insert(users).values({ id: "u2", name: "B", email: "b@t.com" }).run();
    db.insert(users).values({ id: "u3", name: "C", email: "c@t.com" }).run();

    // when
    const page1 = listUsers(db, { limit: 2 });
    const page2 = listUsers(db, { limit: 2, cursor: page1.pageInfo.endCursor });

    // then
    expect(page1.nodes).toHaveLength(2);
    expect(page1.pageInfo.hasNextPage).toBe(true);
    expect(page2.nodes).toHaveLength(1);
    expect(page2.pageInfo.hasNextPage).toBe(false);
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

  test("'me' returns default user when configured in local_config", () => {
    // given — configure "me" via local_config table
    db.insert(localConfig).values({ key: "default_user_id", value: "u1" }).run();

    // when
    const result = getUser(db, { query: "me" });

    // then
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Alice");
  });

  test("'me' throws error with guidance when not configured", () => {
    // given — no local_config entry for default_user_id

    // when/then
    expect(() => getUser(db, { query: "me" })).toThrow(
      /default_user_id/,
    );
  });
});
