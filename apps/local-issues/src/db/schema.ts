import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ── Internal ──

export const migrations = sqliteTable("_migrations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  appliedAt: text("applied_at").notNull(),
});

// ── Users (minimal, needed as FK reference) ──

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  admin: integer("admin", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Projects (minimal, needed as FK reference) ──

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  state: text("state").notNull().default("planned"),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Issues (minimal, needed as FK reference) ──

export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  title: text("title").notNull(),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Documents ──

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content"),
  icon: text("icon"),
  color: text("color"),
  projectId: text("project_id"),
  issueId: text("issue_id"),
  creatorId: text("creator_id"),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
