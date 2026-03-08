import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables } from "../db/migrate.ts";
import { seedAll, DEFAULT_TEAM_ID } from "../db/seed.ts";
import { saveIssue } from "./issues.ts";
import { createAttachment, getAttachment, deleteAttachment } from "./attachments.ts";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-attachments.db";
const TEST_ATTACHMENTS_DIR = ".run/test-attachments";

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
  if (existsSync(TEST_ATTACHMENTS_DIR)) {
    rmSync(TEST_ATTACHMENTS_DIR, { recursive: true });
  }
}

function createTestIssue(db: AppDatabase): string {
  const issue = saveIssue(db, { title: "Test issue for attachments", team: DEFAULT_TEAM_ID });
  return issue.id;
}

// base64 of "Hello, World!"
const VALID_BASE64 = Buffer.from("Hello, World!").toString("base64");

describe("createAttachment", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("creates an attachment with required fields", () => {
    // given
    const issueId = createTestIssue(db);

    // when
    const attachment = createAttachment(db, {
      issue: issueId,
      base64Content: VALID_BASE64,
      filename: "test.txt",
      contentType: "text/plain",
    }, TEST_ATTACHMENTS_DIR);

    // then
    expect(attachment.id).toBeDefined();
    expect(attachment.issueId).toBe(issueId);
    expect(attachment.url).toContain("test.txt");
    expect(attachment.createdAt).toBeDefined();
  });

  test("creates an attachment with optional title and subtitle", () => {
    // given
    const issueId = createTestIssue(db);

    // when
    const attachment = createAttachment(db, {
      issue: issueId,
      base64Content: VALID_BASE64,
      filename: "doc.pdf",
      contentType: "application/pdf",
      title: "My Document",
      subtitle: "Version 1",
    }, TEST_ATTACHMENTS_DIR);

    // then
    expect(attachment.title).toBe("My Document");
    expect(attachment.subtitle).toBe("Version 1");
  });

  test("saves file to disk in issue_id subdirectory", () => {
    // given
    const issueId = createTestIssue(db);

    // when
    const attachment = createAttachment(db, {
      issue: issueId,
      base64Content: VALID_BASE64,
      filename: "saved.txt",
      contentType: "text/plain",
    }, TEST_ATTACHMENTS_DIR);

    // then
    expect(existsSync(attachment.url)).toBe(true);
    // Path should be: {attachmentsDir}/{issueId}/{attachmentId}_{filename}
    expect(attachment.url).toContain(`/${issueId}/`);
    expect(attachment.url).toContain(`_saved.txt`);
  });

  test("throws when issue does not exist", () => {
    // when / then
    expect(() =>
      createAttachment(db, {
        issue: "nonexistent",
        base64Content: VALID_BASE64,
        filename: "test.txt",
        contentType: "text/plain",
      }, TEST_ATTACHMENTS_DIR),
    ).toThrow(/issue.*not found/i);
  });

  test("throws when base64Content is invalid", () => {
    // given
    const issueId = createTestIssue(db);

    // when / then
    expect(() =>
      createAttachment(db, {
        issue: issueId,
        base64Content: "!!!not-valid-base64!!!",
        filename: "test.txt",
        contentType: "text/plain",
      }, TEST_ATTACHMENTS_DIR),
    ).toThrow(/invalid base64/i);
  });
});

describe("createAttachment (file size limit)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("rejects file larger than 10MB", () => {
    // given
    const issueId = createTestIssue(db);
    // 10MB + 1 byte in base64 (10 * 1024 * 1024 + 1 bytes)
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, "A");
    const largeBase64 = largeBuffer.toString("base64");

    // when / then
    expect(() =>
      createAttachment(db, {
        issue: issueId,
        base64Content: largeBase64,
        filename: "large.bin",
        contentType: "application/pdf",
      }, TEST_ATTACHMENTS_DIR),
    ).toThrow(/file size exceeds.*10.*mb/i);
  });

  test("accepts file exactly at 10MB", () => {
    // given
    const issueId = createTestIssue(db);
    const exactBuffer = Buffer.alloc(10 * 1024 * 1024, "B");
    const exactBase64 = exactBuffer.toString("base64");

    // when
    const attachment = createAttachment(db, {
      issue: issueId,
      base64Content: exactBase64,
      filename: "exact10mb.bin",
      contentType: "application/pdf",
    }, TEST_ATTACHMENTS_DIR);

    // then
    expect(attachment.id).toBeDefined();
  });
});

describe("createAttachment (MIME type allowlist)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("rejects disallowed MIME type", () => {
    // given
    const issueId = createTestIssue(db);

    // when / then
    expect(() =>
      createAttachment(db, {
        issue: issueId,
        base64Content: VALID_BASE64,
        filename: "script.js",
        contentType: "application/javascript",
      }, TEST_ATTACHMENTS_DIR),
    ).toThrow(/content type.*not allowed/i);
  });

  test("accepts allowed MIME types", () => {
    // given
    const issueId = createTestIssue(db);
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "application/pdf",
      "text/plain",
      "text/markdown",
      "application/json",
    ];

    // when / then — each should succeed
    for (const contentType of allowedTypes) {
      const attachment = createAttachment(db, {
        issue: issueId,
        base64Content: VALID_BASE64,
        filename: `test-${contentType.replace("/", "-")}`,
        contentType,
      }, TEST_ATTACHMENTS_DIR);
      expect(attachment.id).toBeDefined();
    }
  });
});

describe("identifier resolution (MY-402)", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("createAttachment resolves identifier to UUID for storage", () => {
    // given
    const issue = saveIssue(db, { title: "Identifier test", team: DEFAULT_TEAM_ID });

    // when — pass identifier instead of UUID
    const attachment = createAttachment(db, {
      issue: issue.identifier,
      base64Content: VALID_BASE64,
      filename: "test.txt",
      contentType: "text/plain",
    }, TEST_ATTACHMENTS_DIR);

    // then — stored issueId should be the UUID, not the identifier
    expect(attachment.issueId).toBe(issue.id);
    expect(attachment.issueId).not.toBe(issue.identifier);
  });

  test("createAttachment uses resolved UUID for file path", () => {
    // given
    const issue = saveIssue(db, { title: "Path test", team: DEFAULT_TEAM_ID });

    // when
    const attachment = createAttachment(db, {
      issue: issue.identifier,
      base64Content: VALID_BASE64,
      filename: "path-test.txt",
      contentType: "text/plain",
    }, TEST_ATTACHMENTS_DIR);

    // then — file path should use UUID, not identifier
    expect(attachment.url).toContain(`/${issue.id}/`);
    expect(attachment.url).not.toContain(`/${issue.identifier}/`);
  });
});

describe("getAttachment", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("retrieves an existing attachment", () => {
    // given
    const issueId = createTestIssue(db);
    const created = createAttachment(db, {
      issue: issueId,
      base64Content: VALID_BASE64,
      filename: "retrieve.txt",
      contentType: "text/plain",
      title: "Retrieve Me",
    }, TEST_ATTACHMENTS_DIR);

    // when
    const attachment = getAttachment(db, { id: created.id });

    // then
    expect(attachment).not.toBeNull();
    expect(attachment!.id).toBe(created.id);
    expect(attachment!.title).toBe("Retrieve Me");
  });

  test("returns null for nonexistent attachment", () => {
    // when
    const attachment = getAttachment(db, { id: "nonexistent" });

    // then
    expect(attachment).toBeNull();
  });
});

describe("deleteAttachment", () => {
  let db: AppDatabase;

  beforeEach(() => {
    cleanupDb();
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  test("deletes an existing attachment and its file", () => {
    // given
    const issueId = createTestIssue(db);
    const created = createAttachment(db, {
      issue: issueId,
      base64Content: VALID_BASE64,
      filename: "delete-me.txt",
      contentType: "text/plain",
    }, TEST_ATTACHMENTS_DIR);
    const filePath = created.url;

    // when
    deleteAttachment(db, { id: created.id });

    // then
    const result = getAttachment(db, { id: created.id });
    expect(result).toBeNull();
    expect(existsSync(filePath)).toBe(false);
  });

  test("throws when attachment does not exist", () => {
    // when / then
    expect(() => deleteAttachment(db, { id: "nonexistent" })).toThrow(
      /attachment.*not found/i,
    );
  });
});
