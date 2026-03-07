import { eq, like, and, or, isNull, desc, asc, gt, lt } from "drizzle-orm";
import { documents, projects, issues } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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
  endCursor: string | null;
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

// ── Cursor encoding ──

interface CursorPayload {
  timestamp: string;
  id: string;
}

function encodeCursor(timestamp: string, id: string): string {
  const payload = JSON.stringify({ timestamp, id });
  return Buffer.from(payload).toString("base64");
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as CursorPayload;
    if (!parsed.timestamp || !parsed.id) {
      throw new Error("Invalid cursor: missing timestamp or id");
    }
    return parsed;
  } catch {
    throw new Error("Invalid cursor: failed to decode");
  }
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
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveUniqueSlug(db: AppDatabase, baseSlug: string, excludeId?: string): string {
  let candidate = baseSlug;
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
    candidate = `${baseSlug}-${suffix}`;
  }
}

// ── CRUD Functions ──

export function createDocument(db: AppDatabase, params: CreateDocumentParams): Document {
  if (!params.title || params.title.trim() === "") {
    throw new Error("Title is required");
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
  const rawLimit = params.limit ?? 0;
  const limit = Math.min(rawLimit > 0 ? rawLimit : DEFAULT_LIMIT, MAX_LIMIT);
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

  // Cursor-based pagination: cursor is Base64(JSON({ timestamp, id }))
  if (params.cursor) {
    const { timestamp, id } = decodeCursor(params.cursor);
    // Items ordered DESC: get items with (orderCol < timestamp) OR (orderCol == timestamp AND id < cursorId)
    conditions.push(
      or(
        lt(orderCol, timestamp),
        and(eq(orderCol, timestamp), lt(documents.id, id))
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(documents)
    .where(whereClause)
    .orderBy(desc(orderCol), desc(documents.id))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const items = (hasNextPage ? rows.slice(0, limit) : rows).map(toDocument);

  // Encode endCursor from last item's timestamp + id
  let endCursor: string | null = null;
  if (hasNextPage && items.length > 0) {
    const lastItem = items[items.length - 1]!;
    const ts = params.orderBy === "createdAt" ? lastItem.createdAt : lastItem.updatedAt;
    endCursor = encodeCursor(ts, lastItem.id);
  }

  return { items, hasNextPage, endCursor };
}

export function updateDocument(db: AppDatabase, params: UpdateDocumentParams): Document {
  const existing = db.select().from(documents).where(eq(documents.id, params.id)).get();
  if (!existing) {
    throw new Error(`Document not found: ${params.id}`);
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
  if (params.project !== undefined) updates.projectId = params.project;
  if (params.issue !== undefined) updates.issueId = params.issue;

  if (params.archived === true) {
    updates.archivedAt = new Date().toISOString();
  } else if (params.archived === false) {
    updates.archivedAt = null;
  }

  db.update(documents).set(updates).where(eq(documents.id, params.id)).run();

  const updated = db.select().from(documents).where(eq(documents.id, params.id)).get();
  return toDocument(updated!);
}
