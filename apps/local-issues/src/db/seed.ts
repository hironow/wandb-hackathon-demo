import { teams, issueStatuses } from "./schema.ts";
import type { AppDatabase } from "./client.ts";

const DEFAULT_TEAM_ID = "default-team";

const SEED_TEAM = {
  id: DEFAULT_TEAM_ID,
  name: "Default Team",
  key: "DEF",
} as const;

interface DefaultStatus {
  name: string;
  type: "backlog" | "unstarted" | "started" | "completed" | "canceled";
  color: string;
  position: number;
}

const DEFAULT_STATUSES: DefaultStatus[] = [
  { name: "Backlog", type: "backlog", color: "#bec2c8", position: 0 },
  { name: "Todo", type: "unstarted", color: "#e2e2e2", position: 1 },
  { name: "In Progress", type: "started", color: "#f2c94c", position: 2 },
  { name: "Done", type: "completed", color: "#5e6ad2", position: 3 },
  { name: "Cancelled", type: "canceled", color: "#95a2b3", position: 4 },
];

export function seedDefaultTeam(db: AppDatabase): void {
  db.insert(teams).values(SEED_TEAM).onConflictDoNothing().run();
}

export function seedDefaultStatuses(db: AppDatabase, teamId: string = DEFAULT_TEAM_ID): void {
  for (const status of DEFAULT_STATUSES) {
    db.insert(issueStatuses)
      .values({
        id: `status-${teamId}-${status.type}`,
        name: status.name,
        type: status.type,
        color: status.color,
        position: status.position,
        teamId,
      })
      .onConflictDoNothing()
      .run();
  }
}

export function seedAll(db: AppDatabase): void {
  seedDefaultTeam(db);
  seedDefaultStatuses(db);
}

export function seed(db: AppDatabase): void {
  seedAll(db);
}

export { DEFAULT_TEAM_ID, DEFAULT_STATUSES };
