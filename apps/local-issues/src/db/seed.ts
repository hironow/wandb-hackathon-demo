import { teams, users, issueStatuses, localConfig } from "./schema.ts";
import type { AppDatabase } from "./client.ts";

const DEFAULT_TEAM_ID = "default-team";
const DEFAULT_USER_ID = "default-user";
const SECOND_USER_ID = "default-user-2";

const SEED_TEAM = {
  id: DEFAULT_TEAM_ID,
  name: "Default Team",
  key: "DEF",
} as const;

const SEED_ARCHIVED_TEAM = {
  id: "archived-team",
  name: "Archived Team",
  key: "ARC",
  archivedAt: "2025-01-01T00:00:00",
} as const;

const SEED_USERS = [
  {
    id: DEFAULT_USER_ID,
    name: "Default User",
    email: "user@local-issues.localhost",
  },
  {
    id: SECOND_USER_ID,
    name: "Second User",
    email: "user2@local-issues.localhost",
  },
] as const;

const SEED_STATUSES = [
  { id: "status-backlog", name: "Backlog", type: "backlog", position: 0 },
  { id: "status-todo", name: "Todo", type: "unstarted", position: 1 },
  { id: "status-in-progress", name: "In Progress", type: "started", position: 2 },
  { id: "status-done", name: "Done", type: "completed", position: 3 },
  { id: "status-cancelled", name: "Cancelled", type: "canceled", position: 4 },
] as const;

export function seed(db: AppDatabase): void {
  db.insert(teams).values(SEED_TEAM).onConflictDoNothing().run();
  db.insert(teams).values(SEED_ARCHIVED_TEAM).onConflictDoNothing().run();

  for (const user of SEED_USERS) {
    db.insert(users).values(user).onConflictDoNothing().run();
  }

  for (const status of SEED_STATUSES) {
    db.insert(issueStatuses)
      .values({ ...status, teamId: DEFAULT_TEAM_ID })
      .onConflictDoNothing()
      .run();
  }

  // Set default "me" user in local_config
  db.insert(localConfig)
    .values({ key: "default_user_id", value: DEFAULT_USER_ID })
    .onConflictDoNothing()
    .run();
}
