import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createDb, type AppDatabase } from "../db/client.ts";
import { ensureTables, ensureFtsTables } from "../db/migrate.ts";
import { rebuildSearchIndex, searchDocumentation } from "./search-documentation.ts";
import { documents } from "../db/schema.ts";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SKIP = process.env.SKIP_BENCHMARK === "1";
const TEST_DB_PATH = ".run/test-benchmark.db";
const DOC_COUNT = 10_000;
const THRESHOLD_MS = 200;

function cleanupDb(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = TEST_DB_PATH + suffix;
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}

function seedBenchmarkDocuments(db: AppDatabase): void {
  const now = new Date().toISOString();
  const batchSize = 500;

  for (let batch = 0; batch < DOC_COUNT / batchSize; batch++) {
    const values = [];
    for (let i = 0; i < batchSize; i++) {
      const idx = batch * batchSize + i;
      values.push({
        id: `bench-doc-${idx}`,
        title: `Benchmark Document ${idx} - Testing FTS5 Performance`,
        slug: `bench-doc-${idx}`,
        content: `This is benchmark document number ${idx}. It contains searchable content about software engineering, testing, performance optimization, and database queries. Keywords: alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu. Document group ${idx % 100}.`,
        createdAt: now,
        updatedAt: now,
      });
    }
    db.insert(documents).values(values).run();
  }
}

describe.skipIf(SKIP)("FTS5 benchmark (10,000 docs)", () => {
  let db: AppDatabase;

  beforeAll(() => {
    cleanupDb();
    mkdirSync(dirname(TEST_DB_PATH), { recursive: true });
    db = createDb(TEST_DB_PATH);
    ensureTables(db);
    ensureFtsTables(db);

    // seed 10,000 documents
    seedBenchmarkDocuments(db);
    rebuildSearchIndex(db);
  });

  afterAll(() => {
    cleanupDb();
  });

  test("search completes within 200ms (warm start)", () => {
    // given: 10,000 documents indexed in FTS5

    // warm-up run (cold start, result discarded)
    searchDocumentation(db, { query: "performance" });

    // when: warm start measurement (2nd run)
    const start = performance.now();
    const result = searchDocumentation(db, { query: "performance" });
    const elapsed = performance.now() - start;

    // then
    console.error(`[benchmark] FTS5 search: ${elapsed.toFixed(2)}ms (threshold: ${THRESHOLD_MS}ms, docs: ${DOC_COUNT})`);
    expect(result.items.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThanOrEqual(THRESHOLD_MS);
  });

  test("search with uncommon term completes within 200ms (warm start)", () => {
    // given: 10,000 documents indexed

    // warm-up
    searchDocumentation(db, { query: "zulu" });

    // when
    const start = performance.now();
    const result = searchDocumentation(db, { query: "zulu" });
    const elapsed = performance.now() - start;

    // then
    console.error(`[benchmark] FTS5 search (uncommon term): ${elapsed.toFixed(2)}ms (threshold: ${THRESHOLD_MS}ms)`);
    expect(result.items.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThanOrEqual(THRESHOLD_MS);
  });

  test("paginated search completes within 200ms (warm start)", () => {
    // given: 10,000 documents indexed

    // warm-up
    searchDocumentation(db, { query: "benchmark", page: 5 });

    // when
    const start = performance.now();
    const result = searchDocumentation(db, { query: "benchmark", page: 5 });
    const elapsed = performance.now() - start;

    // then
    console.error(`[benchmark] FTS5 paginated search (page 5): ${elapsed.toFixed(2)}ms (threshold: ${THRESHOLD_MS}ms)`);
    expect(result.items.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThanOrEqual(THRESHOLD_MS);
  });
});
