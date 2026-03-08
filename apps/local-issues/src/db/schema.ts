import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
};

// ── Teams ──────────────────────────────────────────

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull(),
  icon: text("icon"),
  ...timestamps,
});

// ── Users ──────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  admin: integer("admin", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

// ── Issue Statuses ─────────────────────────────────

export const issueStatuses = sqliteTable("issue_statuses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // backlog | unstarted | started | completed | canceled
  color: text("color"),
  position: integer("position").notNull().default(0),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  ...timestamps,
});

// ── Issue Labels ───────────────────────────────────

export const issueLabels = sqliteTable(
  "issue_labels",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color"),
    description: text("description"),
    parentId: text("parent_id").references((): ReturnType<typeof text> => issueLabels.id, {
      onDelete: "set null",
    }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_issue_labels_name").on(table.name).where(sql`${table.teamId} IS NULL`),
  ],
);

// ── Cycles ─────────────────────────────────────────
// Defined before issues because issues reference cycles

export const cycles = sqliteTable("cycles", {
  id: text("id").primaryKey(),
  number: integer("number").notNull(),
  name: text("name"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  ...timestamps,
});

// ── Projects ───────────────────────────────────────
// Defined before issues because issues reference projects

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  color: text("color"),
  state: text("state").notNull().default("planned"),
  priority: integer("priority").notNull().default(0),
  startDate: text("start_date"),
  targetDate: text("target_date"),
  leadId: text("lead_id").references(() => users.id, { onDelete: "set null" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
  ...timestamps,
});

// ── Issues ─────────────────────────────────────────

export const issues = sqliteTable(
  "issues",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    priority: integer("priority").notNull().default(0),
    estimate: integer("estimate"),
    dueDate: text("due_date"),
    stateId: text("state_id")
      .notNull()
      .references(() => issueStatuses.id),
    assigneeId: text("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    parentId: text("parent_id").references((): ReturnType<typeof text> => issues.id, {
      onDelete: "set null",
    }),
    cycleId: text("cycle_id").references(() => cycles.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    index("idx_issues_team_state").on(table.teamId, table.stateId),
    index("idx_issues_assignee").on(table.assigneeId),
    index("idx_issues_updated_at").on(table.updatedAt),
  ],
);

// ── Project Labels ─────────────────────────────────

export const projectLabels = sqliteTable("project_labels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color"),
  ...timestamps,
});

// ── Milestones ─────────────────────────────────────

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  targetDate: text("target_date"),
  sortOrder: integer("sort_order").notNull().default(0),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ...timestamps,
});

// ── Documents ──────────────────────────────────────

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content"),
  icon: text("icon"),
  color: text("color"),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  issueId: text("issue_id").references(() => issues.id, {
    onDelete: "set null",
  }),
  creatorId: text("creator_id").references(() => users.id, {
    onDelete: "set null",
  }),
  ...timestamps,
});

// ── Comments ───────────────────────────────────────

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  parentId: text("parent_id").references((): ReturnType<typeof text> => comments.id, {
    onDelete: "cascade",
  }),
  ...timestamps,
});

// ── Attachments ────────────────────────────────────

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  title: text("title"),
  subtitle: text("subtitle"),
  url: text("url").notNull(),
  issueId: text("issue_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  metadata: text("metadata"), // JSON string
  ...timestamps,
});

// ── Issue-Label Junction ───────────────────────────

export const issueToLabels = sqliteTable(
  "issue_to_labels",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => issueLabels.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.issueId, table.labelId] })],
);

// ── Issue Relations ────────────────────────────────

export const issueRelations = sqliteTable(
  "issue_relations",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    relatedIssueId: text("related_issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // blocks | blocked_by | related | duplicate
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.relatedIssueId] }),
    check(
      "chk_relation_type",
      sql`${table.type} IN ('blocks', 'blocked_by', 'related', 'duplicate')`,
    ),
  ],
);

// ── Sync Metadata ──────────────────────────────────

export const syncMetadata = sqliteTable("sync_metadata", {
  entityType: text("entity_type").primaryKey(),
  lastSyncedAt: text("last_synced_at").notNull(),
  cursor: text("cursor"),
  syncStatus: text("sync_status").notNull().default("idle"), // idle | syncing | error
  ...timestamps,
});
