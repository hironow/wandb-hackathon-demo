import { eq, or, like, desc, sql } from "drizzle-orm";
import { users, localConfig, teams } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  ListUsersParams,
  GetUserParams,
  User,
  PaginatedResult,
} from "../types/linear-mcp.d.ts";

const DEFAULT_LIMIT = 50;
const ME_CONFIG_KEY = "default_user_id";

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

  // Filter by team (id, name, or key)
  if (params.team) {
    const team = db
      .select()
      .from(teams)
      .where(
        or(
          eq(teams.id, params.team),
          eq(teams.name, params.team),
          eq(teams.key, params.team),
        ),
      )
      .limit(1)
      .all()[0];
    if (team) {
      query = query.where(eq(users.teamId, team.id)) as typeof query;
    } else {
      // Team not found — return empty result
      return { nodes: [], pageInfo: { hasNextPage: false } };
    }
  }

  // Cursor-based pagination (DESC order)
  if (params.cursor) {
    const [cursorTime, cursorId] = decodeCursor(params.cursor);
    if (cursorTime && cursorId) {
      query = query.where(
        sql`(${orderCol}, ${users.id}) < (${cursorTime}, ${cursorId})`,
      ) as typeof query;
    }
  }

  const rows = query
    .orderBy(desc(orderCol), desc(users.id))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const nodes = pageRows.map(toUser);
  const lastRow = pageRows[pageRows.length - 1];

  return {
    nodes,
    pageInfo: {
      hasNextPage,
      endCursor:
        hasNextPage && lastRow
          ? encodeCursor(
              params.orderBy === "createdAt"
                ? lastRow.createdAt
                : lastRow.updatedAt,
              lastRow.id,
            )
          : undefined,
    },
  };
}

export function getUser(
  db: AppDatabase,
  params: GetUserParams,
): User | null {
  // Handle "me" special case — read from local_config table
  if (params.query === "me") {
    const config = db
      .select()
      .from(localConfig)
      .where(eq(localConfig.key, ME_CONFIG_KEY))
      .limit(1)
      .all()[0];

    if (!config) {
      throw new Error(
        'Default user not configured. Run seed or insert into local_config table: key="default_user_id", value="<user-id>"',
      );
    }

    const row = db
      .select()
      .from(users)
      .where(eq(users.id, config.value))
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
