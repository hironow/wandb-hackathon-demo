import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedAll, DEFAULT_USER_ID, DEFAULT_PROJECT_ID } from "../db/seed.ts";
import {
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from "./documents.ts";
import { documents as documentsTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-documents.db";

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

// ── createDocument ──

describe("createDocument", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("creates a document with title and content", () => {
    // given
    const params = { title: "My First Doc", content: "# Hello\n\nWorld" };

    // when
    const doc = createDocument(db, params);

    // then
    expect(doc.id).toBeDefined();
    expect(doc.title).toBe("My First Doc");
    expect(doc.content).toBe("# Hello\n\nWorld");
    expect(doc.slug).toBe("my-first-doc");
    expect(doc.createdAt).toBeDefined();
    expect(doc.updatedAt).toBeDefined();
  });

  test("auto-generates unique slug on collision", () => {
    // given
    createDocument(db, { title: "Duplicate Title" });

    // when
    const doc2 = createDocument(db, { title: "Duplicate Title" });

    // then
    expect(doc2.slug).toBe("duplicate-title-1");
  });

  test("auto-generates incrementing suffix on multiple collisions", () => {
    // given
    createDocument(db, { title: "Same Name" });
    createDocument(db, { title: "Same Name" });

    // when
    const doc3 = createDocument(db, { title: "Same Name" });

    // then
    expect(doc3.slug).toBe("same-name-2");
  });

  test("associates document with project", () => {
    // given / when
    const doc = createDocument(db, {
      title: "Project Doc",
      project: DEFAULT_PROJECT_ID,
    });

    // then
    expect(doc.projectId).toBe(DEFAULT_PROJECT_ID);
  });

  test("sets optional fields (icon, color)", () => {
    // given / when
    const doc = createDocument(db, {
      title: "Styled Doc",
      icon: "book",
      color: "#ff0000",
    });

    // then
    expect(doc.icon).toBe("book");
    expect(doc.color).toBe("#ff0000");
  });

  test("throws when title is empty", () => {
    // when / then
    expect(() => createDocument(db, { title: "" })).toThrow(/title.*required/i);
  });
});

// ── getDocument ──

describe("getDocument", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("retrieves document by id", () => {
    // given
    const created = createDocument(db, { title: "Find Me" });

    // when
    const doc = getDocument(db, { id: created.id });

    // then
    expect(doc).toBeDefined();
    expect(doc!.title).toBe("Find Me");
  });

  test("retrieves document by slug", () => {
    // given
    createDocument(db, { title: "Slug Lookup" });

    // when
    const doc = getDocument(db, { id: "slug-lookup" });

    // then
    expect(doc).toBeDefined();
    expect(doc!.title).toBe("Slug Lookup");
  });

  test("returns null for nonexistent document", () => {
    // when
    const doc = getDocument(db, { id: "nonexistent" });

    // then
    expect(doc).toBeNull();
  });
});

// ── listDocuments ──

describe("listDocuments", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns empty list when no documents exist", () => {
    // when
    const result = listDocuments(db, {});

    // then
    expect(result.items).toHaveLength(0);
    expect(result.hasNextPage).toBe(false);
  });

  test("lists all documents", () => {
    // given
    createDocument(db, { title: "Doc A" });
    createDocument(db, { title: "Doc B" });

    // when
    const result = listDocuments(db, {});

    // then
    expect(result.items).toHaveLength(2);
  });

  test("filters by query (title search)", () => {
    // given
    createDocument(db, { title: "Alpha Guide" });
    createDocument(db, { title: "Beta Manual" });

    // when
    const result = listDocuments(db, { query: "Alpha" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Alpha Guide");
  });

  test("filters by projectId", () => {
    // given
    createDocument(db, { title: "Project Doc", project: DEFAULT_PROJECT_ID });
    createDocument(db, { title: "No Project Doc" });

    // when
    const result = listDocuments(db, { projectId: DEFAULT_PROJECT_ID });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Project Doc");
  });

  test("filters by creatorId", () => {
    // given
    const doc = createDocument(db, { title: "User Doc" });
    db.update(documentsTable)
      .set({ creatorId: DEFAULT_USER_ID })
      .where(eq(documentsTable.id, doc.id))
      .run();
    createDocument(db, { title: "No Creator Doc" });

    // when
    const result = listDocuments(db, { creatorId: DEFAULT_USER_ID });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("User Doc");
  });

  test("excludes archived documents by default", () => {
    // given
    const doc = createDocument(db, { title: "Archived Doc" });
    updateDocument(db, { id: doc.id, archived: true });
    createDocument(db, { title: "Active Doc" });

    // when
    const result = listDocuments(db, {});

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Active Doc");
  });

  test("includes archived documents when includeArchived is true", () => {
    // given
    const doc = createDocument(db, { title: "Archived Doc" });
    updateDocument(db, { id: doc.id, archived: true });
    createDocument(db, { title: "Active Doc" });

    // when
    const result = listDocuments(db, { includeArchived: true });

    // then
    expect(result.items).toHaveLength(2);
  });

  test("respects limit parameter", () => {
    // given
    for (let i = 0; i < 5; i++) {
      createDocument(db, { title: `Doc ${i}` });
    }

    // when
    const result = listDocuments(db, { limit: 3 });

    // then
    expect(result.items).toHaveLength(3);
    expect(result.hasNextPage).toBe(true);
  });

  test("caps limit at 250", () => {
    // given
    createDocument(db, { title: "Single" });

    // when
    const result = listDocuments(db, { limit: 500 });

    // then
    expect(result.items).toHaveLength(1);
  });

  test("paginates with cursor (returns items after cursor)", () => {
    // given
    const docs: ReturnType<typeof createDocument>[] = [];
    for (let i = 0; i < 5; i++) {
      docs.push(createDocument(db, { title: `Doc ${i}` }));
    }
    const firstPage = listDocuments(db, { limit: 2, orderBy: "createdAt" });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.hasNextPage).toBe(true);
    expect(firstPage.cursor).toBeDefined();

    // when
    const secondPage = listDocuments(db, {
      limit: 2,
      orderBy: "createdAt",
      cursor: firstPage.cursor!,
    });

    // then
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.items[0]!.id).not.toBe(firstPage.items[0]!.id);
    expect(secondPage.items[0]!.id).not.toBe(firstPage.items[1]!.id);
  });

  test("filters by createdAt (ISO-8601 date)", () => {
    // given
    const doc = createDocument(db, { title: "Recent Doc" });
    // Set one doc's createdAt to the past
    db.update(documentsTable)
      .set({ createdAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(documentsTable.id, doc.id))
      .run();
    createDocument(db, { title: "New Doc" });

    // when — filter for docs created after 2024-01-01
    const result = listDocuments(db, { createdAt: "2024-01-01T00:00:00.000Z" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("New Doc");
  });

  test("filters by createdAt (ISO-8601 duration like -P7D)", () => {
    // given
    const doc = createDocument(db, { title: "Old Doc" });
    db.update(documentsTable)
      .set({ createdAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(documentsTable.id, doc.id))
      .run();
    createDocument(db, { title: "Fresh Doc" });

    // when — filter for docs created in the last 7 days
    const result = listDocuments(db, { createdAt: "-P7D" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Fresh Doc");
  });

  test("filters by updatedAt (ISO-8601 date)", () => {
    // given
    const doc = createDocument(db, { title: "Stale Doc" });
    db.update(documentsTable)
      .set({ updatedAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(documentsTable.id, doc.id))
      .run();
    createDocument(db, { title: "Updated Doc" });

    // when
    const result = listDocuments(db, { updatedAt: "2024-01-01T00:00:00.000Z" });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Updated Doc");
  });

  test("accepts initiativeId param without error (noop)", () => {
    // given
    createDocument(db, { title: "Any Doc" });

    // when — initiativeId is accepted but ignored (no initiatives table)
    const result = listDocuments(db, { initiativeId: "some-initiative-id" });

    // then
    expect(result.items).toHaveLength(1);
  });
});

// ── updateDocument ──

describe("updateDocument", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("updates document title", () => {
    // given
    const doc = createDocument(db, { title: "Original" });

    // when
    const updated = updateDocument(db, { id: doc.id, title: "Updated" });

    // then
    expect(updated.title).toBe("Updated");
    expect(updated.id).toBe(doc.id);
  });

  test("updates document content", () => {
    // given
    const doc = createDocument(db, { title: "Doc", content: "Old" });

    // when
    const updated = updateDocument(db, { id: doc.id, content: "New content" });

    // then
    expect(updated.content).toBe("New content");
  });

  test("updates slug when title changes", () => {
    // given
    const doc = createDocument(db, { title: "Old Title" });

    // when
    const updated = updateDocument(db, { id: doc.id, title: "New Title" });

    // then
    expect(updated.slug).toBe("new-title");
  });

  test("archives a document", () => {
    // given
    const doc = createDocument(db, { title: "To Archive" });

    // when
    const updated = updateDocument(db, { id: doc.id, archived: true });

    // then
    expect(updated.archivedAt).toBeDefined();
  });

  test("unarchives a document", () => {
    // given
    const doc = createDocument(db, { title: "To Unarchive" });
    updateDocument(db, { id: doc.id, archived: true });

    // when
    const updated = updateDocument(db, { id: doc.id, archived: false });

    // then
    expect(updated.archivedAt).toBeNull();
  });

  test("throws when document does not exist", () => {
    // when / then
    expect(() => updateDocument(db, { id: "nonexistent", title: "x" })).toThrow(
      /document.*not found/i,
    );
  });
});
