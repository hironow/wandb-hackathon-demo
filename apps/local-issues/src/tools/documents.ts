import { eq, like, and, isNull, desc, asc, gt, lt } from "drizzle-orm";
import { documents, projects, issues } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const MAX_SLUG_LENGTH = 128;
const MAX_CONTENT_BYTES = 1_048_576; // 1MB

// ── Types ──

export interface Document {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  icon: string | null;
  color: string | null;
  projectId: string | null;
  issueId: string | null;
  creatorId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  hasNextPage: boolean;
  cursor?: string;
}

export interface CreateDocumentParams {
  title: string;
  content?: string;
  icon?: string;
  color?: string;
  project?: string;
  issue?: string;
}

export interface GetDocumentParams {
  id: string;
}

export interface ListDocumentsParams {
  query?: string;
  projectId?: string;
  creatorId?: string;
  initiativeId?: string;
  includeArchived?: boolean;
  limit?: number;
  orderBy?: "createdAt" | "updatedAt";
  cursor?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateDocumentParams {
  id: string;
  title?: string;
  content?: string;
  icon?: string;
  color?: string;
  project?: string;
  issue?: string;
  archived?: boolean;
}

// ── Date parsing ──

/**
 * Parse ISO-8601 date or duration string to a Date threshold.
 * Supports:
 * - Full ISO date: "2024-01-01T00:00:00.000Z"
 * - Duration (relative to now): "-P7D" (7 days ago), "-P1M" (1 month ago), "-P1Y" (1 year ago)
 */
function parseDateFilter(value: string): Date | null {
  // ISO-8601 duration: -PnD, -PnM, -PnY, PnD, etc.
  const durationMatch = value.match(/^-?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
  if (durationMatch) {
    const years = parseInt(durationMatch[1] ?? "0", 10);
    const months = parseInt(durationMatch[2] ?? "0", 10);
    const days = parseInt(durationMatch[3] ?? "0", 10);
    const now = new Date();
    now.setFullYear(now.getFullYear() - years);
    now.setMonth(now.getMonth() - months);
    now.setDate(now.getDate() - days);
    return now;
  }

  // Try as ISO-8601 date string
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date;
  }

  return null;
}

// ── Helpers ──

function toDocument(row: typeof documents.$inferSelect): Document {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    icon: row.icon,
    color: row.color,
    projectId: row.projectId,
    issueId: row.issueId,
    creatorId: row.creatorId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "untitled";
}

function truncateSlug(slug: string): string {
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  return slug.slice(0, MAX_SLUG_LENGTH).replace(/-$/, "");
}

function validateContentSize(content: string): void {
  const byteLength = new TextEncoder().encode(content).length;
  if (byteLength > MAX_CONTENT_BYTES) {
    throw new Error(
      `Content exceeds 1MB limit (${byteLength} bytes)`,
    );
  }
}

function resolveUniqueSlug(db: AppDatabase, baseSlug: string, excludeId?: string): string {
  const truncatedBase = truncateSlug(baseSlug);
  let candidate = truncatedBase;
  let suffix = 0;

  while (true) {
    const existing = db
      .select()
      .from(documents)
      .where(eq(documents.slug, candidate))
      .get();

    if (!existing || existing.id === excludeId) {
      return candidate;
    }

    suffix++;
    const suffixStr = `-${suffix}`;
    const maxBaseLen = MAX_SLUG_LENGTH - suffixStr.length;
    candidate = `${truncatedBase.slice(0, maxBaseLen)}${suffixStr}`;
  }
}

// ── CRUD Functions ──

export function createDocument(db: AppDatabase, params: CreateDocumentParams): Document {
  if (!params.title || params.title.trim() === "") {
    throw new Error("Title is required");
  }

  if (params.content !== undefined) {
    validateContentSize(params.content);
  }

  if (params.project) {
    const proj = db.select().from(projects).where(eq(projects.id, params.project)).get();
    if (!proj) {
      throw new Error(`Project not found: ${params.project}`);
    }
  }

  if (params.issue) {
    const iss = db.select().from(issues).where(eq(issues.id, params.issue)).get();
    if (!iss) {
      throw new Error(`Issue not found: ${params.issue}`);
    }
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const baseSlug = toSlug(params.title);
  const slug = resolveUniqueSlug(db, baseSlug);

  const row = {
    id,
    title: params.title,
    slug,
    content: params.content ?? null,
    icon: params.icon ?? null,
    color: params.color ?? null,
    projectId: params.project ?? null,
    issueId: params.issue ?? null,
    creatorId: null as string | null,
    archivedAt: null as string | null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(documents).values(row).run();

  return toDocument(row);
}

export function getDocument(db: AppDatabase, params: GetDocumentParams): Document | null {
  // Try by ID first
  let row = db.select().from(documents).where(eq(documents.id, params.id)).get();

  // Fallback to slug lookup
  if (!row) {
    row = db.select().from(documents).where(eq(documents.slug, params.id)).get();
  }

  return row ? toDocument(row) : null;
}

export function listDocuments(
  db: AppDatabase,
  params: ListDocumentsParams,
): PaginatedResult<Document> {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const conditions: ReturnType<typeof eq>[] = [];

  if (!params.includeArchived) {
    conditions.push(isNull(documents.archivedAt));
  }

  if (params.query) {
    conditions.push(like(documents.title, `%${params.query}%`));
  }

  if (params.projectId) {
    conditions.push(eq(documents.projectId, params.projectId));
  }

  if (params.creatorId) {
    conditions.push(eq(documents.creatorId, params.creatorId));
  }

  // Date filters
  if (params.createdAt) {
    const threshold = parseDateFilter(params.createdAt);
    if (threshold) {
      conditions.push(gt(documents.createdAt, threshold.toISOString()));
    }
  }

  if (params.updatedAt) {
    const threshold = parseDateFilter(params.updatedAt);
    if (threshold) {
      conditions.push(gt(documents.updatedAt, threshold.toISOString()));
    }
  }

  // initiativeId is accepted but noop (no initiatives table exists)

  const orderCol =
    params.orderBy === "createdAt" ? documents.createdAt : documents.updatedAt;

  // Cursor-based pagination: cursor is the orderCol value of the last item
  if (params.cursor) {
    conditions.push(lt(orderCol, params.cursor));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(documents)
    .where(whereClause)
    .orderBy(desc(orderCol))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const items = (hasNextPage ? rows.slice(0, limit) : rows).map(toDocument);

  // Set cursor to the last item's order column value for next page
  const cursor = items.length > 0
    ? (params.orderBy === "createdAt"
        ? items[items.length - 1]!.createdAt
        : items[items.length - 1]!.updatedAt)
    : undefined;

  return { items, hasNextPage, cursor: hasNextPage ? cursor : undefined };
}

export function updateDocument(db: AppDatabase, params: UpdateDocumentParams): Document {
  const existing = db.select().from(documents).where(eq(documents.id, params.id)).get();
  if (!existing) {
    throw new Error(`Document not found: ${params.id}`);
  }

  if (params.content !== undefined) {
    validateContentSize(params.content);
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (params.title !== undefined) {
    updates.title = params.title;
    const baseSlug = toSlug(params.title);
    updates.slug = resolveUniqueSlug(db, baseSlug, params.id);
  }

  if (params.content !== undefined) updates.content = params.content;
  if (params.icon !== undefined) updates.icon = params.icon;
  if (params.color !== undefined) updates.color = params.color;
  if (params.project !== undefined) {
    const proj = db.select().from(projects).where(eq(projects.id, params.project)).get();
    if (!proj) {
      throw new Error(`Project not found: ${params.project}`);
    }
    updates.projectId = params.project;
  }
  if (params.issue !== undefined) {
    const iss = db.select().from(issues).where(eq(issues.id, params.issue)).get();
    if (!iss) {
      throw new Error(`Issue not found: ${params.issue}`);
    }
    updates.issueId = params.issue;
  }

  if (params.archived === true) {
    updates.archivedAt = new Date().toISOString();
  } else if (params.archived === false) {
    updates.archivedAt = null;
  }

  db.update(documents).set(updates).where(eq(documents.id, params.id)).run();

  const updated = db.select().from(documents).where(eq(documents.id, params.id)).get();
  return toDocument(updated!);
}
