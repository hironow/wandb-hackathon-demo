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
import { documents as documentsTable, projects as projectsTable, issues as issuesTable } from "../db/schema.ts";
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

  test("throws when creating with archived project", () => {
    // given
    const archivedProjectId = "project-archived";
    const now = new Date().toISOString();
    db.insert(projectsTable)
      .values({
        id: archivedProjectId,
        name: "Archived Project",
        state: "started",
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // when / then
    expect(() =>
      createDocument(db, { title: "Doc", project: archivedProjectId }),
    ).toThrow(/project.*archived/i);
  });

  test("throws when creating with archived issue", () => {
    // given
    const archivedIssueId = "issue-archived";
    const now = new Date().toISOString();
    db.insert(issuesTable)
      .values({
        id: archivedIssueId,
        identifier: "TEST-998",
        title: "Archived Issue",
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // when / then
    expect(() =>
      createDocument(db, { title: "Doc", issue: archivedIssueId }),
    ).toThrow(/issue.*archived/i);
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

  test("caps limit at 100", () => {
    // given
    createDocument(db, { title: "Single" });

    // when
    const result = listDocuments(db, { limit: 500 });

    // then
    expect(result.items).toHaveLength(1);
  });

  test("falls back to default limit when limit=0", () => {
    // given
    createDocument(db, { title: "Doc" });

    // when
    const result = listDocuments(db, { limit: 0 });

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
    expect(firstPage.endCursor).toBeDefined();

    // when
    const secondPage = listDocuments(db, {
      limit: 2,
      orderBy: "createdAt",
      cursor: firstPage.endCursor!,
    });

    // then
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.items[0]!.id).not.toBe(firstPage.items[0]!.id);
    expect(secondPage.items[0]!.id).not.toBe(firstPage.items[1]!.id);
  });

  test("throws on invalid cursor (Base64 decode failure)", () => {
    // given
    createDocument(db, { title: "Doc" });

    // when / then
    expect(() => {
      listDocuments(db, { cursor: "not-valid-base64!!!" });
    }).toThrow("Invalid cursor");
  });

  test("returns null endCursor when hasNextPage is false", () => {
    // given
    createDocument(db, { title: "Only Doc" });

    // when
    const result = listDocuments(db, {});

    // then
    expect(result.hasNextPage).toBe(false);
    expect(result.endCursor).toBeNull();
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

  test("throws when updating with nonexistent project", () => {
    // given
    const doc = createDocument(db, { title: "Valid Doc" });

    // when / then
    expect(() =>
      updateDocument(db, { id: doc.id, project: "nonexistent-project" }),
    ).toThrow(/project.*not found/i);
  });

  test("throws when updating with nonexistent issue", () => {
    // given
    const doc = createDocument(db, { title: "Valid Doc" });

    // when / then
    expect(() =>
      updateDocument(db, { id: doc.id, issue: "nonexistent-issue" }),
    ).toThrow(/issue.*not found/i);
  });

  test("throws when content exceeds 1MB", () => {
    // given
    const doc = createDocument(db, { title: "Big Doc" });
    const bigContent = "a".repeat(1_048_577); // 1MB + 1 byte

    // when / then
    expect(() => updateDocument(db, { id: doc.id, content: bigContent })).toThrow(
      /content.*exceeds.*1MB/i,
    );
  });
});

// ── toSlug (non-ASCII support) ──

describe("slug generation", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("preserves Japanese characters in slug", () => {
    // given / when
    const doc = createDocument(db, { title: "設計ドキュメント" });

    // then
    expect(doc.slug).toBe("設計ドキュメント");
  });

  test("handles mixed ASCII and non-ASCII in slug", () => {
    // given / when
    const doc = createDocument(db, { title: "My 設計 Doc" });

    // then
    expect(doc.slug).toBe("my-設計-doc");
  });

  test("replaces special characters with hyphens", () => {
    // given / when
    const doc = createDocument(db, { title: "Hello! @World#" });

    // then
    expect(doc.slug).toBe("hello-world");
  });

  test("generates fallback slug when title produces empty slug", () => {
    // given / when
    const doc = createDocument(db, { title: "!@#$%^&*()" });

    // then
    expect(doc.slug).toBe("untitled");
  });

  test("normalizes consecutive hyphens to single hyphen", () => {
    // given / when
    const doc = createDocument(db, { title: "a---b" });

    // then
    expect(doc.slug).toBe("a-b");
  });

  test("allows slug exactly 128 characters without truncation", () => {
    // given: 128 lowercase ASCII chars produce a 128-char slug
    const title128 = "a".repeat(128);

    // when
    const doc = createDocument(db, { title: title128 });

    // then
    expect(doc.slug.length).toBe(128);
    expect(doc.slug).toBe("a".repeat(128));
  });

  test("truncates slug from 129 characters to 128", () => {
    // given: 129 lowercase ASCII chars would produce a 129-char slug
    const title129 = "a".repeat(129);

    // when
    const doc = createDocument(db, { title: title129 });

    // then
    expect(doc.slug.length).toBe(128);
  });

  test("truncates slug to 128 characters for long titles", () => {
    // given
    const longTitle = "a".repeat(200);

    // when
    const doc = createDocument(db, { title: longTitle });

    // then
    expect(doc.slug.length).toBeLessThanOrEqual(128);
  });

  test("truncates slug with suffix to 128 characters on collision", () => {
    // given
    const longTitle = "b".repeat(200);
    createDocument(db, { title: longTitle });

    // when
    const doc2 = createDocument(db, { title: longTitle });

    // then
    expect(doc2.slug.length).toBeLessThanOrEqual(128);
    expect(doc2.slug).toMatch(/-1$/);
  });

  test("updateDocument truncates slug to 128 characters", () => {
    // given
    const doc = createDocument(db, { title: "Short" });
    const longTitle = "c".repeat(200);

    // when
    const updated = updateDocument(db, { id: doc.id, title: longTitle });

    // then
    expect(updated.slug.length).toBeLessThanOrEqual(128);
  });
});

// ── content size limit ──

describe("content size limit", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("createDocument throws when content exceeds 1MB", () => {
    // given
    const bigContent = "a".repeat(1_048_577); // 1MB + 1 byte

    // when / then
    expect(() => createDocument(db, { title: "Big Doc", content: bigContent })).toThrow(
      /content.*exceeds.*1MB/i,
    );
  });

  test("createDocument allows content exactly 1MB", () => {
    // given
    const exactContent = "a".repeat(1_048_576); // exactly 1MB

    // when
    const doc = createDocument(db, { title: "Exact 1MB" , content: exactContent });

    // then
    expect(doc.content).toBe(exactContent);
  });

  test("content size is checked in UTF-8 bytes (multibyte chars)", () => {
    // given: each CJK character is 3 bytes in UTF-8
    // 349,526 chars * 3 bytes = 1,048,578 bytes > 1MB
    const multibyteContent = "\u3042".repeat(349_526);

    // when / then
    expect(() => createDocument(db, { title: "CJK Doc", content: multibyteContent })).toThrow(
      /content.*exceeds.*1MB/i,
    );
  });
});
