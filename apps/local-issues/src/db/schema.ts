// Placeholder schema — will be fully defined in MY-230
// This file exists to satisfy the Drizzle ORM setup

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const migrations = sqliteTable("_migrations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  appliedAt: text("applied_at").notNull(),
});
