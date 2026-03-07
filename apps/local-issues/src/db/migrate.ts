import type { AppDatabase } from "./client.ts";

export function ensureTables(db: AppDatabase): void {
  const sqlite = (db as unknown as { $client: { run: (sql: string) => void } }).$client;

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      icon TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

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
    CREATE TABLE IF NOT EXISTS issue_statuses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('backlog', 'unstarted', 'started', 'completed', 'canceled')),
      color TEXT NOT NULL,
      position INTEGER NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS cycles (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL,
      name TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      color TEXT,
      state TEXT NOT NULL DEFAULT 'planned' CHECK(state IN ('planned', 'started', 'paused', 'completed', 'canceled')),
      priority INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      target_date TEXT,
      archived_at TEXT,
      lead_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS project_labels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      target_date TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      estimate INTEGER,
      due_date TEXT,
      state_id TEXT NOT NULL REFERENCES issue_statuses(id),
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      parent_id TEXT REFERENCES issues(id) ON DELETE SET NULL,
      cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_issues_team_state ON issues(team_id, state_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id)`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_issues_updated_at ON issues(updated_at)`);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS issue_to_labels (
      issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      label_id TEXT NOT NULL REFERENCES issue_labels(id) ON DELETE CASCADE,
      PRIMARY KEY (issue_id, label_id)
    )
  `);

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS issue_relations (
      issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      related_issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('blocks', 'blocked_by', 'related', 'duplicate')),
      PRIMARY KEY (issue_id, related_issue_id)
    )
  `);
}
