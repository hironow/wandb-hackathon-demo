import { eq, or, like, asc, sql } from "drizzle-orm";
import { users } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  ListUsersParams,
  GetUserParams,
  User,
  PaginatedResult,
} from "../types/linear-mcp.d.ts";

const DEFAULT_LIMIT = 50;

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    displayName: row.displayName ?? undefined,
    active: row.active,
    admin: row.admin,
  };
}

export function listUsers(
  db: AppDatabase,
  params: ListUsersParams,
): PaginatedResult<User> {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, 250);
  const orderCol =
    params.orderBy === "createdAt" ? users.createdAt : users.updatedAt;

  let query = db.select().from(users);

  // Filter by query (search name or email)
  if (params.query) {
    const pattern = `%${params.query}%`;
    query = query.where(
      or(like(users.name, pattern), like(users.email, pattern)),
    ) as typeof query;
  }

  // Cursor-based pagination
  if (params.cursor) {
    const [cursorTime, cursorId] = decodeCursor(params.cursor);
    if (cursorTime && cursorId) {
      query = query.where(
        sql`(${orderCol}, ${users.id}) > (${cursorTime}, ${cursorId})`,
      ) as typeof query;
    }
  }

  const rows = query
    .orderBy(asc(orderCol), asc(users.id))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const items = pageRows.map(toUser);
  const lastRow = pageRows[pageRows.length - 1];

  return {
    items,
    hasNextPage,
    cursor:
      hasNextPage && lastRow
        ? encodeCursor(
            params.orderBy === "createdAt"
              ? lastRow.createdAt
              : lastRow.updatedAt,
            lastRow.id,
          )
        : undefined,
  };
}

export function getUser(
  db: AppDatabase,
  params: GetUserParams,
): User | null {
  // Handle "me" special case
  if (params.query === "me") {
    const defaultUserId = process.env.LOCAL_ISSUES_DEFAULT_USER;
    if (!defaultUserId) {
      throw new Error(
        'Default user not configured. Set LOCAL_ISSUES_DEFAULT_USER environment variable to a user ID.',
      );
    }
    const row = db
      .select()
      .from(users)
      .where(eq(users.id, defaultUserId))
      .limit(1)
      .all()[0];
    return row ? toUser(row) : null;
  }

  // Try matching by id, name, or email
  const row = db
    .select()
    .from(users)
    .where(
      or(
        eq(users.id, params.query),
        eq(users.name, params.query),
        eq(users.email, params.query),
      ),
    )
    .limit(1)
    .all()[0];

  return row ? toUser(row) : null;
}

// Cursor encoding/decoding
function encodeCursor(time: string, id: string): string {
  return Buffer.from(`${time}|${id}`).toString("base64");
}

function decodeCursor(
  cursor: string,
): [string | undefined, string | undefined] {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const [time, id] = decoded.split("|");
    return [time, id];
  } catch {
    return [undefined, undefined];
  }
}
