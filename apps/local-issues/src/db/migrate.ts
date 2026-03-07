import type { AppDatabase } from "./client.ts";

export function ensureTables(db: AppDatabase): void {
  // Access underlying SQLite driver
  const sqlite = (db as unknown as { $client: { run: (sql: string) => void } }).$client;

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      state TEXT NOT NULL DEFAULT 'planned',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content TEXT,
      icon TEXT,
      color TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      issue_id TEXT REFERENCES issues(id) ON DELETE SET NULL,
      creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_documents_creator ON documents(creator_id)`);
}
