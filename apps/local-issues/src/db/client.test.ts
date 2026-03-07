import { describe, test, expect, afterEach } from "bun:test";
import { createDb, getDbPath } from "./client.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = ".run/test-client.db";

function ensureDir(path: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
}

afterEach(() => {
  // Clean up test database
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = TEST_DB_PATH + suffix;
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
});

describe("getDbPath", () => {
  test("returns default path when env is not set", () => {
    // given
    const original = process.env.LOCAL_ISSUES_DB_PATH;
    delete process.env.LOCAL_ISSUES_DB_PATH;

    // when
    const result = getDbPath();

    // then
    expect(result).toBe(".run/local-issues.db");

    // cleanup
    if (original !== undefined) {
      process.env.LOCAL_ISSUES_DB_PATH = original;
    }
  });

  test("returns env path when set", () => {
    // given
    const original = process.env.LOCAL_ISSUES_DB_PATH;
    process.env.LOCAL_ISSUES_DB_PATH = "/tmp/custom.db";

    // when
    const result = getDbPath();

    // then
    expect(result).toBe("/tmp/custom.db");

    // cleanup
    if (original !== undefined) {
      process.env.LOCAL_ISSUES_DB_PATH = original;
    } else {
      delete process.env.LOCAL_ISSUES_DB_PATH;
    }
  });
});

describe("createDb", () => {
  test("creates a database file", () => {
    // given
    ensureDir(TEST_DB_PATH);

    // when
    const db = createDb(TEST_DB_PATH);

    // then
    expect(db).toBeDefined();
    expect(existsSync(TEST_DB_PATH)).toBe(true);
  });
});
