import { users, projects } from "./schema.ts";
import type { AppDatabase } from "./client.ts";

export const DEFAULT_USER_ID = "user-default";
export const DEFAULT_PROJECT_ID = "project-default";

export function seedAll(db: AppDatabase): void {
  const now = new Date().toISOString();

  db.insert(users)
    .values({
      id: DEFAULT_USER_ID,
      name: "Default User",
      email: "user@local.test",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();

  db.insert(projects)
    .values({
      id: DEFAULT_PROJECT_ID,
      name: "Default Project",
      state: "started",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}
