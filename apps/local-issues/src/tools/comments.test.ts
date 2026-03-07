import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedAll, DEFAULT_TEAM_ID } from "../db/seed.ts";
import { saveIssue } from "./issues.ts";
import { saveComment, listComments, deleteComment } from "./comments.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-comments.db";

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

function createTestIssue(db: AppDatabase): string {
  const issue = saveIssue(db, { title: "Test issue for comments", team: DEFAULT_TEAM_ID });
  return issue.id;
}

describe("saveComment (create)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("creates a comment with required fields", () => {
    // given
    const issueId = createTestIssue(db);

    // when
    const comment = saveComment(db, { issueId, body: "Hello world" });

    // then
    expect(comment.id).toBeDefined();
    expect(comment.body).toBe("Hello world");
    expect(comment.issueId).toBe(issueId);
    expect(comment.createdAt).toBeDefined();
    expect(comment.updatedAt).toBeDefined();
  });

  test("creates a threaded reply", () => {
    // given
    const issueId = createTestIssue(db);
    const parent = saveComment(db, { issueId, body: "Parent comment" });

    // when
    const reply = saveComment(db, { issueId, body: "Reply", parentId: parent.id });

    // then
    expect(reply.parentId).toBe(parent.id);
    expect(reply.body).toBe("Reply");
  });

  test("throws when issueId does not exist", () => {
    // when / then
    expect(() => saveComment(db, { issueId: "nonexistent", body: "test" })).toThrow(
      /issue.*not found/i,
    );
  });

  test("throws when parentId does not exist", () => {
    // given
    const issueId = createTestIssue(db);

    // when / then
    expect(() =>
      saveComment(db, { issueId, body: "test", parentId: "nonexistent" }),
    ).toThrow(/parent comment.*not found/i);
  });
});

describe("saveComment (update)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("updates comment body", () => {
    // given
    const issueId = createTestIssue(db);
    const comment = saveComment(db, { issueId, body: "Original" });

    // when
    const updated = saveComment(db, { id: comment.id, body: "Updated" });

    // then
    expect(updated.body).toBe("Updated");
    expect(updated.id).toBe(comment.id);
  });

  test("throws when updating nonexistent comment", () => {
    // when / then
    expect(() => saveComment(db, { id: "nonexistent", body: "test" })).toThrow(
      /comment.*not found/i,
    );
  });
});

describe("listComments", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("returns empty list for issue with no comments", () => {
    // given
    const issueId = createTestIssue(db);

    // when
    const result = listComments(db, { issueId });

    // then
    expect(result.items).toHaveLength(0);
    expect(result.hasNextPage).toBe(false);
  });

  test("lists comments for an issue", () => {
    // given
    const issueId = createTestIssue(db);
    saveComment(db, { issueId, body: "First" });
    saveComment(db, { issueId, body: "Second" });

    // when
    const result = listComments(db, { issueId });

    // then
    expect(result.items).toHaveLength(2);
  });

  test("does not include comments from other issues", () => {
    // given
    const issueId1 = createTestIssue(db);
    const issue2 = saveIssue(db, { title: "Other issue", team: DEFAULT_TEAM_ID });
    saveComment(db, { issueId: issueId1, body: "Comment on issue 1" });
    saveComment(db, { issueId: issue2.id, body: "Comment on issue 2" });

    // when
    const result = listComments(db, { issueId: issueId1 });

    // then
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.body).toBe("Comment on issue 1");
  });

  test("throws when issueId does not exist", () => {
    // when / then
    expect(() => listComments(db, { issueId: "nonexistent" })).toThrow(
      /issue.*not found/i,
    );
  });

  test("respects limit parameter", () => {
    // given
    const issueId = createTestIssue(db);
    for (let i = 0; i < 5; i++) {
      saveComment(db, { issueId, body: `Comment ${i}` });
    }

    // when
    const result = listComments(db, { issueId, limit: 3 });

    // then
    expect(result.items).toHaveLength(3);
    expect(result.hasNextPage).toBe(true);
  });

  test("caps limit at 250", () => {
    // given
    const issueId = createTestIssue(db);
    saveComment(db, { issueId, body: "test" });

    // when
    const result = listComments(db, { issueId, limit: 500 });

    // then
    expect(result.items).toHaveLength(1);
  });
});

describe("saveComment (thread depth limit)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("allows creating comments up to depth 10", () => {
    // given
    const issueId = createTestIssue(db);
    let parentId: string | undefined;

    // when — create 10 levels of threaded comments
    for (let i = 0; i < 10; i++) {
      const comment = saveComment(db, { issueId, body: `Level ${i + 1}`, parentId });
      parentId = comment.id;
    }

    // then — all 10 should exist
    const result = listComments(db, { issueId, limit: 250 });
    expect(result.items).toHaveLength(10);
  });

  test("flattens reply at depth 11 to depth-10 parent", () => {
    // given — create 10 levels
    const issueId = createTestIssue(db);
    let parentId: string | undefined;
    let depth10Id: string | undefined;
    for (let i = 0; i < 10; i++) {
      const comment = saveComment(db, { issueId, body: `Level ${i + 1}`, parentId });
      parentId = comment.id;
      if (i === 9) depth10Id = comment.id;
    }

    // when — try to create at depth 11
    const flattened = saveComment(db, { issueId, body: "Should be flattened", parentId: depth10Id });

    // then — parentId should be the depth-10 comment (flattened, not rejected)
    expect(flattened.parentId).toBe(depth10Id);
    const result = listComments(db, { issueId, limit: 250 });
    expect(result.items).toHaveLength(11);
  });

  test("deeply nested reply beyond depth 10 is flattened to depth-10 ancestor", () => {
    // given — create 12 levels (should flatten at 11 and 12)
    const issueId = createTestIssue(db);
    let parentId: string | undefined;
    const commentIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const comment = saveComment(db, { issueId, body: `Level ${i + 1}`, parentId });
      parentId = comment.id;
      commentIds.push(comment.id);
    }

    // when — create at depth 11 and 12
    const c11 = saveComment(db, { issueId, body: "Level 11", parentId });
    const c12 = saveComment(db, { issueId, body: "Level 12", parentId: c11.id });

    // then — both should be flattened to the depth-10 ancestor
    expect(c11.parentId).toBe(commentIds[9]);
    expect(c12.parentId).toBe(commentIds[9]);
  });
});

describe("deleteComment", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("deletes an existing comment", () => {
    // given
    const issueId = createTestIssue(db);
    const comment = saveComment(db, { issueId, body: "To be deleted" });

    // when
    deleteComment(db, { id: comment.id });

    // then
    const result = listComments(db, { issueId });
    expect(result.items).toHaveLength(0);
  });

  test("throws when comment does not exist", () => {
    // when / then
    expect(() => deleteComment(db, { id: "nonexistent" })).toThrow(
      /comment.*not found/i,
    );
  });

  test("cascade deletes child comments", () => {
    // given
    const issueId = createTestIssue(db);
    const parent = saveComment(db, { issueId, body: "Parent" });
    saveComment(db, { issueId, body: "Child", parentId: parent.id });

    // when
    deleteComment(db, { id: parent.id });

    // then
    const result = listComments(db, { issueId });
    expect(result.items).toHaveLength(0);
  });
});
