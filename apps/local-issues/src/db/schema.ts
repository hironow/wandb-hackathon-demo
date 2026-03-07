import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ── Internal ──

export const migrations = sqliteTable("_migrations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  appliedAt: text("applied_at").notNull(),
});

// ── Teams (minimal, needed as FK reference) ──

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  icon: text("icon"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Issue Statuses ──

export const issueStatuses = sqliteTable("issue_statuses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["backlog", "unstarted", "started", "completed", "canceled"],
  }).notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Issue Labels ──

export const issueLabels = sqliteTable("issue_labels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  description: text("description"),
  parentId: text("parent_id"),
  teamId: text("team_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
