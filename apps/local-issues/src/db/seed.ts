import { teams } from "./schema.ts";
import type { AppDatabase } from "./client.ts";

export const DEFAULT_TEAM_ID = "team-default";
export const DEFAULT_TEAM_KEY = "DEF";

export function seedAll(db: AppDatabase): void {
  const now = new Date().toISOString();

  db.insert(teams)
    .values({
      id: DEFAULT_TEAM_ID,
      name: "Default Team",
      key: DEFAULT_TEAM_KEY,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}
