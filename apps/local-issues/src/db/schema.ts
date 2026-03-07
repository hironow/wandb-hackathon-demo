import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ── Internal ──

export const migrations = sqliteTable("_migrations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  appliedAt: text("applied_at").notNull(),
});

// ── Teams ──

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Cycles ──

export const cycles = sqliteTable("cycles", {
  id: text("id").primaryKey(),
  name: text("name"),
  number: integer("number").notNull(),
  teamId: text("team_id").notNull(),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Issues ──

export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Documents ──

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content"),
  projectId: text("project_id"),
  creatorId: text("creator_id"),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
