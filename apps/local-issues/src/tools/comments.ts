import { eq, desc } from "drizzle-orm";
import { comments, issues } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  SaveCommentParams,
  ListCommentsParams,
  Comment,
  PaginatedResult,
} from "../types/linear-mcp.d.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const MAX_THREAD_DEPTH = 10;

function toComment(row: typeof comments.$inferSelect): Comment {
  return {
    id: row.id,
    body: row.body,
    issueId: row.issueId,
    parentId: row.parentId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertIssueExists(db: AppDatabase, issueId: string): void {
  const issue = db.select().from(issues).where(eq(issues.id, issueId)).get();
  if (!issue) {
    // Also try by identifier
    const byIdentifier = db.select().from(issues).where(eq(issues.identifier, issueId)).get();
    if (!byIdentifier) {
      throw new Error(`Issue not found: ${issueId}`);
    }
  }
}

export function saveComment(db: AppDatabase, params: SaveCommentParams): Comment {
  if (params.id) {
    return updateComment(db, params);
  }
  return createComment(db, params);
}

function getCommentDepth(db: AppDatabase, commentId: string): number {
  let depth = 0;
  let currentId: string | null = commentId;
  while (currentId) {
    const row = db.select().from(comments).where(eq(comments.id, currentId)).get();
    if (!row || !row.parentId) break;
    depth++;
    currentId = row.parentId;
  }
  return depth;
}

function findDepthLimitAncestor(db: AppDatabase, commentId: string): string {
  let currentId = commentId;
  let depth = getCommentDepth(db, commentId);
  while (depth >= MAX_THREAD_DEPTH) {
    const row = db.select().from(comments).where(eq(comments.id, currentId)).get();
    if (!row || !row.parentId) break;
    currentId = row.parentId;
    depth--;
  }
  return currentId;
}

function createComment(db: AppDatabase, params: SaveCommentParams): Comment {
  if (!params.issueId) throw new Error("issueId is required when creating a comment");

  assertIssueExists(db, params.issueId);

  let effectiveParentId = params.parentId ?? null;

  if (effectiveParentId) {
    const parent = db.select().from(comments).where(eq(comments.id, effectiveParentId)).get();
    if (!parent) {
      throw new Error(`Parent comment not found: ${effectiveParentId}`);
    }

    // Flatten if parent is already at or beyond max depth
    const parentDepth = getCommentDepth(db, effectiveParentId);
    if (parentDepth >= MAX_THREAD_DEPTH - 1) {
      effectiveParentId = findDepthLimitAncestor(db, effectiveParentId);
    }
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    body: params.body,
    issueId: params.issueId,
    userId: null,
    parentId: effectiveParentId,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(comments).values(row).run();

  return toComment({
    ...row,
    parentId: row.parentId,
    userId: row.userId,
  });
}

function updateComment(db: AppDatabase, params: SaveCommentParams): Comment {
  const existing = db.select().from(comments).where(eq(comments.id, params.id!)).get();
  if (!existing) throw new Error(`Comment not found: ${params.id}`);

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (params.body !== undefined) updates.body = params.body;

  db.update(comments).set(updates).where(eq(comments.id, params.id!)).run();

  const updated = db.select().from(comments).where(eq(comments.id, params.id!)).get();
  return toComment(updated!);
}

export function listComments(
  db: AppDatabase,
  params: ListCommentsParams & { limit?: number },
): PaginatedResult<Comment> {
  assertIssueExists(db, params.issueId);

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const rows = db
    .select()
    .from(comments)
    .where(eq(comments.issueId, params.issueId))
    .orderBy(desc(comments.createdAt))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const items = (hasNextPage ? rows.slice(0, limit) : rows).map(toComment);

  return { items, hasNextPage };
}

export interface DeleteCommentParams {
  id: string;
}

export function deleteComment(db: AppDatabase, params: DeleteCommentParams): void {
  const existing = db.select().from(comments).where(eq(comments.id, params.id)).get();
  if (!existing) throw new Error(`Comment not found: ${params.id}`);

  db.delete(comments).where(eq(comments.id, params.id)).run();
}
