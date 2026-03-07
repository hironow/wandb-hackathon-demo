import { eq, or, like, asc, sql } from "drizzle-orm";
import { teams } from "../db/schema.ts";
import type { AppDatabase } from "../db/client.ts";
import type {
  ListTeamsParams,
  GetTeamParams,
  Team,
  PaginatedResult,
} from "../types/linear-mcp.d.ts";

const DEFAULT_LIMIT = 50;

function toTeam(row: typeof teams.$inferSelect): Team {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    icon: row.icon ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listTeams(
  db: AppDatabase,
  params: ListTeamsParams,
): PaginatedResult<Team> {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, 250);
  const orderCol =
    params.orderBy === "createdAt" ? teams.createdAt : teams.updatedAt;

  let query = db.select().from(teams);

  // Filter by query (search name or key)
  if (params.query) {
    const pattern = `%${params.query}%`;
    query = query.where(
      or(like(teams.name, pattern), like(teams.key, pattern)),
    ) as typeof query;
  }

  // Cursor-based pagination: cursor is the last item's updatedAt|id
  if (params.cursor) {
    const [cursorTime, cursorId] = decodeCursor(params.cursor);
    if (cursorTime && cursorId) {
      query = query.where(
        sql`(${orderCol}, ${teams.id}) > (${cursorTime}, ${cursorId})`,
      ) as typeof query;
    }
  }

  const rows = query
    .orderBy(asc(orderCol), asc(teams.id))
    .limit(limit + 1)
    .all();

  const hasNextPage = rows.length > limit;
  const items = (hasNextPage ? rows.slice(0, limit) : rows).map(toTeam);
  const lastItem = items[items.length - 1];

  return {
    items,
    hasNextPage,
    cursor: hasNextPage && lastItem
      ? encodeCursor(
          params.orderBy === "createdAt"
            ? lastItem.createdAt
            : lastItem.updatedAt,
          lastItem.id,
        )
      : undefined,
  };
}

export function getTeam(
  db: AppDatabase,
  params: GetTeamParams,
): Team | null {
  // Try matching by id, key, or name
  const row = db
    .select()
    .from(teams)
    .where(
      or(
        eq(teams.id, params.query),
        eq(teams.key, params.query),
        eq(teams.name, params.query),
      ),
    )
    .limit(1)
    .all()[0];

  return row ? toTeam(row) : null;
}

// Cursor encoding/decoding
function encodeCursor(time: string, id: string): string {
  return Buffer.from(`${time}|${id}`).toString("base64");
}

function decodeCursor(cursor: string): [string | undefined, string | undefined] {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const [time, id] = decoded.split("|");
    return [time, id];
  } catch {
    return [undefined, undefined];
  }
}

