import { eq, and, asc } from "drizzle-orm";
import { issueStatuses } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type { ListIssueStatusesParams, GetIssueStatusParams, IssueStatus } from "../types/linear-mcp.d.ts";

export function listIssueStatuses(
  db: AppDatabase,
  params: ListIssueStatusesParams,
): IssueStatus[] {
  const conditions = [];
  if (params.team) {
    conditions.push(eq(issueStatuses.teamId, params.team));
  }

  const rows = db
    .select()
    .from(issueStatuses)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(issueStatuses.position))
    .all();

  return rows.map(toIssueStatus);
}

export function getIssueStatus(
  db: AppDatabase,
  params: GetIssueStatusParams,
): IssueStatus | null {
  if (params.id) {
    const row = db
      .select()
      .from(issueStatuses)
      .where(eq(issueStatuses.id, params.id))
      .get();
    return row ? toIssueStatus(row) : null;
  }

  if (params.name) {
    const conditions = [eq(issueStatuses.name, params.name)];
    if (params.team) {
      conditions.push(eq(issueStatuses.teamId, params.team));
    }
    const row = db
      .select()
      .from(issueStatuses)
      .where(and(...conditions))
      .get();
    return row ? toIssueStatus(row) : null;
  }

  return null;
}

function toIssueStatus(row: typeof issueStatuses.$inferSelect): IssueStatus {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    position: row.position,
    teamId: row.teamId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
