import type { AppDatabase } from "./client.ts";

export function ensureTables(db: AppDatabase): void {
  const sqlite = (db as unknown as { $client: { run: (sql: string) => void } }).$client;

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      icon TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS issue_statuses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('backlog', 'unstarted', 'started', 'completed', 'canceled')),
      color TEXT NOT NULL,
      position INTEGER NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id)
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS issue_labels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      team_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}
