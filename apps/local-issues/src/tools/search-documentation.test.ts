import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables, ensureFtsTables } from "../db/migrate.ts";
import { seedAll } from "../db/seed.ts";
import { searchDocumentation, rebuildSearchIndex } from "./search-documentation.ts";
import { issues, documents } from "../db/schema.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-search.db";

function setupTestDb(): AppDatabase {
  mkdirSync(dirname(TEST_DB_PATH), { recursive: true });
  const db = createDb(TEST_DB_PATH);
  ensureTables(db);
  ensureFtsTables(db);
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

function insertIssue(db: AppDatabase, id: string, title: string, description: string): void {
  const now = new Date().toISOString();
  db.insert(issues)
    .values({ id, identifier: `TST-${id.slice(0, 4)}`, title, description, createdAt: now, updatedAt: now })
    .run();
}

function insertDocument(db: AppDatabase, id: string, title: string, content: string): void {
  const now = new Date().toISOString();
  db.insert(documents)
    .values({ id, title, slug: title.toLowerCase().replace(/\s+/g, "-"), content, createdAt: now, updatedAt: now })
    .run();
}

describe("searchDocumentation", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns empty array when no matches found", () => {
    // given
    insertIssue(db, "i1", "Some Issue", "content here");
    rebuildSearchIndex(db);

    // when
    const result = searchDocumentation(db, { query: "nonexistent" });

    // then
    expect(result.items).toEqual([]);
  });

  test("finds matching issue by title", () => {
    // given
    insertIssue(db, "i1", "Authentication Bug", "Login fails for users");
    rebuildSearchIndex(db);

    // when
    const result = searchDocumentation(db, { query: "authentication" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.sourceType).toBe("issue");
    expect(result.items[0]!.sourceId).toBe("i1");
    expect(result.items[0]!.title).toBe("Authentication Bug");
  });

  test("finds matching document by content", () => {
    // given
    insertDocument(db, "d1", "Setup Guide", "Install the dependencies using bun");
    rebuildSearchIndex(db);

    // when
    const result = searchDocumentation(db, { query: "dependencies" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.sourceType).toBe("document");
    expect(result.items[0]!.sourceId).toBe("d1");
  });

  test("searches across both issues and documents", () => {
    // given
    insertIssue(db, "i1", "Performance optimization", "Improve query speed");
    insertDocument(db, "d1", "Optimization Guide", "Tips for performance tuning");
    rebuildSearchIndex(db);

    // when
    const result = searchDocumentation(db, { query: "optimization" });

    // then
    expect(result.items).toHaveLength(2);
  });

  test("default page size is 20", () => {
    // given
    for (let i = 0; i < 25; i++) {
      insertIssue(db, `i${i}`, `Test Issue ${i}`, `Common keyword searchable content ${i}`);
    }
    rebuildSearchIndex(db);

    // when
    const page1 = searchDocumentation(db, { query: "searchable", page: 1 });
    const page2 = searchDocumentation(db, { query: "searchable", page: 2 });

    // then
    expect(page1.items).toHaveLength(20);
    expect(page1.hasNextPage).toBe(true);
    expect(page2.items).toHaveLength(5);
    expect(page2.hasNextPage).toBe(false);
  });

  test("supports custom page_size parameter", () => {
    // given
    for (let i = 0; i < 8; i++) {
      insertIssue(db, `i${i}`, `Test Issue ${i}`, `Common keyword searchable content ${i}`);
    }
    rebuildSearchIndex(db);

    // when
    const result = searchDocumentation(db, { query: "searchable", page: 1, page_size: 5 });

    // then
    expect(result.items).toHaveLength(5);
    expect(result.hasNextPage).toBe(true);
    expect(result.page_size).toBe(5);
  });

  test("page_size is capped at 100", () => {
    // given
    for (let i = 0; i < 5; i++) {
      insertIssue(db, `i${i}`, `Test Issue ${i}`, `Common keyword searchable content ${i}`);
    }
    rebuildSearchIndex(db);

    // when
    const result = searchDocumentation(db, { query: "searchable", page_size: 200 });

    // then
    expect(result.page_size).toBe(100);
  });

  test("response includes total_count, page, and page_size fields", () => {
    // given
    for (let i = 0; i < 25; i++) {
      insertIssue(db, `i${i}`, `Test Issue ${i}`, `Common keyword searchable content ${i}`);
    }
    rebuildSearchIndex(db);

    // when
    const result = searchDocumentation(db, { query: "searchable", page: 2 });

    // then
    expect(result.total_count).toBe(25);
    expect(result.page).toBe(2);
    expect(result.page_size).toBe(20);
    expect(result.items).toHaveLength(5);
    expect(result.hasNextPage).toBe(false);
  });

  test("total_count reflects all matches regardless of page", () => {
    // given
    insertIssue(db, "i1", "Alpha Bug", "searchable alpha");
    insertIssue(db, "i2", "Beta Bug", "searchable beta");
    insertIssue(db, "i3", "Gamma Feature", "not related");
    rebuildSearchIndex(db);

    // when
    const result = searchDocumentation(db, { query: "searchable" });

    // then
    expect(result.total_count).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
  });

  test("returns empty result with metadata for empty query", () => {
    // given
    insertIssue(db, "i1", "Some Issue", "content");
    rebuildSearchIndex(db);

    // when
    const result = searchDocumentation(db, { query: "" });

    // then
    expect(result.items).toEqual([]);
    expect(result.total_count).toBe(0);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
  });
});
