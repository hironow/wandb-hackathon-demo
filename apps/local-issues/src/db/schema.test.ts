import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDb } from "./client.ts";
import { eq } from "drizzle-orm";
import {
  teams,
  users,
  issueStatuses,
  issueLabels,
  issues,
  projects,
  projectLabels,
  milestones,
  documents,
  comments,
  attachments,
  cycles,
  issueRelations,
  syncMetadata,
} from "./schema.ts";

const TEST_DB_PATH = ".run/test-schema.db";

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function cleanup(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = TEST_DB_PATH + suffix;
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}

function createTestDb() {
  ensureDir(TEST_DB_PATH);
  const db = createDb(TEST_DB_PATH);
  // Push schema to DB for testing (using drizzle's push or raw SQL)
  // We'll use raw SQL from the schema definitions via migrate
  return db;
}

describe("schema: teams table", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    cleanup();
    db = createTestDb();
    // Create tables using raw SQL
    db.run(sqlForTable("teams"));
  });

  afterEach(cleanup);

  test("can insert and query a team", () => {
    // given
    const teamData = {
      id: "team-1",
      name: "Engineering",
      key: "ENG",
    };

    // when
    db.insert(teams).values(teamData).run();
    const result = db.select().from(teams).where(eq(teams.id, "team-1")).all();

    // then
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Engineering");
    expect(result[0]!.key).toBe("ENG");
    expect(result[0]!.createdAt).toBeDefined();
    expect(result[0]!.updatedAt).toBeDefined();
  });
});

describe("schema: issues table with foreign keys", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    cleanup();
    db = createTestDb();
  });

  afterEach(cleanup);

  test("cascade deletes issues when team is deleted", () => {
    // given
    pushAllTables(db);
    db.insert(teams).values({ id: "t1", name: "Team", key: "T" }).run();
    db.insert(issueStatuses)
      .values({ id: "s1", name: "Backlog", type: "backlog", position: 0, teamId: "t1" })
      .run();
    db.insert(issues)
      .values({
        id: "i1",
        identifier: "T-1",
        title: "Test issue",
        teamId: "t1",
        stateId: "s1",
      })
      .run();

    // when
    db.delete(teams).where(eq(teams.id, "t1")).run();

    // then
    const remaining = db.select().from(issues).all();
    expect(remaining).toHaveLength(0);
  });

  test("sets assigneeId to null when user is deleted", () => {
    // given
    pushAllTables(db);
    db.insert(teams).values({ id: "t1", name: "Team", key: "T" }).run();
    db.insert(users).values({ id: "u1", name: "Alice", email: "alice@test.com" }).run();
    db.insert(issueStatuses)
      .values({ id: "s1", name: "Backlog", type: "backlog", position: 0, teamId: "t1" })
      .run();
    db.insert(issues)
      .values({
        id: "i1",
        identifier: "T-1",
        title: "Test issue",
        teamId: "t1",
        stateId: "s1",
        assigneeId: "u1",
      })
      .run();

    // when
    db.delete(users).where(eq(users.id, "u1")).run();

    // then
    const result = db.select().from(issues).where(eq(issues.id, "i1")).all();
    expect(result).toHaveLength(1);
    expect(result[0]!.assigneeId).toBeNull();
  });
});

describe("schema: comments cascade delete", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    cleanup();
    db = createTestDb();
    pushAllTables(db);
  });

  afterEach(cleanup);

  test("cascade deletes comments when issue is deleted", () => {
    // given
    db.insert(teams).values({ id: "t1", name: "Team", key: "T" }).run();
    db.insert(issueStatuses)
      .values({ id: "s1", name: "Backlog", type: "backlog", position: 0, teamId: "t1" })
      .run();
    db.insert(issues)
      .values({ id: "i1", identifier: "T-1", title: "Test", teamId: "t1", stateId: "s1" })
      .run();
    db.insert(comments)
      .values({ id: "c1", body: "Hello", issueId: "i1" })
      .run();

    // when
    db.delete(issues).where(eq(issues.id, "i1")).run();

    // then
    const remaining = db.select().from(comments).all();
    expect(remaining).toHaveLength(0);
  });
});

describe("schema: sync_metadata table", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    cleanup();
    db = createTestDb();
    pushAllTables(db);
  });

  afterEach(cleanup);

  test("can store and retrieve sync state", () => {
    // given
    const now = new Date().toISOString();

    // when
    db.insert(syncMetadata)
      .values({ entityType: "issues", lastSyncedAt: now })
      .run();
    const result = db
      .select()
      .from(syncMetadata)
      .where(eq(syncMetadata.entityType, "issues"))
      .all();

    // then
    expect(result).toHaveLength(1);
    expect(result[0]!.lastSyncedAt).toBe(now);
  });
});

describe("schema: all tables can be created", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    cleanup();
    db = createTestDb();
  });

  afterEach(cleanup);

  test("pushAllTables creates all expected tables", () => {
    // when
    pushAllTables(db);

    // then - query sqlite_master to verify tables exist
    const tables = db.all<{ name: string }>(
      /*sql*/ `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("teams");
    expect(tableNames).toContain("users");
    expect(tableNames).toContain("issue_statuses");
    expect(tableNames).toContain("issue_labels");
    expect(tableNames).toContain("issues");
    expect(tableNames).toContain("projects");
    expect(tableNames).toContain("project_labels");
    expect(tableNames).toContain("milestones");
    expect(tableNames).toContain("documents");
    expect(tableNames).toContain("comments");
    expect(tableNames).toContain("attachments");
    expect(tableNames).toContain("cycles");
    expect(tableNames).toContain("issue_relations");
    expect(tableNames).toContain("sync_metadata");
  });
});

describe("schema: sync_metadata has sync_status column", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    cleanup();
    db = createTestDb();
    pushAllTables(db);
  });

  afterEach(cleanup);

  test("sync_status defaults to 'idle'", () => {
    // given
    const now = new Date().toISOString();

    // when
    db.insert(syncMetadata)
      .values({ entityType: "issues", lastSyncedAt: now })
      .run();
    const result = db
      .select()
      .from(syncMetadata)
      .where(eq(syncMetadata.entityType, "issues"))
      .all();

    // then
    expect(result).toHaveLength(1);
    expect(result[0]!.syncStatus).toBe("idle");
  });

  test("sync_status can be set to 'syncing' or 'error'", () => {
    // given
    const now = new Date().toISOString();

    // when
    db.insert(syncMetadata)
      .values({ entityType: "teams", lastSyncedAt: now, syncStatus: "syncing" })
      .run();
    db.insert(syncMetadata)
      .values({ entityType: "users", lastSyncedAt: now, syncStatus: "error" })
      .run();

    // then
    const syncing = db
      .select()
      .from(syncMetadata)
      .where(eq(syncMetadata.entityType, "teams"))
      .all();
    expect(syncing[0]!.syncStatus).toBe("syncing");

    const error = db
      .select()
      .from(syncMetadata)
      .where(eq(syncMetadata.entityType, "users"))
      .all();
    expect(error[0]!.syncStatus).toBe("error");
  });
});

describe("schema: issue_relations type CHECK constraint", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    cleanup();
    db = createTestDb();
    pushAllTables(db);
    // Setup prerequisite data
    db.insert(teams).values({ id: "t1", name: "Team", key: "T" }).run();
    db.insert(issueStatuses)
      .values({ id: "s1", name: "Backlog", type: "backlog", position: 0, teamId: "t1" })
      .run();
    db.insert(issues)
      .values({ id: "i1", identifier: "T-1", title: "Issue 1", teamId: "t1", stateId: "s1" })
      .run();
    db.insert(issues)
      .values({ id: "i2", identifier: "T-2", title: "Issue 2", teamId: "t1", stateId: "s1" })
      .run();
  });

  afterEach(cleanup);

  test("allows valid relation types", () => {
    // given
    const validTypes = ["blocks", "blocked_by", "related", "duplicate"];

    // when / then — no errors
    for (const type of validTypes) {
      db.delete(issueRelations).run();
      db.insert(issueRelations)
        .values({ issueId: "i1", relatedIssueId: "i2", type })
        .run();
      const result = db.select().from(issueRelations).all();
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe(type);
    }
  });

  test("rejects invalid relation type", () => {
    // given / when / then
    expect(() => {
      db.insert(issueRelations)
        .values({ issueId: "i1", relatedIssueId: "i2", type: "invalid_type" })
        .run();
    }).toThrow();
  });
});

// Helper: push all tables to DB using raw SQL (for testing without migrations)
function pushAllTables(db: ReturnType<typeof createDb>): void {
  // We use Drizzle's internal SQL generation would be ideal,
  // but for tests we'll create tables via raw SQL matching our schema
  const statements = getCreateTableStatements();
  for (const stmt of statements) {
    db.run(stmt);
  }
}

// Helper: Get SQL for a single table (placeholder — will be replaced with actual implementation)
function sqlForTable(_name: string): string {
  return getCreateTableStatements().find((s) => s.includes(`"${_name}"`)) ?? "";
}

// These CREATE TABLE statements must match the Drizzle schema exactly
function getCreateTableStatements(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS "teams" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "key" text NOT NULL,
      "icon" text,
      "archived_at" text,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "users" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "email" text NOT NULL,
      "display_name" text,
      "active" integer DEFAULT 1 NOT NULL,
      "admin" integer DEFAULT 0 NOT NULL,
      "team_id" text REFERENCES "teams"("id") ON DELETE SET NULL,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "issue_statuses" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "type" text NOT NULL,
      "color" text,
      "position" integer DEFAULT 0 NOT NULL,
      "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "issue_labels" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "color" text,
      "description" text,
      "parent_id" text REFERENCES "issue_labels"("id") ON DELETE SET NULL,
      "team_id" text REFERENCES "teams"("id") ON DELETE CASCADE,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "issues" (
      "id" text PRIMARY KEY NOT NULL,
      "identifier" text NOT NULL UNIQUE,
      "title" text NOT NULL,
      "description" text,
      "priority" integer DEFAULT 0 NOT NULL,
      "estimate" integer,
      "due_date" text,
      "state_id" text NOT NULL REFERENCES "issue_statuses"("id"),
      "assignee_id" text REFERENCES "users"("id") ON DELETE SET NULL,
      "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
      "project_id" text REFERENCES "projects"("id") ON DELETE SET NULL,
      "parent_id" text REFERENCES "issues"("id") ON DELETE SET NULL,
      "cycle_id" text REFERENCES "cycles"("id") ON DELETE SET NULL,
      "archived_at" text,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "projects" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "icon" text,
      "color" text,
      "state" text DEFAULT 'planned' NOT NULL,
      "priority" integer DEFAULT 0 NOT NULL,
      "start_date" text,
      "target_date" text,
      "archived_at" text,
      "lead_id" text REFERENCES "users"("id") ON DELETE SET NULL,
      "team_id" text REFERENCES "teams"("id") ON DELETE SET NULL,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "project_labels" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "color" text,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "milestones" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "target_date" text,
      "sort_order" integer DEFAULT 0 NOT NULL,
      "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "documents" (
      "id" text PRIMARY KEY NOT NULL,
      "title" text NOT NULL,
      "slug" text NOT NULL UNIQUE,
      "content" text,
      "icon" text,
      "color" text,
      "project_id" text REFERENCES "projects"("id") ON DELETE SET NULL,
      "issue_id" text REFERENCES "issues"("id") ON DELETE SET NULL,
      "creator_id" text REFERENCES "users"("id") ON DELETE SET NULL,
      "archived_at" text,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "comments" (
      "id" text PRIMARY KEY NOT NULL,
      "body" text NOT NULL,
      "issue_id" text NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
      "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
      "parent_id" text REFERENCES "comments"("id") ON DELETE CASCADE,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "attachments" (
      "id" text PRIMARY KEY NOT NULL,
      "title" text,
      "subtitle" text,
      "url" text NOT NULL,
      "issue_id" text NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
      "metadata" text,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "cycles" (
      "id" text PRIMARY KEY NOT NULL,
      "number" integer NOT NULL,
      "name" text,
      "starts_at" text,
      "ends_at" text,
      "completed_at" text,
      "team_id" text NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "issue_relations" (
      "issue_id" text NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
      "related_issue_id" text NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
      "type" text NOT NULL,
      PRIMARY KEY ("issue_id", "related_issue_id"),
      CHECK ("type" IN ('blocks', 'blocked_by', 'related', 'duplicate'))
    )`,
    `CREATE TABLE IF NOT EXISTS "sync_metadata" (
      "entity_type" text PRIMARY KEY NOT NULL,
      "last_synced_at" text NOT NULL,
      "cursor" text,
      "sync_status" text DEFAULT 'idle' NOT NULL,
      "created_at" text DEFAULT (datetime('now')) NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL
    )`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS "idx_issues_team_state" ON "issues" ("team_id", "state_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_issues_assignee" ON "issues" ("assignee_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_issues_updated_at" ON "issues" ("updated_at")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_issue_labels_name" ON "issue_labels" ("name") WHERE "team_id" IS NULL`,
  ];
}
