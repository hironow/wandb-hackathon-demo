import { teams, users, issueStatuses } from "./schema.ts";
import type { AppDatabase } from "./client.ts";

const DEFAULT_TEAM_ID = "default-team";
const DEFAULT_USER_ID = "default-user";

const SEED_TEAM = {
  id: DEFAULT_TEAM_ID,
  name: "Default Team",
  key: "DEF",
} as const;

const SEED_USER = {
  id: DEFAULT_USER_ID,
  name: "Default User",
  email: "user@local-issues.localhost",
} as const;

const SEED_STATUSES = [
  { id: "status-backlog", name: "Backlog", type: "backlog", position: 0 },
  { id: "status-todo", name: "Todo", type: "unstarted", position: 1 },
  { id: "status-in-progress", name: "In Progress", type: "started", position: 2 },
  { id: "status-done", name: "Done", type: "completed", position: 3 },
  { id: "status-cancelled", name: "Cancelled", type: "canceled", position: 4 },
] as const;

export function seed(db: AppDatabase): void {
  db.insert(teams).values(SEED_TEAM).onConflictDoNothing().run();
  db.insert(users).values(SEED_USER).onConflictDoNothing().run();

  for (const status of SEED_STATUSES) {
    db.insert(issueStatuses)
      .values({ ...status, teamId: DEFAULT_TEAM_ID })
      .onConflictDoNothing()
      .run();
  }
}
