import { eq, and, asc, desc, isNull } from "drizzle-orm";
import { issueLabels } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  ListIssueLabelsParams,
  CreateIssueLabelParams,
  IssueLabel,
  PaginatedResult,
} from "../types/linear-mcp.d.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const DEFAULT_COLOR = "#6b7280";

function decodeCursor(cursor: string): number {
  try {
    const decoded = atob(cursor);
    const offset = parseInt(decoded, 10);
    return Number.isNaN(offset) || offset < 0 ? 0 : offset;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return btoa(String(offset));
}

export function listIssueLabels(
  db: AppDatabase,
  params: ListIssueLabelsParams,
): PaginatedResult<IssueLabel> {
  const conditions = [];

  if (params.name) {
    conditions.push(eq(issueLabels.name, params.name));
  }
  if (params.team) {
    conditions.push(eq(issueLabels.teamId, params.team));
  }

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = params.cursor ? decodeCursor(params.cursor) : 0;

  const orderColumn =
    params.orderBy === "createdAt" ? issueLabels.createdAt : issueLabels.updatedAt;
  const orderFn = asc; // default ascending

  const rows = db
    .select()
    .from(issueLabels)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderFn(orderColumn))
    .offset(offset)
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const items = (hasNextPage ? rows.slice(0, limit) : rows).map(toIssueLabel);
  const nextCursor = hasNextPage ? encodeCursor(offset + limit) : undefined;

  return { items, hasNextPage, cursor: nextCursor };
}

export function createIssueLabel(
  db: AppDatabase,
  params: CreateIssueLabelParams,
): IssueLabel {
  if (!params.name || params.name.trim() === "") {
    throw new Error("Label name is required and cannot be empty");
  }

  // Check for duplicate name in same scope
  const existingConditions = [eq(issueLabels.name, params.name)];
  if (params.teamId) {
    existingConditions.push(eq(issueLabels.teamId, params.teamId));
  } else {
    existingConditions.push(isNull(issueLabels.teamId));
  }
  const existing = db
    .select()
    .from(issueLabels)
    .where(and(...existingConditions))
    .get();

  if (existing) {
    const scope = params.teamId ? `team ${params.teamId}` : "workspace";
    throw new Error(`Label "${params.name}" already exists in ${scope}`);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    name: params.name,
    color: params.color ?? DEFAULT_COLOR,
    description: params.description ?? null,
    parentId: params.parentId ?? null,
    teamId: params.teamId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(issueLabels).values(row).run();

  return toIssueLabel(row);
}

function toIssueLabel(row: typeof issueLabels.$inferSelect): IssueLabel {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? "#6b7280",
    description: row.description ?? undefined,
    parentId: row.parentId ?? undefined,
    teamId: row.teamId ?? undefined,
  };
}
